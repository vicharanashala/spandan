// SimStudent's delivery tracking and outage records, driven through its socket lifecycle handlers
// with stubs (no backend needed): lt:hello baselines, traced broadcasts, disconnect -> reconnect ->
// re-join -> resync, and closing out before sockets close.
import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { SimStudent, TRACE_FIELD } from '../lib/student.mjs'
import { Recorder } from '../lib/metrics.mjs'
import { Session } from '../lib/session.mjs'

const live = []
afterEach(async () => { for (const s of live.splice(0)) await s.stop() })

function makeStudent({ baseUrl = 'http://localhost:3001', lateMs = 2000, resync = { questions: [] } } = {}) {
  const session = new Session()
  session.roomId = 'room1'
  session.roomCode = 'ABC123'
  const calls = []
  const api = async (path) => { calls.push(path); return resync }
  const s = new SimStudent({ index: 7, email: 'x@y', cfg: { baseUrl, lateMs, answerRate: 0 }, api, rec: new Recorder(), session })
  s.socket = { emitted: [], emit(e, p) { this.emitted.push([e, p]) }, close() {} }
  s.token = 't'
  s.userId = 'u7'
  s.joined = true
  live.push(s)
  return { s, session, calls }
}

const traced = (s, event, n, { sid = 'A', t = Date.now() } = {}) => s._onTraced(event, { x: 1, [TRACE_FIELD]: { s: sid, n, t } })
const flush = () => new Promise(r => setImmediate(r))

describe('SimStudent delivery tracking', () => {
  test('hello sets the baseline; traced broadcasts are tracked and untraced ones ignored', () => {
    const { s } = makeStudent()
    s._onHello({ s: 'A', n: 3 })
    for (const n of [4, 5, 6]) traced(s, 'counts:updated', n)
    s._onTraced('room:joined', { participants: 2 }) // not stamped: ignored
    s._onTraced('video:pause', undefined)
    const f = s.finishDelivery({ A: { lastSeq: 6 } })
    assert.equal(f.traced, true)
    assert.equal(f.delivery.received, 3)
    assert.equal(f.delivery.droppedConnected, 0)
    assert.equal(f.delivery.tailUnverified, false)
    assert.deepEqual(f.outages, [])
  })

  test('out-of-order and duplicate broadcasts are classified', () => {
    const { s } = makeStudent()
    s._onHello({ s: 'A', n: 0 })
    for (const n of [1, 3, 2, 3]) traced(s, 'counts:updated', n)
    const d = s.finishDelivery({ A: { lastSeq: 3 } }).delivery
    assert.equal(d.outOfOrder, 1)
    assert.equal(d.duplicates, 1)
  })

  test('without any lt:hello the run is untraced', () => {
    const { s } = makeStudent()
    const f = s.finishDelivery(null)
    assert.equal(f.traced, false)
    assert.equal(f.delivery.received, 0)
  })

  test('--late-ms comes from the config; late events stay delivered', () => {
    const { s } = makeStudent({ lateMs: 100 })
    s._onHello({ s: 'A', n: 0 })
    traced(s, 'new_question', 1, { t: Date.now() - 500 })
    const d = s.finishDelivery({ A: { lastSeq: 1 } }).delivery
    assert.equal(d.late, 1)
    assert.equal(d.received, 1)
    assert.equal(d.droppedConnected, 0)
  })

  test('a remote target has no comparable clock', () => {
    const { s } = makeStudent({ baseUrl: 'https://test.example.org' })
    s._onHello({ s: 'A', n: 0 })
    traced(s, 'new_question', 1, { t: Date.now() - 99_999 })
    const d = s.finishDelivery({ A: { lastSeq: 1 } }).delivery
    assert.equal(d.clock, 'unavailable')
    assert.equal(d.late, null)
    assert.equal(d.received, 1)
  })

  test('closing out before stop() means a normal shutdown is not an outage', async () => {
    const { s } = makeStudent()
    s._onHello({ s: 'A', n: 0 })
    traced(s, 'room:ended', 1)
    const f = s.finishDelivery({ A: { lastSeq: 1 } })
    await s.stop()
    s._onDisconnect('io client disconnect') // the clean close: ignored while closing
    assert.deepEqual(f.outages, [])
    assert.equal(f.delivery.tailMissing, 0)
    assert.equal(s.outages.length, 0)
    assert.equal(s.rec.events.get('disconnects'), undefined)
  })
})

