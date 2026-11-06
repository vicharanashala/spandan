// Per-student delivery tracking for traced room broadcasts (backend SERVER_EVENT_TRACE=on).
// Pure data + arithmetic, unit-tested; no I/O.
//
// The backend stamps every room broadcast with __lt { s: streamId, n: seq, t: serverEpochMs }, one
// contiguous stream per room per server instance, and sends each socket that joins a room
// lt:hello { s, n }: the stream's last seq at the moment of the join, so every seq above it is
// expected. From that, for each student:
//
//   received          a seq above the high-water mark (anything skipped becomes a hole)
//   outOfOrder        a seq that fills a hole, i.e. it arrived after a higher one       -> run FAILS
//   duplicate         a seq that was already received                                   -> run FAILS
//   droppedConnected  a hole still open at the end: lost while the socket was connected -> run FAILS
//   tailMissing       seqs the server ledger emitted above our high-water mark while we were still
//                     connected (catches a lost LAST event, e.g. room:ended); counted in droppedConnected
//   missedOutage      seqs emitted while the socket was down (between the last seq seen before the
//                     disconnect and the re-join baseline): expected, reported separately
//   beforeBaseline    a seq at or below the stream's first baseline (should not happen; informational)
//   late              delivered, but more than lateMs after the server sent it. Reported, never fails.
//                     Needs comparable clocks (generator and server on one machine); otherwise
//                     latency is reported as unavailable.
//
// Memory: holes are kept as seq RANGES, so a sparse or huge gap costs one entry, and the number of
// ranges is capped (the oldest is finalized as dropped; counts stay exact). A seq that later
// arrives for an evicted hole is `unclassified` (late fill or duplicate can no longer be told apart).
//
// Missing seqs cannot be attributed to an event type on the client (the seq is all it never got),
// so per-event figures cover what was received; missing counts are per stream / total.

export const DEFAULT_LATE_MS = 2000
export const MAX_HOLE_RANGES = 512
export const MAX_STREAMS = 20

/** Sorted, non-overlapping inclusive integer ranges, appended in ascending order. */
export class RangeSet {
  constructor(maxRanges = Infinity) {
    this.maxRanges = maxRanges
    this.ranges = [] // [[a, b], ...] ascending
    this.count = 0   // seqs currently in the set
    this.evicted = 0 // seqs finalized because the range cap was hit (no longer fillable)
    this.evictedMax = -1 // highest evicted seq
  }

  /** Add [a, b]; must lie above everything already in the set. */
  add(a, b) {
    if (b < a) return
    const last = this.ranges[this.ranges.length - 1]
    if (last && a <= last[1]) throw new Error(`RangeSet.add out of order: [${a}, ${b}] after ${last[1]}`)
    if (last && a === last[1] + 1) last[1] = b
    else this.ranges.push([a, b])
    this.count += b - a + 1
    while (this.ranges.length > this.maxRanges) {
      const [x, y] = this.ranges.shift()
      this.count -= y - x + 1
      this.evicted += y - x + 1
      this.evictedMax = y
    }
  }

  _find(n) {
    let lo = 0, hi = this.ranges.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const [a, b] = this.ranges[mid]
      if (n < a) hi = mid - 1
      else if (n > b) lo = mid + 1
      else return mid
    }
    return -1
  }

  has(n) { return this._find(n) !== -1 }

  /** Remove n if present (splitting its range). Returns whether it was present. */
  remove(n) {
    const i = this._find(n)
    if (i === -1) return false
    const [a, b] = this.ranges[i]
    if (a === b) this.ranges.splice(i, 1)
    else if (n === a) this.ranges[i][0] = a + 1
    else if (n === b) this.ranges[i][1] = b - 1
    else this.ranges.splice(i, 1, [a, n - 1], [n + 1, b])
    this.count--
    return true
  }

  /** Everything ever added and not removed, including evicted seqs. */
  get total() { return this.count + this.evicted }
}

const isSeq = (n) => Number.isInteger(n) && n >= 0

