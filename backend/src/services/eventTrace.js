// Opt-in event tracing for local load testing: sequence-numbers room broadcasts so the load
// simulator (loadtest/) can detect missing, duplicate, late and out-of-order events per student.
//
// OFF BY DEFAULT. It takes effect only when BOTH SERVER_EVENT_TRACE=on and the server metrics are
// enabled (SERVER_METRICS=on, which is itself refused when NODE_ENV=production). When off,
// roomEmit() is exactly `io.to(roomCode).emit(event, payload)` with the caller's payload object,
// sendTraceHello() sends nothing, and no state or timers exist.
//
// When on, every room broadcast sent through roomEmit() carries an extra field
//   __lt: { s: streamId, n: seq, t: serverEpochMs }
// on a shallow copy of the payload. There is one stream per (room, server instance): the counter is
// in this process's memory, so with the Redis adapter each instance emits its own contiguous stream
// and no Redis round-trip is added to any broadcast. On room:join the server sends the joining socket
// `lt:hello { s, n }`, the stream's current seq, so the simulator expects exactly the seqs above it.
//
// The ledger (per stream: last seq, emits and local recipients per event) is served inside
// GET /internal/metrics as `eventTrace`. It is keyed by a random stream id, never by the room code.
import { randomBytes } from 'node:crypto'
import { metricsConfig } from './serverMetrics.js'

export const TRACE_FIELD = '__lt'
export const HELLO_EVENT = 'lt:hello'
const MAX_STREAMS = 20      // ledger entries kept; the oldest stream is dropped beyond this
const MAX_EVENT_KEYS = 50   // distinct event names per stream

/** Decide from the environment whether tracing is on. Returns { enabled, reason }. */
export function traceConfig(env = process.env) {
  const flag = String(env.SERVER_EVENT_TRACE || '').trim().toLowerCase()
  if (!['on', 'true', '1', 'yes'].includes(flag)) return { enabled: false, reason: 'SERVER_EVENT_TRACE is not set to "on"' }
  const metrics = metricsConfig(env)
  if (!metrics.enabled) return { enabled: false, reason: `requires server metrics (${metrics.reason})` }
  return { enabled: true, reason: 'SERVER_EVENT_TRACE=on' }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

export class EventTrace {
  constructor({ clock = () => Date.now(), newId = () => randomBytes(6).toString('hex'), recipients = () => null } = {}) {
    this.clock = clock
    this.newId = newId
    this.recipients = recipients // (roomCode) -> local socket count in the room, or null
    this.reset()
  }

  /** Drop every stream. A room that broadcasts afterwards starts a new stream (new id, seq from 1). */
  reset() {
    this.since = new Date(this.clock()).toISOString()
    this.streams = new Map() // roomCode -> { id, seq, createdAt, emitted, recipients, byEvent: Map }
  }

  _stream(roomCode) {
    const key = String(roomCode)
    let s = this.streams.get(key)
    if (!s) {
      if (this.streams.size >= MAX_STREAMS) this.streams.delete(this.streams.keys().next().value)
      s = { id: this.newId(), seq: 0, createdAt: new Date(this.clock()).toISOString(), emitted: 0, recipients: 0, byEvent: new Map() }
      this.streams.set(key, s)
    }
    return s
  }

  /** The stream's id and current (last emitted) seq, for the lt:hello baseline. */
  current(roomCode) {
    const s = this._stream(roomCode)
    return { s: s.id, n: s.seq }
  }

  /**
   * Assign the next seq for this room and return a stamped shallow copy of the payload. Non-object
   * payloads are returned unchanged and consume no seq, so the stream stays contiguous.
   */
  stamp(roomCode, event, payload) {
    if (!isPlainObject(payload)) return payload
    const s = this._stream(roomCode)
    s.seq++
    s.emitted++
    const n = Number(this.recipients(roomCode)) || 0
    s.recipients += n
    const name = s.byEvent.has(event) || s.byEvent.size < MAX_EVENT_KEYS ? event : '(other)'
    const e = s.byEvent.get(name) || { count: 0, recipients: 0, lastSeq: 0 }
    e.count++
    e.recipients += n
    e.lastSeq = s.seq
    s.byEvent.set(name, e)
    return { ...payload, [TRACE_FIELD]: { s: s.id, n: s.seq, t: this.clock() } }
  }

  snapshot() {
    const streams = {}
    for (const s of this.streams.values()) {
      streams[s.id] = {
        lastSeq: s.seq,
        createdAt: s.createdAt,
        emitted: s.emitted,
        localRecipients: s.recipients,
        byEvent: Object.fromEntries(s.byEvent)
      }
    }
    return {
      enabled: true,
      since: this.since,
      note: 'one stream per room per server instance; localRecipients counts sockets on this instance only',
      streams
    }
  }
}

// io instance -> tracer. Per-io (not a module singleton) so separate servers, e.g. in tests, never share state.
const tracers = new WeakMap()

/**
 * Enable tracing for this io if — and only if — the environment allows it and the server metrics
 * collector is installed (the ledger is served from its endpoint). Returns the tracer, or null.
 */
export function installEventTrace(io, metrics, { env = process.env, log = console.log } = {}) {
  const cfg = traceConfig(env)
  if (!cfg.enabled || !metrics || !io) {
    if (String(env.SERVER_EVENT_TRACE || '').trim()) {
      log(`[trace] event tracing disabled (${cfg.enabled ? 'server metrics are not installed' : cfg.reason})`)
    }
    return null
  }
  const trace = new EventTrace({ recipients: (roomCode) => io.sockets?.adapter?.rooms?.get(roomCode)?.size ?? null })
  tracers.set(io, trace)
  metrics.extend('eventTrace', { snapshot: () => trace.snapshot(), reset: () => trace.reset() })
  log('[trace] event tracing ENABLED: room broadcasts carry __lt sequence numbers. Do not enable in production.')
  return trace
}

/** Broadcast to a room. Identical to io.to(roomCode).emit(event, payload) unless tracing is on. */
export function roomEmit(io, roomCode, event, payload) {
  const trace = tracers.get(io)
  return io.to(roomCode).emit(event, trace ? trace.stamp(roomCode, event, payload) : payload)
}

/**
 * Tell a socket that just joined `roomCode` where the room's stream stands. Call it synchronously
 * right after socket.join(roomCode), before any await, so every broadcast this socket can receive
 * has a seq above the baseline. No-op when tracing is off.
 */
export function sendTraceHello(io, socket, roomCode) {
  const trace = tracers.get(io)
  if (trace) socket.emit(HELLO_EVENT, trace.current(roomCode))
}
