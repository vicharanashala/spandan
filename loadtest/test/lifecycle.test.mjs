// Run lifecycle: failure cleanup, partial results, and the final-leaderboard verdict check.
// Offline: the teacher's socket is a fake, nothing connects anywhere.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { runStatus, failureInfo, runSteps } from '../lib/lifecycle.mjs'
import { Session, SimTeacher } from '../lib/session.mjs'
import { Recorder } from '../lib/metrics.mjs'
import { verdict, printSummary, FINAL_LEADERBOARD_CHECK } from '../lib/report.mjs'
import { renderHtmlReport } from '../lib/htmlReport.mjs'

class FakeSocket {
  constructor() { this.handlers = new Map(); this.emitted = []; this.closed = 0; this.connected = false }
  on(e, fn) { (this.handlers.get(e) || this.handlers.set(e, []).get(e)).push(fn); return this }
  off(e, fn) { this.handlers.set(e, (this.handlers.get(e) || []).filter(f => f !== fn)); return this }
  emit(e, p) { this.emitted.push([e, p]); return this }
  fire(e, p) { for (const fn of [...(this.handlers.get(e) || [])]) fn(p) }
  close() { this.closed++; this.connected = false }
}

const fakeApi = async (path) => (path === '/auth/login' ? { token: 'tok' } : { room: { _id: 'room1', code: 'ABC123' } })

function makeTeacher({ joinTimeoutMs = 2000, settleSeconds = 1 } = {}) {
  const socket = new FakeSocket()
  const session = new Session()
  const teacher = new SimTeacher({
    email: 't@x', cfg: { password: 'pw', baseUrl: 'http://localhost:1', socketPath: '/socket.io', settleSeconds },
    api: fakeApi, rec: new Recorder(), session, connect: () => socket, joinTimeoutMs
  })
  return { teacher, socket, session }
}

// Lets the awaited login + create-room calls inside setup() resolve, so the socket exists.
const untilSocket = async (teacher) => { for (let i = 0; i < 20 && !teacher.socket; i++) await new Promise(r => setImmediate(r)) }

describe('lifecycle helpers', () => {
  test('runStatus: failed wins over aborted; otherwise completed', () => {
    assert.equal(runStatus({}), 'completed')
    assert.equal(runStatus({ aborted: true }), 'aborted')
    assert.equal(runStatus({ aborted: true, failure: { phase: 'x', message: 'y' } }), 'failed')
  })

  test('failureInfo keeps the phase and a capped message, never a stack', () => {
    const f = failureInfo(new Error('boom'.repeat(200)), 'teacher setup')
    assert.equal(f.phase, 'teacher setup')
    assert.equal(f.message.length, 300)
    assert.equal(Object.keys(f).sort().join(), 'message,phase')
  })

  test('runSteps runs every step even when earlier ones throw, and reports which failed', async () => {
    const ran = []
    const errors = await runSteps([
      ['end room', async () => { ran.push(1); throw new Error('backend down') }],
      ['stop students', () => { ran.push(2) }],
      ['stop teacher', () => { ran.push(3); throw new Error('already closed') }],
      ['stop monitor', async () => { ran.push(4) }]
    ])
    assert.deepEqual(ran, [1, 2, 3, 4])
    assert.deepEqual(errors, [{ step: 'end room', message: 'backend down' }, { step: 'stop teacher', message: 'already closed' }])
  })
})

describe('SimTeacher.setup socket cleanup', () => {
  test('room:error rejects AND closes the socket, so nothing keeps reconnecting', async () => {
    const { teacher, socket } = makeTeacher()
    const p = teacher.setup()
    await untilSocket(teacher)
    socket.fire('connect')
    socket.fire('room:error', { error: 'Not authorized' })
    await assert.rejects(p, /teacher room:error Not authorized/)
    assert.equal(socket.closed, 1)
    teacher.stop() // the run's teardown calls stop() again: must stay safe
    assert.equal(socket.closed, 2)
  })

  test('a join timeout rejects and closes the socket', async () => {
    const { teacher, socket } = makeTeacher({ joinTimeoutMs: 30 })
    const p = teacher.setup()
    await untilSocket(teacher)
    socket.fire('connect')
    await assert.rejects(p, /teacher socket\/join timeout/)
    assert.equal(socket.closed, 1)
  })

  test('a successful join leaves the socket open, and a later room:error cannot close it', async () => {
    const { teacher, socket, session } = makeTeacher()
    const p = teacher.setup()
    await untilSocket(teacher)
    socket.fire('connect')
    assert.deepEqual(socket.emitted.map(e => e[0]), ['authenticate', 'room:join'])
    socket.fire('room:joined', { roomCode: 'OTHER' }) // someone else's room: ignored
    socket.fire('room:joined', { roomCode: session.roomCode })
    await p
    socket.fire('room:error', { error: 'late' })
    assert.equal(socket.closed, 0)
    assert.equal(session.roomId, 'room1')
  })

  test('stop() before any socket exists is a no-op', () => {
    const { teacher } = makeTeacher()
    assert.doesNotThrow(() => teacher.stop())
  })
})

