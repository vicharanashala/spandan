import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { createAdapter } from '@socket.io/redis-adapter'
import { RedisStore } from 'rate-limit-redis'
import { initRedis } from './config/redis.js'
import { computeRanked } from './services/leaderboardAgg.js'
import compression from 'compression'
import morgan from 'morgan'

// Import routes
import authRoutes from './routes/auth.js'
import roomRoutes from './routes/rooms.js'
import questionRoutes from './routes/questions.js'
import transcriptionRoutes from './routes/transcription.js'
import transcriptRoutes from './routes/transcripts.js'
import responseRoutes from './routes/responses.js'
import researchRoutes from './routes/research.js'

// Import models for reference
import './models/index.js'

dotenv.config()

const BASE_PATH = process.env.BASE_PATH || ''
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3001').split(',').map(s => s.trim())

// Request timeout middleware - defined BEFORE use due to hoisting
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
      // Allow requests with no origin (mobile apps, curl, Socket.IO polling)
      if (!origin) return callback(null, true)
      // Allow if origin is in the explicit CORS_ORIGINS list
      if (CORS_ORIGINS.includes(origin)) return callback(null, true)
      // Allow any localhost origin (covers localhost:5173, :8080, :3001, etc.)
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true)
      }
      callback(new Error('Not allowed by CORS'))
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
})

// Phase 2A — connect Redis (optional). When enabled, the socket.io adapter makes
// io.to(room).emit() reach clients on ALL instances, so the app can run behind a load
// balancer. Top-level await (ESM entry module) so setup below can branch on redis.enabled.
const redis = await initRedis()
const INSTANCE_ID = String(process.pid)
if (redis.enabled) {
  io.adapter(createAdapter(redis.pubClient, redis.subClient))
  console.log('[socket.io] Redis adapter attached (instance ' + INSTANCE_ID + ')')
}

// Make io accessible to routes
app.set('io', io)

// --- Live answer-counts + DEFERRED (quiet-debounce) leaderboard broadcasts (Phase 1 + 2A) ---
// A live question can draw ~1000 answers in seconds. We split the room's live signal in two so
// the expensive part stays OUT of the answer burst (which otherwise saturates the event loop and
// starves the next question's broadcast — the root cause of the missed-poll incident):
//  (1) Answer COUNTS — the teacher needs the live "X answered / total" badge to decide when to
//      close a poll. Cheap (one count-only aggregation), so it stays LIVE on a short throttle,
//      coalesced across a burst (multi-instance: SET-NX so only one instance emits per window).
//  (2) Ranked LEADERBOARD — expensive (per-student aggregation + name resolution) and nobody
//      studies it mid-burst, so it is DEFERRED: recomputed + broadcast only once the room has
//      been QUIET for LEADERBOARD_IDLE_MS (i.e. the answer burst has drained), plus a forced
//      refresh when the room ends. Scoring is UNAFFECTED — points are still computed and saved
//      per-response in the REST handler; only the read-side leaderboard recompute is deferred,
//      and Mongo stays authoritative.
const LIVE_THROTTLE_MS = Number(process.env.LIVE_UPDATE_THROTTLE_MS) || 1500
const LEADERBOARD_IDLE_MS = Number(process.env.LEADERBOARD_IDLE_MS) || 12000
const LEADERBOARD_TOP_N = Number(process.env.LEADERBOARD_TOP_N) || 20
// Rank cache must outlive a couple of debounce windows, or "rank on submit" always reads null.
const RANK_CACHE_TTL_S = Math.max(30, Math.ceil((LEADERBOARD_IDLE_MS * 3) / 1000))
const roomLive = new Map() // roomId(str) -> { countsTimer, lbTimer, lbCheckTimer, roomCode, rankByStudent, total }

function getRoomState(id) {
  let s = roomLive.get(id)
  if (!s) { s = { countsTimer: null, lbTimer: null, lbCheckTimer: null, roomCode: null, rankByStudent: new Map(), total: 0 }; roomLive.set(id, s) }
  return s
}

async function resolveRoomCode(roomId) {
  const s = getRoomState(String(roomId))
  if (s.roomCode) return s.roomCode
  const Room = (await import('./models/Room.js')).default
  const room = await Room.findById(roomId).select('code').lean()
  s.roomCode = room?.code || null
  return s.roomCode
}

