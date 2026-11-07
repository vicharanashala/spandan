// Opt-in server metrics (services/serverMetrics.js): enable/disable rules, that nothing is installed
// when off, HTTP and Socket.IO collection, local-only access, and that no identifying data
// (ids, codes, emails, tokens, payloads) ever appears in the output.
import http from 'http'
import express from 'express'
import request from 'supertest'
import { Server } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import {
  metricsConfig, installServerMetrics, isLocalDirectRequest, routeKey, eventKey, percentileOf,
  ServerMetrics, METRICS_PATH, RESET_HEADER, RESET_HEADER_VALUE, hostnameOf, isLoopbackOrigin, metricsAccessError
} from '../services/serverMetrics.js'

const quiet = () => {}
const ROOM_ID = '665f1c2ab3d4e5f6a7b8c9d0'
const EMAIL = 'someone.private@example.com'
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.secret-token-value'

// A small app shaped like index.js: metrics first, a limiter-like gate, routes, then a 404 handler.
function buildApp(env) {
  const app = express()
  app.use(express.json())
  const metrics = installServerMetrics(app, null, { env, log: quiet })
  app.use('/api/responses', (req, res, next) => (req.headers['x-test-throttle'] ? res.status(429).json({ error: 'slow down' }) : next()))
  const rooms = express.Router()
  rooms.get('/:id', (req, res) => res.json({ id: req.params.id }))
  rooms.get('/', (req, res) => res.json([]))
  app.use('/api/rooms', rooms)
  app.get('/api/boom', () => { throw new Error('kaboom') })
  app.post('/api/responses', (req, res) => res.status(201).json({ ok: true }))
  app.use((err, req, res, next) => res.status(500).json({ error: 'x' })) // eslint-disable-line no-unused-vars
  app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }))
  return { app, metrics }
}

afterEach(() => { /* collectors created per test stop their sampler below */ })

describe('metricsConfig', () => {
  it('is off unless SERVER_METRICS is explicitly on', () => {
    expect(metricsConfig({}).enabled).toBe(false)
    expect(metricsConfig({ SERVER_METRICS: '' }).enabled).toBe(false)
    expect(metricsConfig({ SERVER_METRICS: 'off' }).enabled).toBe(false)
    expect(metricsConfig({ SERVER_METRICS: 'maybe' }).enabled).toBe(false)
    for (const v of ['on', 'ON', 'true', '1', 'yes']) expect(metricsConfig({ SERVER_METRICS: v }).enabled).toBe(true)
  })

  it('is refused when NODE_ENV=production, even if requested', () => {
    const cfg = metricsConfig({ SERVER_METRICS: 'on', NODE_ENV: 'production' })
    expect(cfg.enabled).toBe(false)
    expect(cfg.reason).toMatch(/production/)
  })
})

describe('when disabled', () => {
  it('installs nothing: no middleware, no route, endpoint is a plain 404', async () => {
    const app = express()
    app.get('/x', (req, res) => res.send('x'))
    const before = app._router.stack.length
    const io = { on: jest.fn(), engine: { on: jest.fn() } }
    expect(installServerMetrics(app, io, { env: {}, log: quiet })).toBeNull()
    expect(installServerMetrics(app, io, { env: { SERVER_METRICS: 'on', NODE_ENV: 'production' }, log: quiet })).toBeNull()
    expect(app._router.stack.length).toBe(before)
    expect(io.on).not.toHaveBeenCalled()
    expect(io.engine.on).not.toHaveBeenCalled()

    const { app: full } = buildApp({})
    const res = await request(full).get(METRICS_PATH)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Endpoint not found' })
    expect((await request(full).post(`${METRICS_PATH}/reset`)).status).toBe(404)
  })
})