describe('SimStudent outage records', () => {
  test('disconnect -> reconnect -> re-join -> resync: durations, missed seqs, recovered poll', async () => {
    const qid = 'q-missed'
    const { s, session, calls } = makeStudent({ resync: { success: true, questions: [{ _id: 'q-old' }, { _id: qid }] } })
    const t0 = performance.now() - 10_000 // all lifecycle times in the past
    s.joinedAt = t0 - 5000
    session.polls.set('q-old', { index: 0, questionId: 'q-old', launchedAt: t0 - 4000, received: 1, recovered: 0 })
    s.received.add('q-old')
    session.polls.set(qid, { index: 1, questionId: qid, launchedAt: t0 + 500, received: 0, recovered: 0 })
    session.polls.set('q-after', { index: 2, questionId: 'q-after', launchedAt: t0 + 3000, received: 0, recovered: 0 })

    s._onHello({ s: 'A', n: 0 })
    traced(s, 'counts:updated', 1)
    traced(s, 'counts:updated', 2)
    s._onDisconnect('transport close', t0)
    s._onReconnect(t0 + 1500)
    assert.deepEqual(s.socket.emitted.map(e => e[0]), ['authenticate', 'room:join'])
    s._onHello({ s: 'A', n: 5 }, t0 + 1600)
    await flush(); await flush()
    traced(s, 'counts:updated', 6)

    const f = s.finishDelivery({ A: { lastSeq: 6 } })
    assert.equal(f.outages.length, 1)
    const o = f.outages[0]
    assert.equal(o.student, 7)
    assert.equal(o.reason, 'transport close')
    assert.equal(o.outageMs, 1500)
    assert.equal(o.rejoinMs, 100)
    assert.equal(typeof o.resyncMs, 'number')
    assert.equal(o.missedSeqs, 3)
    // q-old was received; q-after was launched after the re-join, so it is not "missed".
    assert.deepEqual(o.missedQuestions, [{ questionId: qid, poll: 2, recovered: true }])
    assert.equal(o.recovered, true)
    assert.equal(o.stuck, false)
    assert.ok(!Object.keys(o).some(k => k.startsWith('_')))
    assert.equal(session.polls.get(qid).recovered, 1)
    assert.ok(calls.some(p => p === '/responses/room/room1/student/u7'))

    assert.equal(f.delivery.missedOutage, 3)
    assert.equal(f.delivery.droppedConnected, 0)
    assert.equal(f.delivery.outages, 1)
    assert.equal(s.rec.events.get('reconnects'), 1)
    assert.equal(s.rec.ops.get('reconnect_time').samples[0], 1500)
  })

  test('a missed poll the resync does not return is not recovered', async () => {
    const { s, session } = makeStudent({ resync: { questions: [] } })
    const t0 = performance.now() - 10_000
    s.joinedAt = t0 - 1000
    session.polls.set('q1', { index: 0, questionId: 'q1', launchedAt: t0 + 100, received: 0, recovered: 0 })
    s._onHello({ s: 'A', n: 0 })
    s._onDisconnect('ping timeout', t0)
    s._onReconnect(t0 + 1000)
    s._onHello({ s: 'A', n: 2 }, t0 + 1100)
    await flush(); await flush()
    const o = s.finishDelivery({ A: { lastSeq: 2 } }).outages[0]
    assert.equal(o.recovered, false)
    assert.deepEqual(o.missedQuestions, [{ questionId: 'q1', poll: 1, recovered: false }])
    assert.equal(session.polls.get('q1').recovered, 0)
  })

  test('an outage with no polls in it is recovered trivially', async () => {
    const { s } = makeStudent()
    const t0 = performance.now() - 10_000
    s._onHello({ s: 'A', n: 0 })
    s._onDisconnect('transport close', t0)
    s._onReconnect(t0 + 1000)
    s._onHello({ s: 'A', n: 0 }, t0 + 1050)
    await flush(); await flush()
    const o = s.finishDelivery({ A: { lastSeq: 0 } }).outages[0]
    assert.equal(o.recovered, true)
    assert.equal(o.missedSeqs, 0)
  })

  test('still disconnected at the end: stuck, with the outage so far', () => {
    const { s } = makeStudent()
    s._onHello({ s: 'A', n: 0 })
    traced(s, 'counts:updated', 1)
    const t0 = performance.now() - 3000
    s._onDisconnect('io server disconnect', t0) // never auto-reconnects
    const f = s.finishDelivery({ A: { lastSeq: 4 } }, t0 + 3000)
    assert.equal(f.outages[0].stuck, true)
    assert.equal(f.outages[0].outageMs, 3000)
    assert.equal(f.outages[0].rejoinMs, null)
    assert.equal(f.delivery.missedOutage, 3) // the tail, while down
    assert.equal(f.delivery.tailMissing, 0)
  })

  test('reconnected but never re-joined (traced): stuck', () => {
    const { s } = makeStudent()
    const t0 = performance.now() - 5000
    s._onHello({ s: 'A', n: 0 })
    s._onDisconnect('transport close', t0)
    s._onReconnect(t0 + 1000)
    const o = s.finishDelivery({ A: { lastSeq: 0 } }).outages[0]
    assert.equal(o.stuck, true)
    assert.equal(o.outageMs, 1000)
    assert.equal(o.rejoinMs, null)
  })

  test('untraced runs still record outages, without rejoin time or stuck guesses', async () => {
    const { s } = makeStudent()
    const t0 = performance.now() - 5000
    s._onDisconnect('transport close', t0)
    s._onReconnect(t0 + 2000)
    await flush(); await flush()
    const f = s.finishDelivery(null)
    assert.equal(f.traced, false)
    assert.equal(f.outages[0].outageMs, 2000)
    assert.equal(f.outages[0].rejoinMs, null)
    assert.equal(f.outages[0].stuck, false)
    assert.equal(f.outages[0].recovered, true)
  })

  test('connect errors while down do not open extra outages', () => {
    const { s } = makeStudent()
    s._onHello({ s: 'A', n: 0 })
    s._onDisconnect('transport close')
    s._onDisconnect('transport close') // e.g. a duplicate signal before reconnecting
    assert.equal(s.outages.length, 1)
  })
})
