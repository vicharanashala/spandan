import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createServer } from 'http'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { createAdapter } from '@socket.io/redis-adapter'
import { RedisStore } from 'rate-limit-redis'
import { initRedis } from './config/redis.js'
import { computeRanked } from './services/leaderboardAgg.js'

// Import routes
import authRoutes from './routes/auth.js'
import roomRoutes from './routes/rooms.js'
import questionRoutes from './routes/questions.js'
import transcriptionRoutes from './routes/transcription.js'
import transcriptRoutes from './routes/transcripts.js'
import responseRoutes from './routes/responses.js'
import riskScoreRoutes from './routes/riskScores.js'

// Import models for reference
import './models/index.js'
import { Room, User, Response, RiskScore } from './models/index.js'
import {
  applyEvent,
  getRoomRiskSnapshot,
  SAFE_THRESHOLD
} from './services/riskScoreService.js'

dotenv.config()

console.log('[debug] cwd:', process.cwd())
console.log('[debug] MONGODB_URI:', process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 50) + '...' : 'UNDEFINED')

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
    redis.client.set(`live:lb:act:${id}`, '1', { PX: LEADERBOARD_IDLE_MS }).catch(() => {})
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
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
app.use('/api/risk-scores', riskScoreRoutes)

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
app.set('connectedUsers', connectedUsers)

