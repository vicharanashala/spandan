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
  ServerMetrics, METRICS_PATH
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
    const reset = await request(app).post(`${METRICS_PATH}/reset`)
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
    expect((await request(app).post(`${METRICS_PATH}/reset`).set('X-Forwarded-For', '1.2.3.4')).status).toBe(403)
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
