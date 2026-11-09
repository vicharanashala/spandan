import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { RangeSet, DeliveryTracker, mergeSummaries, DEFAULT_LATE_MS, MAX_HOLE_RANGES, MAX_STREAMS } from '../lib/delivery.mjs'

const T0 = 1_700_000_000_000
const lt = (n, s = 'A', t = T0) => ({ s, n, t })
// Receive seqs on stream s, each delivered 10 ms after it was sent.
const feed = (tr, seqs, s = 'A', event = 'counts:updated') => seqs.map(n => tr.receive(event, lt(n, s), T0 + 10))
const joined = (n = 0, s = 'A', opts) => { const tr = new DeliveryTracker(opts); tr.hello({ s, n }); return tr }

describe('RangeSet', () => {
  test('appends, merges adjacent ranges, and splits on removal', () => {
    const r = new RangeSet()
    r.add(3, 5)
    r.add(6, 6)
    assert.deepEqual(r.ranges, [[3, 6]])
    r.add(10, 12)
    assert.equal(r.count, 7)
    assert.ok(r.remove(4))
    assert.deepEqual(r.ranges, [[3, 3], [5, 6], [10, 12]])
    assert.ok(r.remove(3) && r.remove(12) && r.remove(11) && r.remove(10))
    assert.deepEqual(r.ranges, [[5, 6]])
    assert.equal(r.remove(99), false)
    assert.equal(r.count, 2)
    assert.throws(() => r.add(6, 7), /out of order/)
  })

  test('caps the number of ranges, keeping the total exact', () => {
    const r = new RangeSet(3)
    for (let i = 0; i < 5; i++) r.add(i * 10, i * 10 + 1)
    assert.equal(r.ranges.length, 3)
    assert.equal(r.evicted, 4)
    assert.equal(r.total, 10)
    assert.equal(r.has(0), false) // evicted ranges can no longer be filled
    assert.equal(r.evictedMax, 11)
  })
})

describe('DeliveryTracker: baselines', () => {
  test('expects exactly the seqs above the hello baseline', () => {
    const tr = joined(6)
    assert.deepEqual(feed(tr, [7, 8, 9]), ['received', 'received', 'received'])
    const s = tr.summary({ A: { lastSeq: 9 } })
    assert.equal(s.received, 3)
    assert.equal(s.droppedConnected, 0)
    assert.equal(s.tailMissing, 0)
    assert.equal(s.tailUnverified, false)
    assert.equal(s.baselineInferred, 0)
  })

  test('a seq at or below the first baseline is beforeBaseline, not received', () => {
    const tr = joined(6)
    assert.equal(tr.receive('room:joined', lt(6)), 'beforeBaseline')
    assert.equal(tr.receive('room:joined', lt(2)), 'beforeBaseline')
    const s = tr.summary({ A: { lastSeq: 6 } })
    assert.equal(s.beforeBaseline, 2)
    assert.equal(s.received, 0)
  })

  test('a new stream id in a hello starts a fresh baseline; both streams are judged', () => {
    const tr = joined(0, 'A')
    feed(tr, [1, 2, 3], 'A')
    tr.hello({ s: 'B', n: 40 }) // e.g. backend metrics reset mid-room, then a re-join
    feed(tr, [41, 42], 'B')
    const s = tr.summary({ A: { lastSeq: 3 }, B: { lastSeq: 42 } })
    assert.equal(s.streams, 2)
    assert.equal(s.received, 5)
    assert.equal(s.droppedConnected, 0)
  })

  test('events from a stream with no hello re-baseline on the first seq seen and are flagged', () => {
    const tr = joined(0, 'A')
    assert.equal(tr.receive('counts:updated', lt(17, 'C')), 'received')
    feed(tr, [18, 20], 'C')
    const s = tr.summary({ A: { lastSeq: 0 }, C: { lastSeq: 20 } })
    assert.equal(s.baselineInferred, 1)
    assert.equal(s.received, 3)
    assert.equal(s.droppedConnected, 1) // 19
  })

  test('malformed hellos and traces are counted as invalid and ignored', () => {
    const tr = new DeliveryTracker()
    tr.hello(null)
    tr.hello({ s: 'A', n: -1 })
    tr.hello({ s: 'A', n: 0 })
    assert.equal(tr.receive('x', undefined), 'invalid')
    assert.equal(tr.receive('x', { s: 'A', n: 1.5 }), 'invalid')
    assert.equal(tr.summary({ A: { lastSeq: 0 } }).invalid, 4)
  })
})

