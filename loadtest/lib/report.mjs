// Turns a run's raw metrics into the saved JSON result and a console summary with a verdict.
import { mkdir, writeFile } from 'node:fs/promises'
import { summarize } from './metrics.mjs'
import { mergeSummaries } from './delivery.mjs'

// Basic pass thresholds (p95, ms). Conservative for a local machine; the Step 5 report will make
// these configurable. Operations not listed are reported but not judged.
export const THRESHOLDS = Object.freeze({
  login: 2000,
  join_http: 1500,
  socket_connect: 3000,
  join_socket: 3000,
  answer: 1500,
  leaderboard_get: 1500,
  leaderboard_get_final: 1500,
  poll_delivery: 1000
})
export const MAX_ERROR_RATE_PCT = 1
export const MIN_JOIN_RATE_PCT = 99
export const OUTAGE_P95_MS = 8000       // disconnect -> reconnect, judged only when outages happened
export const MAX_OUTAGE_RECORDS = 200   // outage records kept in the result file
export const MAX_WORST_STUDENTS = 10

export const RESULT_SCHEMA_VERSION = 2

// Windows-safe, sortable: 2026-11-06T02-15-30Z
export const resultFileName = (date = new Date()) =>
  `${date.toISOString().slice(0, 19).replace(/:/g, '-')}Z.json`

/**
 * Run-level delivery figures from each joined student's finishDelivery() output
 * ({ student, traced, delivery, outages }). Tracing that did not happen is `status: 'unavailable'`
 * with the reason, never zeros.
 */
export function deliverySection(finished, { ledgerAvailable, ledgerCompromised = false, lateMs, unavailableReason }) {
  if (!finished.some(f => f.traced)) {
    return { status: 'unavailable', reason: unavailableReason || 'no student received an lt:hello trace baseline' }
  }
  const m = mergeSummaries(finished.map(f => f.delivery))
  const worstStudents = finished
    .map(f => ({
      student: f.student,
      droppedConnected: f.delivery.droppedConnected,
      tailMissing: f.delivery.tailMissing,
      outOfOrder: f.delivery.outOfOrder,
      duplicates: f.delivery.duplicates,
      missedOutage: f.delivery.missedOutage
    }))
    .filter(w => w.droppedConnected + w.outOfOrder + w.duplicates > 0)
    .sort((a, b) => (b.droppedConnected + b.outOfOrder + b.duplicates) - (a.droppedConnected + a.outOfOrder + a.duplicates))
    .slice(0, MAX_WORST_STUDENTS)
  return {
    status: 'traced',
    lateMs,
    clock: m.clock,                                        // 'local' | 'unavailable' (remote target)
    // compromised: another client reset the backend's counters mid-run, so its ledger can't be trusted.
    tail: ledgerCompromised ? 'compromised' : !ledgerAvailable ? 'unverified' : m.tailUnverified ? 'partial' : 'verified',
    students: m.students,
    studentsUntraced: finished.filter(f => !f.traced).length,
    studentsWithDrops: m.studentsWithDrops,
    received: m.received,
    droppedConnected: m.droppedConnected,                  // includes tailMissing
    tailMissing: m.tailMissing,
    missedOutage: m.missedOutage,
    outOfOrder: m.outOfOrder,
    duplicates: m.duplicates,
    late: m.late,                                          // null when the clock is unavailable
    latencyMs: m.latency,                                  // { n, meanMs, maxMs } or null
    beforeBaseline: m.beforeBaseline,
    unclassified: m.unclassified,
    invalid: m.invalid,
    baselineInferred: m.baselineInferred,
    streamsEvicted: m.streamsEvicted,                      // client-side, under MAX_STREAMS (figures kept)
    byEvent: m.byEvent,
    worstStudents
  }
}

