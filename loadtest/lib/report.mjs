// Turns a run's raw metrics into the saved JSON result and a console summary with a basic verdict.
import { mkdir, writeFile } from 'node:fs/promises'

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

// Windows-safe, sortable: 2026-11-06T02-15-30Z
export const resultFileName = (date = new Date()) =>
  `${date.toISOString().slice(0, 19).replace(/:/g, '-')}Z.json`

export function verdict({ operations, events, polls = [], roomEndedReceived = null }, { students }) {
  const checks = []
  for (const [op, limit] of Object.entries(THRESHOLDS)) {
    const o = operations[op]
    if (!o || !o.n) continue
    checks.push({ check: `${op} p95 <= ${limit}ms`, value: o.p95, pass: o.p95 <= limit })
  }
  for (const [op, o] of Object.entries(operations)) {
    if (!o.errorCount) continue
    checks.push({ check: `${op} errors <= ${MAX_ERROR_RATE_PCT}%`, value: o.errorRate, pass: o.errorRate <= MAX_ERROR_RATE_PCT })
  }
  const joinRate = students ? ((events.studentsJoined || 0) / students) * 100 : 0
  checks.push({ check: `students joined >= ${MIN_JOIN_RATE_PCT}%`, value: Math.round(joinRate * 10) / 10, pass: joinRate >= MIN_JOIN_RATE_PCT })
  checks.push({ check: 'no answer key in student payloads', value: events.answerKeyLeaked || 0, pass: !events.answerKeyLeaked })
  // Delivery, as seen by the clients (not server-side event tracing — that is a later step).
  const joined = events.studentsJoined || 0
  if (polls.length) {
    const short = polls.filter(p => p.deliveredTo < joined).length
    checks.push({ check: 'every poll reached every joined student', value: `${polls.length - short}/${polls.length} polls`, pass: short === 0 })
  }
  if (roomEndedReceived != null) {
    checks.push({ check: 'room:ended reached every joined student', value: `${roomEndedReceived}/${joined}`, pass: roomEndedReceived >= joined })
  }
  return { pass: checks.every(c => c.pass), checks }
}

export function pollSummary(session, students) {
  return [...session.polls.values()].sort((a, b) => a.index - b.index).map(p => ({
    poll: p.index + 1,
    type: p.type,
    questionId: p.questionId,
    deliveredTo: p.received,
    notDelivered: Math.max(0, students - p.received),
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
    log(`poll ${p.poll} (${p.type}): delivered ${p.deliveredTo}/${config.students}, answers accepted ${p.answersAccepted}, rejected ${p.answersRejected}`)
  }
  log(`room:ended received by ${summary.roomEndedReceived}/${c.studentsJoined} joined students`)
  log(`generator: CPU avg ${generator.processCpuAvg}% / peak ${generator.processCpuPeak}% of one core, machine avg ${generator.machineCpuAvg}% / peak ${generator.machineCpuPeak}% (${generator.cores} cores), loop lag p99 peak ${generator.loopLagP99PeakMs}ms`)
  for (const w of generator.warnings) log(`WARNING: ${w}`)
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
  for (const ch of v.checks) log(`${ch.pass ? 'PASS' : 'FAIL'}  ${ch.check}  (got ${ch.value})`)
  log(`OVERALL: ${v.pass ? 'PASS' : 'FAIL'}${generator.possibleBottleneck ? '  (results may be limited by this machine, see warnings)' : ''}`)
  log('==================================================\n')
}
