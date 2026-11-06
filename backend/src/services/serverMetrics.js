// Lightweight, opt-in server metrics for local load testing (see loadtest/README.md).
//
// OFF BY DEFAULT. Only `SERVER_METRICS=on` enables it, and it is refused outright when
// NODE_ENV=production. When off, installServerMetrics() installs NOTHING: no middleware, no socket
// listeners, no timers and no route, so the app behaves exactly as before and the URL is a plain 404.
//
// When on, it records in memory, with bounded size:
//   http    per route PATTERN (e.g. "GET /api/responses/leaderboard/:roomId", never the raw URL):
//           count, status codes, errors (5xx), latency (mean/max + p50/p95/p99 over recent samples)
//   sockets active/peak/total connections, disconnect reasons, engine connection errors, and counts
//           of incoming and outgoing events by event NAME (outgoing = per-socket deliveries, so a
//           room broadcast to 50 students counts 50)
//   process CPU % (1 s samples), memory, event-loop delay, uptime, MongoDB/Redis state
//
// and serves them as JSON at GET /internal/metrics (POST /internal/metrics/reset clears them),
// only to requests from the loopback interface that did not come through a proxy. The endpoint is
// deliberately outside /api, so a reverse proxy that forwards /api and /socket.io never routes it.
//
// Never recorded: URLs, query strings, bodies, headers, tokens, user ids, emails, room codes,
// socket ids or event payloads.
import express from 'express'
import { monitorEventLoopDelay } from 'node:perf_hooks'

export const METRICS_PATH = '/internal/metrics'
const RESERVOIR_SIZE = 1024     // latency samples kept per route (recent window for percentiles)
const MAX_ROUTE_KEYS = 200      // distinct route keys; beyond this, traffic lands in "other"
const MAX_EVENT_KEYS = 100      // distinct socket event names, likewise
const CPU_HISTORY = 120         // 1 s CPU samples kept (2 minutes)
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const PROXY_HEADERS = ['x-forwarded-for', 'x-real-ip', 'forwarded', 'x-forwarded-host']
// Top-level /api segments the app actually mounts; anything else in an unmatched URL is masked.
const KNOWN_API_SEGMENTS = new Set(['auth', 'rooms', 'questions', 'transcription', 'transcripts', 'responses', 'research', 'admin', 'health'])

/** Decide from the environment whether metrics are on. Returns { enabled, reason }. */
export function metricsConfig(env = process.env) {
  const flag = String(env.SERVER_METRICS || '').trim().toLowerCase()
  const requested = ['on', 'true', '1', 'yes'].includes(flag)
  if (!requested) return { enabled: false, reason: 'SERVER_METRICS is not set to "on"' }
  if (String(env.NODE_ENV || '').toLowerCase() === 'production') {
    return { enabled: false, reason: 'refused: NODE_ENV is "production"' }
  }
  return { enabled: true, reason: 'SERVER_METRICS=on' }
}

/** Local-only access: loopback peer address and no proxy forwarding headers. */
export function isLocalDirectRequest(req) {
  const addr = req.socket?.remoteAddress || ''
  if (!LOOPBACK.has(addr)) return false
  return !PROXY_HEADERS.some(h => req.headers?.[h] !== undefined)
}

// Route key from Express's matched route pattern, so ids/codes never appear. Unmatched requests
// (404s, or a rate limiter answering before routing) keep only a known /api/<segment> prefix.
export function routeKey(req) {
  const method = req.method || 'GET'
  if (req.route?.path !== undefined) {
    const base = req.baseUrl || ''
    const path = Array.isArray(req.route.path) ? req.route.path[0] : String(req.route.path)
    return `${method} ${base}${path === '/' && base ? '' : path}`
  }
  const raw = String(req.originalUrl || req.url || '').split('?')[0]
  const parts = raw.split('/').filter(Boolean)
  if (parts[0] === 'api' && KNOWN_API_SEGMENTS.has(parts[1])) {
    return `${method} /api/${parts[1]}${parts.length > 2 ? '/*' : ''} (unmatched)`
  }
  if (parts[0] === 'socket.io') return `${method} /socket.io (unmatched)`
  return `${method} (other unmatched)`
}

// Event names are client-controlled on incoming sockets, so keep only plain names.
export const eventKey = (name) =>
  (typeof name === 'string' && /^[A-Za-z][\w:.-]{0,39}$/.test(name)) ? name : '(invalid)'

