// Stage-4 report: delivery and outage sections, the verdict's delivery/outage checks (PASS / FAIL /
// N/A), reported-only late events, and the console summary.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { DeliveryTracker } from '../lib/delivery.mjs'
import {
  deliverySection, outageSection, verdict, printSummary, OUTAGE_P95_MS, MAX_OUTAGE_RECORDS, MAX_WORST_STUDENTS
} from '../lib/report.mjs'

const T0 = 1_700_000_000_000
// A joined student's finishDelivery() output: hello at 0, then the given seqs.
function student(index, seqs, { lastSeq = Math.max(0, ...seqs), lateBy = 10, clockComparable = true, hello = true, ledger } = {}) {
  const tr = new DeliveryTracker({ clockComparable })
  if (hello) tr.hello({ s: 'A', n: 0 })
  for (const n of seqs) tr.receive('counts:updated', { s: 'A', n, t: T0 }, T0 + lateBy)
  return { student: index, traced: hello, delivery: tr.summary(ledger === undefined ? { A: { lastSeq } } : ledger), outages: [] }
}
const opts = { ledgerAvailable: true, lateMs: 2000, unavailableReason: 'tracing off' }
const outage = (o = {}) => ({ student: 1, atSec: 3, reason: 'transport close', outageMs: 1500, rejoinMs: 80, resyncMs: 120, missedSeqs: 2, missedQuestions: [], recovered: true, stuck: false, ...o })
const base = { operations: {}, events: { studentsJoined: 3 } }
const run = (delivery, outages) => verdict({ ...base, delivery, outages }, { students: 3 })
const named = (v, prefix) => v.checks.find(c => c.check.startsWith(prefix))

describe('deliverySection', () => {
  test('clean traced run', () => {
    const d = deliverySection([student(1, [1, 2, 3]), student(2, [1, 2, 3])], opts)
    assert.equal(d.status, 'traced')
    assert.equal(d.clock, 'local')
    assert.equal(d.tail, 'verified')
    assert.equal(d.received, 6)
    assert.equal(d.droppedConnected, 0)
    assert.equal(d.late, 0)
    assert.deepEqual(d.latencyMs, { n: 6, meanMs: 10, maxMs: 10 })
    assert.deepEqual(d.worstStudents, [])
  })

  test('untraced run is unavailable with a reason, not zeros', () => {
    const d = deliverySection([student(1, [], { hello: false })], opts)
    assert.deepEqual(d, { status: 'unavailable', reason: 'tracing off' })
  })

  test('no ledger: tail unverified; a stream missing from the ledger: partial', () => {
    assert.equal(deliverySection([student(1, [1], { ledger: null })], { ...opts, ledgerAvailable: false }).tail, 'unverified')
    assert.equal(deliverySection([student(1, [1], { ledger: {} })], opts).tail, 'partial')
  })

  test('remote clock: late and latency are null, clock unavailable', () => {
    const d = deliverySection([student(1, [1, 2], { clockComparable: false })], opts)
    assert.equal(d.clock, 'unavailable')
    assert.equal(d.late, null)
    assert.equal(d.latencyMs, null)
  })

  test('worst students are ranked and capped', () => {
    const list = Array.from({ length: 15 }, (_, i) => student(i + 1, i % 2 ? [1, 3] : [1, 2, 3]))
    list.push(student(99, [1, 5], { lastSeq: 7 })) // 3 holes + 2 at the tail
    const d = deliverySection(list, opts)
    assert.ok(d.worstStudents.length <= MAX_WORST_STUDENTS)
    assert.equal(d.worstStudents[0].student, 99)
    assert.equal(d.worstStudents[0].droppedConnected, 5)
    assert.equal(d.worstStudents[0].tailMissing, 2)
    assert.equal(d.studentsWithDrops, 8)
  })

  test('a joined student without a baseline in a traced run is counted', () => {
    const d = deliverySection([student(1, [1]), student(2, [], { hello: false })], opts)
    assert.equal(d.studentsUntraced, 1)
  })
})