/** Run-level outage figures from every student's outage records (stats over all, records capped). */
export function outageSection(records, { traced }) {
  const pick = (k) => records.map(r => r[k]).filter(v => typeof v === 'number')
  const byReason = {}
  let missedPolls = 0, recoveredPolls = 0
  const retry = { recovered: 0, stillMissing: 0, notCompleted: 0 }
  const delays = []
  for (const r of records) {
    byReason[r.reason] = (byReason[r.reason] || 0) + 1
    missedPolls += r.missedQuestions.length
    for (const q of r.missedQuestions) {
      if (q.recovered) { recoveredPolls++; if (typeof q.recoveredAfterMs === 'number') delays.push(q.recoveredAfterMs) }
      if (q.retry === 'recovered') retry.recovered++
      else if (q.retry === 'still_missing') retry.stillMissing++
      else if (q.retry === 'not_completed') retry.notCompleted++
    }
  }
  return {
    recoveryDelayMs: summarize(delays),  // reconnect -> the fetch that returned the poll (reported only)
    resyncRetry: retry,                  // polls only the retry returned / still missing / run ended first
    total: records.length,
    stuck: records.filter(r => r.stuck).length,
    byReason,
    outageMs: summarize(pick('outageMs')),
    rejoinMs: traced ? summarize(pick('rejoinMs')) : null, // needs lt:hello; null = unavailable
    resyncMs: summarize(pick('resyncMs')),
    missedPolls,
    recoveredPolls,
    unrecoveredPolls: missedPolls - recoveredPolls,
    truncated: records.length > MAX_OUTAGE_RECORDS,
    records: records.slice(0, MAX_OUTAGE_RECORDS)
  }
}

const check = (name, value, pass) => ({ check: name, value, pass, status: pass ? 'PASS' : 'FAIL' })
const notAvailable = (name, reason) => ({ check: name, value: reason, pass: null, status: 'N/A' })

export const FINAL_LEADERBOARD_CHECK = 'final leaderboard push received after the last segment-done'

/**
 * Checks are PASS, FAIL or N/A (not measurable in this run, e.g. tracing off): N/A never counts as a
 * pass in the figures nor fails the run. `info` lists reported-only figures (late events, latency).
 *
 * finalLeaderboard  SimTeacher.waitForFinalLeaderboard() outcome ({ status: received | missing |
 *                   not_checked }); omitted = not judged (older callers).
 * failure           { phase, message } when an error stopped the run: always a FAIL.
 * leaderboardGrouping  Session.pushGrouping(); when approximate it is reported (info), never judged.
 * serverCompromised    detectForeignReset() record: another client reset the backend's counters (or it
 *                      restarted) mid-run. Always a FAIL: the server-side figures and the tail check
 *                      cover only part of the run, so the run cannot be an ordinary PASS.
 */