export function percentileOf(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10)
const mb = (bytes) => Math.round((bytes / 1048576) * 10) / 10

function boundedInc(map, key, max, by = 1) {
  const k = map.has(key) || map.size < max ? key : '(other)'
  map.set(k, (map.get(k) || 0) + by)
}

export class ServerMetrics {
  constructor({ now = () => performance.now(), clock = () => Date.now() } = {}) {
    this.now = now
    this.clock = clock
    this.cpuHistory = []
    this.loop = null
    this.timer = null
    this.probes = {}
    this.sections = new Map()
    this.reset()
  }

  /** Add a named section to the snapshot (e.g. event tracing); its reset() runs on every metrics reset. */
  extend(name, { snapshot, reset }) {
    this.sections.set(name, { snapshot, reset })
  }

  reset() {
    for (const s of this.sections?.values() || []) s.reset?.()
    this.since = new Date(this.clock()).toISOString()
    this.http = { total: 0, errors: 0, aborted: 0, inFlight: this.http?.inFlight || 0, routes: new Map() }
    const active = this.sockets?.active || 0
    this.sockets = {
      active, peak: active, connections: 0, disconnects: 0,
      disconnectReasons: new Map(), connectionErrors: new Map(),
      incoming: new Map(), outgoing: new Map()
    }
    this.cpuHistory = []
    this.loop?.reset()
  }

  // ---- HTTP -------------------------------------------------------------------------------
  recordHttp(key, status, ms) {
    this.http.total++
    let route = this.http.routes.get(key)
    if (!route) {
      if (this.http.routes.size >= MAX_ROUTE_KEYS) key = '(other)'
      route = this.http.routes.get(key)
      if (!route) {
        route = { count: 0, errors: 0, sum: 0, max: 0, statuses: new Map(), samples: [], next: 0 }
        this.http.routes.set(key, route)
      }
    }
    route.count++
    route.sum += ms
    if (ms > route.max) route.max = ms
    boundedInc(route.statuses, String(status), 50)
    if (status >= 500) { route.errors++; this.http.errors++ }
    if (route.samples.length < RESERVOIR_SIZE) route.samples.push(ms)
    else { route.samples[route.next] = ms; route.next = (route.next + 1) % RESERVOIR_SIZE }
  }

  middleware() {
    return (req, res, next) => {
      if (req.path === METRICS_PATH || req.path.startsWith(METRICS_PATH + '/')) return next() // don't measure ourselves
      const start = this.now()
      this.http.inFlight++
      let done = false
      const finish = (aborted) => {
        if (done) return
        done = true
        this.http.inFlight--
        if (aborted) { this.http.aborted++; return }
        this.recordHttp(routeKey(req), res.statusCode, this.now() - start)
      }
      res.once('finish', () => finish(false))
      res.once('close', () => finish(!res.writableFinished))
      next()
    }
  }

  // ---- Socket.IO --------------------------------------------------------------------------
  attachIo(io) {
    io.on('connection', (socket) => {
      const s = this.sockets
      s.active++
      s.connections++
      if (s.active > s.peak) s.peak = s.active
      socket.onAny((event) => boundedInc(this.sockets.incoming, eventKey(event), MAX_EVENT_KEYS))
      socket.onAnyOutgoing((event) => boundedInc(this.sockets.outgoing, eventKey(event), MAX_EVENT_KEYS))
      socket.once('disconnect', (reason) => {
        this.sockets.active = Math.max(0, this.sockets.active - 1)
        this.sockets.disconnects++
        boundedInc(this.sockets.disconnectReasons, eventKey(String(reason).replace(/\s+/g, '_')), 20)
      })
    })
    io.engine?.on?.('connection_error', (err) => {
      boundedInc(this.sockets.connectionErrors, `${err?.code ?? 'unknown'}:${eventKey(String(err?.message || '').replace(/\s+/g, '_'))}`, 20)
    })
  }

  // ---- Process ----------------------------------------------------------------------------
  startSampling(intervalMs = 1000) {
    if (this.timer) return
    this.loop = monitorEventLoopDelay({ resolution: 20 })
    this.loop.enable()
    let lastCpu = process.cpuUsage()
    let lastAt = this.now()
    this.timer = setInterval(() => {
      const at = this.now()
      const d = process.cpuUsage(lastCpu)
      const pct = at > lastAt ? ((d.user + d.system) / ((at - lastAt) * 1000)) * 100 : 0
      lastCpu = process.cpuUsage()
      lastAt = at
      this.cpuHistory.push(r1(pct))
      if (this.cpuHistory.length > CPU_HISTORY) this.cpuHistory.shift()
    }, intervalMs)
    this.timer.unref()
  }