describe('when enabled', () => {
  let app, metrics
  beforeEach(() => { ({ app, metrics } = buildApp({ SERVER_METRICS: 'on' })) })
  afterEach(() => metrics?.stopSampling())

  it('records counts, statuses, errors and latency per route pattern', async () => {
    await request(app).get(`/api/rooms/${ROOM_ID}`).set('Authorization', `Bearer ${TOKEN}`)
    await request(app).get('/api/rooms/ABC123')
    await request(app).get('/api/rooms')
    await request(app).get('/api/boom')
    await request(app).post('/api/responses').send({ email: EMAIL })
    await request(app).post('/api/responses').set('x-test-throttle', '1')

    const snap = (await request(app).get(METRICS_PATH)).body
    const r = snap.http.routes
    expect(r['GET /api/rooms/:id']).toMatchObject({ count: 2, errors: 0, statuses: { 200: 2 } })
    expect(r['GET /api/rooms']).toMatchObject({ count: 1 })
    expect(r['GET /api/boom']).toMatchObject({ count: 1, errors: 1, statuses: { 500: 1 } })
    expect(r['POST /api/responses']).toMatchObject({ count: 1, statuses: { 201: 1 } })
    // The limiter answered before routing: grouped under a masked prefix.
    expect(r['POST /api/responses (unmatched)']).toMatchObject({ count: 1, statuses: { 429: 1 } })
    for (const k of ['p50Ms', 'p95Ms', 'p99Ms', 'meanMs', 'maxMs']) expect(typeof r['GET /api/rooms/:id'][k]).toBe('number')
    expect(snap.http.total).toBe(6)
    expect(snap.http.errors).toBe(1)
    expect(snap.http.inFlight).toBe(0)
    // The metrics endpoint does not measure itself.
    expect(Object.keys(r).some(k => k.includes('/internal'))).toBe(false)
  })

  it('never exposes ids, codes, emails, tokens or raw URLs', async () => {
    await request(app).get(`/api/rooms/${ROOM_ID}`).set('Authorization', `Bearer ${TOKEN}`)
    await request(app).get(`/api/rooms/join/XYZ789?email=${encodeURIComponent(EMAIL)}`) // unmatched -> masked
    await request(app).get(`/api/${EMAIL}/whatever`)
    await request(app).get(`/not-api/${ROOM_ID}`)
    const text = JSON.stringify((await request(app).get(METRICS_PATH)).body)
    for (const secret of [ROOM_ID, 'XYZ789', 'ABC123', EMAIL, 'example.com', TOKEN, 'secret-token', 'Bearer']) {
      expect(text).not.toContain(secret)
    }
    const keys = Object.keys(JSON.parse(text).http.routes)
    expect(keys).toEqual(expect.arrayContaining(['GET /api/rooms/:id', 'GET /api/rooms/* (unmatched)', 'GET (other unmatched)']))
  })

  it('reports process CPU, memory, event-loop delay and probe state', async () => {
    const snap = (await request(app).get(METRICS_PATH)).body
    expect(snap.schemaVersion).toBe(1)
    expect(snap.process.memoryMb.rss).toBeGreaterThan(0)
    expect(snap.process.eventLoopDelayMs).toEqual(expect.objectContaining({ p99: expect.any(Number) }))
    expect(snap.process.cpuPercent).toEqual(expect.objectContaining({ samples: expect.any(Number) }))
    expect(snap.process).not.toHaveProperty('env')
    expect(JSON.stringify(snap)).not.toMatch(/MONGODB_URI|JWT_SECRET|password/i)
  })

  it('reset clears counters', async () => {
    await request(app).get('/api/rooms')
    expect((await request(app).get(METRICS_PATH)).body.http.total).toBe(1)
    const reset = await request(app).post(`${METRICS_PATH}/reset`).set(RESET_HEADER, RESET_HEADER_VALUE)
    expect(reset.status).toBe(200)
    expect(reset.body.reset).toBe(true)
    const snap = (await request(app).get(METRICS_PATH)).body
    expect(snap.http.total).toBe(0)
    expect(snap.http.routes).toEqual({})
  })

  it('refuses requests that came through a proxy', async () => {
    for (const h of ['X-Forwarded-For', 'X-Real-IP', 'Forwarded', 'X-Forwarded-Host']) {
      const res = await request(app).get(METRICS_PATH).set(h, '203.0.113.9')
      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'metrics are available only to direct local requests' })
    }
    expect((await request(app).post(`${METRICS_PATH}/reset`).set('X-Forwarded-For', '1.2.3.4').set(RESET_HEADER, RESET_HEADER_VALUE)).status).toBe(403)
  })

  it('reset without the custom header is refused and clears nothing (CSRF)', async () => {
    await request(app).get('/api/rooms')
    for (const value of [undefined, '', '1', 'RESET ']) {
      const req = request(app).post(`${METRICS_PATH}/reset`)
      const res = await (value === undefined ? req : req.set(RESET_HEADER, value))
      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/x-loadtest-metrics: reset/)
    }
    // A plain form-style POST, as a drive-by page would send it.
    const form = await request(app).post(`${METRICS_PATH}/reset`).type('form').send('a=1')
    expect(form.status).toBe(403)
    expect((await request(app).get(METRICS_PATH)).body.http.total).toBe(1)
  })

  it('refuses a non-localhost Host header (DNS rebinding), for reads and resets', async () => {
    for (const host of ['evil.example', 'evil.example:3001', '127.0.0.1.nip.io:3001', '10.0.0.5:3001', '']) {
      expect((await request(app).get(METRICS_PATH).set('Host', host)).status).toBe(403)
      expect((await request(app).post(`${METRICS_PATH}/reset`).set('Host', host).set(RESET_HEADER, RESET_HEADER_VALUE)).status).toBe(403)
    }
    const res = await request(app).get(METRICS_PATH).set('Host', 'evil.example')
    expect(res.body).toEqual({ error: 'metrics require a localhost Host header' })
    for (const host of ['localhost:3001', 'LOCALHOST', '127.0.0.1:3001', '[::1]:3001']) {
      expect((await request(app).get(METRICS_PATH).set('Host', host)).status).toBe(200)
    }
  })

  it('refuses requests a browser marks as cross-site or same-site, or with a foreign Origin', async () => {
    for (const site of ['cross-site', 'same-site', 'CROSS-SITE']) {
      const res = await request(app).post(`${METRICS_PATH}/reset`).set('Sec-Fetch-Site', site).set(RESET_HEADER, RESET_HEADER_VALUE)
      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/cross-site/)
    }
    for (const origin of ['https://evil.example', 'null', 'http://127.0.0.1.evil.example', 'file://', 'chrome-extension://abc']) {
      const res = await request(app).get(METRICS_PATH).set('Origin', origin)
      expect(res.status).toBe(403)
      expect(res.body.error).toMatch(/cross-origin/)
    }
    // A cross-origin preflight is refused and never approved, so a page can't send the reset header.
    const pre = await request(app).options(`${METRICS_PATH}/reset`).set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', RESET_HEADER)
    expect(pre.status).toBe(403)
    expect(pre.headers['access-control-allow-origin']).toBeUndefined()
    // Same-origin / direct navigation and a loopback Origin are fine.
    expect((await request(app).get(METRICS_PATH).set('Sec-Fetch-Site', 'none')).status).toBe(200)
    expect((await request(app).get(METRICS_PATH).set('Sec-Fetch-Site', 'same-origin')).status).toBe(200)
    expect((await request(app).get(METRICS_PATH).set('Origin', 'http://localhost:3001')).status).toBe(200)
  })

  it('sends its own security headers (it runs before helmet), on success and on refusal', async () => {
    const ok = await request(app).get(METRICS_PATH)
    const refused = await request(app).get(METRICS_PATH).set('Origin', 'https://evil.example')
    const resetRefused = await request(app).post(`${METRICS_PATH}/reset`)
    for (const res of [ok, refused, resetRefused]) {
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin')
      expect(res.headers['x-powered-by']).toBeUndefined()
      expect(res.headers['content-type']).toMatch(/^application\/json/)
    }
    expect([ok.status, refused.status, resetRefused.status]).toEqual([200, 403, 403])
  })

  it('a non-browser client (no Origin or Sec-Fetch-Site), like the simulator, can read and reset', async () => {
    expect((await request(app).get(METRICS_PATH).set('Sec-Fetch-Mode', 'cors')).status).toBe(200)
    const res = await request(app).post(`${METRICS_PATH}/reset`).set('Sec-Fetch-Mode', 'cors').set(RESET_HEADER, RESET_HEADER_VALUE)
    expect(res.status).toBe(200)
  })
})

