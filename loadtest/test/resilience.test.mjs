// Resync retry after the backend question cache (C6), detection of another client resetting the
// backend metrics mid-run (C14), and the capped wait for student starts during shutdown.
// Offline: stubs and an in-process HTTP stand-in only.
import { test, describe, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { SimStudent } from '../lib/student.mjs'
import { Recorder } from '../lib/metrics.mjs'
import { Session } from '../lib/session.mjs'
import { resolveConfig, parseArgs, defaultResyncRetryMs } from '../lib/config.mjs'
import { outageSection, deliverySection, verdict, printSummary } from '../lib/report.mjs'
import { renderHtmlReport } from '../lib/htmlReport.mjs'
import { startServerMetrics, detectForeignReset } from '../lib/serverMetrics.mjs'
import { settleWithin } from '../lib/lifecycle.mjs'

const flush = () => new Promise(r => setImmediate(r))
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const live = []
afterEach(async () => { for (const s of live.splice(0)) await s.stop() })

// A student whose past-answers fetches return `responses` in order (the last one repeats).
function student({ responses, resyncRetryMs = 0 }) {
  const session = new Session()
  session.roomId = 'room1'
  session.roomCode = 'ABC123'
  let i = 0
  const calls = []
  const api = async (path) => { calls.push(path); return responses[Math.min(i++, responses.length - 1)] }
  const s = new SimStudent({ index: 3, email: 'x@y', cfg: { baseUrl: 'http://localhost:3001', answerRate: 0, resyncRetryMs }, api, rec: new Recorder(), session })
  s.socket = { emitted: [], emit(e, p) { this.emitted.push([e, p]) }, close() {} }
  s.token = 't'; s.userId = 'u3'; s.joined = true
  live.push(s)
  return { s, session, calls }
}

// Joined, poll q1 launched while the socket was down, then reconnect + re-join.
async function outageMissing(s, session) {
  const t0 = performance.now() - 10_000
  s.joinedAt = t0 - 1000
  session.polls.set('q1', { index: 0, questionId: 'q1', launchedAt: t0 + 100, received: 0, recovered: 0 })
  s._onHello({ s: 'A', n: 0 })
  s._onDisconnect('transport close', t0)
  s._onReconnect(t0 + 1000)
  s._onHello({ s: 'A', n: 1 }, t0 + 1100)
  await flush(); await flush()
}

const WITH_Q1 = { questions: [{ _id: 'q1' }] }
const EMPTY = { questions: [] }

describe('C6: resync retry after the backend question cache', () => {
  test('immediate recovery: no retry is made', async () => {
    const { s, session, calls } = student({ responses: [WITH_Q1], resyncRetryMs: 30 })
    await outageMissing(s, session)
    await wait(60); await flush()
    const o = s.finishDelivery(null).outages[0]
    assert.equal(o.recovered, true)
    assert.equal(o.missedQuestions[0].retry, 'none')
    assert.equal(o.missedQuestions[0].recoveredAfterMs, o.resyncMs)
    assert.equal(calls.length, 1)
    assert.equal(session.polls.get('q1').recovered, 1)
  })

  test('delayed recovery: the first fetch misses it (stale cache), the one retry returns it', async () => {
    const { s, session, calls } = student({ responses: [EMPTY, WITH_Q1], resyncRetryMs: 30 })
    await outageMissing(s, session)
    assert.equal(s.outages[0].recovered, null) // undecided until the retry, neither pass nor fail
    await wait(60); await flush(); await flush()
    const o = s.finishDelivery(null).outages[0]
    assert.equal(calls.length, 2)
    assert.deepEqual({ ...o.missedQuestions[0], recoveredAfterMs: typeof o.missedQuestions[0].recoveredAfterMs },
      { questionId: 'q1', poll: 1, recovered: true, recoveredAfterMs: 'number', retry: 'recovered' })
    assert.ok(o.missedQuestions[0].recoveredAfterMs > o.resyncMs) // the delay is the retry's, not the first fetch's
    assert.equal(o.recovered, true)
    assert.equal(session.polls.get('q1').recovered, 1)
    assert.ok(s.rec.ops.get('past_responses_resync_retry'))
  })

  test('still missing after the retry: not recovered', async () => {
    const { s, session, calls } = student({ responses: [EMPTY, EMPTY], resyncRetryMs: 30 })
    await outageMissing(s, session)
    await wait(60); await flush(); await flush()
    const o = s.finishDelivery(null).outages[0]
    assert.equal(calls.length, 2)
    assert.equal(o.recovered, false)
    assert.equal(o.missedQuestions[0].retry, 'still_missing')
    assert.equal(o.missedQuestions[0].recoveredAfterMs, null)
    assert.equal(session.polls.get('q1').recovered, 0)
  })

  test('a failed retry request is still missing, never recovered', async () => {
    const { s, session } = student({ responses: [EMPTY], resyncRetryMs: 30 })
    s.api = async () => { if (s._failNext) throw new Error('HTTP 503'); s._failNext = true; return EMPTY }
    await outageMissing(s, session)
    await wait(60); await flush(); await flush()
    const o = s.finishDelivery(null).outages[0]
    assert.equal(o.recovered, false)
    assert.equal(o.missedQuestions[0].retry, 'still_missing')
  })

  test('the run ends before the retry: not recovered, and a late answer cannot change the record', async () => {
    const { s, session } = student({ responses: [EMPTY, WITH_Q1], resyncRetryMs: 5000 })
    await outageMissing(s, session)
    const o = s.finishDelivery(null).outages[0]
    assert.equal(o.recovered, false)
    assert.equal(o.missedQuestions[0].retry, 'not_completed')
    s._onResyncRetry(s.outages[0], WITH_Q1) // a late retry result
    assert.equal(s.outages[0].missedQuestions[0].recovered, false)
    assert.equal(session.polls.get('q1').recovered, 0)
  })

  test('retries off (0): a miss is final at once, as before', async () => {
    const { s, session, calls } = student({ responses: [EMPTY, WITH_Q1], resyncRetryMs: 0 })
    await outageMissing(s, session)
    await wait(30)
    assert.equal(s.outages[0].recovered, false)
    assert.equal(s.outages[0].missedQuestions[0].retry, 'none')
    assert.equal(calls.length, 1)
  })

  test('report: a retry recovery passes, with its delay as INFO; still-missing and not-completed fail', () => {
    const rec = (q) => ({ student: 1, atSec: 2, reason: 'transport close', outageMs: 1500, rejoinMs: 50, resyncMs: 80, missedSeqs: 1, missedQuestions: [q], recovered: q.recovered, stuck: false })
    const base = { operations: {}, events: { studentsJoined: 1 } }
    const delayed = outageSection([rec({ questionId: 'q', poll: 1, recovered: true, recoveredAfterMs: 11200, retry: 'recovered' })], { traced: true })
    assert.deepEqual(delayed.resyncRetry, { recovered: 1, stillMissing: 0, notCompleted: 0 })
    assert.equal(delayed.recoveryDelayMs.max, 11200)
    const v = verdict({ ...base, outages: delayed }, { students: 1 })
    assert.equal(v.checks.find(c => /recovered by resync/.test(c.check)).status, 'PASS')
    assert.ok(v.info.some(i => /only by the resync retry/.test(i.item) && i.value === 1))
    assert.ok(v.info.some(i => /recovery delay/.test(i.item) && /max 11200ms/.test(i.value)))

    for (const retry of ['still_missing', 'not_completed']) {
      const o = outageSection([rec({ questionId: 'q', poll: 1, recovered: false, recoveredAfterMs: null, retry })], { traced: true })
      const vv = verdict({ ...base, outages: o }, { students: 1 })
      assert.equal(vv.checks.find(c => /recovered by resync/.test(c.check)).status, 'FAIL', retry)
      assert.equal(vv.pass, false)
    }
    const nc = outageSection([rec({ questionId: 'q', poll: 1, recovered: false, recoveredAfterMs: null, retry: 'not_completed' })], { traced: true })
    assert.ok(verdict({ ...base, outages: nc }, { students: 1 }).info.some(i => /run ended before/.test(i.item)))
  })

  test('config: the retry delay is derived from the backend cache TTL, and can be set or turned off', () => {
    assert.equal(defaultResyncRetryMs({}), 11000)
    assert.equal(defaultResyncRetryMs({ ROOM_QUESTIONS_CACHE_TTL_MS: '3000' }), 4000)
    assert.equal(defaultResyncRetryMs({ ROOM_QUESTIONS_CACHE_TTL_MS: 'junk' }), 11000)
    const d = resolveConfig({}, {})
    assert.equal(d.resyncRetryMs, 11000)
    assert.equal(d.resyncRetryDerived, true)
    assert.equal(resolveConfig({}, { ROOM_QUESTIONS_CACHE_TTL_MS: '2000' }).resyncRetryMs, 3000)
    const set = resolveConfig(parseArgs(['--resync-retry-ms', '2500']), { ROOM_QUESTIONS_CACHE_TTL_MS: '9000' })
    assert.equal(set.resyncRetryMs, 2500)
    assert.equal(set.resyncRetryDerived, false)
    assert.equal(resolveConfig({}, { LOADTEST_RESYNC_RETRY_MS: '0' }).resyncRetryMs, 0)
    assert.throws(() => resolveConfig(parseArgs(['--resync-retry-ms', '-1']), {}), /resync-retry-ms must be 0\.\.120000/)
    assert.throws(() => resolveConfig(parseArgs(['--resync-retry-ms', '1.5']), {}), /whole number/)
  })

  test('HTML shows each missed poll with its retry outcome', () => {
    const o = outageSection([{ student: 1, atSec: 2, reason: 'transport close', outageMs: 1500, rejoinMs: 50, resyncMs: 80, missedSeqs: 1, recovered: false, stuck: false,
      missedQuestions: [
        { questionId: 'a', poll: 1, recovered: true, recoveredAfterMs: 80, retry: 'none' },
        { questionId: 'b', poll: 2, recovered: true, recoveredAfterMs: 11200, retry: 'recovered' },
        { questionId: 'c', poll: 3, recovered: false, recoveredAfterMs: null, retry: 'still_missing' }
      ] }], { traced: true })
    const html = renderHtmlReport({ schemaVersion: 2, tool: 'spandan-loadtest', config: {}, summary: {}, polls: [], outages: o, verdict: { pass: false, checks: [], info: [] } })
    assert.match(html, /poll 1 ✓ 80 ms, poll 2 ✓ after retry, 11200 ms, poll 3 ✗ retry still missing/)
    assert.match(html, /1 only after the retry/)
  })
})

describe('close-out: saved records cannot change afterwards', () => {
  test('a resync still in flight at close-out changes neither the saved record nor the poll counts', async () => {
    const { s, session } = student({ responses: [WITH_Q1], resyncRetryMs: 30 })
    let release
    s.api = () => new Promise(r => { release = () => r(WITH_Q1) }) // the reconnect resync is slow
    const t0 = performance.now() - 10_000
    s.joinedAt = t0 - 1000
    session.polls.set('q1', { index: 0, questionId: 'q1', launchedAt: t0 + 100, received: 0, recovered: 0 })
    s._onHello({ s: 'A', n: 0 })
    s._onDisconnect('transport close', t0)
    s._onReconnect(t0 + 1000)
    s._onHello({ s: 'A', n: 1 }, t0 + 1100)

    const saved = s.finishDelivery(null).outages[0] // close-out while the resync is still pending
    release()
    await flush(); await flush()
    assert.deepEqual(saved.missedQuestions, [])
    assert.deepEqual(s.outages[0].missedQuestions, []) // the live record is frozen too
    assert.equal(session.polls.get('q1').recovered, 0)   // and so is the poll count pollSummary reads
  })

  test('a retry that fires after close-out cannot recover anything', async () => {
    const { s, session } = student({ responses: [EMPTY, WITH_Q1], resyncRetryMs: 30 })
    await outageMissing(s, session)
    const saved = s.finishDelivery(null).outages[0]
    await wait(60); await flush(); await flush() // the retry timer would fire here
    assert.equal(saved.missedQuestions[0].retry, 'not_completed')
    assert.equal(saved.recovered, false)
    assert.equal(session.polls.get('q1').recovered, 0)
  })

  test('saved records are deep copies: later changes to the live record never reach them', async () => {
    const { s, session } = student({ responses: [WITH_Q1] })
    await outageMissing(s, session)
    const saved = s.finishDelivery(null).outages[0]
    const before = JSON.parse(JSON.stringify(saved))
    s.outages[0].missedQuestions.push({ questionId: 'x', poll: 9, recovered: false, recoveredAfterMs: null, retry: 'none' })
    s.outages[0].missedQuestions[0].recovered = false
    s.outages[0].recovered = false
    assert.deepEqual(saved, before)
    assert.notEqual(saved.missedQuestions, s.outages[0].missedQuestions)
  })
})

describe('C14: another client resetting the backend metrics mid-run', () => {
  test('detectForeignReset compares each snapshot with our own reset', () => {
    assert.equal(detectForeignReset('2026-11-08T10:00:00.000Z', { since: '2026-11-08T10:00:00.000Z' }, 5), null)
    assert.equal(detectForeignReset(null, { since: 'x' }, 5), null)         // no reset of ours to compare with
    assert.equal(detectForeignReset('a', {}, 5), null)                      // snapshot without since
    const c = detectForeignReset('2026-11-08T10:00:00.000Z', { since: '2026-11-08T10:00:42.000Z' }, 42.3)
    assert.deepEqual({ ...c, reason: typeof c.reason }, { detectedAtSec: 42.3, expectedSince: '2026-11-08T10:00:00.000Z', seenSince: '2026-11-08T10:00:42.000Z', reason: 'string' })
  })

  // A stand-in backend whose `since` changes when anyone resets it.
  let since = 'S0'
  let active = 0
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/internal/metrics/reset') {
      since = `S${Number(since.slice(1)) + 1}`
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ reset: true, since }))
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ since, process: {}, http: {}, sockets: { active } }))
  })
  let base
  before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r() })))
  after(() => new Promise(r => server.close(r)))

  test('a reset by someone else is detected on the next read and reported by stop()', async () => {
    active = 0
    const logs = []
    const sm = await startServerMetrics({ baseUrl: base, serverMetrics: 'auto' }, new Recorder(), { intervalMs: 60000, log: (l) => logs.push(l) })
    assert.equal(sm.compromised, null)
    await sm.read()
    assert.equal(sm.compromised, null) // our own reset: fine
    await fetch(`${base}/internal/metrics/reset`, { method: 'POST' }) // another client
    await sm.read()
    assert.ok(sm.compromised)
    assert.match(sm.compromised.reason, /another client/)
    const out = await sm.stop()
    assert.equal(out.compromised, sm.compromised)
    assert.ok(logs.some(l => /server metrics compromised/.test(l)))
  })

  test('sockets already connected before our reset are counted and warned about', async () => {
    active = 3
    const logs = []
    const sm = await startServerMetrics({ baseUrl: base, serverMetrics: 'auto' }, new Recorder(), { intervalMs: 60000, log: (l) => logs.push(l) })
    await sm.stop()
    assert.equal(sm.preexistingSockets, 3)
    assert.ok(logs.some(l => /3 socket\(s\) were already connected[\s\S]*one simulation per backend/.test(l)))
    active = 0
  })

  test('compromised metrics fail the run, mark the tail compromised, and show in every output', () => {
    const comp = { detectedAtSec: 42.3, expectedSince: 'S1', seenSince: 'S2', reason: 'the backend metrics were reset by <another client>' }
    const del = deliverySection([{ student: 1, traced: true, delivery: { received: 3, droppedConnected: 0, tailMissing: 0, outOfOrder: 0, duplicates: 0, missedOutage: 0, tailUnverified: true, clock: 'local', late: 0, byEvent: {} } }],
      { ledgerAvailable: false, ledgerCompromised: true, lateMs: 2000 })
    assert.equal(del.tail, 'compromised')
    const v = verdict({ operations: {}, events: { studentsJoined: 1 }, delivery: del, serverCompromised: comp }, { students: 1 })
    assert.equal(v.pass, false) // never an ordinary PASS
    assert.equal(v.checks.find(c => /not reset by another client/.test(c.check)).status, 'FAIL')
    assert.match(v.checks.find(c => c.check === 'no broadcasts lost while connected').value, /tail compromised/)
    assert.ok(v.info.some(i => i.item === 'tail check' && /untrustworthy/.test(i.value)))
    assert.ok(v.info.some(i => i.item === 'server-side figures' && /compromised/.test(i.value)))

    const result = {
      schemaVersion: 2, tool: 'spandan-loadtest', config: { students: 1 }, polls: [], generator: null, delivery: del, verdict: v,
      summary: { durationSeconds: 1, operations: {}, connections: { studentsJoined: 1 }, roomEndedReceived: 1 },
      server: { available: true, compromised: comp, preexistingSockets: 2, metrics: null }
    }
    const lines = []
    printSummary(result, (l) => lines.push(l))
    assert.match(lines.join('\n'), /SERVER METRICS COMPROMISED at 42\.3s/)
    assert.match(lines.join('\n'), /2 socket\(s\) were already connected/)
    const html = renderHtmlReport(result)
    assert.match(html, /Server metrics compromised<\/strong> at 42\.3 s: the backend metrics were reset by &lt;another client&gt;/)
    assert.match(html, /2 socket\(s\) were already connected/)
  })
})

