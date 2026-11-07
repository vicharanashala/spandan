// The run's orchestration, out of run.mjs so it can be tested end to end with fakes:
//   rampStudents   start students across the ramp; abortable (Ctrl+C / shutdown)
//   runPhases      teacher setup -> ramp -> polls -> leaderboard settle; never throws
//   closeOut       end the room, read the ledger, close out delivery, stop everything; never throws
// run.mjs wires the real backend, sockets, metrics and monitor into these and builds the result.
import { isStopped } from './student.mjs'
import { failureInfo, runSteps, settleWithin } from './lifecycle.mjs'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/**
 * Start each student at (i / N) * rampMs. Returns
 *   { starts, done, outcomes }
 * starts    one promise per student, resolving to 'joined' | 'failed' | 'stopped' | 'cancelled'; never rejects
 * done      resolves when every start has settled, OR as soon as `signal` aborts. On abort every slot
 *           still waiting is cancelled at once (its timer cleared, its student never starts), and starts
 *           already in flight are left to the shutdown's capped wait (closeOut) instead of being awaited.
 * onFailed  called for a genuine failure only. A start abandoned because the run is stopping
 *           (isStopped) is 'stopped', never a failed student.
 */
export function rampStudents(students, { rampMs = 0, signal = null, onFailed = () => {} } = {}) {
  const waiting = new Map() // index -> { timer, resolve }
  const outcomes = { joined: 0, failed: 0, stopped: 0, cancelled: 0 }
  const settle = (resolve, outcome) => { outcomes[outcome]++; resolve(outcome) }

  const starts = students.map((s, i) => new Promise((resolve) => {
    const delay = students.length > 1 ? (i / students.length) * rampMs : 0
    const begin = () => {
      waiting.delete(i)
      if (signal?.aborted) return settle(resolve, 'cancelled')
      s.start().then(
        () => settle(resolve, 'joined'),
        (err) => {
          if (isStopped(err)) return settle(resolve, 'stopped')
          onFailed(err, s)
          settle(resolve, 'failed')
        })
    }
    waiting.set(i, { timer: setTimeout(begin, delay), resolve })
  }))

  const cancelWaiting = () => {
    for (const { timer, resolve } of waiting.values()) { clearTimeout(timer); settle(resolve, 'cancelled') }
    waiting.clear()
  }
  let onAbort = null
  const aborted = new Promise((resolve) => {
    if (!signal) return
    onAbort = () => { cancelWaiting(); resolve() }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
  const done = Promise.race([Promise.all(starts), aborted]).then(() => {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  })
  return { starts, done, outcomes, cancelWaiting }
}

/**
 * Teacher setup, ramp, poll cycles and the final-leaderboard wait. Never throws: an error becomes
 * `failure` ({ phase, message }). Returns { failure, finalLeaderboard, ramp }.
 */
export async function runPhases({ cfg, rec, session, teacher, students, signal, log = console.log, gapSleep = sleep }) {
  let phase = 'teacher setup'
  let ramp = null
  let finalLeaderboard = { status: 'not_checked', reason: 'the run did not reach the leaderboard settle phase' }
  const aborted = () => !!signal?.aborted
  try {
    await teacher.setup()
    log(`room ${session.roomCode} created; ramping up students...`)

    phase = 'student ramp'
    ramp = rampStudents(students, { rampMs: cfg.rampSeconds * 1000, signal, onFailed: () => rec.count('studentsFailed') })
    await ramp.done
    log(`${rec.events.get('studentsJoined') || 0}/${cfg.students} students joined in ${rec.elapsedSeconds().toFixed(1)}s`)

    phase = 'polls'
    const pollPhaseStart = performance.now()
    const cycleMs = (cfg.answerSeconds + 1.5 + cfg.gapSeconds) * 1000
    for (let i = 0; i < cfg.maxPolls && !aborted(); i++) {
      if (cfg.durationSeconds > 0 && i > 0 && performance.now() - pollPhaseStart + cycleMs > cfg.durationSeconds * 1000) break
      const p = await teacher.runPoll(i).catch((err) => { log(`poll ${i + 1} failed: ${err.message}`); return null })
      if (p) log(`poll ${i + 1}: delivered to ${p.received}/${rec.events.get('studentsJoined') || 0} joined, accepted ${p.accepted}, rejected ${p.rejected}`)
      if (i + 1 < cfg.maxPolls && cfg.gapSeconds > 0 && !aborted()) await gapSleep(cfg.gapSeconds * 1000)
    }

    phase = 'leaderboard settle'
    if (aborted()) {
      finalLeaderboard = { status: 'not_checked', reason: 'the run was stopped early (Ctrl+C)' }
    } else {
      log(`waiting up to ${cfg.settleSeconds}s for the leaderboard push...`)
      finalLeaderboard = await teacher.waitForFinalLeaderboard()
      // Every joined student checks the leaderboard once more, spread over a second.
      await Promise.all(students.map(s => sleep(Math.random() * 1000).then(() => s.checkLeaderboard())))
    }
    return { failure: null, finalLeaderboard, ramp }
  } catch (err) {
    const failure = failureInfo(err, phase)
    log(`\nRun failed during ${phase}: ${failure.message}\nCleaning up and saving a partial result...`)
    return { failure, finalLeaderboard, ramp }
  }
}

/**
 * Close-out and shutdown; every step runs even if an earlier one throws. Delivery tracking is closed
 * out BEFORE any socket closes, so a normal shutdown is never counted as an outage.
 * Returns { ledger, finished, serverRun, generator, teardownErrors, startsAbandoned }.
 */
export async function closeOut({
  students, ramp, teacher, session, serverMetrics, monitor, onStopped = () => {}, log = console.log,
  startWaitCapMs = 5000, roomEndedWaitMs = 2000, ledgerGraceMs = 1000
}) {
  ramp?.cancelWaiting() // no student may start from here on
  let ledger = null
  let finished = []
  let serverRun = { samples: 0, failures: 0, final: null }
  let generator = null
  let startsAbandoned = 0
  const anyJoined = () => students.some(s => s.joined)
  const teardownErrors = await runSteps([
    // Starts still in flight get at most startWaitCapMs; they are then stopped below, and a stopped
    // student abandons its start without opening a socket or recording a failure.
    ['wait for student starts', async () => {
      const { timedOut, pending } = await settleWithin(ramp?.starts || [], startWaitCapMs)
      if (timedOut) {
        startsAbandoned = pending
        log(`cleanup: ${pending} student start(s) still in flight after ${startWaitCapMs / 1000}s; stopping them`)
      }
    }],
    ['end room', async () => {
      if (!session.roomId || !teacher.token) return // the room was never created
      await teacher.endRoom()
      if (anyJoined()) await sleep(roomEndedWaitMs) // let 'room:ended' reach the students
    }],
    ['read event-trace ledger', async () => {
      const snap = await serverMetrics.read()
      // After another client's reset the ledger restarted mid-run: comparing against it would invent
      // or hide tail losses, so it is not used (the tail check reports "compromised").
      ledger = serverMetrics.compromised ? null : snap?.eventTrace?.streams ?? null
      if (anyJoined()) await sleep(ledgerGraceMs)
    }],
    ['close out delivery', () => {
      finished = students.filter(s => s.joined).map(s => ({ student: s.index, ...s.finishDelivery(ledger) }))
    }],
    ['stop students', async () => {
      const errs = []
      for (const s of students) await s.stop().catch((e) => errs.push(e))
      if (errs.length) throw new Error(`${errs.length} student(s) failed to stop: ${errs[0].message}`)
    }],
    ['stop teacher', () => teacher.stop()],
    ['remove Ctrl+C handler', () => onStopped()],
    ['stop server metrics', async () => { serverRun = (await serverMetrics.stop()) ?? serverRun }],
    ['stop monitor', () => { generator = monitor.stop() }]
  ])
  for (const e of teardownErrors) log(`cleanup: ${e.step} failed: ${e.message}`)
  return { ledger, finished, serverRun, generator, teardownErrors, startsAbandoned }
}