describe('route keys for errors handled at app level', () => {
  let app, metrics
  beforeEach(() => {
    app = express()
    metrics = installServerMetrics(app, null, { env: { SERVER_METRICS: 'on' }, log: quiet })
    const rooms = express.Router()
    rooms.get('/:id/fail', (req, res, next) => next(new Error('x')))
    rooms.get('/:id/throw', () => { throw new Error('x') })
    rooms.get('/:id/own500', (req, res) => res.status(500).json({}))
    rooms.get('/', (req, res, next) => next(new Error('x')))
    const questions = express.Router()
    questions.get('/:id/fail', (req, res, next) => next(new Error('x')))
    app.use('/api/rooms', rooms)
    app.use('/api/questions', questions)
    app.get('/api/health', (req, res, next) => next(new Error('x'))) // app-level route: already full
    app.use((err, req, res, next) => res.status(500).json({ error: 'x' })) // eslint-disable-line no-unused-vars
  })
  afterEach(() => metrics?.stopSampling())

  it('keeps each router prefix, so the same pattern in two routers never merges', async () => {
    await request(app).get(`/api/rooms/${ROOM_ID}/fail`)
    await request(app).get('/api/rooms/ABC123/throw')
    await request(app).get(`/api/rooms/${ROOM_ID}/own500`)
    await request(app).get('/api/rooms?x=1')
    await request(app).get(`/api/questions/${ROOM_ID}/fail`)
    await request(app).get('/api/health')
    const snap = (await request(app).get(METRICS_PATH)).body
    const keys = Object.keys(snap.http.routes).sort()
    expect(keys).toEqual([
      'GET /api/health', 'GET /api/questions/:id/fail', 'GET /api/rooms',
      'GET /api/rooms/:id/fail', 'GET /api/rooms/:id/own500', 'GET /api/rooms/:id/throw'
    ])
    for (const k of keys) expect(snap.http.routes[k]).toMatchObject({ count: 1, errors: 1, statuses: { 500: 1 } })
    expect(JSON.stringify(snap)).not.toContain(ROOM_ID)
    expect(JSON.stringify(snap)).not.toContain('ABC123')
  })

  it('routeKey recovers the prefix only for known /api segments', () => {
    const req = (originalUrl, path = '/:id') => ({ method: 'GET', baseUrl: '', originalUrl, route: { path } })
    expect(routeKey(req('/api/rooms/1'))).toBe('GET /api/rooms/:id')
    expect(routeKey(req('/api/unknownthing/1'))).toBe('GET /:id')
    expect(routeKey(req('/other/1'))).toBe('GET /:id')
    expect(routeKey(req('/api/health', '/api/health'))).toBe('GET /api/health')
  })
})