describe('shutdown: capped wait for student starts', () => {
  test('settleWithin resolves as soon as everything settles, rejections included', async () => {
    const t0 = performance.now()
    const out = await settleWithin([Promise.resolve(1), Promise.reject(new Error('x')), wait(10)], 5000)
    assert.deepEqual(out, { timedOut: false, pending: 0 })
    assert.ok(performance.now() - t0 < 1000)
  })

  test('settleWithin gives up after the cap and says how many are still pending', async () => {
    const never = new Promise(() => {})
    const out = await settleWithin([Promise.resolve(), never, never], 30)
    assert.deepEqual(out, { timedOut: true, pending: 2 })
  })

  test('a student stopped while its login is in flight abandons its start and never opens a socket', async () => {
    const session = new Session()
    session.roomCode = 'ABC123'
    let releaseLogin
    const api = (path) => (path === '/auth/login'
      ? new Promise(r => { releaseLogin = () => r({ token: 't', user: { _id: 'u1' } }) })
      : Promise.resolve({}))
    const s = new SimStudent({ index: 1, email: 'x@y', cfg: { baseUrl: 'http://localhost:1', socketPath: '/socket.io', password: 'pw' }, api, rec: new Recorder(), session })
    const started = s.start()
    await flush()
    await s.stop()
    releaseLogin()
    await assert.rejects(started, /stopped during start/)
    assert.equal(s.socket, null)
    assert.equal(s.joined, false)
  })
})
