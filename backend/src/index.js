import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import { spawn } from 'child_process'
import { createServer } from 'http'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { createAdapter } from '@socket.io/redis-adapter'
import { RedisStore } from 'rate-limit-redis'
import { initRedis } from './config/redis.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Import routes
import authRoutes from './routes/auth.js'
import roomRoutes from './routes/rooms.js'
import questionRoutes from './routes/questions.js'
import transcriptionRoutes from './routes/transcription.js'
import transcriptRoutes from './routes/transcripts.js'
import responseRoutes, { cleanupRoomThrottles } from './routes/responses.js'
import exportRoutes from './routes/export.js'
import questionBankRoutes from './routes/questionBank.js'
import categoryRoutes from './routes/categories.js'
import soundRoutes from './routes/sounds.js'

// Import models once at startup
import User from './models/User.js'
import Room from './models/Room.js'
import RoomMember from './models/RoomMember.js'

// Import services
import { initLeaderboardRedis, getTopN } from './services/leaderboardService.js'
import { throttledParticipantBroadcast, broadcastToStudent, cleanupRoomTimers } from './services/broadcastThrottleService.js'
import { flushAllBatches } from './services/responseBatchService.js'

dotenv.config()

const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3001').split(',').map(s => s.trim())

// ============================================
// Redis adapter + Leaderboard Redis
// ============================================
const REDIS_URL = process.env.REDIS_URL

// Request timeout middleware
const requestTimeout = (req, res, next) => {
  // Question generation calls an LLM synchronously; for long transcripts (e.g. a
  // 10- or 30-minute session) that can take minutes, so those routes get a much
  // longer timeout. Everything else keeps the tight 30s cap.
  const isGeneration = req.path.startsWith('/api/questions/generate')
  const timeoutMs = isGeneration ? 300000 : 30000 // 5 min for generation, 30s otherwise

  req.setTimeout(timeoutMs, () => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Request timeout', message: 'The request took too long to process' })
    }
  })

  // Also set server-side timeout for the response
  res.setTimeout(timeoutMs, () => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Response timeout', message: 'The response took too long to generate' })
    }
  })

  next()
}

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (CORS_ORIGINS.includes(origin)) return callback(null, true)
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true)
      }
      callback(new Error('Not allowed by CORS'))
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  httpCompression: true,
  // Max 100K concurrent connections per process
  maxHttpBufferSize: 1e6, // 1MB max payload
  allowUpgrades: true,
  perMessageDeflate: true
})

// Phase 2A — connect Redis (optional). When enabled, the socket.io adapter makes
// io.to(room).emit() reach clients on ALL instances, so the app can run behind a load
// balancer. Top-level await (ESM entry module) so setup below can branch on redis.enabled.
const redis = await initRedis()
const INSTANCE_ID = String(process.pid)
if (redis.enabled) {
  io.adapter(createAdapter(redis.pubClient, redis.subClient))
  console.log('[socket.io] Redis adapter attached (instance ' + INSTANCE_ID + ')')
  // Init leaderboard Redis (sorted sets) with the same connection
  await initLeaderboardRedis(process.env.REDIS_URL)
}

// Make io accessible to routes
app.set('io', io)

// --- Throttled, server-authoritative live room updates (Phase 1 + 2A multi-instance) ---
// A live question can draw ~1000 answers in seconds. Instead of every client re-fetching the
// leaderboard (~N^2 DB hits), the REST submit handler calls schedule(roomId); a burst coalesces
// into ONE recompute + broadcast per room per interval, pushing a top-N payload.
//  - Single instance: an in-memory timer + rank Map.
//  - Multi-instance (Redis): a SET-NX lock so only ONE instance computes+broadcasts per window
//    (the adapter fans the broadcast out to all instances), and the rank cache lives in a Redis
//    hash so any instance can answer "rank on submit".
const LIVE_THROTTLE_MS = Number(process.env.LIVE_UPDATE_THROTTLE_MS) || 1500
const LEADERBOARD_TOP_N = Number(process.env.LEADERBOARD_TOP_N) || 20
const RANK_CACHE_TTL_S = Math.max(10, Math.ceil((LIVE_THROTTLE_MS * 5) / 1000))
const roomLive = new Map() // roomId(str) -> { timer, roomCode, rankByStudent: Map, total } (single-instance)