export function verdict({ operations, events, polls = [], roomEndedReceived = null, delivery = null, outages = null, finalLeaderboard = null, failure = null, leaderboardGrouping = null, serverCompromised = null }, { students }) {
  const checks = []
  const info = []
  if (failure) checks.push(check('run completed without an error', `failed during ${failure.phase}: ${failure.message}`, false))
  if (serverCompromised) {
    checks.push(check('server metrics not reset by another client during the run',
      `reset detected at ${serverCompromised.detectedAtSec ?? '?'}s: ${serverCompromised.reason}`, false))
    info.push({ item: 'server-side figures', value: 'compromised: they cover only part of this run (and may include another run). Re-run with one simulator per backend.' })
  }
  for (const [op, limit] of Object.entries(THRESHOLDS)) {
    const o = operations[op]
    if (!o || !o.n) continue
    checks.push(check(`${op} p95 <= ${limit}ms`, o.p95, o.p95 <= limit))
  }
  for (const [op, o] of Object.entries(operations)) {
    if (!o.errorCount) continue
    checks.push(check(`${op} errors <= ${MAX_ERROR_RATE_PCT}%`, o.errorRate, o.errorRate <= MAX_ERROR_RATE_PCT))
  }
  const joinRate = students ? ((events.studentsJoined || 0) / students) * 100 : 0
  checks.push(check(`students joined >= ${MIN_JOIN_RATE_PCT}%`, Math.round(joinRate * 10) / 10, joinRate >= MIN_JOIN_RATE_PCT))
  checks.push(check('no answer key in student payloads', events.answerKeyLeaked || 0, !events.answerKeyLeaked))
  const joined = events.studentsJoined || 0
  if (polls.length) {
    // A student who missed the socket push during an outage but got the poll from the resync counts.
    const short = polls.filter(p => p.deliveredTo + (p.recoveredByResync || 0) < joined).length
    const recovered = polls.reduce((n, p) => n + (p.recoveredByResync || 0), 0)
    checks.push(check('every poll reached every joined student (socket or resync)',
      `${polls.length - short}/${polls.length} polls${recovered ? ` (${recovered} via resync)` : ''}`, short === 0))
  }
  if (roomEndedReceived != null) {
    checks.push(check('room:ended reached every joined student', `${roomEndedReceived}/${joined}`, roomEndedReceived >= joined))
  }
  // The leaderboard fold after the last poll must actually broadcast. Tracing cannot catch a push
  // the server never sent (no seq is ever emitted), so this is judged on its own.
  if (finalLeaderboard) {
    if (finalLeaderboard.status === 'received') {
      checks.push(check(FINAL_LEADERBOARD_CHECK, `received ${finalLeaderboard.afterMs ?? '?'}ms after segment-done`, true))
    } else if (finalLeaderboard.status === 'missing') {
      checks.push(check(FINAL_LEADERBOARD_CHECK, `none within ${finalLeaderboard.waitedSeconds ?? '?'}s`, false))
    } else {
      checks.push(notAvailable(FINAL_LEADERBOARD_CHECK, `not checked: ${finalLeaderboard.reason || 'unknown'}`))
    }
  }
  if (leaderboardGrouping?.approximate) {
    info.push({ item: 'leaderboard push spread is approximate', value: leaderboardGrouping.reason })
  }

  if (delivery) {
    const names = ['no broadcasts lost while connected', 'no out-of-order broadcasts', 'no duplicate broadcasts']
    if (delivery.status !== 'traced') {
      for (const n of names) checks.push(notAvailable(n, `unavailable: ${delivery.reason}`))
    } else {
      const tailNote = delivery.tail === 'verified' ? `incl. ${delivery.tailMissing} at the tail` : `tail ${delivery.tail}`
      checks.push(check(names[0], `${delivery.droppedConnected} (${tailNote})`, delivery.droppedConnected === 0))
      checks.push(check(names[1], delivery.outOfOrder, delivery.outOfOrder === 0))
      checks.push(check(names[2], delivery.duplicates, delivery.duplicates === 0))
      if (delivery.studentsUntraced) {
        checks.push(check('every joined student got a trace baseline (lt:hello)', `${delivery.students - delivery.studentsUntraced}/${delivery.students}`, false))
      }
      info.push(delivery.clock === 'local'
        ? { item: `late broadcasts (> ${delivery.lateMs}ms, reported only)`, value: delivery.late }
        : { item: 'late broadcasts', value: 'unavailable: the server clock is not comparable for a remote target' })
      if (delivery.latencyMs) info.push({ item: 'broadcast delivery latency', value: `mean ${delivery.latencyMs.meanMs}ms, max ${delivery.latencyMs.maxMs}ms` })
      if (delivery.tail !== 'verified') {
        const why = delivery.tail === 'compromised' ? 'server ledger untrustworthy: reset by another client mid-run'
          : delivery.tail === 'partial' ? 'some streams missing from the server ledger' : 'server ledger not read'
        info.push({ item: 'tail check', value: `${delivery.tail}: a lost final broadcast may go unnoticed (${why})` })
      }
      if (delivery.missedOutage) info.push({ item: 'broadcasts missed while disconnected', value: delivery.missedOutage })
    }
  }

  if (outages) {
    if (!outages.total) {
      info.push({ item: 'disconnects during the run', value: 0 })
    } else {
      checks.push(check('no student stuck after a disconnect', `${outages.stuck}/${outages.total} outages`, outages.stuck === 0))
      checks.push(check('every poll missed during an outage recovered by resync',
        `${outages.recoveredPolls}/${outages.missedPolls}`, outages.unrecoveredPolls === 0))
      const d = outages.recoveryDelayMs
      if (d?.n) info.push({ item: 'resync recovery delay (reconnect to the fetch that returned the poll)', value: `p50 ${Math.round(d.p50)}ms, max ${Math.round(d.max)}ms over ${d.n} poll(s)` })
      const rt = outages.resyncRetry
      if (rt?.recovered) info.push({ item: 'polls returned only by the resync retry (stale backend question cache)', value: rt.recovered })
      if (rt?.notCompleted) info.push({ item: 'resync retries the run ended before (counted as not recovered)', value: rt.notCompleted })
      checks.push(check(`outage p95 <= ${OUTAGE_P95_MS}ms`, outages.outageMs.p95, outages.outageMs.p95 != null && outages.outageMs.p95 <= OUTAGE_P95_MS))
    }
  }

  return { pass: checks.every(c => c.pass !== false), checks, info }
}