describe('browser-request helpers', () => {
  it('hostnameOf parses Host headers and rejects malformed ones', () => {
    expect(hostnameOf('LocalHost:3001')).toBe('localhost')
    expect(hostnameOf('127.0.0.1')).toBe('127.0.0.1')
    expect(hostnameOf('[::1]:3001')).toBe('[::1]')
    expect(hostnameOf('')).toBeNull()
    expect(hostnameOf(undefined)).toBeNull()
    expect(hostnameOf('a b')).toBeNull()
    expect(hostnameOf('localhost:3001:1')).toBeNull()
  })

  it('isLoopbackOrigin accepts only http(s) origins on this machine', () => {
    expect(isLoopbackOrigin('http://localhost:5173')).toBe(true)
    expect(isLoopbackOrigin('https://127.0.0.1')).toBe(true)
    expect(isLoopbackOrigin('http://[::1]:3001')).toBe(true)
    expect(isLoopbackOrigin('null')).toBe(false)
    expect(isLoopbackOrigin('http://localhost.evil.example')).toBe(false)
    expect(isLoopbackOrigin('ws://localhost')).toBe(false)
  })

  it('metricsAccessError checks the peer first, then Host, Sec-Fetch-Site and Origin', () => {
    const req = (headers, remoteAddress = '127.0.0.1') => ({ socket: { remoteAddress }, headers: { host: 'localhost:3001', ...headers } })
    expect(metricsAccessError(req({}))).toBeNull()
    expect(metricsAccessError(req({}, '10.0.0.5'))).toMatch(/direct local requests/)
    expect(metricsAccessError(req({ host: 'evil.example' }))).toMatch(/Host/)
    expect(metricsAccessError(req({ 'sec-fetch-site': 'cross-site' }))).toMatch(/cross-site/)
    expect(metricsAccessError(req({ origin: 'https://evil.example' }))).toMatch(/cross-origin/)
  })
})

describe('isLocalDirectRequest', () => {
  const req = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers })
  it('accepts only loopback peers without proxy headers', () => {
    expect(isLocalDirectRequest(req('127.0.0.1'))).toBe(true)
    expect(isLocalDirectRequest(req('::1'))).toBe(true)
    expect(isLocalDirectRequest(req('::ffff:127.0.0.1'))).toBe(true)
    expect(isLocalDirectRequest(req('10.0.0.5'))).toBe(false)
    expect(isLocalDirectRequest(req('192.168.1.20'))).toBe(false)
    expect(isLocalDirectRequest(req('::ffff:10.0.0.5'))).toBe(false)
    expect(isLocalDirectRequest(req(undefined))).toBe(false)
    expect(isLocalDirectRequest(req('127.0.0.1', { 'x-forwarded-for': '127.0.0.1' }))).toBe(false)
  })
})