describe('DeliveryTracker: missing, duplicate, out-of-order', () => {
  test('a gap while connected that never fills is droppedConnected', () => {
    const tr = joined(0)
    feed(tr, [1, 2, 5, 6])
    const s = tr.summary({ A: { lastSeq: 6 } })
    assert.equal(s.droppedConnected, 2)
    assert.equal(s.outOfOrder, 0)
    assert.equal(s.missedOutage, 0)
  })

  test('a hole that later fills is outOfOrder, not missing', () => {
    const tr = joined(0)
    assert.deepEqual(feed(tr, [1, 3, 4, 2]), ['received', 'received', 'received', 'outOfOrder'])
    const s = tr.summary({ A: { lastSeq: 4 } })
    assert.equal(s.outOfOrder, 1)
    assert.equal(s.droppedConnected, 0)
    assert.equal(s.received, 4)
    assert.equal(s.byEvent['counts:updated'].outOfOrder, 1)
  })

  test('a second copy of a seq is a duplicate and is not counted as received', () => {
    const tr = joined(0)
    assert.deepEqual(feed(tr, [1, 2, 2, 1]), ['received', 'received', 'duplicate', 'duplicate'])
    // A filled hole received again is a duplicate too.
    feed(tr, [4, 3])
    assert.equal(tr.receive('counts:updated', lt(3)), 'duplicate')
    const s = tr.summary({ A: { lastSeq: 4 } })
    assert.equal(s.duplicates, 3)
    assert.equal(s.received, 4)
    assert.equal(s.byEvent['counts:updated'].duplicates, 3)
  })

  test('a re-hello on the same stream WITHOUT a noticed disconnect counts the gap as dropped', () => {
    const tr = joined(0)
    feed(tr, [1, 2])
    assert.equal(tr.hello({ s: 'A', n: 5 }), 0)
    const s = tr.summary({ A: { lastSeq: 5 } })
    assert.equal(s.droppedConnected, 3)
    assert.equal(s.missedOutage, 0)
  })
})

describe('DeliveryTracker: outages', () => {
  test('seqs emitted while disconnected are missedOutage, and hello returns how many', () => {
    const tr = joined(0)
    feed(tr, [1, 2, 3])
    tr.disconnected()
    assert.equal(tr.hello({ s: 'A', n: 7 }), 4)
    feed(tr, [8, 9])
    const s = tr.summary({ A: { lastSeq: 9 } })
    assert.equal(s.missedOutage, 4)
    assert.equal(s.droppedConnected, 0)
    assert.equal(s.outages, 1)
    assert.equal(s.received, 5)
  })

  test('a hole left before the disconnect is still a connected drop', () => {
    const tr = joined(0)
    feed(tr, [1, 3])
    tr.disconnected()
    tr.hello({ s: 'A', n: 5 })
    const s = tr.summary({ A: { lastSeq: 5 } })
    assert.equal(s.droppedConnected, 1) // seq 2
    assert.equal(s.missedOutage, 2)     // 4, 5
  })

  test('an outage with nothing emitted misses nothing', () => {
    const tr = joined(0)
    feed(tr, [1, 2])
    tr.disconnected()
    assert.equal(tr.hello({ s: 'A', n: 2 }), 0)
    assert.equal(tr.summary({ A: { lastSeq: 2 } }).outages, 1)
  })
})

describe('DeliveryTracker: tail (server ledger)', () => {
  test('ledger seqs above the high-water mark while connected are tailMissing and fail as dropped', () => {
    const tr = joined(0)
    feed(tr, [1, 2, 3])
    const s = tr.summary({ A: { lastSeq: 5 } }) // e.g. the final room:ended never arrived
    assert.equal(s.tailMissing, 2)
    assert.equal(s.droppedConnected, 2)
  })

  test('tail while disconnected at the end is an (unrecovered) outage miss', () => {
    const tr = joined(0)
    feed(tr, [1, 2])
    tr.disconnected()
    const s = tr.summary({ A: { lastSeq: 6 } })
    assert.equal(s.tailMissing, 0)
    assert.equal(s.droppedConnected, 0)
    assert.equal(s.missedOutage, 4)
  })

  test('without a ledger the tail is unverified but gaps are still found', () => {
    const tr = joined(0)
    feed(tr, [1, 3])
    const s = tr.summary(null)
    assert.equal(s.tailUnverified, true)
    assert.equal(s.droppedConnected, 1)
    assert.equal(s.tailMissing, 0)
  })

  test('a ledger missing one of our streams marks the tail unverified', () => {
    const tr = joined(0, 'A')
    tr.hello({ s: 'B', n: 0 })
    assert.equal(tr.summary({ B: { lastSeq: 0 } }).tailUnverified, true)
  })
})