/**
 * Per-poll delivery. `joined` is the number of students who actually joined the room (not the
 * configured --students): a student who never joined cannot receive a poll, and the verdict's
 * "every poll reached every joined student" check uses the same denominator.
 */
export function pollSummary(session, joined) {
  return [...session.polls.values()].sort((a, b) => a.index - b.index).map(p => ({
    poll: p.index + 1,
    type: p.type,
    questionId: p.questionId,
    deliveredTo: p.received,
    recoveredByResync: p.recovered || 0,
    notDelivered: Math.max(0, joined - p.received - (p.recovered || 0)), // of the joined students
    answersAccepted: p.accepted,
    answersRejected: p.rejected
  }))
}

export async function saveResult(dir, result, date = new Date()) {
  await mkdir(dir, { recursive: true })
  const file = new URL(resultFileName(date), dir)
  await writeFile(file, JSON.stringify(result, null, 2))
  return file
}

const fmt = (v) => (v == null ? '-' : String(Math.round(v)))
const pad = (s, n) => String(s).padStart(n)
const stat = (s) => (s && s.n ? `p50 ${fmt(s.p50)} / p95 ${fmt(s.p95)} / max ${fmt(s.max)}ms` : 'none measured')

export function printDelivery(result, log = console.log) {
  const d = result.delivery
  if (!d) return
  if (d.status !== 'traced') {
    log(`delivery:  not traced (${d.reason})`)
  } else {
    const tail = d.tail === 'verified' ? `${d.tailMissing} at the tail` : `tail ${d.tail}`
    log(`delivery:  traced, ${d.students} students, clock ${d.clock}, tail ${d.tail}`)
    log(`           received ${d.received}, lost while connected ${d.droppedConnected} (${tail}; ${d.studentsWithDrops} students), missed while disconnected ${d.missedOutage}`)
    log(`           out-of-order ${d.outOfOrder}, duplicates ${d.duplicates}${d.unclassified ? `, unclassified ${d.unclassified}` : ''}${d.studentsUntraced ? `, students without a baseline ${d.studentsUntraced}` : ''}`)
    log(d.clock === 'local'
      ? `           late (> ${d.lateMs}ms) ${d.late}${d.latencyMs ? `, latency mean ${d.latencyMs.meanMs}ms / max ${d.latencyMs.maxMs}ms` : ''}`
      : '           late / latency: unavailable (remote target, clocks not comparable)')
    for (const w of d.worstStudents.slice(0, 3)) {
      log(`           student ${w.student}: lost ${w.droppedConnected}, out-of-order ${w.outOfOrder}, duplicates ${w.duplicates}`)
    }
  }
  const o = result.outages
  if (!o) return
  if (!o.total) { log('outages:   none (no student disconnected)'); return }
  log(`outages:   ${o.total} (${Object.entries(o.byReason).map(([r, n]) => `${r} x${n}`).join(', ')}), stuck ${o.stuck}`)
  log(`           down ${stat(o.outageMs)}; re-join ${o.rejoinMs ? stat(o.rejoinMs) : 'unavailable (not traced)'}; resync ${stat(o.resyncMs)}`)
  log(`           polls missed while down ${o.missedPolls}, recovered by resync ${o.recoveredPolls}${o.resyncRetry?.recovered ? ` (${o.resyncRetry.recovered} only after the retry)` : ''}, not recovered ${o.unrecoveredPolls}`)
}