const SOCKET_JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// Phase 2B — resolve identity for a socket from a JWT and attach it to socket.data, so every
// handler trusts SERVER-derived identity (userId/role) instead of client-supplied fields.
// Throws on an invalid/expired token.
async function authenticateSocket(socket, token) {
  const decoded = jwt.verify(token, SOCKET_JWT_SECRET)
  const User = (await import('./models/User.js')).default
  const u = await User.findById(decoded.userId).select('role').lean()
  socket.data.userId = decoded.userId
  socket.data.role = u?.role || null
  connectedUsers.set(socket.id, decoded.userId)
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

// Per-room auto-end timers: roomCode -> { questionId, timerHandle }
const questionTimers = new Map()

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
      if (error.name === 'TokenExpiredError') {
        socket.emit('authenticated', { success: false, error: 'Token expired', expired: true })
      } else {
        socket.emit('authenticated', { success: false, error: 'Invalid token' })
      }
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
      const room = await Room.findByCode(roomCode)

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
        participantCount = await RoomMember.countDocuments({ roomId: room._id })
      }

      io.to(roomCode).emit('room:joined', { roomCode, userId, participants: participantCount })
    } catch (error) {
      console.error('Error in room:join:', error)
      io.to(roomCode).emit('room:joined', { roomCode, userId, participants: 0 })
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

      let participantCount = 0
      if (room) {
        if (role === 'student' && userId) {
          await RoomMember.deleteOne({ roomId: room._id, studentId: userId })
        }
        participantCount = await RoomMember.countDocuments({ roomId: room._id })
      }

      io.to(roomCode).emit('room:left', { roomCode, participants: participantCount })
    } catch (error) {
      console.error('Error in room:leave:', error)
      io.to(roomCode).emit('room:left', { roomCode, participants: 0 })
    }
  })

  // Submit response (real-time)
  // Extends the original broadcast with risk-score update + targeted emits.
  socket.on('response:submit', async (data) => {
    // Preserve original broadcast behavior.
    io.to(data.roomCode).emit('response:new', {
      questionId: data.questionId,
      studentId: data.studentId,
      selectedOption: data.selectedOption,
      responseTime: data.responseTime
    })

    // Risk-score update path. If anything fails here, do not break the
    // existing broadcast — log and move on.
    try {
      const room = await Room.findOne({ code: data.roomCode })
        .select('_id teacher coHosts createdAt')
        .lean()
      if (!room) return

      // Fetch the question for timeToAnswer only (needed by the risk scorer).
      const Question = (await import('./models/Question.js')).default
      const question = await Question.findById(data.questionId)
        .select('timeToAnswer')
        .lean()
      if (!question) return

      // Use the Response doc saved by the HTTP route as the single source of
      // truth for correctness. This guarantees the risk score always agrees
      // with the leaderboard — no duplicate correctness logic here.
      // If the HTTP POST hasn't committed yet (unlikely but possible under
      // high load), we fall back to false (scored as wrong) which is safe;
      // the dedup guard in applyEvent will reject any retry anyway.
      const savedResponse = await Response.findOne({
        questionId: data.questionId,
        studentId: data.studentId,
        roomId: room._id
      }).select('isCorrect').lean()
      const isCorrect = savedResponse?.isCorrect ?? false

      const { doc, update } = await applyEvent(
        data.studentId,
        room._id,
        {
          type: isCorrect ? 'correct' : 'wrong',
          questionId: data.questionId,
          responseTimeMs: data.responseTime ?? null,
          timeToAnswerMs: (question.timeToAnswer || 30) * 1000
        },
        room.createdAt || new Date()
      )

      // PER-STUDENT emit: only to sockets belonging to this studentId.
      // This is the strict access rule — students never see each other's scores.
      for (const [sockId, uid] of connectedUsers.entries()) {
        if (uid === data.studentId) {
          io.to(sockId).emit('risk-score:self-update', {
            currentScore: update.newScore,
            zone: update.newZone,
            correctStreakNeeded: update.correctStreakNeeded
          })
        }
      }

      // HOST/CO-HOST emit: per-room snapshot of all student scores.
      // Use the snapshot helper so the payload is consistent with the
      // /api/risk-scores/room/:roomId endpoint.
      const snapshot = await getRoomRiskSnapshot(room._id)
      const hostIds = new Set([
        room.teacher.toString(),
        ...(room.coHosts || []).map(id => id.toString())
      ])
      for (const [sockId, uid] of connectedUsers.entries()) {
        if (hostIds.has(uid)) {
          io.to(sockId).emit('risk-score:all-update', {
            roomId: room._id.toString(),
            snapshot
          })
        }
      }

      // Silence unused-var lint for doc (kept for future logging)
      void doc
    } catch (err) {
      console.error('[risk-score] apply on response:submit failed:', err)
    }
  })

  // NOTE: the client-driven 'response:submit', 'points:update' and 'leaderboard:update'
  // handlers were removed in Phase 1. They let clients forge points/answers and caused a
  // ~N^2 leaderboard-refetch storm. Live answer-count updates (throttled) and the deferred
  // leaderboard are now emitted server-side from the authenticated REST submit handler — see the
  // scheduleCountsBroadcast()/scheduleLeaderboardRefresh() broadcasters above and routes/responses.js.

  // Question events — teacher-only and restricted to the room's OWNER (server-verified),
  // so a student can no longer forge question start/end or push a fake question to the room.
  socket.on('question:start', async (data) => {
    if (!(await verifyRoomOwner(socket, data?.roomCode))) return
    io.to(data.roomCode).emit('question:started', {
      questionId: data.questionId,
      question: data.question,
      timer: data.timer,
      startTime: Date.now()
    })
  })

  // Server-side skip detection helper. For every RoomMember of this room,
  // if they have NO Response doc for this questionId, treat as a skip
  // and apply the (heavier-than-wrong) skip penalty.
  async function runSkipDetection(roomCode, questionId) {
    try {
      const room = await Room.findOne({ code: roomCode })
        .select('_id teacher coHosts createdAt')
        .lean()
      if (!room) return

      // Use RiskScore history (not RoomMember) to find participants.
      // RoomMember records are deleted when students leave the room — so a student
      // who exits before a question launches would never get the skip penalty.
      // RiskScore docs persist permanently, so anyone who ever answered or was
      // skipped in this room is correctly included here.
      const participantIds = await RiskScore.distinct('studentId', { roomId: room._id })
      if (!participantIds.length) return

      const respondedStudentIds = await Response.find({
        questionId: questionId,
        roomId: room._id
      }).distinct('studentId')
      const respondedSet = new Set(respondedStudentIds.map(id => id.toString()))

      for (const studentId of participantIds) {
        const sid = studentId.toString()
        if (respondedSet.has(sid)) continue  // already answered

        const { update } = await applyEvent(
          studentId,
          room._id,
          { type: 'skip', questionId },
          room.createdAt || new Date()
        )

        for (const [sockId, uid] of connectedUsers.entries()) {
          if (uid === sid) {
            io.to(sockId).emit('risk-score:self-update', {
              currentScore: update.newScore,
              zone: update.newZone,
              correctStreakNeeded: update.correctStreakNeeded
            })
            console.log(`[risk-score] Emitted self-update to socket ${sockId} (user ${sid}) — newScore=${update.newScore}`)
          }
        }
      }

      // Push the refreshed snapshot to host sockets once after bulk skip processing.
      const snapshot = await getRoomRiskSnapshot(room._id)
      const hostIds = new Set([
        room.teacher.toString(),
        ...(room.coHosts || []).map(id => id.toString())
      ])
      for (const [sockId, uid] of connectedUsers.entries()) {
        if (hostIds.has(uid)) {
          io.to(sockId).emit('risk-score:all-update', {
            roomId: room._id.toString(),
            snapshot
          })
        }
      }

      // Mark SAFE_THRESHOLD used for future tuning reference
      void SAFE_THRESHOLD
    } catch (err) {
      console.error('[risk-score] skip-detection failed:', err)
    }
  }

  socket.on('question:end', async (data) => {
    if (!(await verifyRoomOwner(socket, data?.roomCode))) return
    // Clear the auto-end timer for this room since the question is being
    // ended manually (or via the timer itself; either way, no-op if absent).
    const existingTimer = questionTimers.get(data.roomCode)
    if (existingTimer) {
      clearTimeout(existingTimer.timerHandle)
      questionTimers.delete(data.roomCode)
    }
    io.to(data.roomCode).emit('question:ended', {
      questionId: data.questionId,
      results: data.results
    })
    // Clear active-question pointer if this is the question that's active.
    try {
      await Room.updateOne(
        { code: data.roomCode, currentQuestion: data.questionId },
        { $set: { currentQuestion: null, currentQuestionStartedAt: null } }
      )
    } catch (err) {
      console.error('Failed to clear currentQuestion on Room:', err.message)
    }

    // Run server-side skip detection (extracted helper below).
    await runSkipDetection(data.roomCode, data.questionId)
  })

  // New question from teacher (manually created)
  socket.on('new_question', async (data) => {
    if (!(await verifyRoomOwner(socket, data?.roomCode))) {
      console.warn('new_question rejected — not the room owner:', socket.id)
      return
    }
    console.log('New question received from teacher:', data.question?.question?.substring(0, 50))
    const roomCode = data.roomCode
    const question = data.question
    if (!roomCode || !question) {
      console.error('new_question event missing roomCode or question:', data)
      return
    }

    // Auto-end the previous active question (if any) so skip-detection
    // runs server-side even when the teacher's React state hasn't
    // updated yet (e.g. across page refreshes or rapid back-to-back
    // launches). Without this, the frontend's `endActiveQuestion()`
    // relies on stale `room.currentQuestion` and silently no-ops.
    let replacedPrevQuestion = false
    try {
      const prevRoom = await Room.findOne({ code: roomCode })
        .select('currentQuestion')
        .lean()
      const prevQuestionId = prevRoom?.currentQuestion?.toString()
      const newQuestionId = (question._id || question.id)?.toString()
      if (prevQuestionId && newQuestionId && prevQuestionId !== newQuestionId) {
        console.log(`[new_question] Auto-ending previous question ${prevQuestionId} for room ${roomCode}`)
        replacedPrevQuestion = true
        // Emit question:ended broadcast so clients refresh UI state.
        io.to(roomCode).emit('question:ended', {
          questionId: prevQuestionId,
          reason: 'replaced-by-new-question'
        })
        // Clear active-question pointer only if it still points to the
        // previous question (avoids races with another in-flight end).
        await Room.updateOne(
          { code: roomCode, currentQuestion: prevQuestionId },
          { $set: { currentQuestion: null, currentQuestionStartedAt: null } }
        )
        // Run skip-detection for the previous question.
        await runSkipDetection(roomCode, prevQuestionId)
      }
    } catch (err) {
      console.error('[new_question] auto-end previous question failed:', err.message)
    }

    // Broadcast to existing room members (original behavior).
    // Give the score-update event time to reach the client and render
    // before the new question arrives. Without this delay, Socket.IO
    // batches both events on the wire and the student sees the score
    // change AT the same moment as the new-question overlay (UI noise
    // hides the prior change). 350ms is enough for the React render
    // to flush without feeling laggy to the teacher.
    const broadcastDelay = typeof data?.deferBroadcastMs === 'number' ? data.deferBroadcastMs : (replacedPrevQuestion ? 350 : 0)
    if (broadcastDelay > 0) {
      setTimeout(() => io.to(roomCode).emit('new_question', question), broadcastDelay)
    } else {
      io.to(roomCode).emit('new_question', question)
    }

    // Server-side auto-end timer: after `timeToAnswer` seconds, emit a
    // synthetic question:end so skip-detection runs even if the teacher
    // never launches the next question. This is what makes the student's
    // risk score drop visibly after they skip the only question in a session.
    const newQuestionId = (question._id || question.id)?.toString()
    if (newQuestionId) {
      // Clear any prior timer for this room.
      const prior = questionTimers.get(roomCode)
      if (prior) clearTimeout(prior.timerHandle)
      const ttl = Math.max(5, (question.timeToAnswer || 30)) * 1000
      const handle = setTimeout(async () => {
        questionTimers.delete(roomCode)
        try {
          // Re-fetch to ensure we don't fire on a question that's already been
          // replaced or ended by the teacher manually.
          const stillActive = await Room.findOne({ code: roomCode, currentQuestion: newQuestionId })
            .select('currentQuestion')
            .lean()
          if (!stillActive) return

          console.log(`[auto-end] question ${newQuestionId} in room ${roomCode} timer expired — running skip detection`)

          // Broadcast question:ended to clients so their UI updates.
          io.to(roomCode).emit('question:ended', { questionId: newQuestionId, reason: 'timer' })

          // Clear the active-question pointer on the Room doc.
          await Room.updateOne(
            { code: roomCode, currentQuestion: newQuestionId },
            { $set: { currentQuestion: null, currentQuestionStartedAt: null } }
          )

          // Run skip detection directly server-side — no round-trip needed.
          await runSkipDetection(roomCode, newQuestionId)
        } catch (err) {
          console.error('[auto-end] failed:', err.message)
        }
      }, ttl)
      questionTimers.set(roomCode, { questionId: newQuestionId, timerHandle: handle })
    }
    // Persist active-question pointer so late joiners can fetch via REST.
    try {
      const questionId = question._id || question.id
      if (questionId) {
        await Room.updateOne(
          { code: roomCode },
          { $set: { currentQuestion: questionId, currentQuestionStartedAt: new Date() } }
        )
      }
    } catch (err) {
      console.error('Failed to persist currentQuestion on Room:', err.message)
    }
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
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

// MongoDB connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spandan'
    console.log('[debug] Final URI to connect:', mongoUri.substring(0, 60) + '...')
    console.log('[debug] mongoose version check skipped (ESM)')
    
    console.log('[debug] connect attempt with options: timeout=30s, dbName=spandan')
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      dbName: 'spandan',
      // Ceiling on concurrent in-flight queries. Default is 100; a live event with
      // hundreds of students bursting responses/leaderboard reads can exhaust it and
      // queue requests until they time out. Size to the Mongo server's capacity.
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 200,
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE) || 10
    })
  } catch (error) {
    console.error('MongoDB connection error:', error.message)
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
    console.error('Stack:', error.stack)
    console.log('Server will continue without database connection')
  }
}

const PORT = process.env.PORT || 3001

// Start server
const startServer = async () => {
  await connectDB()
  
  httpServer.listen(PORT, () => {
    console.log(`Spandan backend v0.5 running on port ${PORT}`)
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
  })
}

startServer().catch(console.error)

export { app, io }