async function computeAndBroadcast(roomId) {
  try {
    const Response = (await import('./models/Response.js')).default
    const User = (await import('./models/User.js')).default
    const Room = (await import('./models/Room.js')).default
    const roomObjId = new mongoose.Types.ObjectId(roomId)

    // Points per student (ranked) + per-question answer counts, in two aggregations.
    const [ranked, countAgg] = await Promise.all([
      Response.aggregate([
        { $match: { roomId: roomObjId } },
        { $group: { _id: '$studentId', totalPoints: { $sum: '$points' }, correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } }, totalAnswered: { $sum: 1 } } },
        { $sort: { totalPoints: -1 } }
      ]),
      Response.aggregate([
        { $match: { roomId: roomObjId } },
        { $group: { _id: '$questionId', count: { $sum: 1 } } }
      ])
    ])

    const users = await User.find({ _id: { $in: ranked.map(e => e._id) } }).select('name email').lean()
    const nameById = new Map(users.map(u => [u._id.toString(), u.name || u.email || 'Unknown Student']))

    const rankByStudent = new Map()
    const full = ranked.map((e, i) => {
      const sid = e._id.toString()
      rankByStudent.set(sid, i + 1)
      return { rank: i + 1, studentId: sid, studentName: nameById.get(sid) || 'Unknown Student', totalPoints: e.totalPoints, correctCount: e.correctCount, totalAnswered: e.totalAnswered }
    })
    const counts = {}
    countAgg.forEach(c => { counts[c._id.toString()] = c.count })

    // Resolve roomCode (needed to target the socket room).
    let roomCode = roomLive.get(roomId)?.roomCode
    if (!roomCode) {
      const room = await Room.findById(roomId).select('code').lean()
      roomCode = room?.code || null
    }

    // Cache ranks for "rank on submit".
    if (redis.enabled) {
      try {
        const flat = { _total: String(full.length) }
        rankByStudent.forEach((rank, sid) => { flat[sid] = String(rank) })
        const key = `live:ranks:${roomId}`
        await redis.client.del(key)
        await redis.client.hSet(key, flat)
        await redis.client.expire(key, RANK_CACHE_TTL_S)
      } catch (e) { /* non-fatal: rank-on-submit just returns null */ }
    } else {
      const state = roomLive.get(roomId) || {}
      state.rankByStudent = rankByStudent
      state.total = full.length
      state.roomCode = roomCode
      roomLive.set(roomId, state)
    }

    if (roomCode) {
      io.to(roomCode).emit('leaderboard:updated', {
        leaderboard: full.slice(0, LEADERBOARD_TOP_N),
        totalParticipants: full.length,
        counts
      })
    }
  } catch (err) {
    console.error('computeAndBroadcast error:', err.message)
  }
}

async function scheduleRoomLiveUpdate(roomId) {
  const id = String(roomId)
  if (redis.enabled) {
    // Only one instance schedules a broadcast per throttle window (global coalescing via SET NX).
    try {
      const won = await redis.client.set(`live:sched:${id}`, INSTANCE_ID, { NX: true, PX: LIVE_THROTTLE_MS })
      if (won === 'OK') setTimeout(() => computeAndBroadcast(id), LIVE_THROTTLE_MS)
    } catch (e) {
      // Redis hiccup — fall back to a local timer so updates still flow on this instance.
      setTimeout(() => computeAndBroadcast(id), LIVE_THROTTLE_MS)
    }
    return
  }
  let state = roomLive.get(id)
  if (!state) { state = { timer: null, roomCode: null, rankByStudent: new Map(), total: 0 }; roomLive.set(id, state) }
  if (state.timer) return // already scheduled; the trailing run picks up the latest state
  state.timer = setTimeout(() => {
    const s = roomLive.get(id)
    if (s) s.timer = null
    computeAndBroadcast(id)
  }, LIVE_THROTTLE_MS)
}

// Last-computed rank for a student ("rank on submit"); may be up to one interval stale.
async function getCachedStudentRank(roomId, studentId) {
  const id = String(roomId)
  if (redis.enabled) {
    try {
      const [rank, total] = await redis.client.hmGet(`live:ranks:${id}`, [String(studentId), '_total'])
      return { rank: rank != null ? Number(rank) : null, totalParticipants: total != null ? Number(total) : null }
    } catch (e) {
      return { rank: null, totalParticipants: null }
    }
  }
  const state = roomLive.get(id)
  if (!state) return { rank: null, totalParticipants: null }
  return { rank: state.rankByStudent?.get(String(studentId)) ?? null, totalParticipants: state.total ?? null }
}

app.set('liveUpdates', { schedule: scheduleRoomLiveUpdate, getRank: getCachedStudentRank })

// Trust proxy (for rate limiting behind nginx)
app.set('trust proxy', 1)

