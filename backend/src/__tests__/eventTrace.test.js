// Opt-in event tracing (services/eventTrace.js): enable rules, that roomEmit is a plain broadcast
// when off, contiguous per-room sequences and the join baseline when on, the bounded ledger (no room
// codes), and that it is served/reset through the server metrics collector.
import http from 'http'
import { Server } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import {
  traceConfig, EventTrace, installEventTrace, roomEmit, sendTraceHello, TRACE_FIELD, HELLO_EVENT
} from '../services/eventTrace.js'
import { ServerMetrics } from '../services/serverMetrics.js'

const quiet = () => {}
const ON = { SERVER_EVENT_TRACE: 'on', SERVER_METRICS: 'on' }
const ROOM = 'QWERTY'

// Minimal io stand-in that records broadcasts.
function fakeIo() {
  const sent = []
  return { sent, to: (room) => ({ emit: (event, payload) => { sent.push({ room, event, payload }); return true } }) }
}
const fakeSocket = () => { const out = []; return { out, emit: (e, p) => out.push({ e, p }) } }

describe('traceConfig', () => {
  it('is off unless SERVER_EVENT_TRACE is on', () => {
    expect(traceConfig({}).enabled).toBe(false)
    expect(traceConfig({ SERVER_METRICS: 'on' }).enabled).toBe(false)
    expect(traceConfig({ SERVER_EVENT_TRACE: 'off', SERVER_METRICS: 'on' }).enabled).toBe(false)
  })
  it('requires server metrics as well', () => {
    const c = traceConfig({ SERVER_EVENT_TRACE: 'on' })
    expect(c.enabled).toBe(false)
    expect(c.reason).toMatch(/requires server metrics/)
  })
  it('is refused in production even with both flags', () => {
    const c = traceConfig({ ...ON, NODE_ENV: 'production' })
    expect(c.enabled).toBe(false)
    expect(c.reason).toMatch(/production/)
  })
  it('is on with both flags outside production', () => {
    expect(traceConfig(ON).enabled).toBe(true)
    expect(traceConfig({ SERVER_EVENT_TRACE: 'TRUE', SERVER_METRICS: '1', NODE_ENV: 'development' }).enabled).toBe(true)
  })
})

describe('when disabled', () => {
  it('installs nothing and roomEmit passes the very same payload object through', () => {
    const io = fakeIo()
    const metrics = new ServerMetrics()
    expect(installEventTrace(io, metrics, { env: {}, log: quiet })).toBeNull()
    const payload = { counts: { a: 1 } }
    roomEmit(io, ROOM, 'counts:updated', payload)
    expect(io.sent).toHaveLength(1)
    expect(io.sent[0].room).toBe(ROOM)
    expect(io.sent[0].payload).toBe(payload)
    expect(payload).toEqual({ counts: { a: 1 } }) // not mutated, no __lt
    expect(metrics.snapshot().eventTrace).toBeUndefined()
  })

  it('sendTraceHello sends nothing', () => {
    const io = fakeIo()
    installEventTrace(io, new ServerMetrics(), { env: {}, log: quiet })
    const sock = fakeSocket()
    sendTraceHello(io, sock, ROOM)
    expect(sock.out).toHaveLength(0)
  })

  it('stays off when the flag is on but metrics are not installed, and says why', () => {
    const io = fakeIo()
    const logs = []
    expect(installEventTrace(io, null, { env: ON, log: (m) => logs.push(m) })).toBeNull()
    expect(logs.join(' ')).toMatch(/disabled/)
    const payload = { x: 1 }
    roomEmit(io, ROOM, 'room:joined', payload)
    expect(io.sent[0].payload).toBe(payload)
  })

  it('a tracer on one io never affects another io', () => {
    const traced = fakeIo()
    const plain = fakeIo()
    installEventTrace(traced, new ServerMetrics(), { env: ON, log: quiet })
    const payload = { x: 1 }
    roomEmit(plain, ROOM, 'room:joined', payload)
    expect(plain.sent[0].payload).toBe(payload)
  })
})

