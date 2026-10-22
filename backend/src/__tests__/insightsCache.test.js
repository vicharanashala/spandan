// Insights cache: an ended room's insights are computed once and served identically to the direct
// compute — with Redis connected, with Redis off (single-instance mode) and with Redis disconnected.
import mongoose from 'mongoose'

// Controllable fake Redis (enough of node-redis v4 for the cache: strings, hashes, NX locks, multi).
const mockRedis = { enabled: false, client: null }
jest.mock('../config/redis.js', () => ({
  isRedisEnabled: () => mockRedis.enabled,
  isRedisReady: () => mockRedis.enabled && !!mockRedis.client?.isReady,
  getRedisClient: () => mockRedis.client
}))

function fakeRedisClient() {
  const store = new Map()
  const ops = {
    get: async (k) => (typeof store.get(k) === 'string' ? store.get(k) : null),
    set: async (k, v, opts = {}) => { if (opts.NX && store.has(k)) return null; store.set(k, v); return 'OK' },
    exists: async (k) => (store.has(k) ? 1 : 0),
    del: async (k) => { for (const x of [].concat(k)) store.delete(x); return 1 },
    hGetAll: async (k) => ({ ...(store.get(k) || {}) }),
    hSet: async (k, obj) => { store.set(k, { ...(store.get(k) || {}), ...obj }); return 1 },
    expire: async () => 1
  }
  const client = { ...ops, store, isReady: true }
  client.multi = () => {
    const queue = []
    const tx = { exec: async () => { const out = []; for (const [op, args] of queue) out.push(await ops[op](...args)); return out } }
    for (const op of Object.keys(ops)) tx[op] = (...args) => { queue.push([op, args]); return tx }
    return tx
  }
  return client
}

const { computeInsights } = require('../services/insightsService.js')
const cache = require('../services/insightsCache.js')
const Room = require('../models/Room.js').default
const Question = require('../models/Question.js').default
const Response = require('../models/Response.js').default
const RoomMember = require('../models/RoomMember.js').default
const User = require('../models/User.js').default

const oid = () => new mongoose.Types.ObjectId()
const T0 = new Date('2026-10-14T14:30:00Z')
const min = (m) => new Date(T0.getTime() + m * 60000)
let roomId, teacherId, studentIds, silentId, V // V = current room version

// Count Response reads: the whole point is that the room's responses are read once, not per viewer.
let responseReads = 0
const countReads = (coll, method) => { if (coll === 'responses' && method === 'find') responseReads += 1 }

// The direct path's exact body (what res.json({ success, role, ...insights }) sends).
async function directBody(role, studentId) {
  const docs = await cache.loadInsightsDocs(roomId)
  const isTeacher = role === 'teacher'
  const usersById = isTeacher ? docs.usersById : new Map()
  const insights = computeInsights({ ...docs, usersById, forTeacher: isTeacher, studentId: isTeacher ? null : studentId })
  return JSON.stringify({ success: true, role, ...insights })
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URL, { dbName: 'insightsCacheTest' })
  teacherId = oid()
  const room = await Room.create({ name: 'Cache room', code: 'CACHE1', teacher: teacherId, createdAt: T0, endedAt: min(50), isActive: false })
  roomId = room._id
  V = cache.roomVersion(room)
  const qs = await Question.insertMany([0, 1, 2].map((i) => ({
    roomId, question: `Q${i + 1}`, type: 'MCQ', segmentIndex: i, points: 100, timeToAnswer: 30, status: 'approved',
    options: [{ text: 'A', isCorrect: i !== 1 }, { text: 'B', isCorrect: i === 1 }, { text: 'C' }, { text: 'D' }]
  })))
  studentIds = Array.from({ length: 8 }, oid)
  silentId = oid() // joined, never answered
  await User.insertMany([...studentIds, silentId].map((_id, i) => ({ _id, name: `Student ${i + 1}`, email: `s${i + 1}@x.com`, role: 'student', password: 'x'.repeat(12) })))
  await RoomMember.insertMany([...studentIds, silentId].map((studentId, i) => ({ roomId, studentId, joinedAt: min(i) })))
  const rs = []
  studentIds.forEach((studentId, s) => qs.forEach((q, i) => {
    if (s === 7 && i === 2) return // one missed answer
    const right = (s + i) % 3 !== 0
    const pick = right ? q.options.findIndex((o) => o.isCorrect) : 3
    rs.push({ roomId, questionId: q._id, studentId, selectedOption: pick, isCorrect: right, responseTime: 4 + s + i, points: right ? 90 - s : 0, createdAt: min(5 + i * 15 + s * 0.1) })
  }))
  await Response.insertMany(rs)
  mongoose.set('debug', countReads)
})

