// Run-level orchestration (lib/orchestrate.mjs, exactly what run.mjs calls): Ctrl+C during the ramp,
// starts still in flight at shutdown, the capped wait, and stopped-vs-failed accounting. Real
// SimStudents on a fake socket; fake teacher, server metrics and monitor. Nothing connects anywhere.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { rampStudents, runPhases, closeOut } from '../lib/orchestrate.mjs'
import { SimStudent, isStopped } from '../lib/student.mjs'
import { Recorder } from '../lib/metrics.mjs'
import { Session } from '../lib/session.mjs'
import { analyzeGenerator } from '../lib/monitor.mjs'
import { HttpError } from '../lib/http.mjs'

const wait = (ms) => new Promise(r => setTimeout(r, ms))
const quiet = () => {}

// join: 'ok' answers room:join; 'hang' never does. connect: false = the socket never connects.
class FakeSocket {
  constructor({ join = 'ok', roomCode }) { Object.assign(this, { join, roomCode, handlers: new Map(), emitted: [], closed: 0, connected: false }) }
  on(e, fn) { (this.handlers.get(e) || this.handlers.set(e, []).get(e)).push(fn); return this }
  off(e, fn) { this.handlers.set(e, (this.handlers.get(e) || []).filter(f => f !== fn)); return this }
  onAny() { return this }
  fire(e, p) { for (const fn of [...(this.handlers.get(e) || [])]) fn(p) }
  emit(e, p) {
    this.emitted.push(e)
    if (e === 'room:join' && this.join === 'ok') setImmediate(() => this.fire('room:joined', { roomCode: this.roomCode, participants: 1 }))
    return this
  }
  close() { this.closed++; this.connected = false }
}

function world({ n = 5, join = 'ok', connect = true, loginFails = new Set(), rampSeconds = 0, maxPolls = 2 } = {}) {
  const rec = new Recorder()
  const session = new Session()
  const sockets = []
  const api = async (path, opts) => {
    if (path === '/auth/login') {
      const who = opts.body.email
      if (loginFails.has(who)) throw new HttpError(401, 'Invalid credentials', path)
      return { token: 't', user: { _id: `u-${who}` } }
    }
    return { questions: [] }
  }
  const factory = () => {
    const s = new FakeSocket({ join, roomCode: session.roomCode })
    sockets.push(s)
    if (connect) setImmediate(() => { s.connected = true; s.fire('connect') })
    return s
  }
  const cfg = { baseUrl: 'http://localhost:1', socketPath: '/socket.io', password: 'pw', answerRate: 0, students: n, rampSeconds, maxPolls, durationSeconds: 0, answerSeconds: 5, gapSeconds: 0, settleSeconds: 1 }
  const students = Array.from({ length: n }, (_, i) => new SimStudent({ index: i + 1, email: `s${i + 1}`, cfg, api, rec, session, connect: factory }))
  const calls = { setup: 0, runPoll: 0, endRoom: 0, stop: 0, settle: 0 }
  const teacher = {
    token: null,
    async setup() { calls.setup++; this.token = 'tt'; session.roomId = 'room1'; session.roomCode = 'ABC123' },
    async runPoll(i) { calls.runPoll++; return { index: i, received: 0, accepted: 0, rejected: 0 } },
    async waitForFinalLeaderboard() { calls.settle++; return { status: 'received', afterMs: 1 } },
    async endRoom() { calls.endRoom++ },
    stop() { calls.stop++ }
  }
  const serverMetrics = { compromised: null, read: async () => null, stop: async () => ({ samples: 0, failures: 0, final: null, compromised: null }) }
  const monitor = { stop: () => analyzeGenerator([]) }
  return { rec, session, students, sockets, teacher, calls, cfg, serverMetrics, monitor }
}

const fastClose = (w, ramp, extra = {}) => closeOut({
  students: w.students, ramp, teacher: w.teacher, session: w.session, serverMetrics: w.serverMetrics, monitor: w.monitor,
  log: quiet, startWaitCapMs: 50, roomEndedWaitMs: 0, ledgerGraceMs: 0, ...extra
})