export class DeliveryTracker {
  /**
   * @param lateMs          delivery latency above which an event counts as late
   * @param clockComparable true only when the server shares this machine's clock (a local target)
   * @param onLatency       optional (event, ms) callback per received event, e.g. to feed a Recorder
   */
  constructor({ lateMs = DEFAULT_LATE_MS, clockComparable = true, onLatency = null, maxHoleRanges = MAX_HOLE_RANGES } = {}) {
    Object.assign(this, { lateMs, clockComparable, onLatency, maxHoleRanges })
    this.streams = new Map() // streamId -> stream state
    this.current = null      // streamId of the last hello
    this.connected = false
    this.outages = 0         // re-joins after a disconnect
    this.invalid = 0         // events with a malformed __lt
    this.byEvent = new Map() // event -> { received, duplicates, outOfOrder, late, n, sumMs, maxMs }
  }

  _newStream(id, baseline, inferred) {
    if (this.streams.size >= MAX_STREAMS) this.streams.delete(this.streams.keys().next().value)
    const st = {
      id, baseline, highWater: baseline, inferred,
      holes: new RangeSet(this.maxHoleRanges),
      outage: new RangeSet(this.maxHoleRanges),
      received: 0, duplicates: 0, outOfOrder: 0, beforeBaseline: 0, unclassified: 0
    }
    this.streams.set(id, st)
    return st
  }

  /** The socket went down. Seqs emitted until the next hello count as missed during the outage. */
  disconnected() { this.connected = false }

  /**
   * lt:hello { s, n } after a (re)join. A new stream id starts a fresh baseline; the same stream after
   * a disconnect marks (highWater, n] as the outage window. Returns the seqs missed during that outage.
   */
  hello(h) {
    const id = h?.s
    const n = h?.n
    if (typeof id !== 'string' || !isSeq(n)) { this.invalid++; return 0 }
    const wasDown = !this.connected && this.current !== null
    this.connected = true
    this.current = id
    let st = this.streams.get(id)
    if (!st) { this._newStream(id, n, false); if (wasDown) this.outages++; return 0 }
    let missed = 0
    if (n > st.highWater) {
      // Seqs between what we last saw and the new baseline were emitted while we could not receive
      // them. If we never noticed a disconnect, they are holes instead (lost while connected).
      if (wasDown) { st.outage.add(st.highWater + 1, n); missed = n - st.highWater }
      else st.holes.add(st.highWater + 1, n)
      st.highWater = n
    }
    if (wasDown) this.outages++
    return missed
  }

  /**
   * One received broadcast. `trace` is its __lt field; `receivedAt` is this machine's epoch ms.
   * Returns the classification: 'received' | 'outOfOrder' | 'duplicate' | 'beforeBaseline' | 'unclassified' | 'invalid'.
   */
  receive(event, trace, receivedAt = Date.now()) {
    const id = trace?.s
    const n = trace?.n
    if (typeof id !== 'string' || !isSeq(n)) { this.invalid++; return 'invalid' }
    // No hello for this stream (e.g. the backend's metrics were reset mid-room, or another instance's
    // stream): baseline on the first seq seen, and say so in the summary.
    const st = this.streams.get(id) || this._newStream(id, n - 1, true)
    const ev = this._event(event)

    let kind
    if (n > st.highWater) {
      if (n > st.highWater + 1) st.holes.add(st.highWater + 1, n - 1)
      st.highWater = n
      kind = 'received'
    } else if (st.holes.remove(n) || st.outage.remove(n)) {
      kind = 'outOfOrder'
    } else if (n <= st.holes.evictedMax || n <= st.outage.evictedMax) {
      // Its hole was evicted under the range cap: a late fill and a duplicate look the same now.
      st.unclassified++
      return 'unclassified'
    } else if (n <= st.baseline) {
      st.beforeBaseline++
      return 'beforeBaseline'
    } else {
      st.duplicates++
      ev.duplicates++
      return 'duplicate'
    }

    st.received++
    ev.received++
    if (kind === 'outOfOrder') { st.outOfOrder++; ev.outOfOrder++ }
    if (this.clockComparable && Number.isFinite(trace.t)) {
      const ms = Math.max(0, receivedAt - trace.t)
      ev.n++
      ev.sumMs += ms
      if (ms > ev.maxMs) ev.maxMs = ms
      if (ms > this.lateMs) ev.late++
      this.onLatency?.(event, ms)
    }
    return kind
  }