// Rate limiting — shared across instances via Redis when enabled, else per-process memory.
// A shared store is required for multi-instance so limits are global, not N-times looser.
const rlStore = (prefix) => redis.enabled
  ? new RedisStore({ prefix, sendCommand: (...args) => redis.client.sendCommand(args) })
  : undefined

const apiLimiter = rateLimit({
  store: rlStore('rl:api:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Per-IP but very high — shared NAT scenario (10K students = one IP)
  // Each student makes ~5 requests per 15 min → 50K per IP needed
  max: 500000,
  message: { error: 'Too many requests, please try again later' }
})

const authLimiter = rateLimit({
  store: rlStore('rl:auth:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  // Only count FAILED auth attempts per IP — shared NAT is fine here
  skipSuccessfulRequests: true,
  max: 5000,
  message: { error: 'Too many authentication attempts, please try again later' }
})

const responseLimiter = rateLimit({
  store: rlStore('rl:resp:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // limit each IP to 5000 response submissions per windowMs (high limit for live quizzes)
  message: { error: 'Too many response submissions, please try again later' }
})

const leaderboardLimiter = rateLimit({
  store: rlStore('rl:lb:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // very high limit for leaderboard reads (refreshes on every points update during live sessions)
  message: { error: 'Too many requests, please try again later' }
})

// Middleware
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}))
app.use(compression()) // Compress all responses — critical for 10K+ users
app.use(express.json({ limit: '10mb' }))
app.use('/api/', apiLimiter)
app.use('/api/auth/', authLimiter)
app.use('/api/responses/', responseLimiter)
app.use('/api/responses/leaderboard/', leaderboardLimiter)
app.use(requestTimeout)

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/rooms', roomRoutes)
app.use('/api/questions', questionRoutes)
app.use('/api/transcription', transcriptionRoutes)
app.use('/api/transcripts', transcriptRoutes)
app.use('/api/responses', responseRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/question-bank', questionBankRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/sounds', soundRoutes)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '0.9.0',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redis: REDIS_URL ? 'configured' : 'not configured'
  })
})

// ============================================
// In-memory caches
// ============================================
const roomCodeCache = new Map()
const ROOM_CACHE_MAX = 10000

function setRoomCache(code, roomId) {
  if (roomCodeCache.size >= ROOM_CACHE_MAX) {
    // Evict oldest half
    const keys = [...roomCodeCache.keys()]
    for (let i = 0; i < keys.length / 2; i++) {
      roomCodeCache.delete(keys[i])
    }
  }
  roomCodeCache.set(code, roomId)
}


// Room-level broadcast rate limiting (in-memory, per-process)
const roomLastBroadcast = new Map()
const BROADCAST_COOLDOWN_MS = 2000

// Reverse socket index: studentId → socketId for O(1) student lookup
const studentSocketIndex = new Map()
io._studentSocketIndex = studentSocketIndex

function canBroadcast(roomCode) {
  const last = roomLastBroadcast.get(roomCode) || 0
  if (Date.now() - last < BROADCAST_COOLDOWN_MS) return false
  roomLastBroadcast.set(roomCode, Date.now())
  return true
}

async function getRoomIdByCode(roomCode) {
  const cached = roomCodeCache.get(roomCode)
  if (cached) return cached
  const room = await Room.findByCode(roomCode)
  if (!room) return null
  setRoomCache(roomCode, room._id)
  return room._id
}

function getActualParticipantCount(roomCode) {
  const room = io.sockets.adapter.rooms.get(roomCode)
  if (!room) return 0
  let count = 0
  for (const socketId of room) {
    const s = io.sockets.sockets.get(socketId)
    if (s && s.data.role === 'student') count++
  }
  return count
}

// ============================================
// Socket.IO — Unlimited single-room handling
// ============================================

const SOCKET_JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-fallback-do-not-use-in-production'

// Phase 2B — resolve identity for a socket from a JWT and attach it to socket.data, so every
// handler trusts SERVER-derived identity (userId/role) instead of client-supplied fields.
// Throws on an invalid/expired token.
async function authenticateSocket(socket, token) {
  const decoded = jwt.verify(token, SOCKET_JWT_SECRET)
  const User = (await import('./models/User.js')).default
  const u = await User.findById(decoded.userId).select('role').lean()
  socket.data.userId = decoded.userId
  socket.data.role = u?.role || null
  socket.data.authenticated = true
  return socket.data
}

// Teacher-only + room-ownership guard for privileged events (question:start/end, new_question).
async function verifyRoomOwner(socket, roomCode) {
  if (socket.data?.role !== 'teacher' || !roomCode) return false
  try {
    const Room = (await import('./models/Room.js')).default
    const room = await Room.findByCode(roomCode)
    return !!room && room.teacher.toString() === String(socket.data.userId)
  } catch {
    return false
  }
}