describe('run-level Ctrl+C during the ramp', () => {
  test('returns at once even with a 600 s ramp; queued students never start; nothing counts as failed', async () => {
    const w = world({ n: 10, rampSeconds: 600 }) // student k is scheduled at k * 60 s
    const ac = new AbortController()
    const t0 = performance.now()
    const phases = runPhases({ cfg: w.cfg, rec: w.rec, session: w.session, teacher: w.teacher, students: w.students, signal: ac.signal, log: quiet })
    await wait(50) // student 1 (at 0 s) has joined; the other 9 are queued
    ac.abort()     // Ctrl+C
    const { failure, finalLeaderboard, ramp } = await phases
    assert.ok(performance.now() - t0 < 1000, 'the ramp wait must end on abort, not after 600 s')
    assert.equal(failure, null)
    assert.deepEqual(finalLeaderboard, { status: 'not_checked', reason: 'the run was stopped early (Ctrl+C)' })
    assert.equal(w.calls.runPoll, 0) // no poll starts after Ctrl+C
    assert.deepEqual(ramp.outcomes, { joined: 1, failed: 0, stopped: 0, cancelled: 9 })

    const out = await fastClose(w, ramp)
    assert.ok(performance.now() - t0 < 2000)
    assert.equal(out.startsAbandoned, 0)
    assert.deepEqual(out.teardownErrors, [])
    assert.equal(out.finished.length, 1)
    assert.equal(w.calls.endRoom, 1) // the room that was created is ended
    assert.equal(w.calls.stop, 1)
    assert.equal(w.sockets.length, 1) // the 9 cancelled students never opened a socket
    assert.equal(w.rec.events.get('studentsFailed'), undefined)
    assert.equal(w.rec.events.get('studentsJoined'), 1)
    for (const s of w.students) assert.equal(s.timers.size, 0)
  })

  test('a start stuck in its room join: shutdown caps the wait, stops it, and records no failure', async () => {
    const w = world({ n: 3, join: 'hang' }) // every join would only time out after 15 s
    const ac = new AbortController()
    const t0 = performance.now()
    const phases = runPhases({ cfg: w.cfg, rec: w.rec, session: w.session, teacher: w.teacher, students: w.students, signal: ac.signal, log: quiet })
    await wait(30)
    ac.abort()
    const { ramp } = await phases
    assert.ok(performance.now() - t0 < 1000, 'must not wait for the 15 s join timeouts')

    const out = await fastClose(w, ramp)
    assert.equal(out.startsAbandoned, 3)
    const outcomes = await Promise.all(ramp.starts)
    assert.deepEqual(outcomes, ['stopped', 'stopped', 'stopped'])
    assert.ok(performance.now() - t0 < 2000)
    assert.equal(w.rec.events.get('studentsFailed'), undefined)
    assert.equal(w.rec.events.get('studentsJoined'), undefined)
    assert.equal(w.rec.ops.get('join_socket'), undefined) // the stop is not a timed-out join
    assert.equal(out.finished.length, 0)
    for (const s of w.students) { assert.equal(s.timers.size, 0); assert.equal(s.aborts.size, 0) }
  })

  test('without Ctrl+C the run is unchanged: every student joins, polls and the settle run', async () => {
    const w = world({ n: 4, rampSeconds: 0.03, maxPolls: 2 })
    const { failure, finalLeaderboard, ramp } = await runPhases({ cfg: w.cfg, rec: w.rec, session: w.session, teacher: w.teacher, students: w.students, signal: new AbortController().signal, log: quiet })
    assert.equal(failure, null)
    assert.deepEqual(ramp.outcomes, { joined: 4, failed: 0, stopped: 0, cancelled: 0 })
    assert.equal(w.calls.runPoll, 2)
    assert.equal(w.calls.settle, 1)
    assert.equal(finalLeaderboard.status, 'received')
    const out = await fastClose(w, ramp)
    assert.equal(out.finished.length, 4)
    assert.equal(out.startsAbandoned, 0)
  })

  test('genuine failures are still failed students; stops are not', async () => {
    const w = world({ n: 3, loginFails: new Set(['s2']) })
    const { ramp } = await runPhases({ cfg: { ...w.cfg, maxPolls: 0 }, rec: w.rec, session: w.session, teacher: w.teacher, students: w.students, signal: new AbortController().signal, log: quiet })
    assert.deepEqual(ramp.outcomes, { joined: 2, failed: 1, stopped: 0, cancelled: 0 })
    assert.equal(w.rec.events.get('studentsFailed'), 1)
    await fastClose(w, ramp)
  })

  test('a failed teacher setup: no ramp, no room to end, shutdown still completes', async () => {
    const w = world({ n: 2 })
    w.teacher.setup = async () => { throw new Error('teacher room:error Not authorized') }
    const r = await runPhases({ cfg: w.cfg, rec: w.rec, session: w.session, teacher: w.teacher, students: w.students, signal: new AbortController().signal, log: quiet })
    assert.equal(r.failure.phase, 'teacher setup')
    assert.equal(r.ramp, null)
    const out = await fastClose(w, r.ramp)
    assert.equal(w.calls.endRoom, 0)
    assert.equal(w.calls.stop, 1)
    assert.deepEqual(out.teardownErrors, [])
  })
})

