import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createServer } from 'http'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import mongoose from 'mongoose'

// Import routes
import authRoutes from './routes/auth.js'
import roomRoutes from './routes/rooms.js'
import questionRoutes from './routes/questions.js'
import transcriptionRoutes from './routes/transcription.js'
import transcriptRoutes from './routes/transcripts.js'
import responseRoutes from './routes/responses.js'
import summaryRoutes from './routes/summary.js'

// Import models for reference
import './models/index.js'

dotenv.config()

const BASE_PATH = process.env.BASE_PATH || ''
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3001').split(',').map(s => s.trim())

// Request timeout middleware
// Kept above aiProviderService's FETCH_TIMEOUT_MS (45s) so a slow-but-alive
// AI provider call is never cut off early by the generic Express timeout.
const REQUEST_TIMEOUT_MS = 60000
const requestTimeout = (req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Request timeout', message: 'The request took too long to process' })
    }
  })
  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
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
  }
})

// Make io accessible to routes
app.set('io', io)

// Trust proxy (for rate limiting behind nginx)
app.set('trust proxy', 1)

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: { error: 'Too many requests, please try again later' }
})

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 300,
  message: { error: 'Too many authentication attempts, please try again later' }
})

const responseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { error: 'Too many response submissions, please try again later' }
})

const leaderboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  message: { error: 'Too many requests, please try again later' }
})

// Middleware
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))
app.use('/api/', apiLimiter)
app.use('/api/auth/', authLimiter)
// FIX: leaderboard route registered BEFORE the broader responses limiter so its
// higher limit (10k) applies instead of being overridden by responses' 5k limit.
app.use('/api/responses/leaderboard/', leaderboardLimiter)
app.use('/api/responses/', responseLimiter)

// Apply timeout middleware before routes
app.use(requestTimeout)

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/rooms', roomRoutes)
app.use('/api/questions', questionRoutes)
app.use('/api/transcription', transcriptionRoutes)
app.use('/api/transcripts', transcriptRoutes)
app.use('/api/responses', responseRoutes)
app.use('/api/summary', summaryRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '0.5.0',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  })
})

// FIX: confusionCounts moved OUTSIDE io.on('connection') — previously declared
// inside, so every socket got a fresh empty Map and counts never aggregated
// across students (confusion % was always 1/total no matter how many signalled).
const confusionCounts = new Map() // roomCode -> { count, totalStudents }

// Socket.IO connection handling
const connectedUsers = new Map() // socket.id -> userId

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  socket.on('confusion:signal', async ({ roomCode }) => {
    if (!roomCode) return
    
    try {
      const Room = (await import('./models/Room.js')).default
      const RoomMember = (await import('./models/RoomMember.js')).default
      const room = await Room.findOne({ code: roomCode })
      if (!room) return
      const totalStudents = await RoomMember.countDocuments({ roomId: room._id })
      
      const current = confusionCounts.get(roomCode) || { count: 0, totalStudents }
      current.count += 1
      current.totalStudents = totalStudents // refresh in case students joined/left
      confusionCounts.set(roomCode, current)
      
      const percentage = totalStudents > 0 ? Math.round((current.count / totalStudents) * 100) : 0
      
      let level = 'LOW'
      if (percentage >= 40) level = 'HIGH'
      else if (percentage >= 20) level = 'MEDIUM'
      
      io.to(roomCode).emit('confusion:signal', {
        count: current.count,
        totalStudents,
        percentage,
        level
      })
    } catch (error) {
      console.error('Error handling confusion signal:', error)
    }
  })

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
      
      const user = await User.findById(userId)
      const room = await Room.findByCode(roomCode)
      
      let participantCount = 0
      
      if (user && room) {
        if (user.role === 'student') {
          await RoomMember.findOneAndUpdate(
            { roomId: room._id, studentId: user._id },
            { roomId: room._id, studentId: user._id, joinedAt: new Date() },
            { upsert: true, new: true }
          )
          console.log(`Student ${userId} added to room members for room ${roomCode}`)
        }
        
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
        await RoomMember.deleteOne({ roomId: room._id, studentId: user._id })
        participantCount = await RoomMember.countDocuments({ roomId: room._id })

        // Reset confusion count for this room when a student leaves
        if (confusionCounts.has(roomCode)) {
          const current = confusionCounts.get(roomCode)
          current.count = Math.max(0, current.count - 1)
          current.totalStudents = participantCount
          confusionCounts.set(roomCode, current)
        }
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

  // Submit response (real-time broadcast only — DB save is done via HTTP POST)
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
    // Reset confusion counts when question ends
    if (data.roomCode) confusionCounts.delete(data.roomCode)

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
      // Reset confusion counts for the new question
      confusionCounts.delete(roomCode)
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

const startServer = async () => {
  await connectDB()
  
  httpServer.listen(PORT, () => {
    console.log(`Spandan backend v0.5 running on port ${PORT}`)
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
  })
}

startServer().catch(console.error)

export { app, io }