// (1) Live answer counts — cheap count-only aggregation, throttled/coalesced per window.
async function broadcastCounts(roomId) {
  try {
    const Response = (await import('./models/Response.js')).default
    const roomObjId = new mongoose.Types.ObjectId(roomId)
    const countAgg = await Response.aggregate([
      { $match: { roomId: roomObjId } },
      { $group: { _id: '$questionId', count: { $sum: 1 } } }
    ])
    const counts = {}
    countAgg.forEach(c => { counts[c._id.toString()] = c.count })
    const roomCode = await resolveRoomCode(roomId)
    if (roomCode) io.to(roomCode).emit('counts:updated', { counts })
  } catch (err) {
    console.error('broadcastCounts error:', err.message)
  }
}

async function scheduleCountsBroadcast(roomId) {
  const id = String(roomId)
  if (redis.enabled) {
    try {
      const won = await redis.client.set(`live:cnt:sched:${id}`, INSTANCE_ID, { NX: true, PX: LIVE_THROTTLE_MS })
      if (won === 'OK') setTimeout(() => broadcastCounts(id), LIVE_THROTTLE_MS)
    } catch (e) {
      setTimeout(() => broadcastCounts(id), LIVE_THROTTLE_MS)
    }
    return
  }
  const s = getRoomState(id)
  if (s.countsTimer) return // already scheduled; the trailing run picks up the latest DB state
  s.countsTimer = setTimeout(() => { const st = roomLive.get(id); if (st) st.countsTimer = null; broadcastCounts(id) }, LIVE_THROTTLE_MS)
}

// (2) Ranked leaderboard — full aggregation + name resolution + rank cache. Deferred/forced only.
async function broadcastLeaderboard(roomId) {
  try {
    const Response = (await import('./models/Response.js')).default
    const roomObjId = new mongoose.Types.ObjectId(roomId)

    // Ranked board comes from the shared helper (single source of truth); the per-question answer
    // counts stay here (live-only concern). Both run in one round-trip via Promise.all.
    const [{ full, rankByStudent }, countAgg] = await Promise.all([
      computeRanked(roomId),
      Response.aggregate([
        { $match: { roomId: roomObjId } },
        { $group: { _id: '$questionId', count: { $sum: 1 } } }
      ])
    ])

    const counts = {}
    countAgg.forEach(c => { counts[c._id.toString()] = c.count })

    const roomCode = await resolveRoomCode(roomId)

    // Cache ranks for "rank on submit" (refreshed only when the board settles — Option A).
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
      const s = getRoomState(String(roomId))
      s.rankByStudent = rankByStudent
      s.total = full.length
    }

    if (roomCode) {
      io.to(roomCode).emit('leaderboard:updated', {
        leaderboard: full.slice(0, LEADERBOARD_TOP_N),
        totalParticipants: full.length,
        counts
      })
    }
  } catch (err) {
    console.error('broadcastLeaderboard error:', err.message)
  }
}

// Debounce: each answer (re)starts the window; the board fires only after LEADERBOARD_IDLE_MS of
// no new answers (burst drained). Multi-instance: a shared Redis activity key — refreshed per
// answer on whichever instance handled it — is the global quiet signal, and an NX lock makes
// exactly one instance emit (the adapter fans it out to all).
async function scheduleLeaderboardRefresh(roomId) {
  const id = String(roomId)
  if (redis.enabled) {
    redis.client.set(`live:lb:act:${id}`, '1', { PX: LEADERBOARD_IDLE_MS }).catch(() => { })
    ensureLbChecker(id)
    return
  }
  const s = getRoomState(id)
  if (s.lbTimer) clearTimeout(s.lbTimer)
  s.lbTimer = setTimeout(() => { const st = roomLive.get(id); if (st) st.lbTimer = null; broadcastLeaderboard(id) }, LEADERBOARD_IDLE_MS)
}

function ensureLbChecker(id, delayMs = LEADERBOARD_IDLE_MS) {
  const s = getRoomState(id)
  if (s.lbCheckTimer) return
  s.lbCheckTimer = setTimeout(() => runLbCheck(id), delayMs)
}