describe('outageSection', () => {
  test('stats, poll recovery, reasons; records capped', () => {
    const recs = [
      outage({ outageMs: 1000, missedQuestions: [{ questionId: 'q1', poll: 1, recovered: true }] }),
      outage({ outageMs: 3000, reason: 'ping timeout', missedQuestions: [{ questionId: 'q1', poll: 1, recovered: false }], recovered: false }),
      outage({ outageMs: 9000, rejoinMs: null, resyncMs: null, stuck: true })
    ]
    const o = outageSection(recs, { traced: true })
    assert.equal(o.total, 3)
    assert.equal(o.stuck, 1)
    assert.deepEqual(o.byReason, { 'transport close': 2, 'ping timeout': 1 })
    assert.equal(o.outageMs.p95, 9000)
    assert.equal(o.rejoinMs.n, 2)
    assert.equal(o.missedPolls, 2)
    assert.equal(o.recoveredPolls, 1)
    assert.equal(o.unrecoveredPolls, 1)
    assert.equal(o.truncated, false)

    const many = outageSection(Array.from({ length: MAX_OUTAGE_RECORDS + 5 }, () => outage()), { traced: true })
    assert.equal(many.total, MAX_OUTAGE_RECORDS + 5)
    assert.equal(many.records.length, MAX_OUTAGE_RECORDS)
    assert.equal(many.truncated, true)
  })

  test('re-join time is unavailable (null) when not traced', () => {
    assert.equal(outageSection([outage({ rejoinMs: null })], { traced: false }).rejoinMs, null)
  })
})