describe('DeliveryTracker: latency and late events', () => {
  test(`late is > lateMs (default ${DEFAULT_LATE_MS} ms) after the server stamp; reported per event`, () => {
    const seen = []
    const tr = joined(0, 'A', { onLatency: (e, ms) => seen.push([e, ms]) })
    tr.receive('new_question', lt(1, 'A', T0), T0 + 150)
    tr.receive('new_question', lt(2, 'A', T0), T0 + 2000)  // exactly the limit: on time
    tr.receive('leaderboard:updated', lt(3, 'A', T0), T0 + 2500)
    tr.receive('counts:updated', lt(4, 'A', T0 + 50), T0)  // small clock skew: clamped to 0
    const s = tr.summary({ A: { lastSeq: 4 } })
    assert.equal(s.late, 1)
    assert.equal(s.clock, 'local')
    assert.deepEqual(s.latency, { n: 4, meanMs: Math.round((150 + 2000 + 2500 + 0) / 4), maxMs: 2500 })
    assert.deepEqual(s.byEvent.new_question, { received: 2, duplicates: 0, outOfOrder: 0, late: 0, meanMs: 1075, maxMs: 2000 })
    assert.equal(s.byEvent['leaderboard:updated'].late, 1)
    assert.deepEqual(seen.map(x => x[1]), [150, 2000, 2500, 0])
    // Late events are delivered: they do not count as missing.
    assert.equal(s.received, 4)
    assert.equal(s.droppedConnected, 0)
  })

  test('lateMs is configurable', () => {
    const tr = joined(0, 'A', { lateMs: 100 })
    tr.receive('x', lt(1), T0 + 150)
    assert.equal(tr.summary({ A: { lastSeq: 1 } }).late, 1)
  })

  test('with a remote target the clock is unavailable: no latency, late is null, delivery still tracked', () => {
    let calls = 0
    const tr = joined(0, 'A', { clockComparable: false, onLatency: () => calls++ })
    tr.receive('x', lt(1), T0 + 99_999)
    tr.receive('x', lt(3), T0 + 99_999)
    const s = tr.summary({ A: { lastSeq: 3 } })
    assert.equal(s.clock, 'unavailable')
    assert.equal(s.late, null)
    assert.equal(s.latency, null)
    assert.equal(s.byEvent.x.late, null)
    assert.equal(s.byEvent.x.meanMs, null)
    assert.equal(calls, 0)
    assert.equal(s.droppedConnected, 1)
  })

  test('events without a server timestamp are tracked but not timed', () => {
    const tr = joined(0)
    tr.receive('x', { s: 'A', n: 1 }, T0)
    const s = tr.summary({ A: { lastSeq: 1 } })
    assert.equal(s.received, 1)
    assert.equal(s.latency, null)
  })
})

describe('DeliveryTracker: bounded memory', () => {
  test('one huge gap costs a single range', () => {
    const tr = joined(0)
    feed(tr, [1, 1_000_001])
    const st = tr.streams.get('A')
    assert.equal(st.holes.ranges.length, 1)
    assert.equal(tr.summary({ A: { lastSeq: 1_000_001 } }).droppedConnected, 999_999)
  })

  test('many sparse gaps stay capped and the dropped count stays exact', () => {
    const tr = joined(0)
    const seqs = []
    for (let n = 1; n <= 20_000; n += 2) seqs.push(n) // every even seq is lost: 10,000 holes
    feed(tr, seqs)
    const st = tr.streams.get('A')
    assert.ok(st.holes.ranges.length <= MAX_HOLE_RANGES)
    assert.equal(tr.summary({ A: { lastSeq: 19_999 } }).droppedConnected, 9_999)
    // Recent holes can still be filled (out of order); evicted old ones are final.
    assert.equal(tr.receive('counts:updated', lt(19_998)), 'outOfOrder')
    assert.equal(tr.receive('counts:updated', lt(2)), 'unclassified')
    const after = tr.summary({ A: { lastSeq: 19_999 } })
    assert.equal(after.unclassified, 1)
    assert.equal(after.duplicates, 0)
  })

  test('a long clean stream keeps no per-seq state', () => {
    const tr = joined(0)
    for (let n = 1; n <= 50_000; n++) tr.receive('counts:updated', lt(n), T0)
    const st = tr.streams.get('A')
    assert.equal(st.holes.ranges.length, 0)
    assert.equal(st.received, 50_000)
  })
})