// Authenticate at connection time from the handshake token (client already sends auth:{token}),
// so socket.data is populated BEFORE any event fires (no race). Unauthenticated sockets may still
// connect, but privileged handlers reject them.
io.use(async (socket, next) => {
  const token = socket.handshake?.auth?.token
  if (token) {
    try { await authenticateSocket(socket, token) } catch { /* leave unauthenticated */ }
  }
  next()
})

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  // Re-authenticate on demand (also covers clients that auth via this event, not the handshake).
  socket.on('authenticate', async (data) => {
    try {
      if (!data?.token) {
        socket.emit('authenticated', { success: false, error: 'No token provided' })
        return
      }
      await authenticateSocket(socket, data.token)
      socket.emit('authenticated', { success: true })
    } catch (error) {
      socket.emit('authenticated', {
        success: false,
        error: error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'
      })
    }
  })

  // Join room — identity is taken from the AUTHENTICATED socket, not the client payload
  // (so a client can't join/register as another user).
  socket.on('room:join', async ({ roomCode }) => {
    const userId = socket.data?.userId
    const role = socket.data?.role
    if (!userId) { socket.emit('room:error', { error: 'Not authenticated' }); return }
    if (!roomCode) return
    try {
      const Room = (await import('./models/Room.js')).default
      const RoomMember = (await import('./models/RoomMember.js')).default

      socket.join(roomCode)
      // Store roomCode on socket for disconnect cleanup
      socket.data.roomCode = roomCode
      const room = await Room.findByCode(roomCode)

      // Register in reverse socket index for O(1) student lookup
      if (role === 'student') {
        studentSocketIndex.set(userId.toString(), socket.id)
      }

      let participantCount = 0
      if (room) {
        // Only students are added to RoomMember (not teachers)
        if (role === 'student') {
          await RoomMember.findOneAndUpdate(
            { roomId: room._id, studentId: userId },
            { roomId: room._id, studentId: userId, joinedAt: new Date() },
            { upsert: true, new: true }
          )
        }
        // Count actual connected student sockets (not drift-prone counter)
        participantCount = getActualParticipantCount(roomCode)
      }

      // Throttled participant broadcast (not every join floods the room)
      throttledParticipantBroadcast(io, roomCode, participantCount)

      // Send join confirmation only to the joining socket (not broadcast)
      socket.emit('room:joined', { roomCode, userId, participants: participantCount })
    } catch (error) {
      console.error('Error in room:join:', error)
    }
  })

  // Leave room — identity from the authenticated socket.
  socket.on('room:leave', async ({ roomCode }) => {
    const userId = socket.data?.userId
    const role = socket.data?.role
    if (!roomCode) return
    try {
      const Room = (await import('./models/Room.js')).default
      const RoomMember = (await import('./models/RoomMember.js')).default

      socket.leave(roomCode)
      const room = await Room.findByCode(roomCode)

      // Clean up reverse socket index
      studentSocketIndex.delete(userId.toString())

      let participantCount = 0
      if (room) {
        if (role === 'student' && userId) {
          await RoomMember.deleteOne({ roomId: room._id, studentId: userId })
        }
        // Count remaining actual connected sockets
        participantCount = getActualParticipantCount(roomCode)
      }

      throttledParticipantBroadcast(io, roomCode, participantCount)
      socket.emit('room:left', { roomCode, participants: participantCount })
    } catch (error) {
      console.error('Error in room:leave:', error)
    }
  })

  // NOTE: the client-driven 'response:submit', 'points:update' and 'leaderboard:update'
  // handlers were removed in Phase 1. They let clients forge points/answers and caused a
  // ~N^2 leaderboard-refetch storm. Live leaderboard/answer-count updates are now emitted
  // server-side (throttled) from the authenticated REST submit handler — see the
  // scheduleRoomLiveUpdate() broadcaster above and routes/responses.js.

  // Kept as no-op for backward compatibility with older frontend versions
  socket.on('response:submit', () => {})

  // Question events — teacher-only and restricted to the room's OWNER (server-verified),
  // so a student can no longer forge question start/end or push a fake question to the room.
  socket.on('question:start', async (data) => {
    if (!(await verifyRoomOwner(socket, data?.roomCode))) return
    if (!data?.questionId || !data?.question) return
    io.to(data.roomCode).emit('question:started', {
      questionId: data.questionId,
      question: data.question,
      timer: Math.min(Number(data.timer) || 30, 300), // cap at 5 min
      startTime: Date.now()
    })
  })

  socket.on('question:end', async (data) => {
    if (!(await verifyRoomOwner(socket, data?.roomCode))) return
    io.to(data.roomCode).emit('question:ended', {
      questionId: data.questionId,
      results: data.results
    })

    // Resolve roomCode → roomId for getTopN
    const roomId = await getRoomIdByCode(data.roomCode)
    if (roomId) {
      const topStudents = await getTopN(roomId.toString(), 50)
      io.to(data.roomCode).emit('leaderboard:updated', { leaderboard: topStudents })
    }
  })

  // New question pushed by the teacher (manually created)
  socket.on('new_question', async (data) => {
    if (!(await verifyRoomOwner(socket, data?.roomCode))) {
      console.warn('new_question rejected — not the room owner:', socket.id)
      return
    }
    if (data.question) {
      io.to(data.roomCode).emit('new_question', data.question)
    }
  })

  // Teacher: manual leaderboard broadcast
  socket.on('leaderboard:broadcast', async (data) => {
    if (!socket.data.authenticated || socket.data.role !== 'teacher') return
    if (data.roomCode !== socket.data.roomCode) return
    const roomId = await getRoomIdByCode(data.roomCode)
    if (roomId) {
      const topStudents = await getTopN(roomId.toString(), 50)
      io.to(data.roomCode).emit('leaderboard:updated', { leaderboard: topStudents })
    }
  })

  socket.on('disconnect', async () => {
    // Clean up reverse socket index
    if (socket.data.userId) {
      studentSocketIndex.delete(socket.data.userId.toString())
    }

    // Broadcast updated count if student was in a room
    // socket.data.roomCode is set via room:join below
    const roomCode = socket.data.roomCode
    if (roomCode && socket.data.userId && socket.data.role === 'student') {
      const roomId = await getRoomIdByCode(roomCode)
      if (roomId) {
        const RoomMember = (await import('./models/RoomMember.js')).default
        await RoomMember.deleteOne({ roomId, studentId: socket.data.userId })
        const participantCount = getActualParticipantCount(roomCode)
        throttledParticipantBroadcast(io, roomCode, participantCount)
      }
    }
  })
})