describe('EventTrace', () => {
  let ids
  const make = (opts = {}) => { ids = 0; return new EventTrace({ clock: () => 1_700_000_000_000, newId: () => `stream${++ids}`, ...opts }) }

  it('numbers each room contiguously from 1 on a copy of the payload', () => {
    const t = make()
    const p = { a: 1 }
    const out = [1, 2, 3].map(() => t.stamp(ROOM, 'counts:updated', p))
    expect(out.map(o => o[TRACE_FIELD].n)).toEqual([1, 2, 3])
    expect(out[0]).toEqual({ a: 1, [TRACE_FIELD]: { s: 'stream1', n: 1, t: 1_700_000_000_000 } })
    expect(p).toEqual({ a: 1 }) // caller's object untouched
  })

  it('keeps one stream per room, across event types', () => {
    const t = make()
    expect(t.stamp('A', 'room:joined', {})[TRACE_FIELD]).toMatchObject({ s: 'stream1', n: 1 })
    expect(t.stamp('B', 'room:joined', {})[TRACE_FIELD]).toMatchObject({ s: 'stream2', n: 1 })
    expect(t.stamp('A', 'new_question', {})[TRACE_FIELD]).toMatchObject({ s: 'stream1', n: 2 })
    expect(t.stamp('A', 'room:ended', {})[TRACE_FIELD]).toMatchObject({ s: 'stream1', n: 3 })
  })

  it('non-object payloads pass through and consume no seq', () => {
    const t = make()
    expect(t.stamp(ROOM, 'x', undefined)).toBeUndefined()
    expect(t.stamp(ROOM, 'x', 'str')).toBe('str')
    const arr = [1]
    expect(t.stamp(ROOM, 'x', arr)).toBe(arr)
    expect(t.stamp(ROOM, 'x', {})[TRACE_FIELD].n).toBe(1)
  })

  it('current() gives the hello baseline: the last emitted seq', () => {
    const t = make()
    expect(t.current(ROOM)).toEqual({ s: 'stream1', n: 0 })
    t.stamp(ROOM, 'room:joined', {})
    t.stamp(ROOM, 'counts:updated', {})
    expect(t.current(ROOM)).toEqual({ s: 'stream1', n: 2 })
  })

  it('ledger counts emits and local recipients per event, without room codes', () => {
    const sizes = { [ROOM]: 3 }
    const t = make({ recipients: (r) => sizes[r] ?? null })
    t.stamp(ROOM, 'new_question', {})
    sizes[ROOM] = 4
    t.stamp(ROOM, 'room:joined', {})
    t.stamp(ROOM, 'new_question', {})
    const snap = t.snapshot()
    expect(snap.streams.stream1).toMatchObject({
      lastSeq: 3, emitted: 3, localRecipients: 11,
      byEvent: { new_question: { count: 2, recipients: 7, lastSeq: 3 }, 'room:joined': { count: 1, recipients: 4, lastSeq: 2 } }
    })
    expect(JSON.stringify(snap)).not.toContain(ROOM)
  })

  it('bounds the number of streams, dropping the oldest', () => {
    const t = make()
    for (let i = 0; i < 25; i++) t.stamp(`R${i}`, 'e', {})
    const snap = t.snapshot()
    const keys = Object.keys(snap.streams)
    expect(keys).toHaveLength(20)
    expect(keys).not.toContain('stream1')
    expect(keys).toContain('stream25')
    expect(snap.evictedStreams).toBe(5)
    expect(snap.maxStreams).toBe(20)
  })

  it('evicts the least recently USED stream, so a live room keeps its stream', () => {
    const t = make()
    t.stamp('LIVE', 'e', {})                     // stream1, created first
    for (let i = 0; i < 30; i++) {
      t.stamp(`Q${i}`, 'e', {})                  // other rooms keep arriving
      if (i % 5 === 0) t.stamp('LIVE', 'e', {})  // the live room keeps broadcasting
    }
    const live = t.snapshot().streams.stream1
    expect(live).toBeDefined()                   // never evicted, never restarted
    expect(live.lastSeq).toBe(7)                 // one contiguous stream: 1 + 6 later broadcasts
    expect(t.current('LIVE')).toEqual({ s: 'stream1', n: 7 })
  })

  it('a hello (current) also counts as use', () => {
    const t = make()
    t.stamp('A', 'e', {})
    for (let i = 0; i < 19; i++) t.stamp(`B${i}`, 'e', {}) // 20 streams, A least recently used
    t.current('A')                                        // a socket joins room A
    t.stamp('C', 'e', {})                                 // evicts the LRU, which is now B0, not A
    expect(t.current('A').s).toBe('stream1')
    expect(t.snapshot().evictedStreams).toBe(1)
  })

  it('reset clears the eviction count', () => {
    const t = make()
    for (let i = 0; i < 21; i++) t.stamp(`R${i}`, 'e', {})
    expect(t.snapshot().evictedStreams).toBe(1)
    t.reset()
    expect(t.snapshot().evictedStreams).toBe(0)
  })

  it('bounds distinct event names per stream', () => {
    const t = make()
    for (let i = 0; i < 60; i++) t.stamp(ROOM, `ev${i}`, {})
    const by = t.snapshot().streams.stream1.byEvent
    expect(Object.keys(by)).toHaveLength(51)
    expect(by['(other)'].count).toBe(10)
  })

  it('reset starts a new stream for the same room', () => {
    const t = make()
    t.stamp(ROOM, 'e', {})
    t.reset()
    expect(t.snapshot().streams).toEqual({})
    expect(t.stamp(ROOM, 'e', {})[TRACE_FIELD]).toMatchObject({ s: 'stream2', n: 1 })
  })
})

