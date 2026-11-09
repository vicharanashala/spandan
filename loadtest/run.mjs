#!/usr/bin/env node
// Spandan load simulator: one simulated teacher runs a live session while N simulated students
// join, answer each poll inside its window, and read the leaderboard. Saves the run to
// results/<timestamp>.json and prints a summary. Local / authorized test servers only.
//
//   npm start                                  # 50 students, 3 polls (safe default)
//   npm start -- --students 20 --polls 2 --answer-time 10
//   npm start -- --help
//
// Whatever happens once the run has started (normal end, Ctrl+C, or an error), the shutdown runs
// in full: the room is ended if it was created, every socket, timer and monitor is stopped, and a
// result file is saved with status "completed", "aborted" or "failed".
import os from 'node:os'
import { parseArgs, resolveConfig, passwordWarning, HELP } from './lib/config.mjs'
import { Recorder } from './lib/metrics.mjs'
import { makeApi } from './lib/http.mjs'
import { startMonitor, analyzeGenerator } from './lib/monitor.mjs'
import { startServerMetrics } from './lib/serverMetrics.mjs'
import { Session, SimTeacher } from './lib/session.mjs'
import { SimStudent } from './lib/student.mjs'
import { verdict, pollSummary, saveResult, printSummary, deliverySection, outageSection, RESULT_SCHEMA_VERSION } from './lib/report.mjs'
import { runStatus } from './lib/lifecycle.mjs'
import { runPhases, closeOut } from './lib/orchestrate.mjs'
import { buildReport } from './lib/reportFile.mjs'
import { fileURLToPath } from 'node:url'

const RESULTS_DIR = new URL('./results/', import.meta.url)
const TEACHER_EMAIL = 'lt.teacher@loadtest.spandan.test'
const studentEmail = (n) => `lt.student${String(n).padStart(4, '0')}@loadtest.spandan.test`
const LEDGER_GRACE_MS = 1000   // after reading the ledger, let broadcasts already in flight land
const ROOM_ENDED_WAIT_MS = 2000 // after ending the room, let 'room:ended' reach the students
// Shutdown waits at most this long for student starts still in flight (a stuck login/connect/join
// can otherwise hold it for its full timeouts, ~65 s). Those students are then stopped, and a stopped
// student abandons its start before opening any socket (SimStudent.start).
const START_WAIT_CAP_MS = 5000

async function preflight(cfg, api) {
  try {
    const h = await api('/health')
    if (h?.mongodb !== 'connected') throw new Error(`backend reports MongoDB ${h?.mongodb}`)
  } catch (err) {
    throw new Error(`Cannot reach the backend at ${cfg.api}/health (${err.message}).\nStart it first: cd backend && npm run dev`)
  }
  // The highest-numbered student proves enough accounts were seeded.
  try {
    await api('/auth/login', { method: 'POST', body: { email: studentEmail(cfg.students), password: cfg.password } })
  } catch (err) {
    if (err.status === 401) {
      throw new Error(`${studentEmail(cfg.students)} cannot sign in. Seed enough accounts first:\n  cd backend && npm run seed:loadtest -- --students ${cfg.students}`)
    }
    throw err
  }
}

