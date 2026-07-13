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
import Redis from 'ioredis'
import { RedisStore } from 'rate-limit-redis'

// Import routes
import authRoutes from './routes/auth.js'
import roomRoutes from './routes/rooms.js'
import questionRoutes from './routes/questions.js'
import transcriptionRoutes from './routes/transcription.js'
import transcriptRoutes from './routes/transcripts.js'
import responseRoutes from './routes/responses.js'

// Import models for reference
import './models/index.js'

dotenv.config()

const BASE_PATH = process.env.BASE_PATH || ''
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3001').split(',').map(s => s.trim())

// Request timeout middleware - defined BEFORE use due to hoisting
const requestTimeout = (req, res, next) => {
  // Set a 30-second timeout for all requests
  req.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Request timeout', message: 'The request took too long to process' })
    }
  })
  
  // Also set server-side timeout for the response
  res.setTimeout(30000, () => {
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

// Make io accessible to routes
app.set('io', io)

// ---- Horizontal scaling: Redis-backed Socket.IO adapter + rate-limit store ----
// When REDIS_URL is set, broadcasts (io.to(room).emit) propagate across every worker/instance,
// which is REQUIRED for PM2 cluster mode or multiple servers — without it, a message emitted by
// one worker never reaches clients connected to another. When REDIS_URL is absent (local dev,
// single process), everything falls back to in-memory and behaves exactly as before.
const REDIS_URL = process.env.REDIS_URL
let redisClient = null
if (REDIS_URL) {
  try {
    const pubClient = new Redis(REDIS_URL)
    const subClient = pubClient.duplicate()
    io.adapter(createAdapter(pubClient, subClient))
    redisClient = new Redis(REDIS_URL) // separate connection for the rate limiter
    pubClient.on('error', (e) => console.error('Redis pub error:', e.message))
    subClient.on('error', (e) => console.error('Redis sub error:', e.message))
    console.log('Socket.IO Redis adapter enabled (cluster-ready)')
  } catch (e) {
    console.error('Failed to init Redis adapter, falling back to in-memory:', e.message)
  }
} else {
  console.warn('REDIS_URL not set — running single-instance (in-memory Socket.IO). Do NOT run in cluster mode without Redis.')
}

// Trust proxy (for rate limiting behind nginx)
app.set('trust proxy', 1)

// Rate limiting. Use a shared Redis store when available so limits are consistent across all
// workers (with per-process in-memory stores, N workers = N× looser limits and inconsistent counts).
const rateStore = () => redisClient
  ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) })
  : undefined

// All limits are PER IP. A whole classroom often shares one public IP (campus NAT), so the caps must
// account for ~1000 students behind a single IP or the class gets 429'd — a direct "can't join"
// failure. All maxes are env-tunable (raise them for large shared-NAT deployments or load testing).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.API_RATE_LIMIT_MAX || 60000), // ~1000 students × dozens of requests / 15 min
  message: { error: 'Too many requests, please try again later' },
  store: rateStore()
})

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20000), // ~1000 students logging in (with retries) / IP
  message: { error: 'Too many authentication attempts, please try again later' },
  store: rateStore()
})

const responseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RESPONSE_RATE_LIMIT_MAX || 30000), // 1000 students × many answers / 15 min
  message: { error: 'Too many response submissions, please try again later' },
  store: rateStore()
})

const leaderboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.LEADERBOARD_RATE_LIMIT_MAX || 100000), // refreshes on every points update
  message: { error: 'Too many requests, please try again later' },
  store: rateStore()
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

// Coalesce bursty per-room broadcasts into at most one emit per room per interval.
// A 1000-student join/answer storm otherwise triggers O(N²) work: N joins each doing a
// countDocuments + a broadcast to all N sockets. With this, each room flushes at most once
// per interval regardless of how many events arrived, collapsing the storm to O(N).
function makeRoomThrottler(intervalMs) {
  const pending = new Map() // roomCode -> latest run fn (a timer is scheduled while an entry exists)
  return (roomCode, run) => {
    const alreadyScheduled = pending.has(roomCode)
    pending.set(roomCode, run) // keep only the most recent run
    if (alreadyScheduled) return
    setTimeout(async () => {
      const fn = pending.get(roomCode)
      pending.delete(roomCode)
      try { await fn() } catch (e) { console.error(`throttled emit (${roomCode}):`, e.message) }
    }, intervalMs)
  }
}
const throttleParticipants = makeRoomThrottler(1000) // room:joined / room:left participant count
const throttlePoints = makeRoomThrottler(1500)       // points:updated leaderboard-refresh signal

// Broadcast the current participant count for a room (single countDocuments per flush).
async function broadcastParticipantCount(roomCode, event) {
  const Room = (await import('./models/Room.js')).default
  const RoomMember = (await import('./models/RoomMember.js')).default
  const room = await Room.findByCode(roomCode)
  const participants = room ? await RoomMember.countDocuments({ roomId: room._id }) : 0
  io.to(roomCode).emit(event, { roomCode, participants })
}

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

      // Record membership (students only). This is the one write we must do per join; it's an
      // indexed upsert on (roomId, studentId), so it's cheap even under a join storm.
      const user = await User.findById(userId)
      const room = await Room.findByCode(roomCode)
      if (user && room && user.role === 'student') {
        await RoomMember.findOneAndUpdate(
          { roomId: room._id, studentId: user._id },
          { roomId: room._id, studentId: user._id, joinedAt: new Date() },
          { upsert: true, new: true }
        )
      }

      // The participant count no longer runs a countDocuments + whole-room broadcast on EVERY join
      // (that was the O(N²) join-storm killer). Instead we coalesce: one count + one broadcast per
      // room per second, no matter how many students join in that window.
      throttleParticipants(roomCode, () => broadcastParticipantCount(roomCode, 'room:joined'))
    } catch (error) {
      console.error('Error in room:join:', error)
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

  // Points update event (emitted after response is saved with calculated points).
  // This is a refresh signal — the Leaderboard component just refetches when it arrives; it does
  // not read the payload. Under load, 1000 answers would fire 1000 whole-room broadcasts, each
  // triggering every client to refetch (O(N²)). We coalesce to one signal per room per 1.5s; the
  // leaderboard endpoint's short-TTL cache then absorbs the concurrent refetches.
  socket.on('points:update', (data) => {
    if (!data?.roomCode) return
    throttlePoints(data.roomCode, () => {
      io.to(data.roomCode).emit('points:updated', { roomCode: data.roomCode })
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
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
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