describe('installed with server metrics', () => {
  it('stamps through roomEmit, serves the ledger in the metrics snapshot and clears it on reset', () => {
    const io = fakeIo()
    const metrics = new ServerMetrics()
    const trace = installEventTrace(io, metrics, { env: ON, log: quiet })
    expect(trace).toBeInstanceOf(EventTrace)

    roomEmit(io, ROOM, 'room:joined', { participants: 1 })
    roomEmit(io, ROOM, 'new_question', { _id: 'q1' })
    expect(io.sent.map(m => m.payload[TRACE_FIELD].n)).toEqual([1, 2])
    expect(io.sent[1].payload._id).toBe('q1')

    const sock = fakeSocket()
    sendTraceHello(io, sock, ROOM)
    expect(sock.out).toEqual([{ e: HELLO_EVENT, p: { s: io.sent[0].payload[TRACE_FIELD].s, n: 2 } }])

    const snap = metrics.snapshot()
    expect(snap.eventTrace.enabled).toBe(true)
    expect(Object.values(snap.eventTrace.streams)[0].lastSeq).toBe(2)
    expect(JSON.stringify(snap)).not.toContain(ROOM)

    metrics.reset()
    expect(metrics.snapshot().eventTrace.streams).toEqual({})
  })
})

describe('over a real Socket.IO server', () => {
  let httpServer, io, url
  const clients = []

  beforeAll(async () => {
    httpServer = http.createServer()
    io = new Server(httpServer)
    installEventTrace(io, new ServerMetrics(), { env: ON, log: quiet })
    // Shaped like index.js room:join: join, hello synchronously, then (after an await) announce.
    io.on('connection', (socket) => {
      socket.on('room:join', async ({ roomCode }) => {
        socket.join(roomCode)
        sendTraceHello(io, socket, roomCode)
        await new Promise(r => setTimeout(r, 5))
        roomEmit(io, roomCode, 'room:joined', { roomCode })
      })
      socket.on('push', ({ roomCode, n }) => {
        for (let i = 0; i < n; i++) roomEmit(io, roomCode, 'counts:updated', { i })
      })
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
    const c = ioClient(url, { transports: ['websocket'], reconnection: false })
    clients.push(c)
    c.on('connect', () => resolve(c))
    c.on('connect_error', reject)
  })
  const waitFor = async (pred, ms = 2000) => {
    const end = Date.now() + ms
    while (Date.now() < end) { if (pred()) return; await new Promise(r => setTimeout(r, 10)) }
    throw new Error('condition not met')
  }
  const record = (c) => {
    const log = { hello: [], seqs: [] }
    c.on(HELLO_EVENT, (h) => log.hello.push(h))
    c.onAny((event, p) => { if (p?.[TRACE_FIELD]) log.seqs.push(p[TRACE_FIELD].n) })
    return log
  }

  it('a late joiner gets a baseline and then exactly the seqs above it, in order', async () => {
    const a = await connect()
    const la = record(a)
    a.emit('room:join', { roomCode: 'R1' })
    await waitFor(() => la.seqs.length === 1)
    a.emit('push', { roomCode: 'R1', n: 5 })
    await waitFor(() => la.seqs.length === 6)

    const b = await connect()
    const lb = record(b)
    b.emit('room:join', { roomCode: 'R1' })
    await waitFor(() => lb.seqs.length === 1)
    a.emit('push', { roomCode: 'R1', n: 3 })
    await waitFor(() => la.seqs.length === 10 && lb.seqs.length === 4)

    expect(la.hello[0]).toMatchObject({ n: 0 })
    expect(la.seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(lb.hello[0]).toEqual({ s: la.hello[0].s, n: 6 })
    expect(lb.seqs).toEqual([7, 8, 9, 10])
  })
})