async function main() {
  const cli = parseArgs(process.argv.slice(2))
  if (cli.help) { console.log(HELP); return 0 }
  const cfg = resolveConfig(cli, process.env)
  const pwWarning = passwordWarning(cfg)
  if (pwWarning) console.log(`${pwWarning}\n`)
  const api = makeApi(cfg.api)
  console.log(`Spandan load test -> ${cfg.api} (socket ${cfg.socketPath})`)
  console.log(`${cfg.students} students over ${cfg.rampSeconds}s, ${cfg.durationSeconds ? `polls for ${cfg.durationSeconds}s` : `${cfg.polls} poll(s)`}, ${cfg.answerSeconds}s to answer, ${cfg.gapSeconds}s gap\n`)

  // Nothing is created before this point, so a failure here simply exits (no result file).
  await preflight(cfg, api)

  const startedAt = new Date()
  const rec = new Recorder()
  const serverMetrics = await startServerMetrics(cfg, rec) // resets the backend's counters first
  const session = new Session()
  // Created up front (cheap objects, nothing connects yet) so the ramp, the monitor gauge and the
  // shutdown all work on the same list.
  const students = Array.from({ length: cfg.students }, (_, i) =>
    new SimStudent({ index: i + 1, email: studentEmail(i + 1), cfg, api, rec, session }))
  const teacher = new SimTeacher({ email: TEACHER_EMAIL, cfg, api, rec, session })
  const monitor = startMonitor(rec, {
    extraGauges: () => ({ connectedSockets: students.reduce((n, s) => n + (s.socket?.connected ? 1 : 0), 0) })
  })

  // First Ctrl+C: abort (the ramp stops at once, no further poll starts); second: force exit.
  const stopRun = new AbortController()
  const onSigint = () => {
    if (stopRun.signal.aborted) process.exit(130)
    stopRun.abort()
    console.log('\nStopping early (Ctrl+C again to force)...')
  }
  process.on('SIGINT', onSigint)

  const { failure, finalLeaderboard, ramp } = await runPhases({ cfg, rec, session, teacher, students, signal: stopRun.signal })
  const aborted = stopRun.signal.aborted

  const { ledger, finished, serverRun, generator: gen, teardownErrors, startsAbandoned } = await closeOut({
    students, ramp, teacher, session, serverMetrics, monitor,
    onStopped: () => process.off('SIGINT', onSigint),
    startWaitCapMs: START_WAIT_CAP_MS, roomEndedWaitMs: ROOM_ENDED_WAIT_MS, ledgerGraceMs: LEDGER_GRACE_MS
  })
  const generator = gen || analyzeGenerator([]) // the monitor failed to stop: report it empty, never crash
  const endedAt = new Date()

  const pushStats = session.pushStats()
  const leaderboardGrouping = session.pushGrouping() // sequence (traced, exact) or receipt order
  for (const p of pushStats) for (const ms of p.spreads) rec.sample('leaderboard_push_spread', ms)
  const snap = rec.snapshot()
  const ev = snap.events
  const disconnectReasons = Object.fromEntries(Object.entries(ev)
    .filter(([k]) => k.startsWith('disconnect:')).map(([k, v]) => [k.slice('disconnect:'.length), v]))
  const socketEvents = Object.fromEntries(Object.entries(ev)
    .filter(([k]) => k.startsWith('evt:')).map(([k, v]) => [k.slice(4), v]))

  const { password: _pw, ...safeConfig } = cfg
  const result = {
    schemaVersion: RESULT_SCHEMA_VERSION,
    tool: 'spandan-loadtest',
    status: runStatus({ aborted, failure }), // completed | aborted | failed
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    aborted,
    failure,                                  // { phase, message } or null
    teardownErrors,                           // cleanup steps that failed (normally empty)
    config: safeConfig,
    environment: {
      node: process.version, platform: process.platform, arch: process.arch,
      cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model?.trim(), totalMemoryGb: Math.round(os.totalmem() / 1073741824)
    },
    room: { roomId: session.roomId, roomCode: session.roomCode },
    summary: {
      durationSeconds: Math.round(rec.elapsedSeconds()),
      operations: snap.operations,
      connections: {
        studentsJoined: ev.studentsJoined || 0,
        studentsFailed: ev.studentsFailed || 0,
        connectFailures: ev.connectFailures || 0,
        connectErrors: ev.connectErrors || 0,
        disconnects: ev.disconnects || 0,
        disconnectReasons,
        reconnects: ev.reconnects || 0,
        startsAbandoned                        // still starting when shutdown's 5 s wait ran out
      },
      socketEventsReceived: socketEvents,
      answersSkipped: ev.answersSkipped || 0,
      answerKeyLeaked: ev.answerKeyLeaked || 0,
      leaderboardPushMissing: ev.leaderboardPushMissing || 0,
      finalLeaderboardPush: finalLeaderboard,  // { status: received | missing | not_checked, ... }
      roomEndedReceived: session.roomEndedReceipts
    },
    polls: pollSummary(session, ev.studentsJoined || 0), // "not delivered" counts joined students only
    leaderboardBroadcasts: pushStats.map(p => ({ seq: p.seq, receipts: p.receipts, spreadMs: p.spreadMs })),
    leaderboardGrouping,                      // { mode, approximate, reason }
    generator,
    // Backend-side view (only when the backend runs with SERVER_METRICS=on): the final snapshot of
    // /internal/metrics, covering exactly this run (counters were reset at the start).
    server: serverMetrics.available
      ? {
          available: true,
          url: serverMetrics.url,
          samples: serverRun.samples,
          failures: serverRun.failures,
          preexistingSockets: serverMetrics.preexistingSockets, // connected before our reset
          compromised: serverMetrics.compromised,               // non-null: reset by another client mid-run
          metrics: serverRun.final
        }
      : { available: false, reason: serverMetrics.reason },
    errorSamples: snap.errorSamples,
    timeline: snap.timeline
  }
  // Per-broadcast delivery (backend SERVER_EVENT_TRACE=on) and per-disconnect outage records.
  result.delivery = deliverySection(finished, {
    ledgerAvailable: ledger != null,
    ledgerCompromised: !!serverMetrics.compromised,
    lateMs: cfg.lateMs,
    unavailableReason: !serverMetrics.available
      ? `server metrics not available (${serverMetrics.reason})`
      : 'backend event tracing is off (start it with SERVER_METRICS=on SERVER_EVENT_TRACE=on)'
  })
  result.outages = outageSection(finished.flatMap(f => f.outages), { traced: result.delivery.status === 'traced' })

  result.verdict = verdict({
    operations: snap.operations, events: ev, polls: result.polls,
    // An aborted or failed run may never have ended the room for everyone: not judged.
    roomEndedReceived: aborted || failure ? null : session.roomEndedReceipts,
    delivery: result.delivery,
    outages: result.outages,
    finalLeaderboard,
    failure,
    leaderboardGrouping,
    serverCompromised: serverMetrics.compromised
  }, { students: cfg.students })

  let jsonPath
  try {
    jsonPath = fileURLToPath(await saveResult(RESULTS_DIR, result, startedAt))
  } catch (err) {
    console.error(`\nCould not save the result file: ${err.message}`)
    return 2
  }
  try { printSummary(result) } catch (err) { console.log(`Summary not printed: ${err.message}`) }
  console.log(`Saved ${jsonPath}${result.status !== 'completed' ? ` (${result.status}: partial result)` : ''}`)
  // The offline HTML report, built from the file just saved (regenerate any time: npm run report).
  try { console.log(`Report ${await buildReport(jsonPath)}`) } catch (err) { console.log(`HTML report not written: ${err.message}`) }
  console.log('Test data stays in the database for inspection; remove it with: cd backend && npm run clean:loadtest')
  if (failure) return 2
  return result.verdict.pass ? 0 : 1
}

main()
  .then((code) => { process.exitCode = code })
  .catch((err) => { console.error(`\nLoad test failed: ${err.message}`); process.exitCode = 2 })