  stopSampling() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.loop?.disable()
  }

  /** Optional state probes (e.g. MongoDB/Redis readiness) — must return non-sensitive values. */
  setProbes(probes) { this.probes = probes || {} }

  snapshot() {
    const routes = {}
    for (const [key, r] of [...this.http.routes].sort((a, b) => b[1].count - a[1].count)) {
      routes[key] = {
        count: r.count,
        errors: r.errors,
        statuses: Object.fromEntries(r.statuses),
        meanMs: r1(r.count ? r.sum / r.count : null),
        p50Ms: r1(percentileOf(r.samples, 50)),
        p95Ms: r1(percentileOf(r.samples, 95)),
        p99Ms: r1(percentileOf(r.samples, 99)),
        maxMs: r1(r.max)
      }
    }
    const mem = process.memoryUsage()
    const cpu = this.cpuHistory
    const loop = this.loop
    const probes = {}
    for (const [k, fn] of Object.entries(this.probes)) {
      try { probes[k] = fn() } catch { probes[k] = 'unknown' }
    }
    const s = this.sockets
    const extra = {}
    for (const [name, sec] of this.sections) {
      try { extra[name] = sec.snapshot() } catch { extra[name] = null }
    }
    return {
      schemaVersion: 1,
      since: this.since,
      at: new Date(this.clock()).toISOString(),
      process: {
        pid: process.pid,
        node: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        cpuPercent: {
          last: cpu.length ? cpu[cpu.length - 1] : null,
          avg: cpu.length ? r1(cpu.reduce((a, b) => a + b, 0) / cpu.length) : null,
          max: cpu.length ? Math.max(...cpu) : null,
          samples: cpu.length,
          note: '% of one core, sampled each second since the last reset (max 120 samples)'
        },
        memoryMb: { rss: mb(mem.rss), heapUsed: mb(mem.heapUsed), heapTotal: mb(mem.heapTotal), external: mb(mem.external) },
        eventLoopDelayMs: loop
          ? { mean: r1(loop.mean / 1e6), p50: r1(loop.percentile(50) / 1e6), p99: r1(loop.percentile(99) / 1e6), max: r1(loop.max / 1e6) }
          : null,
        ...probes
      },
      http: { total: this.http.total, errors: this.http.errors, aborted: this.http.aborted, inFlight: this.http.inFlight, routes },
      sockets: {
        active: s.active,
        peak: s.peak,
        connections: s.connections,
        disconnects: s.disconnects,
        disconnectReasons: Object.fromEntries(s.disconnectReasons),
        connectionErrors: Object.fromEntries(s.connectionErrors),
        incomingEvents: Object.fromEntries(s.incoming),
        outgoingEvents: Object.fromEntries(s.outgoing)
      },
      ...extra
    }
  }

  router() {
    const r = express.Router()
    r.use((req, res, next) => {
      if (!isLocalDirectRequest(req)) {
        return res.status(403).json({ error: 'metrics are available only to direct local requests' })
      }
      res.set('Cache-Control', 'no-store')
      next()
    })
    r.get('/', (req, res) => res.json(this.snapshot()))
    r.post('/reset', (req, res) => { this.reset(); res.json({ reset: true, since: this.since }) })
    return r
  }
}

/**
 * Wire metrics into the app if — and only if — the environment enables them. Call this BEFORE the
 * rate limiters and routes so throttled (429) responses are measured too. Returns the collector
 * when enabled, otherwise null (and nothing at all is installed).
 */
export function installServerMetrics(app, io, { env = process.env, probes = {}, log = console.log } = {}) {
  const cfg = metricsConfig(env)
  if (!cfg.enabled) {
    if (String(env.SERVER_METRICS || '').trim()) log(`[metrics] server metrics disabled (${cfg.reason})`)
    return null
  }
  const metrics = new ServerMetrics()
  metrics.setProbes(probes)
  metrics.startSampling()
  app.use(metrics.middleware())
  app.use(METRICS_PATH, metrics.router())
  if (io) metrics.attachIo(io)
  log(`[metrics] server metrics ENABLED at ${METRICS_PATH} (local direct requests only). Do not enable in production.`)
  return metrics
}