// ============================================
// Error handling
// ============================================
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

// ============================================
// MongoDB connection
// ============================================
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spandan'
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      // Ceiling on concurrent in-flight queries. Default is 100; a live event with
      // hundreds of students bursting responses/leaderboard reads can exhaust it and
      // queue requests until they time out. Size to the Mongo server's capacity.
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 200,
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE) || 10
    })
    console.log('MongoDB connected successfully')
  } catch (error) {
    console.error('MongoDB connection error:', error.message)
    console.log('Server will continue without database connection')
  }
}

// ============================================
// Graceful shutdown
// ============================================
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`)

  // Stop auth cache cleanup interval
  const { stopCacheCleanup } = await import('./middleware/auth.js')
  stopCacheCleanup()

  // Flush any pending response batches
  await flushAllBatches()

  // Clear all caches
  roomCodeCache.clear()
  roomLastBroadcast.clear()
  studentSocketIndex.clear()

  // Clear roomLive timers
  for (const [id, state] of roomLive) {
    if (state.timer) clearTimeout(state.timer)
  }
  roomLive.clear()

  // Clear broadcast throttle timers
  cleanupRoomTimers()

  httpServer.close(() => {
    mongoose.connection.close(false, () => {
      console.log('Server shut down.')
      process.exit(0)
    })
  })

  setTimeout(() => {
    console.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// ============================================
// Start server
// ============================================
const startServer = async () => {
  await connectDB()

  // Start transcription server (Python faster-whisper) as a child process
  if (!process.env.TRANSCRIPTION_SERVICE_URL) {
    const transcriptionScript = path.join(__dirname, '..', 'transcription_server.py')
    try {
      const py = spawn('python', [transcriptionScript], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      })
      py.stdout.on('data', (d) => process.stdout.write('[whisper] ' + d))
      py.stderr.on('data', (d) => process.stderr.write('[whisper] ' + d))
      py.on('error', (e) => console.error('Whisper spawn failed:', e.message))
      py.on('exit', (code) => console.log('Whisper process exited with code', code))
      console.log('Transcription server (faster-whisper) started as child process')
    } catch (e) {
      console.error('Failed to start transcription server:', e.message)
    }
  }

  httpServer.listen(process.env.PORT || 3001, () => {
    console.log(`Spandan backend v0.9.0 running on port ${process.env.PORT || 3001}`)
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
    console.log(`Redis: ${REDIS_URL ? 'enabled' : 'disabled (single process mode)'}`)
  })
}

startServer().catch(console.error)

export { app, io }
