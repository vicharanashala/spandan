// In-memory metrics for one run: latency samples and error counts per operation, connection
// events, and a per-second timeline. Pure data + arithmetic, unit-tested.

// Nearest-rank percentile of an unsorted array (p in 0..100). Empty -> null.
export function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

const round = (v) => (v == null ? null : Math.round(v * 10) / 10)

export function summarize(values) {
  if (!values.length) return { n: 0, min: null, mean: null, p50: null, p95: null, p99: null, max: null }
  const sum = values.reduce((a, b) => a + b, 0)
  return {
    n: values.length,
    min: round(Math.min(...values)),
    mean: round(sum / values.length),
    p50: round(percentile(values, 50)),
    p95: round(percentile(values, 95)),
    p99: round(percentile(values, 99)),
    max: round(Math.max(...values))
  }
}

// Short, stable error category for grouping: "http_409:poll_closed", "http_429", "timeout", ...
export function errorKind(err) {
  if (!err) return 'unknown'
  if (err.status) return err.code ? `http_${err.status}:${err.code}` : `http_${err.status}`
  if (err.name === 'TimeoutError' || err.name === 'AbortError' || /timeout/i.test(err.message || '')) return 'timeout'
  if (err.cause?.code) return `network:${err.cause.code}`
  if (err.code) return `network:${err.code}`
  return 'error'
}

export class Recorder {
  constructor({ now = () => performance.now() } = {}) {
    this.now = now
    this.t0 = now()
    this.ops = new Map()      // op -> { samples: [], ok, errors: Map(kind -> n) }
    this.events = new Map()   // counter name -> n
    this.errorSamples = []    // first few error messages, for debugging
    this.timeline = new Map() // second -> { requests, errors, ... }
  }

  _op(name) {
    let o = this.ops.get(name)
    if (!o) { o = { samples: [], ok: 0, errors: new Map() }; this.ops.set(name, o) }
    return o
  }

  _tick(field, by = 1) {
    const sec = Math.floor((this.now() - this.t0) / 1000)
    let row = this.timeline.get(sec)
    if (!row) { row = { t: sec, requests: 0, errors: 0 }; this.timeline.set(sec, row) }
    row[field] = (row[field] || 0) + by
  }

  success(op, ms) {
    const o = this._op(op)
    o.ok++
    o.samples.push(ms)
    this._tick('requests')
  }

  failure(op, err) {
    const o = this._op(op)
    const kind = errorKind(err)
    o.errors.set(kind, (o.errors.get(kind) || 0) + 1)
    this._tick('requests')
    this._tick('errors')
    if (this.errorSamples.length < 25) {
      this.errorSamples.push({ op, kind, message: String(err?.message || err).slice(0, 200), atSec: round((this.now() - this.t0) / 1000) })
    }
  }

  // A latency sample that is not a request (e.g. socket fan-out delivery time).
  sample(op, ms) { this._op(op).samples.push(ms); this._op(op).ok++ }

  // Wrap an async call: time it and record success/failure. Re-throws so callers can react.
  async time(op, fn) {
    const start = this.now()
    try {
      const out = await fn()
      this.success(op, this.now() - start)
      return out
    } catch (err) {
      this.failure(op, err)
      throw err
    }
  }

  count(name, by = 1) {
    this.events.set(name, (this.events.get(name) || 0) + by)
    this._tick(name, by)
  }

  // Merge arbitrary per-second gauges (e.g. CPU %, connected sockets) into the timeline.
  gauge(fields) {
    const sec = Math.floor((this.now() - this.t0) / 1000)
    let row = this.timeline.get(sec)
    if (!row) { row = { t: sec, requests: 0, errors: 0 }; this.timeline.set(sec, row) }
    Object.assign(row, fields)
  }

  elapsedSeconds() { return (this.now() - this.t0) / 1000 }

  snapshot() {
    const operations = {}
    for (const [name, o] of this.ops) {
      const errors = Object.fromEntries(o.errors)
      const errorCount = [...o.errors.values()].reduce((a, b) => a + b, 0)
      const attempts = o.ok + errorCount
      operations[name] = {
        ...summarize(o.samples),
        ok: o.ok,
        errorCount,
        errorRate: attempts ? round((errorCount / attempts) * 100) : 0,
        errors
      }
    }
    return {
      operations,
      events: Object.fromEntries(this.events),
      errorSamples: this.errorSamples,
      timeline: [...this.timeline.values()].sort((a, b) => a.t - b.t)
    }
  }
}