describe('helpers and bounds', () => {
  it('routeKey uses the route pattern and masks unmatched paths', () => {
    expect(routeKey({ method: 'GET', baseUrl: '/api/responses', route: { path: '/leaderboard/:roomId' } }))
      .toBe('GET /api/responses/leaderboard/:roomId')
    expect(routeKey({ method: 'GET', baseUrl: '/api/rooms', route: { path: '/' } })).toBe('GET /api/rooms')
    expect(routeKey({ method: 'GET', baseUrl: '', route: { path: '/api/health' } })).toBe('GET /api/health')
    expect(routeKey({ method: 'GET', originalUrl: '/api/rooms/ABCDEF?x=1' })).toBe('GET /api/rooms/* (unmatched)')
    expect(routeKey({ method: 'GET', originalUrl: '/api/unknown-thing/1' })).toBe('GET (other unmatched)')
    expect(routeKey({ method: 'GET', originalUrl: '/socket.io/?EIO=4&sid=abc' })).toBe('GET /socket.io (unmatched)')
  })

  it('eventKey keeps plain event names only', () => {
    expect(eventKey('room:join')).toBe('room:join')
    expect(eventKey('leaderboard:updated')).toBe('leaderboard:updated')
    expect(eventKey('x'.repeat(41))).toBe('(invalid)')
    expect(eventKey('<script>')).toBe('(invalid)')
    expect(eventKey(42)).toBe('(invalid)')
  })

  it('nearest-rank percentiles', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentileOf(v, 50)).toBe(50)
    expect(percentileOf(v, 95)).toBe(95)
    expect(percentileOf(v, 99)).toBe(99)
    expect(percentileOf([], 50)).toBeNull()
  })

  it('memory stays bounded: route keys cap into (other), samples cap at the reservoir size', () => {
    const m = new ServerMetrics()
    for (let i = 0; i < 300; i++) m.recordHttp(`GET /r${i}`, 200, 1)
    expect(m.http.routes.size).toBeLessThanOrEqual(201)
    expect(m.http.routes.get('(other)').count).toBe(100)
    for (let i = 0; i < 5000; i++) m.recordHttp('GET /hot', 200, i)
    expect(m.http.routes.get('(other)').samples.length).toBeLessThanOrEqual(1024)
    const hot = m.snapshot().http.routes['(other)']
    expect(hot.count).toBe(5100)
    expect(hot.maxMs).toBe(4999)
  })
})

describe('Socket.IO metrics', () => {
  let httpServer, io, metrics, url
  const clients = []

  beforeAll(async () => {
    httpServer = http.createServer()
    io = new Server(httpServer)
    metrics = new ServerMetrics()
    metrics.attachIo(io)
    io.on('connection', (socket) => {
      socket.join('room-1')
      socket.on('room:join', () => io.to('room-1').emit('room:joined', { participants: 2 }))
    })
    await new Promise(r => httpServer.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${httpServer.address().port}`
  })

  afterAll(async () => {
    for (const c of clients) c.close()
    io.close()
    await new Promise(r => httpServer.close(r))
  })

  const connect = () => new Promise((resolve, reject) => {
    const c = ioClient(url, { transports: ['websocket'], auth: { token: TOKEN }, reconnection: false })
    clients.push(c)
    c.on('connect', () => resolve(c))
    c.on('connect_error', reject)
  })
  const waitFor = async (pred, ms = 2000) => {
    const end = Date.now() + ms
    while (Date.now() < end) { if (pred()) return; await new Promise(r => setTimeout(r, 10)) }
    throw new Error('condition not met')
  }

  it('counts connections, incoming events, per-socket broadcast deliveries and disconnects', async () => {
    const a = await connect()
    const b = await connect()
    await waitFor(() => metrics.sockets.active === 2)

    const got = []
    b.on('room:joined', () => got.push('b'))
    a.on('room:joined', () => got.push('a'))
    a.emit('room:join', { roomCode: 'QWERTY', email: EMAIL, token: TOKEN })
    a.emit('<bad name>', { x: 1 })
    await waitFor(() => got.length === 2)

    a.close()
    await waitFor(() => metrics.sockets.active === 1)

    const s = metrics.snapshot().sockets
    expect(s).toMatchObject({ active: 1, peak: 2, connections: 2, disconnects: 1 })
    expect(s.incomingEvents).toEqual({ 'room:join': 1, '(invalid)': 1 })
    expect(s.outgoingEvents['room:joined']).toBe(2) // one broadcast, delivered to 2 sockets
    expect(Object.keys(s.disconnectReasons)).toHaveLength(1)

    const text = JSON.stringify(metrics.snapshot())
    for (const secret of ['QWERTY', EMAIL, TOKEN, a.id ?? 'no-id', b.id]) expect(text).not.toContain(secret)
  })
})