describe('verdict: delivery and outages', () => {
  test('clean traced run passes; late is info only', () => {
    const d = deliverySection([student(1, [1, 2]), student(2, [1, 2]), student(3, [1, 2], { lateBy: 5000 })], opts)
    const v = run(d, outageSection([], { traced: true }))
    assert.equal(d.late, 2)
    assert.equal(v.pass, true)
    assert.equal(named(v, 'no broadcasts lost').status, 'PASS')
    assert.ok(v.info.some(i => /late broadcasts \(> 2000ms/.test(i.item) && i.value === 2))
    assert.ok(v.info.some(i => i.item === 'disconnects during the run' && i.value === 0))
    assert.ok(!v.checks.some(c => /late/i.test(c.check)))
  })

  test('out-of-order delivery fails the run', () => {
    const v = run(deliverySection([student(1, [1, 3, 2])], opts), null)
    assert.equal(named(v, 'no out-of-order').status, 'FAIL')
    assert.equal(v.pass, false)
  })

  test('duplicates fail the run', () => {
    assert.equal(run(deliverySection([student(1, [1, 1])], opts), null).pass, false)
  })

  test('lost while connected, including only at the tail, fails the run', () => {
    const holes = run(deliverySection([student(1, [1, 3])], opts), null)
    assert.equal(named(holes, 'no broadcasts lost').status, 'FAIL')
    const tail = run(deliverySection([student(1, [1, 2], { lastSeq: 3 })], opts), null)
    assert.equal(named(tail, 'no broadcasts lost').value, '1 (incl. 1 at the tail)')
    assert.equal(tail.pass, false)
  })

  test('unverified tail is said so, in the check and in info', () => {
    const v = run(deliverySection([student(1, [1, 2], { ledger: null })], { ...opts, ledgerAvailable: false }), null)
    assert.equal(v.pass, true)
    assert.match(named(v, 'no broadcasts lost').value, /tail unverified/)
    assert.ok(v.info.some(i => i.item === 'tail check'))
  })

  test('untraced: delivery checks are N/A, never PASS, and do not fail the run', () => {
    const v = run(deliverySection([student(1, [], { hello: false })], opts), null)
    const na = v.checks.filter(c => c.status === 'N/A')
    assert.equal(na.length, 3)
    for (const c of na) { assert.equal(c.pass, null); assert.match(c.value, /unavailable: tracing off/) }
    assert.equal(v.pass, true)
  })

  test('remote clock: late reported as unavailable', () => {
    const v = run(deliverySection([student(1, [1], { clockComparable: false })], opts), null)
    assert.ok(v.info.some(i => i.item === 'late broadcasts' && /unavailable/.test(i.value)))
  })

  test('a joined student without a baseline fails a traced run', () => {
    const v = run(deliverySection([student(1, [1]), student(2, [], { hello: false })], opts), null)
    assert.equal(named(v, 'every joined student got a trace baseline').status, 'FAIL')
  })

  test('outages: stuck, unrecovered polls and slow outages each fail', () => {
    const ok = run(null, outageSection([outage({ missedQuestions: [{ questionId: 'q', poll: 1, recovered: true }] })], { traced: true }))
    assert.equal(ok.pass, true)
    assert.equal(named(ok, 'every poll missed during an outage').value, '1/1')
    assert.equal(run(null, outageSection([outage({ stuck: true })], { traced: true })).pass, false)
    assert.equal(run(null, outageSection([outage({ missedQuestions: [{ questionId: 'q', poll: 1, recovered: false }] })], { traced: true })).pass, false)
    assert.equal(run(null, outageSection([outage({ outageMs: OUTAGE_P95_MS + 1 })], { traced: true })).pass, false)
  })

  test('a poll recovered by resync counts as reached', () => {
    const polls = [{ deliveredTo: 2, recoveredByResync: 1 }]
    const v = verdict({ ...base, polls }, { students: 3 })
    assert.equal(v.pass, true)
    assert.match(named(v, 'every poll reached').value, /1 via resync/)
    assert.equal(verdict({ ...base, polls: [{ deliveredTo: 2, recoveredByResync: 0 }] }, { students: 3 }).pass, false)
  })
})

describe('printSummary', () => {
  const resultWith = (delivery, outages, v) => ({
    config: { api: 'http://localhost:3001/api', students: 3, rampSeconds: 1 },
    summary: { durationSeconds: 10, operations: {}, connections: { studentsJoined: 3, connectFailures: 0, disconnects: 1, reconnects: 1 }, roomEndedReceived: 3 },
    polls: [{ poll: 1, type: 'MCQ', deliveredTo: 2, recoveredByResync: 1, answersAccepted: 3, answersRejected: 0 }],
    generator: { processCpuAvg: 1, processCpuPeak: 2, machineCpuAvg: 3, machineCpuPeak: 4, cores: 8, loopLagP99PeakMs: 30, warnings: [], possibleBottleneck: false },
    delivery, outages, verdict: v
  })
  const capture = (r) => { const lines = []; printSummary(r, (l) => lines.push(l)); return lines.join('\n') }

  test('traced run with an outage prints delivery, outage, N/A-free checks and info', () => {
    const d = deliverySection([student(1, [1, 3, 2]), student(2, [1, 2, 3])], opts)
    const o = outageSection([outage({ missedQuestions: [{ questionId: 'q', poll: 1, recovered: true }] })], { traced: true })
    const out = capture(resultWith(d, o, run(d, o)))
    assert.match(out, /delivery: {2}traced, 2 students, clock local, tail verified/)
    assert.match(out, /out-of-order 1, duplicates 0/)
    assert.match(out, /late \(> 2000ms\) 0/)
    assert.match(out, /outages: {3}1 \(transport close x1\), stuck 0/)
    assert.match(out, /recovered by resync 1, not recovered 0/)
    assert.match(out, /recovered by resync 1, answers/)
    assert.match(out, /FAIL {2}no out-of-order broadcasts/)
    assert.match(out, /INFO {2}late broadcasts/)
    assert.match(out, /OVERALL: FAIL/)
  })

  test('untraced run prints "not traced" and N/A checks', () => {
    const d = deliverySection([student(1, [], { hello: false })], opts)
    const o = outageSection([], { traced: false })
    const out = capture(resultWith(d, o, run(d, o)))
    assert.match(out, /delivery: {2}not traced \(tracing off\)/)
    assert.match(out, /outages: {3}none/)
    assert.match(out, /N\/A +no broadcasts lost while connected {2}\(unavailable: tracing off\)/)
    assert.match(out, /OVERALL: PASS/)
  })

  test('remote clock prints late/latency as unavailable', () => {
    const d = deliverySection([student(1, [1], { clockComparable: false })], opts)
    const out = capture(resultWith(d, outageSection([], { traced: true }), run(d, null)))
    assert.match(out, /late \/ latency: unavailable/)
  })
})
