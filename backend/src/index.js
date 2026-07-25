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

const otpLimiter = rateLimit({
  store: rlStore('rl:otp:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  // Registration-code sends trigger real emails, so this endpoint gets a tighter per-IP cap than the
  // general auth limiter to prevent email-bombing. Legit sign-ups are rare per IP; the finer control
  // (60s resend cooldown + 5-send cap) is per-email in otpService. Sized to still tolerate a shared NAT
  // (a campus behind one IP), so the default is well above 100. Override via OTP_LIMIT_PER_HOUR in .env.
  max: Number(process.env.OTP_LIMIT_PER_HOUR) || 500, // sends per IP per hour
  message: { error: 'Too many verification requests, please try again later' }
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
app.use('/api/auth/register/send-otp', otpLimiter)  // stricter cap on the email-sending step
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

// Active poll state — keyed by roomCode. Stores the full question payload,
// timer (seconds), and startTime (epoch ms) so reconnecting/late-joining
// students can recover the active poll without hitting the database.
// Cleared when the question ends. Fixes issue #78.
const activePolls = new Map()
// roomCode -> { questionId, question, timer, startTime }

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
  socket.data.tokenExp = decoded.exp || null // seconds since epoch; used to enforce freshness below
  connectedUsers.set(socket.id, decoded.userId)
  return socket.data
}

// jwt.verify only runs at (re)connect, so a long-lived socket can outlive its token: its cached
// socket.data.userId then becomes stale. These helpers enforce token freshness on the socket anyway.
// room:join refuses an expired socket, and a timer proactively de-authenticates it AT expiry so a
// student who is only PASSIVELY receiving polls is still told to re-login (the client turns the
// `expired` signal into a graceful sign-out) instead of lingering "in the room but unable to answer".
function socketTokenExpired(socket) {
  const exp = socket.data?.tokenExp
  return typeof exp === 'number' && exp * 1000 <= Date.now()
}

function deauthenticateSocket(socket) {
  socket.data.userId = null
  socket.data.role = null
  connectedUsers.delete(socket.id)
  socket.emit('authenticated', { success: false, error: 'Token expired', expired: true })
}

function scheduleSocketExpiry(socket) {
  if (socket.data?._expiryTimer) { clearTimeout(socket.data._expiryTimer); socket.data._expiryTimer = null }
  const exp = socket.data?.tokenExp
  if (typeof exp !== 'number') return
  const ms = exp * 1000 - Date.now()
  if (ms <= 0) { deauthenticateSocket(socket); return }
  // setTimeout overflows past ~24.8 days; clamp and, if we hit the clamp before the real expiry,
  // reschedule for the remainder (harmless — real sockets never live that long anyway).
  socket.data._expiryTimer = setTimeout(() => {
    if (socketTokenExpired(socket)) deauthenticateSocket(socket)
    else scheduleSocketExpiry(socket)
  }, Math.min(ms, 2_147_000_000))
}

// Teacher-only + room-ownership guard for privileged events (question:start/end, new_question).
// Returns the room doc when the socket is the room's teacher-owner, else null. Returning the room
// (not just a bool) lets callers use room._id (e.g. to mark the current question) without re-looking
// it up; truthiness of the result is still a valid owner check.
async function verifyRoomOwner(socket, roomCode) {
  if (socket.data?.role !== 'teacher' || !roomCode) return null
  try {
    const Room = (await import('./models/Room.js')).default
    const room = await Room.findByCode(roomCode)
    return (room && room.teacher.toString() === String(socket.data.userId)) ? room : null
  } catch {
    return null
  }
}

// Mark which question is CURRENTLY LIVE for a room. Set on every launch and NEVER cleared: the read
// endpoints withhold the correct answer of `currentQuestion` from students while it is live, and it
// stays the current one until the NEXT launch overwrites it (or the room ends). This is the only
// desync-safe "poll is live" signal — a per-student/teacher timer can't be, since each student runs
// their own answering window. Fire-and-forget.
async function setLiveQuestion(roomId, questionId) {
  try {
    const Room = (await import('./models/Room.js')).default
    const Question = (await import('./models/Question.js')).default
    const GRACE = Number(process.env.POLL_RESPONSE_GRACE_MS) || 10000
    // Close the OUTGOING poll (the one leaving the live slot) to new responses, GRACE ms from now.
    // The grace covers in-flight/late submits; once it passes, POST /responses refuses that poll, so
    // a bot can no longer back-fill answers to polls that have already moved on. (The last poll of a
    // session is never superseded, so it stays open until the room ends — see the POST guard.)
    const room = await Room.findById(roomId).select('currentQuestion')
    const outgoing = room?.currentQuestion
    if (outgoing && String(outgoing) !== String(questionId)) {
      await Question.updateOne({ _id: outgoing }, { $set: { closeAt: new Date(Date.now() + GRACE) } })
    }
    // The incoming poll is now live — clear any stale closeAt (e.g. if it is being re-launched).
    await Question.updateOne({ _id: questionId }, { $set: { closeAt: null } })
    await Room.updateOne({ _id: roomId }, { currentQuestion: questionId })
    // Refresh the shared room-live cache so POST /responses can check the live poll without a Mongo
    // read per submit (see services/roomLiveCache.js). Launch is the sole writer of this value.
    const { setRoomLive } = await import('./services/roomLiveCache.js')
    await setRoomLive(roomId, questionId)
  } catch { /* non-fatal */ }
}

// Remove answer-revealing fields (which option is correct, and the explanation) from a question
// before it is broadcast to STUDENTS on launch. Students receive this over the socket, so leaving
// the answer in it lets them read `isCorrect` straight from the browser's WS frames. Removing it
// breaks nothing: the teacher renders from its own local copy, scoring is computed server-side from
// the submitted option index, and the answer is revealed afterwards through the results path. Option
// order/count are preserved (students submit answers by index).
function sanitizeQuestionForStudents(q) {
  if (!q || typeof q !== 'object') return q
  const { explanation, ...rest } = q
  if (Array.isArray(rest.options)) {
    rest.options = rest.options.map(o =>
      (o && typeof o === 'object') ? (({ isCorrect, ...opt }) => opt)(o) : o
    )
  }
  return rest
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
  // Arm the proactive de-auth for a handshake-authenticated socket (io.use already ran authenticateSocket).
  scheduleSocketExpiry(socket)

  // Re-authenticate on demand (also covers clients that auth via this event, not the handshake).
  socket.on('authenticate', async (data) => {
    try {
      if (!data?.token) {
        socket.emit('authenticated', { success: false, error: 'No token provided' })
        return
      }
      await authenticateSocket(socket, data.token)
      scheduleSocketExpiry(socket) // re-arm for the new token's expiry
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
    // Token this socket authenticated with has since lapsed — refuse the join and tell the client to
    // re-login rather than trusting the userId cached at connect time.
    if (socketTokenExpired(socket)) {
      deauthenticateSocket(socket)
      socket.emit('room:error', { error: 'Session expired' })
      return
    }
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

      // Issue #78 — active poll recovery: if a question is still live when this
      // student joins or rejoins, push the remaining state directly to their socket.
      // Served from RAM (activePolls map) — zero DB cost even under reload storms.
      if (role === 'student') {
        const poll = activePolls.get(roomCode)
        if (poll) {
          const elapsed = (Date.now() - poll.startTime) / 1000
          const timeLeft = Math.floor(poll.timer - elapsed)
          if (timeLeft > 0) {
            socket.emit('question:started', {
              questionId: poll.questionId,
              question:   poll.question,
              timer:      timeLeft,
              startTime:  poll.startTime
            })
          }
        }
      }
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

  // NOTE: the client-driven 'response:submit', 'points:update' and 'leaderboard:update'
  // handlers were removed in Phase 1. They let clients forge points/answers and caused a
  // ~N^2 leaderboard-refetch storm. Live answer-count updates (throttled) and the deferred
  // leaderboard are now emitted server-side from the authenticated REST submit handler — see the
  // scheduleCountsBroadcast()/scheduleLeaderboardRefresh() broadcasters above and routes/responses.js.

  // Question events — teacher-only and restricted to the room's OWNER (server-verified),
  // so a student can no longer forge question start/end or push a fake question to the room.
  socket.on('question:start', async (data) => {
    const room = await verifyRoomOwner(socket, data?.roomCode)
    if (!room) return
    if (data.questionId) setLiveQuestion(room._id, data.questionId)
    const startTime = Date.now()
    const sanitized = sanitizeQuestionForStudents(data.question)
    // Cache in RAM so reconnecting students can recover this poll (issue #78).
    activePolls.set(data.roomCode, {
      questionId: data.questionId,
      question:   sanitized,
      timer:      data.timer,
      startTime
    })
    io.to(data.roomCode).emit('question:started', {
      questionId: data.questionId,
      question:   sanitized,
      timer:      data.timer,
      startTime
    })
  })

  socket.on('question:end', async (data) => {
    if (!(await verifyRoomOwner(socket, data?.roomCode))) return
    // Clear the RAM cache — the poll is over, no new joiner should receive it.
    activePolls.delete(data.roomCode)
    io.to(data.roomCode).emit('question:ended', {
      questionId: data.questionId,
      results: data.results
    })
  })

  // New question pushed by the teacher (manually created)
  socket.on('new_question', async (data) => {
    const room = await verifyRoomOwner(socket, data?.roomCode)
    if (!room) {
      console.warn('new_question rejected — not the room owner:', socket.id)
      return
    }
    if (data.question) {
      const qId = data.question._id || data.question.id
      if (qId) setLiveQuestion(room._id, qId)
      const sanitized = sanitizeQuestionForStudents(data.question)
      const timer = data.question.timeToAnswer || 30
      // Cache in RAM for reconnect recovery (issue #78).
      activePolls.set(data.roomCode, {
        questionId: qId,
        question:   sanitized,
        timer,
        startTime:  Date.now()
      })
      io.to(data.roomCode).emit('new_question', sanitized)
    }
  })

  socket.on('disconnect', () => {
    if (socket.data?._expiryTimer) { clearTimeout(socket.data._expiryTimer); socket.data._expiryTimer = null }
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