describe('SimTeacher.waitForFinalLeaderboard', () => {
  test('no poll completed: not_checked at once, without waiting out the settle time', async () => {
    const { teacher } = makeTeacher({ settleSeconds: 60 })
    const t0 = performance.now()
    const out = await teacher.waitForFinalLeaderboard()
    assert.equal(out.status, 'not_checked')
    assert.match(out.reason, /no poll completed/)
    assert.ok(performance.now() - t0 < 1000)
    assert.equal(teacher.rec.events.get('leaderboardPushMissing'), undefined)
  })

  test('no push after the last segment-done: missing, and counted', async () => {
    const { teacher, session } = makeTeacher({ settleSeconds: 0.3 })
    teacher.segmentDoneAt.push(1000)
    session.noteLeaderboardPush(0, 500) // an earlier push does not count
    const out = await teacher.waitForFinalLeaderboard()
    assert.deepEqual(out, { status: 'missing', waitedSeconds: 0.3 })
    assert.equal(teacher.rec.events.get('leaderboardPushMissing'), 1)
  })

  test('a push after the last segment-done: received, with its delay', async () => {
    const { teacher, session } = makeTeacher({ settleSeconds: 5 })
    teacher.segmentDoneAt.push(1000)
    session.noteLeaderboardPush(0, 1250)
    const out = await teacher.waitForFinalLeaderboard()
    assert.deepEqual(out, { status: 'received', afterMs: 250 })
  })
})

describe('verdict: final leaderboard push and run failure', () => {
  const base = { operations: {}, events: { studentsJoined: 10 } }
  const opts = { students: 10 }
  const find = (v) => v.checks.find(c => c.check === FINAL_LEADERBOARD_CHECK)

  test('received passes', () => {
    const v = verdict({ ...base, finalLeaderboard: { status: 'received', afterMs: 820 } }, opts)
    assert.equal(find(v).status, 'PASS')
    assert.match(find(v).value, /820ms/)
    assert.equal(v.pass, true)
  })

  test('missing fails the run', () => {
    const v = verdict({ ...base, finalLeaderboard: { status: 'missing', waitedSeconds: 25 } }, opts)
    assert.equal(find(v).status, 'FAIL')
    assert.match(find(v).value, /none within 25s/)
    assert.equal(v.pass, false)
  })

  test('aborted run: N/A with the reason, which neither passes nor fails', () => {
    const v = verdict({ ...base, finalLeaderboard: { status: 'not_checked', reason: 'the run was stopped early (Ctrl+C)' } }, opts)
    const c = find(v)
    assert.equal(c.status, 'N/A')
    assert.equal(c.pass, null)
    assert.match(c.value, /stopped early/)
    assert.equal(v.pass, true)
  })

  test('older callers that pass no outcome get no check at all', () => {
    assert.equal(find(verdict(base, opts)), undefined)
  })

  test('a run stopped by an error always fails, naming the phase', () => {
    const v = verdict({
      ...base,
      failure: { phase: 'teacher setup', message: 'teacher room:error Not authorized' },
      finalLeaderboard: { status: 'not_checked', reason: 'the run did not reach the leaderboard settle phase' }
    }, opts)
    assert.equal(v.pass, false)
    const c = v.checks.find(x => x.check === 'run completed without an error')
    assert.equal(c.status, 'FAIL')
    assert.match(c.value, /teacher setup: teacher room:error/)
    assert.equal(find(v).status, 'N/A')
  })
})

describe('partial results', () => {
  const failed = () => {
    const failure = { phase: 'teacher setup', message: '<b>teacher socket/join timeout</b>' }
    return {
      schemaVersion: 2, tool: 'spandan-loadtest', status: 'failed', aborted: false, failure,
      teardownErrors: [{ step: 'end room', message: 'HTTP 503' }],
      startedAt: '2026-11-08T10:00:00.000Z', endedAt: '2026-11-08T10:00:21.000Z',
      config: { api: 'http://localhost:3001/api', students: 10, rampSeconds: 1, answerSeconds: 15 },
      summary: { durationSeconds: 21, operations: {}, connections: { studentsJoined: 0, connectFailures: 0, disconnects: 0, reconnects: 0, disconnectReasons: {} }, roomEndedReceived: 0 },
      polls: [],
      generator: null,
      verdict: verdict({ operations: {}, events: {}, failure, finalLeaderboard: { status: 'not_checked', reason: 'the run did not reach the leaderboard settle phase' } }, { students: 10 })
    }
  }

  test('printSummary handles a failed run with no generator summary', () => {
    const lines = []
    assert.doesNotThrow(() => printSummary(failed(), (l) => lines.push(l)))
    const out = lines.join('\n')
    assert.match(out, /RUN FAILED during teacher setup/)
    assert.match(out, /CLEANUP {2}end room failed: HTTP 503/)
    assert.match(out, /N\/A +final leaderboard push/)
    assert.match(out, /OVERALL: FAIL/)
  })

  test('the HTML report shows an escaped failure banner', () => {
    const html = renderHtmlReport(failed())
    assert.match(html, /The run failed<\/strong> during teacher setup: &lt;b&gt;teacher socket\/join timeout&lt;\/b&gt;/)
    assert.ok(!html.includes('<b>teacher'))
    assert.match(html, /OVERALL: FAIL/)
  })
})