async function runLbCheck(id) {
  const s = getRoomState(id)
  s.lbCheckTimer = null
  try {
    // The activity key's remaining TTL tells us exactly how long since the last answer. If it's
    // still alive, re-arm for precisely that remainder (so the board fires ~IDLE_MS after the LAST
    // answer, not up to 2×IDLE later); once it's gone, one instance takes the NX lock and emits.
    const pttl = await redis.client.pTTL(`live:lb:act:${id}`)
    if (pttl > 0) { ensureLbChecker(id, pttl + 200); return }
    const won = await redis.client.set(`live:lb:lock:${id}`, INSTANCE_ID, { NX: true, PX: 3000 })
    if (won === 'OK') await broadcastLeaderboard(id)
  } catch (e) {
    await broadcastLeaderboard(id) // redis hiccup — emit locally rather than stall the board
  }
}

// Force an immediate leaderboard recompute + broadcast (e.g. when a room ends) so the final,
// settled board is complete regardless of where the debounce window happened to be.
async function refreshLeaderboardNow(roomId) {
  const id = String(roomId)
  if (redis.enabled) {
    try { await redis.client.del(`live:lb:act:${id}`) } catch (e) { /* non-fatal */ }
  } else {
    const s = roomLive.get(id)
    if (s?.lbTimer) { clearTimeout(s.lbTimer); s.lbTimer = null }
  }
  await broadcastLeaderboard(id)
}

// Last-computed rank for a student ("rank on submit"); refreshed when the board settles, so it
// may lag during an active burst (Option A — the student still gets their points immediately).
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

app.set('liveUpdates', {
  scheduleCounts: scheduleCountsBroadcast,
  scheduleLeaderboard: scheduleLeaderboardRefresh,
  refreshLeaderboardNow,
  getRank: getCachedStudentRank
})

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
  // Note: hundreds of students at a live event usually share ONE public IP (venue/campus NAT),
  // so this per-IP limit is effectively shared across the whole room. Sized for that.
  max: 50000, // limit each IP to 50000 requests per windowMs (shared across a NATed classroom)
  message: { error: 'Too many requests, please try again later' }
})

const authLimiter = rateLimit({
  store: rlStore('rl:auth:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  // Only count FAILED auth attempts: 700 students behind one NAT share this bucket, so counting
  // successful logins would trip a 429 mid-event (seen at ~250 logins). Failures still throttle brute-force.
  skipSuccessfulRequests: true,
  max: 5000, // limit each IP to 5000 FAILED auth attempts per hour (brute-force backstop)
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
app.use(compression())

// HTTP Logging in production
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
}
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (CORS_ORIGINS.includes(origin)) return callback(null, true)
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true)
    }
    callback(new Error('Not allowed by CORS'))
  },
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))
app.use('/api/', apiLimiter)           // general /api/ routes
app.use('/api/auth/', authLimiter)     // auth routes
app.use('/api/responses/', responseLimiter)  // response submission routes
app.use('/api/responses/leaderboard/', leaderboardLimiter)  // leaderboard routes (high limit for live sessions)

// Apply timeout middleware before routes
app.use(requestTimeout)

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/rooms', roomRoutes)
app.use('/api/questions', questionRoutes)
app.use('/api/transcription', transcriptionRoutes)
app.use('/api/transcripts', transcriptRoutes)
app.use('/api/responses', responseRoutes)
app.use('/api/research', researchRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '0.5.0',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  })
})