afterAll(async () => {
  mongoose.set('debug', false)
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

beforeEach(() => {
  cache._resetInsightsCache()
  mockRedis.enabled = false
  mockRedis.client = null
  responseReads = 0
})

describe('insights cache, Redis off (single-instance mode)', () => {
  it('serves bodies byte-identical to the direct compute, teacher and every student', async () => {
    expect(await cache.getInsightsBody(roomId, { ended: true, version: V, role: 'teacher' })).toBe(await directBody('teacher'))
    for (const st of [...studentIds, silentId]) {
      expect(await cache.getInsightsBody(roomId, { ended: true, version: V, role: 'student', studentId: st })).toBe(await directBody('student', st))
    }
  })

  it('computes once: a burst of 30 viewers shares one build and one response read', async () => {
    const viewers = [{ role: 'teacher' }, ...Array.from({ length: 29 }, (_, i) => ({ role: 'student', studentId: studentIds[i % 8] }))]
    const bodies = await Promise.all(viewers.map((v) => cache.getInsightsBody(roomId, { ended: true, version: V, ...v })))
    expect(bodies.every(Boolean)).toBe(true)
    expect(responseReads).toBe(1)
    await cache.getInsightsBody(roomId, { ended: true, version: V, role: 'student', studentId: studentIds[0] }) // later visit = memory hit
    expect(responseReads).toBe(1)
  })

  it('student bodies never carry names, emails, other students\' ids or the heatmap', async () => {
    const users = await User.find({}).lean()
    for (const st of [...studentIds, silentId]) {
      const body = await cache.getInsightsBody(roomId, { ended: true, version: V, role: 'student', studentId: st })
      const j = JSON.parse(body)
      expect(j.role).toBe('student')
      expect(j.heatmap).toBeUndefined()
      expect(j.scores.students).toBeUndefined()
      for (const q of j.questions) { expect(q.wrongStudents).toBeUndefined(); expect(q.noAnswer).toBeUndefined() }
      for (const u of users) {
        expect(body).not.toContain(u.email)
        expect(body).not.toContain(`"${u.name}"`)
        if (String(u._id) !== String(st)) expect(body).not.toContain(String(u._id))
      }
    }
  })

  it('a room edit (anonymous leaderboard ON) is picked up at once: rank hidden from students', async () => {
    const before = JSON.parse(await cache.getInsightsBody(roomId, { ended: true, version: V, role: 'student', studentId: studentIds[0] }))
    expect(before.me.rank).toBeGreaterThan(0)
    expect(before.me.rankHidden).toBe(false)
    const edited = await Room.findByIdAndUpdate(roomId, { 'settings.anonymousLeaderboard': true }, { new: true }).lean()
    const V2 = cache.roomVersion(edited)
    expect(V2).not.toBe(V)
    const after = JSON.parse(await cache.getInsightsBody(roomId, { ended: true, version: V2, role: 'student', studentId: studentIds[0] }))
    expect(after.me.rank).toBeNull()
    expect(after.me.rankHidden).toBe(true)
    expect(after.me.of).toBe(before.me.of)
    expect(responseReads).toBe(2) // rebuilt once for the new version
    const restored = await Room.findByIdAndUpdate(roomId, { 'settings.anonymousLeaderboard': false }, { new: true }).lean()
    V = cache.roomVersion(restored)
  })

  it('never caches a live room, and returns null for a student outside the build', async () => {
    expect(await cache.getInsightsBody(roomId, { ended: false, version: V, role: 'teacher' })).toBeNull()
    expect(await cache.getInsightsBody(roomId, { ended: true, version: V, role: 'student', studentId: oid() })).toBeNull()
  })

  it('invalidate forces a rebuild', async () => {
    await cache.getInsightsBody(roomId, { ended: true, version: V, role: 'teacher' })
    await cache.invalidateInsights(roomId)
    await cache.getInsightsBody(roomId, { ended: true, version: V, role: 'teacher' })
    expect(responseReads).toBe(2)
  })
})

describe('insights cache, Redis on', () => {
  it('pre-warm writes Redis; another instance (empty memory) reads it with no Mongo scan', async () => {
    mockRedis.enabled = true
    mockRedis.client = fakeRedisClient()
    await cache.prewarmInsights(roomId)
    expect(responseReads).toBe(1)
    expect(mockRedis.client.store.has(`results:ins:t:${roomId}`)).toBe(true)
    expect(Object.keys(mockRedis.client.store.get(`results:ins:m:${roomId}`))).toHaveLength(9) // 8 responders + silent member
    expect(mockRedis.client.store.has(`results:ins:lock:${roomId}`)).toBe(false) // lock released

    cache._resetInsightsCache() // simulate a second backend instance
    const body = await cache.getInsightsBody(roomId, { ended: true, version: V, role: 'student', studentId: silentId })
    expect(body).toBe(await directBody('student', silentId))
    expect(responseReads).toBe(2) // only directBody's own read above; the cache read none
  })

  it('falls back to a local build when Redis is configured but disconnected', async () => {
    mockRedis.enabled = true
    mockRedis.client = { ...fakeRedisClient(), isReady: false }
    expect(await cache.getInsightsBody(roomId, { ended: true, version: V, role: 'teacher' })).toBe(await directBody('teacher'))
  })

  it('falls back to a local build when Redis errors', async () => {
    mockRedis.enabled = true
    const broken = fakeRedisClient()
    broken.multi = () => { throw new Error('connection reset') }
    broken.set = async () => { throw new Error('connection reset') }
    mockRedis.client = broken
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(await cache.getInsightsBody(roomId, { ended: true, version: V, role: 'teacher' })).toBe(await directBody('teacher'))
    spy.mockRestore()
  })
})