describe('mergeSummaries', () => {
  test('adds up students and counts those with connected drops', () => {
    const a = joined(0); feed(a, [1, 2, 3])
    const b = joined(0); feed(b, [1, 3])
    const c = joined(0); feed(c, [1]); c.disconnected(); c.hello({ s: 'A', n: 3 })
    const ledger = { A: { lastSeq: 3 } }
    const m = mergeSummaries([a, b, c].map(t => t.summary(ledger)))
    assert.equal(m.students, 3)
    assert.equal(m.received, 6)
    assert.equal(m.droppedConnected, 1)
    assert.equal(m.studentsWithDrops, 1)
    assert.equal(m.missedOutage, 2)
    assert.equal(m.outages, 1)
    assert.equal(m.late, 0)
    assert.deepEqual(m.latency, { n: 6, meanMs: 10, maxMs: 10 })
    assert.equal(m.byEvent['counts:updated'].received, 6)
  })

  test('any unavailable clock or unverified tail carries through', () => {
    const a = joined(0, 'A', { clockComparable: false }); feed(a, [1])
    const b = joined(0); feed(b, [1])
    const m = mergeSummaries([a.summary(null), b.summary({ A: { lastSeq: 1 } })])
    assert.equal(m.clock, 'unavailable')
    assert.equal(m.late, null)
    assert.equal(m.latency, null)
    assert.equal(m.tailUnverified, true)
  })

  test('empty input', () => {
    const m = mergeSummaries([])
    assert.equal(m.students, 0)
    assert.equal(m.droppedConnected, 0)
    assert.equal(m.latency, null)
  })
})

describe('stream eviction (more than MAX_STREAMS streams)', () => {
  // Stream "A" (the room) has a lost seq; then MAX_STREAMS other streams appear, forcing evictions.
  const churn = (tr, count, touchA = false) => {
    for (let i = 0; i < count; i++) {
      tr.receive('counts:updated', lt(1, `X${i}`), T0 + 10)
      if (touchA) tr.receive('counts:updated', lt(10 + i, 'A'), T0 + 10)
    }
  }

  test('an evicted stream keeps its figures: losses, duplicates and receipts stay in the totals', () => {
    const tr = joined(0, 'A')
    feed(tr, [1, 2, 4, 4]) // 3 lost, 4 duplicated
    churn(tr, MAX_STREAMS) // A is the least recently used: evicted
    const s = tr.summary(null)
    assert.equal(s.streamsEvicted, 1)
    assert.equal(s.streams, MAX_STREAMS + 1)
    assert.equal(s.droppedConnected, 1) // seq 3, final once its stream is gone
    assert.equal(s.duplicates, 1)
    assert.equal(s.received, 3 + MAX_STREAMS)
    assert.equal(s.baselineInferred, MAX_STREAMS) // the 20 live X streams had no hello; A (evicted) had one
    assert.equal(s.tailUnverified, true)              // an evicted stream's tail can't be checked
  })

  test('a late seq for an evicted stream is unclassified, never a fresh delivery', () => {
    const tr = joined(0, 'A')
    feed(tr, [1, 3])
    churn(tr, MAX_STREAMS)
    assert.equal(tr.receive('counts:updated', lt(2, 'A'), T0 + 10), 'unclassified')
    const s = tr.summary(null)
    assert.equal(s.unclassified, 1)
    assert.equal(s.droppedConnected, 1) // the hole stays counted
  })

  test('the stream in use is the most recently used, so it survives the churn', () => {
    const tr = joined(0, 'A')
    feed(tr, [1, 2])
    tr.receive('counts:updated', lt(3, 'A'), T0 + 10)
    for (let i = 0; i < MAX_STREAMS + 5; i++) {
      tr.receive('counts:updated', lt(1, `X${i}`), T0 + 10)
      tr.receive('counts:updated', lt(4 + i, 'A'), T0 + 10) // the room keeps broadcasting
    }
    const s = tr.summary({ A: { lastSeq: 3 + MAX_STREAMS + 5 } })
    assert.equal(tr.streams.has('A'), true)
    assert.equal(s.droppedConnected, 0)
    assert.equal(s.tailMissing, 0)
  })

  test('a hello for an evicted stream starts it afresh from the new baseline', () => {
    const tr = joined(0, 'A')
    feed(tr, [1])
    churn(tr, MAX_STREAMS)
    tr.disconnected()
    tr.hello({ s: 'A', n: 9 })
    assert.equal(tr.receive('counts:updated', lt(10, 'A'), T0 + 10), 'received')
  })

  test('merged summaries carry the eviction count', () => {
    const a = joined(0, 'A'); feed(a, [1]); churn(a, MAX_STREAMS)
    const b = joined(0, 'A'); feed(b, [1])
    assert.equal(mergeSummaries([a.summary(null), b.summary(null)]).streamsEvicted, 1)
  })
})
