#!/usr/bin/env node
// Spandan load simulator: one simulated teacher runs a live session while N simulated students
// join, answer each poll inside its window, and read the leaderboard. Saves the run to
// results/<timestamp>.json and prints a summary. Local / authorized test servers only.
//
//   npm start                                  # 50 students, 3 polls (safe default)
//   npm start -- --students 20 --polls 2 --answer-time 10
//   npm start -- --help
import os from 'node:os'
import { parseArgs, resolveConfig, HELP } from './lib/config.mjs'
import { Recorder } from './lib/metrics.mjs'
import { makeApi } from './lib/http.mjs'
import { startMonitor } from './lib/monitor.mjs'
import { startServerMetrics } from './lib/serverMetrics.mjs'
import { Session, SimTeacher } from './lib/session.mjs'
import { SimStudent } from './lib/student.mjs'
import { verdict, pollSummary, saveResult, printSummary, deliverySection, outageSection, RESULT_SCHEMA_VERSION } from './lib/report.mjs'
import { buildReport } from './make-report.mjs'
import { fileURLToPath } from 'node:url'

const RESULTS_DIR = new URL('./results/', import.meta.url)
const TEACHER_EMAIL = 'lt.teacher@loadtest.spandan.test'
const studentEmail = (n) => `lt.student${String(n).padStart(4, '0')}@loadtest.spandan.test`
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const LEDGER_GRACE_MS = 1000 // after reading the ledger, let broadcasts already in flight land

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
  const api = makeApi(cfg.api)
  console.log(`Spandan load test -> ${cfg.api} (socket ${cfg.socketPath})`)
  console.log(`${cfg.students} students over ${cfg.rampSeconds}s, ${cfg.durationSeconds ? `polls for ${cfg.durationSeconds}s` : `${cfg.polls} poll(s)`}, ${cfg.answerSeconds}s to answer, ${cfg.gapSeconds}s gap\n`)

  await preflight(cfg, api)

  const startedAt = new Date()
  const rec = new Recorder()
  const serverMetrics = await startServerMetrics(cfg, rec) // resets the backend's counters first
  const session = new Session()
  const students = []
  let connected = 0
  const monitor = startMonitor(rec, {
    extraGauges: () => {
      connected = students.reduce((n, s) => n + (s.socket?.connected ? 1 : 0), 0)
      return { connectedSockets: connected }
    }
  })

  let aborted = false
  const onSigint = () => { if (aborted) process.exit(130); aborted = true; console.log('\nStopping early (Ctrl+C again to force)...') }
  process.on('SIGINT', onSigint)

  const teacher = new SimTeacher({ email: TEACHER_EMAIL, cfg, api, rec, session })
  await teacher.setup()
  console.log(`room ${session.roomCode} created; ramping up students...`)

  // Ramp: student i starts at (i / N) * ramp.
  const starts = []
  for (let i = 0; i < cfg.students; i++) {
    const s = new SimStudent({ index: i + 1, email: studentEmail(i + 1), cfg, api, rec, session })
    students.push(s)
    const delay = cfg.students > 1 ? (i / cfg.students) * cfg.rampSeconds * 1000 : 0
    starts.push(sleep(delay).then(() => (aborted ? null : s.start())).catch(() => { rec.count('studentsFailed') }))
  }
  await Promise.all(starts)
  console.log(`${rec.events.get('studentsJoined') || 0}/${cfg.students} students joined in ${rec.elapsedSeconds().toFixed(1)}s`)

  // Poll cycles.
  const pollPhaseStart = performance.now()
  const cycleMs = (cfg.answerSeconds + 1.5 + cfg.gapSeconds) * 1000
  for (let i = 0; i < cfg.maxPolls && !aborted; i++) {
    if (cfg.durationSeconds > 0 && i > 0 && performance.now() - pollPhaseStart + cycleMs > cfg.durationSeconds * 1000) break
    const p = await teacher.runPoll(i).catch((err) => { console.log(`poll ${i + 1} failed: ${err.message}`); return null })
    if (p) console.log(`poll ${i + 1}: delivered to ${p.received}/${cfg.students}, accepted ${p.accepted}, rejected ${p.rejected}`)
    if (i + 1 < cfg.maxPolls && cfg.gapSeconds > 0 && !aborted) await sleep(cfg.gapSeconds * 1000)
  }

  if (!aborted) {
    console.log(`waiting up to ${cfg.settleSeconds}s for the leaderboard push...`)
    await teacher.waitForFinalLeaderboard()
    // Every joined student checks the leaderboard once more, spread over a second.
    await Promise.all(students.map(s => sleep(Math.random() * 1000).then(() => s.checkLeaderboard())))
  }
  await teacher.endRoom()
  await sleep(2000) // let 'room:ended' reach the students

  // Delivery tracking is closed out BEFORE any socket closes, so a normal shutdown is never counted
  // as an outage: read the server's event-trace ledger (the last seq per stream), give broadcasts
  // already in flight a moment to land, then take each joined student's summary.
  const ledgerSnap = await serverMetrics.read()
  const ledger = ledgerSnap?.eventTrace?.streams ?? null
  await sleep(LEDGER_GRACE_MS)
  const finished = students.filter(s => s.joined).map(s => ({ student: s.index, ...s.finishDelivery(ledger) }))

  for (const s of students) await s.stop()
  teacher.stop()
  process.off('SIGINT', onSigint)
  const serverRun = await serverMetrics.stop()
  const generator = monitor.stop()
  const endedAt = new Date()

  const pushStats = session.pushStats()
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
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    aborted,
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
        reconnects: ev.reconnects || 0
      },
      socketEventsReceived: socketEvents,
      answersSkipped: ev.answersSkipped || 0,
      answerKeyLeaked: ev.answerKeyLeaked || 0,
      leaderboardPushMissing: ev.leaderboardPushMissing || 0,
      roomEndedReceived: session.roomEndedReceipts
    },
    polls: pollSummary(session, cfg.students),
    leaderboardBroadcasts: pushStats.map(p => ({ receipts: p.receipts, spreadMs: p.spreadMs })),
    generator,
    // Backend-side view (only when the backend runs with SERVER_METRICS=on): the final snapshot of
    // /internal/metrics, covering exactly this run (counters were reset at the start).
    server: serverMetrics.available
      ? { available: true, url: serverMetrics.url, samples: serverRun.samples, failures: serverRun.failures, metrics: serverRun.final }
      : { available: false, reason: serverMetrics.reason },
    errorSamples: snap.errorSamples,
    timeline: snap.timeline
  }
  // Per-broadcast delivery (backend SERVER_EVENT_TRACE=on) and per-disconnect outage records.
  result.delivery = deliverySection(finished, {
    ledgerAvailable: ledger != null,
    lateMs: cfg.lateMs,
    unavailableReason: !serverMetrics.available
      ? `server metrics not available (${serverMetrics.reason})`
      : 'backend event tracing is off (start it with SERVER_METRICS=on SERVER_EVENT_TRACE=on)'
  })
  result.outages = outageSection(finished.flatMap(f => f.outages), { traced: result.delivery.status === 'traced' })

  result.verdict = verdict({
    operations: snap.operations, events: ev, polls: result.polls,
    roomEndedReceived: aborted ? null : session.roomEndedReceipts,
    delivery: result.delivery,
    outages: result.outages
  }, { students: cfg.students })

  const file = await saveResult(RESULTS_DIR, result, startedAt)
  printSummary(result)
  const jsonPath = fileURLToPath(file)
  console.log(`Saved ${jsonPath}`)
  // The offline HTML report, built from the file just saved (regenerate any time: npm run report).
  try { console.log(`Report ${await buildReport(jsonPath)}`) } catch (err) { console.log(`HTML report not written: ${err.message}`) }
  console.log('Test data stays in the database for inspection; remove it with: cd backend && npm run clean:loadtest')
  return result.verdict.pass ? 0 : 1
}

main()
  .then((code) => { process.exitCode = code })
  .catch((err) => { console.error(`\nLoad test failed: ${err.message}`); process.exitCode = 2 })