describe('rampStudents', () => {
  const fake = (start) => ({ start })
  test('an already-aborted signal cancels every slot; no student starts', async () => {
    let started = 0
    const ac = new AbortController(); ac.abort()
    const r = rampStudents([fake(async () => { started++ }), fake(async () => { started++ })], { rampMs: 1000, signal: ac.signal })
    await r.done
    assert.deepEqual(await Promise.all(r.starts), ['cancelled', 'cancelled'])
    assert.equal(started, 0)
  })

  test('cancelWaiting (shutdown) cancels queued slots without a signal', async () => {
    let started = 0
    const r = rampStudents([fake(async () => { started++ }), fake(async () => { started++ })], { rampMs: 60000 })
    await wait(20)
    r.cancelWaiting()
    assert.deepEqual(await Promise.all(r.starts), ['joined', 'cancelled'])
    assert.equal(started, 1)
  })
})

describe('SimStudent.stop during a pending connect', () => {
  test('settles the connect as stopped: no socket_connect failure, no connectFailures, no timers left', async () => {
    const w = world({ n: 1, connect: false }) // the socket never connects (connect guard: 20 s)
    await w.teacher.setup()
    const s = w.students[0]
    const outcome = s.start().then(() => null, e => e) // handled up front, as the ramp does
    await wait(20)
    assert.equal(s.timers.size, 1) // the connect guard is registered
    await s.stop()
    const err = await outcome
    assert.ok(isStopped(err))
    assert.equal(w.rec.ops.get('socket_connect'), undefined)
    assert.equal(w.rec.events.get('connectFailures'), undefined)
    assert.equal(s.timers.size, 0)
    assert.equal(s.aborts.size, 0)
    assert.ok(w.sockets[0].closed >= 1) // closed (by the abort, then stop()'s own idempotent close)
  })

  test('a real connect timeout is still recorded as a failure', async () => {
    const w = world({ n: 1, connect: false })
    await w.teacher.setup()
    const s = new SimStudent({ index: 1, email: 's1', cfg: w.cfg, api: async () => ({ token: 't', user: { _id: 'u' } }), rec: w.rec, session: w.session, connect: () => new FakeSocket({}), connectTimeoutMs: 20 })
    await assert.rejects(s.start(), /socket connect timeout/)
    assert.equal(w.rec.events.get('connectFailures'), 1)
    assert.ok(w.rec.ops.get('socket_connect'))
    await s.stop()
  })
})