export function printSummary(result, log = console.log) {
  const { config, summary, generator, polls, verdict: v } = result
  log('\n================ LOAD TEST RESULT ================')
  log(`target ${config.api}   students ${config.students}   ramp ${config.rampSeconds}s   polls ${polls.length}   duration ${summary.durationSeconds}s`)
  log('--------------------------------------------------')
  log(`${'operation'.padEnd(34)}${pad('n', 6)}${pad('p50', 8)}${pad('p95', 8)}${pad('p99', 8)}${pad('max', 8)}${pad('err', 6)}`)
  for (const [op, o] of Object.entries(summary.operations)) {
    log(`${op.padEnd(34)}${pad(o.n, 6)}${pad(fmt(o.p50), 8)}${pad(fmt(o.p95), 8)}${pad(fmt(o.p99), 8)}${pad(fmt(o.max), 8)}${pad(o.errorCount, 6)}`)
    for (const [kind, n] of Object.entries(o.errors)) log(`${''.padEnd(36)}${kind} x${n}`)
  }
  log('(latencies in ms)')
  log('--------------------------------------------------')
  const c = summary.connections
  log(`connections: joined ${c.studentsJoined}/${config.students}, connect failures ${c.connectFailures}, disconnects ${c.disconnects}, reconnects ${c.reconnects}`)
  for (const p of polls) {
    log(`poll ${p.poll} (${p.type}): delivered ${p.deliveredTo}/${c.studentsJoined} joined${p.recoveredByResync ? `, recovered by resync ${p.recoveredByResync}` : ''}${p.notDelivered ? `, not delivered ${p.notDelivered}` : ''}, answers accepted ${p.answersAccepted}, rejected ${p.answersRejected}`)
  }
  log(`room:ended received by ${summary.roomEndedReceived}/${c.studentsJoined} joined students`)
  printDelivery(result, log)
  if (generator) {
    log(`generator: CPU avg ${generator.processCpuAvg}% / peak ${generator.processCpuPeak}% of one core, machine avg ${generator.machineCpuAvg}% / peak ${generator.machineCpuPeak}% (${generator.cores} cores), loop lag p99 peak ${generator.loopLagP99PeakMs}ms`)
    for (const w of generator.warnings || []) log(`WARNING: ${w}`)
  }
  const sm = result.server?.metrics
  if (sm) {
    const p = sm.process
    log(`server:    CPU avg ${p.cpuPercent.avg ?? '-'}% / peak ${p.cpuPercent.max ?? '-'}% of one core, RSS ${p.memoryMb.rss} MB, heap ${p.memoryMb.heapUsed} MB, loop delay p99 ${p.eventLoopDelayMs?.p99 ?? '-'}ms`)
    log(`           HTTP ${sm.http.total} requests (${sm.http.errors} 5xx), sockets peak ${sm.sockets.peak}, disconnects ${sm.sockets.disconnects} (incl. the clean close at the end: ${JSON.stringify(sm.sockets.disconnectReasons)})`)
    const slow = Object.entries(sm.http.routes).sort((a, b) => (b[1].p95Ms ?? 0) - (a[1].p95Ms ?? 0)).slice(0, 3)
    for (const [route, r] of slow) log(`           slowest: ${route}  p95 ${r.p95Ms}ms  (n=${r.count})`)
    const out = Object.entries(sm.sockets.outgoingEvents).sort((a, b) => b[1] - a[1]).slice(0, 4)
    log(`           socket messages sent: ${out.map(([e, n]) => `${e} ${n}`).join(', ') || 'none'}`)
  } else if (result.server && !result.server.available) {
    log(`server:    not collected (${result.server.reason})`)
  }
  log('--------------------------------------------------')
  for (const ch of v.checks) log(`${(ch.status || (ch.pass ? 'PASS' : 'FAIL')).padEnd(4)}  ${ch.check}  (${ch.pass === null ? '' : 'got '}${ch.value})`)
  for (const i of v.info || []) log(`INFO  ${i.item}: ${i.value}`)
  if (result.server?.compromised) log(`SERVER METRICS COMPROMISED at ${result.server.compromised.detectedAtSec}s: ${result.server.compromised.reason}`)
  if (result.server?.preexistingSockets > 0) log(`NOTE  ${result.server.preexistingSockets} socket(s) were already connected to the backend before this run`)
  if (result.failure) log(`RUN FAILED during ${result.failure.phase}: ${result.failure.message} (partial result)`)
  else if (result.status === 'aborted' || result.aborted) log('RUN ABORTED (Ctrl+C): partial result, some checks were not judged')
  for (const e of result.teardownErrors || []) log(`CLEANUP  ${e.step} failed: ${e.message}`)
  log(`OVERALL: ${v.pass ? 'PASS' : 'FAIL'}${generator?.possibleBottleneck ? '  (results may be limited by this machine, see warnings)' : ''}`)
  log('==================================================\n')
}