// Socket.IO connection handling
const connectedUsers = new Map() // socket.id -> userId

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  // Authenticate socket
  socket.on('authenticate', (data) => {
    try {
      if (!data.token) {
        socket.emit('authenticated', { success: false, error: 'No token provided' })
        return
      }
      const decoded = jwt.verify(data.token, process.env.JWT_SECRET || 'your-secret-key-change-in-production')
      connectedUsers.set(socket.id, decoded.userId)
      socket.emit('authenticated', { success: true })
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        socket.emit('authenticated', { success: false, error: 'Token expired', expired: true })
      } else {
        socket.emit('authenticated', { success: false, error: 'Invalid token' })
      }
    }
  })

  // Join room
  socket.on('room:join', async ({ roomCode, userId }) => {
    try {
      const Room = (await import('./models/Room.js')).default
      const User = (await import('./models/User.js')).default
      const RoomMember = (await import('./models/RoomMember.js')).default

      socket.join(roomCode)
      console.log(`Client ${socket.id} (user: ${userId}) joining room ${roomCode}`)

      // Find user and room
      const user = await User.findById(userId)
      const room = await Room.findByCode(roomCode)

      let participantCount = 0

      if (user && room) {
        // Only students get added to RoomMember (not teachers)
        if (user.role === 'student') {
          // Upsert: add student to room members if not already there
          await RoomMember.findOneAndUpdate(
            { roomId: room._id, studentId: user._id },
            { roomId: room._id, studentId: user._id, joinedAt: new Date() },
            { upsert: true, new: true }
          )
          console.log(`Student ${userId} added to room members for room ${roomCode}`)
        }

        // Count participants from RoomMember (excludes teacher)
        const memberCount = await RoomMember.countDocuments({ roomId: room._id })
        participantCount = memberCount
      }

      io.to(roomCode).emit('room:joined', {
        roomCode,
        userId,
        participants: participantCount
      })
    } catch (error) {
      console.error('Error in room:join:', error)
      io.to(roomCode).emit('room:joined', {
        roomCode,
        userId,
        participants: 0
      })
    }
  })

  // Leave room
  socket.on('room:leave', async ({ roomCode, userId }) => {
    try {
      const Room = (await import('./models/Room.js')).default
      const User = (await import('./models/User.js')).default
      const RoomMember = (await import('./models/RoomMember.js')).default

      socket.leave(roomCode)
      console.log(`Client ${socket.id} (user: ${userId}) left room ${roomCode}`)

      const user = await User.findById(userId)
      const room = await Room.findByCode(roomCode)

      let participantCount = 0

      if (user && room && user.role === 'student') {
        // Remove student from room members
        await RoomMember.deleteOne({ roomId: room._id, studentId: user._id })

        // Recount remaining participants
        participantCount = await RoomMember.countDocuments({ roomId: room._id })
      }

      io.to(roomCode).emit('room:left', {
        roomCode,
        participants: participantCount
      })
    } catch (error) {
      console.error('Error in room:leave:', error)
      io.to(roomCode).emit('room:left', {
        roomCode,
        participants: 0
      })
    }
  })

  // Submit response (real-time)
  socket.on('response:submit', (data) => {
    io.to(data.roomCode).emit('response:new', {
      questionId: data.questionId,
      studentId: data.studentId,
      selectedOption: data.selectedOption,
      responseTime: data.responseTime
    })
  })

  // Points update event (emitted after response is saved with calculated points)
  socket.on('points:update', (data) => {
    io.to(data.roomCode).emit('points:updated', {
      questionId: data.questionId,
      studentId: data.studentId,
      points: data.points,
      isCorrect: data.isCorrect
    })
  })

  // Question events
  socket.on('question:start', (data) => {
    io.to(data.roomCode).emit('question:started', {
      questionId: data.questionId,
      question: data.question,
      timer: data.timer,
      startTime: Date.now()
    })
  })

  socket.on('question:end', (data) => {
    io.to(data.roomCode).emit('question:ended', {
      questionId: data.questionId,
      results: data.results
    })
  })

  // New question from teacher (manually created)
  socket.on('new_question', (data) => {
    console.log('New question received from teacher:', data.question?.question?.substring(0, 50))
    const roomCode = data.roomCode
    const question = data.question
    if (roomCode && question) {
      io.to(roomCode).emit('new_question', question)
    } else {
      console.error('new_question event missing roomCode or question:', data)
    }
  })

  // Leaderboard update
  socket.on('leaderboard:update', (data) => {
    io.to(data.roomCode).emit('leaderboard:updated', data)
  })

  socket.on('disconnect', () => {
    const userId = connectedUsers.get(socket.id)
    connectedUsers.delete(socket.id)
    console.log('Client disconnected:', socket.id, userId ? `(user: ${userId})` : '')
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV !== 'production' ? err.message : 'Something went wrong'
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

const PORT = process.env.PORT || 3001

// MongoDB connection
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

// Start server
const startServer = async () => {
  await connectDB()

  app.listen(PORT, () => {
    console.log(`Spandan backend v0.5 running on port ${PORT}`)
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
    startCleanupRoutine()
  })
}

startServer().catch(console.error)

export { app }