  _event(name) {
    const key = typeof name === 'string' ? name : '(unknown)'
    let e = this.byEvent.get(key)
    if (!e) { e = { received: 0, duplicates: 0, outOfOrder: 0, late: 0, n: 0, sumMs: 0, maxMs: 0 }; this.byEvent.set(key, e) }
    return e
  }

  /**
   * Final figures. `ledger` is the backend's eventTrace.streams ({ [streamId]: { lastSeq } }), read
   * after the last broadcast and BEFORE the sockets are closed; null when unavailable, in which case
   * a lost final event cannot be detected (tailUnverified).
   */
  summary(ledger = null) {
    const out = {
      streams: this.streams.size, baselineInferred: 0,
      received: 0, duplicates: 0, outOfOrder: 0, beforeBaseline: 0, unclassified: 0,
      droppedConnected: 0, tailMissing: 0, missedOutage: 0, tailUnverified: false,
      late: 0, outages: this.outages, invalid: this.invalid,
      clock: this.clockComparable ? 'local' : 'unavailable',
      latency: null, byEvent: {}
    }
    for (const st of this.streams.values()) {
      if (st.inferred) out.baselineInferred++
      out.received += st.received
      out.duplicates += st.duplicates
      out.outOfOrder += st.outOfOrder
      out.beforeBaseline += st.beforeBaseline
      out.unclassified += st.unclassified
      out.droppedConnected += st.holes.total
      out.missedOutage += st.outage.total
      const last = ledger?.[st.id]?.lastSeq
      if (!isSeq(last)) { out.tailUnverified = true; continue }
      const tail = Math.max(0, last - st.highWater)
      // Only the current stream can still be connected; an older stream ended with its socket.
      if (this.connected && st.id === this.current) { out.tailMissing += tail; out.droppedConnected += tail }
      else out.missedOutage += tail
    }
    let n = 0, sum = 0, max = 0
    for (const [name, e] of this.byEvent) {
      out.late += e.late
      n += e.n; sum += e.sumMs; max = Math.max(max, e.maxMs)
      out.byEvent[name] = {
        received: e.received, duplicates: e.duplicates, outOfOrder: e.outOfOrder,
        late: this.clockComparable ? e.late : null,
        meanMs: this.clockComparable && e.n ? Math.round(e.sumMs / e.n) : null,
        maxMs: this.clockComparable && e.n ? Math.round(e.maxMs) : null
      }
    }
    if (!this.clockComparable) out.late = null
    else if (n) out.latency = { n, meanMs: Math.round(sum / n), maxMs: Math.round(max) }
    return out
  }
}

const SUM_FIELDS = ['received', 'duplicates', 'outOfOrder', 'beforeBaseline', 'unclassified', 'droppedConnected', 'tailMissing', 'missedOutage', 'outages', 'invalid', 'baselineInferred']

/** Combine per-student summaries into run totals (adds `students` and `studentsWithDrops`). */
export function mergeSummaries(list) {
  const out = { students: list.length, studentsWithDrops: 0, tailUnverified: false, late: 0, clock: 'local', latency: null, byEvent: {} }
  for (const f of SUM_FIELDS) out[f] = 0
  let n = 0, sum = 0, max = 0
  for (const s of list) {
    for (const f of SUM_FIELDS) out[f] += s[f] || 0
    if (s.droppedConnected > 0) out.studentsWithDrops++
    if (s.tailUnverified) out.tailUnverified = true
    if (s.clock === 'unavailable') out.clock = 'unavailable'
    if (s.late != null) out.late += s.late
    if (s.latency) { n += s.latency.n; sum += s.latency.meanMs * s.latency.n; max = Math.max(max, s.latency.maxMs) }
    for (const [name, e] of Object.entries(s.byEvent || {})) {
      const t = out.byEvent[name] || (out.byEvent[name] = { received: 0, duplicates: 0, outOfOrder: 0, late: 0 })
      t.received += e.received
      t.duplicates += e.duplicates
      t.outOfOrder += e.outOfOrder
      if (e.late != null) t.late += e.late
    }
  }
  if (out.clock === 'unavailable') {
    out.late = null
    for (const e of Object.values(out.byEvent)) e.late = null
  } else if (n) out.latency = { n, meanMs: Math.round(sum / n), maxMs: max }
  return out
}
