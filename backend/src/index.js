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
import teamRoutes from './routes/teams.js'
import researchRoutes from './routes/research.js'

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
      // In development/non-production, allow all origins (crucial for local testing across devices)
      if (!origin || process.env.NODE_ENV !== 'production') {
        return callback(null, true)
      }
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

// Trust proxy (for rate limiting behind nginx)
app.set('trust proxy', 1)

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // limit each IP to 2000 requests per windowMs (increased for real-time classroom use)
  message: { error: 'Too many requests, please try again later' }
})

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 300, // limit each IP to 300 auth requests per hour (increased for live classroom use)
  message: { error: 'Too many authentication attempts, please try again later' }
})

const responseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // limit each IP to 5000 response submissions per windowMs (high limit for live quizzes)
  message: { error: 'Too many response submissions, please try again later' }
})

const leaderboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // very high limit for leaderboard reads (refreshes on every points update during live sessions)
  message: { error: 'Too many requests, please try again later' }
})

// Middleware
app.use(helmet())
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || process.env.NODE_ENV !== 'production') {
      return callback(null, true)
    }
    const allowed = [process.env.FRONTEND_URL, ...CORS_ORIGINS]
    if (allowed.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
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
app.use('/api/teams', teamRoutes)
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

// Token bucket rate limiter for socket events (Security Rule 3: 5 events/sec per socket)
const socketRateLimiters = new Map()
const RATE_LIMIT_MAX_TOKENS = 5
const RATE_LIMIT_REFILL_RATE = 5

function checkSocketRateLimit(socketId) {
  const now = Date.now()
  let bucket = socketRateLimiters.get(socketId)
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_MAX_TOKENS, lastRefill: now }
    socketRateLimiters.set(socketId, bucket)
  }
  const elapsed = (now - bucket.lastRefill) / 1000
  bucket.tokens = Math.min(RATE_LIMIT_MAX_TOKENS, bucket.tokens + elapsed * RATE_LIMIT_REFILL_RATE)
  bucket.lastRefill = now
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
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
      // Rule 10: Store roomCode on socket for spoofing protection
      socket.roomCode = roomCode
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
          
          // Rule 8: Late-joiner catch-all — auto-assign to team if team battle is active
          if (room.settings?.teamBattleActive) {
            try {
              const { assignLateJoiner } = await import('./services/teamService.js')
              const team = await assignLateJoiner(room._id, user._id)
              if (team) {
                socket.emit('team:assigned', { team })
                console.log(`Late-joiner ${userId} auto-assigned to team ${team.name}`)
              }
            } catch (teamErr) {
              console.error('Late-joiner team assignment error:', teamErr)
            }
          }
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

  // ========================
  // TEAM BATTLE SOCKET EVENTS
  // ========================

  // Team: Join channel with BOLA guard (Security Rule 1)
  socket.on('team:join_channel', async ({ teamId }) => {
    try {
      // Rule 9: ObjectId validation
      if (typeof teamId !== 'string' || !mongoose.Types.ObjectId.isValid(teamId)) {
        return socket.emit('error', { message: 'Malformed team ID' })
      }
      const Team = (await import('./models/Team.js')).default
      const userId = connectedUsers.get(socket.id)
      if (!userId) return socket.emit('error', { message: 'Not authenticated' })

      // Rule 1: Verify student is actually a member of this team
      const team = await Team.findOne({ _id: teamId, members: userId })
      if (!team) {
        return socket.emit('error', { message: 'Access denied: not a member of this team' })
      }
      socket.join(`team:${teamId}`)
      socket.teamId = teamId
      console.log(`Socket ${socket.id} joined team channel team:${teamId}`)
    } catch (error) {
      console.error('Error in team:join_channel:', error)
    }
  })

  // Team: Ephemeral chat message (Rules 3, 9, E)
  socket.on('team:message', async ({ teamId, text }) => {
    try {
      // Rule 3: Rate limiting
      if (!checkSocketRateLimit(socket.id)) {
        return socket.emit('rate_limit_exceeded', { message: 'Too many messages. Slow down!' })
      }
      // Rule 9: ObjectId validation
      if (typeof teamId !== 'string' || !mongoose.Types.ObjectId.isValid(teamId)) {
        return socket.emit('error', { message: 'Malformed team ID' })
      }
      // Rule E: Text validation (1-200 chars)
      if (typeof text !== 'string' || text.trim().length === 0 || text.length > 200) {
        return socket.emit('error', { message: 'Message must be 1-200 characters' })
      }
      const userId = connectedUsers.get(socket.id)
      if (!userId) return

      // Team membership verification
      const Team = (await import('./models/Team.js')).default
      const team = await Team.findOne({ _id: teamId, members: userId })
      if (!team) return

      const User = (await import('./models/User.js')).default
      const user = await User.findById(userId)

      // XSS sanitization
      const { stripHtml } = await import('./utils/sanitize.js')
      const cleanText = stripHtml(text.trim())

      io.to(`team:${teamId}`).emit('team:message_received', {
        studentId: userId,
        studentName: user ? user.name : 'Unknown',
        text: cleanText,
        timestamp: new Date().toLocaleTimeString()
      })
    } catch (error) {
      console.error('Error in team:message:', error)
    }
  })

  // Team: Option selection sync (Rules 3, 9, F)
  socket.on('team:select_option', async ({ teamId, selectedOption }) => {
    try {
      if (!checkSocketRateLimit(socket.id)) return
      if (typeof teamId !== 'string' || !mongoose.Types.ObjectId.isValid(teamId)) return
      if (typeof selectedOption !== 'number' || !Number.isInteger(selectedOption) || selectedOption < 0 || selectedOption > 10) return

      const userId = connectedUsers.get(socket.id)
      if (!userId) return

      const Team = (await import('./models/Team.js')).default
      const team = await Team.findOne({ _id: teamId, members: userId })
      if (!team) return

      socket.to(`team:${teamId}`).emit('team:partner_selected', {
        studentId: userId,
        selectedOption
      })
    } catch (error) {
      console.error('Error in team:select_option:', error)
    }
  })

  // Team: Consensus scoring check (Rules 2, 4, 6, 10)
  socket.on('team:check_consensus', async ({ roomId, questionId }) => {
    try {
      if (typeof roomId !== 'string' || !mongoose.Types.ObjectId.isValid(roomId)) return
      if (typeof questionId !== 'string' || !mongoose.Types.ObjectId.isValid(questionId)) return

      const Team = (await import('./models/Team.js')).default
      const Response = (await import('./models/Response.js')).default

      const userId = connectedUsers.get(socket.id)
      if (!userId) return

      const team = await Team.findOne({ roomId, members: userId })
      if (!team) return

      // Get all responses from team members for this question
      const teammateResponses = await Response.find({
        roomId,
        questionId,
        studentId: { $in: team.members }
      })

      // Check if all active members have answered
      const allAnswered = teammateResponses.length >= team.members.length
      if (!allAnswered) return

      // Check consensus
      const firstOption = teammateResponses[0].selectedOption
      const allSelectedSame = teammateResponses.every(r => r.selectedOption === firstOption)
      const allCorrect = teammateResponses[0].isCorrect

      if (allSelectedSame && allCorrect) {
        // CONSENSUS BONUS: 1.5x multiplier
        const totalTeamPoints = teammateResponses.reduce((sum, r) => sum + r.points, 0)
        const bonusPoints = Math.round(totalTeamPoints * 0.5)

        // Rule 4: Atomic update
        const updatedTeam = await Team.findByIdAndUpdate(
          team._id,
          { $inc: { points: totalTeamPoints + bonusPoints, streakCount: 1 } },
          { new: true }
        )

        // Rule 10: Broadcast using socket.roomCode, not client-provided data
        if (socket.roomCode) {
          io.to(socket.roomCode).emit('team:score_updated', {
            teamId: team._id,
            points: updatedTeam.points,
            streakCount: updatedTeam.streakCount,
            consensusBonus: true
          })
        }
        io.to(`team:${team._id}`).emit('team:consensus_success', {
          teamId: team._id,
          bonusPoints,
          totalPoints: updatedTeam.points
        })
      } else {
        // No consensus or wrong answer — add individual points, reset streak
        const totalTeamPoints = teammateResponses.reduce((sum, r) => sum + r.points, 0)
        const updatedTeam = await Team.findByIdAndUpdate(
          team._id,
          { $inc: { points: totalTeamPoints }, $set: { streakCount: 0 } },
          { new: true }
        )

        if (socket.roomCode) {
          io.to(socket.roomCode).emit('team:score_updated', {
            teamId: team._id,
            points: updatedTeam.points,
            streakCount: 0,
            consensusBonus: false
          })
        }
      }
    } catch (error) {
      console.error('Error in team:check_consensus:', error)
    }
  })

  // Team: Join team in student-choice mode
  socket.on('team:join', async ({ roomId, teamId }) => {
    try {
      if (typeof roomId !== 'string' || !mongoose.Types.ObjectId.isValid(roomId)) {
        return socket.emit('error', { message: 'Invalid room ID' })
      }
      if (typeof teamId !== 'string' || !mongoose.Types.ObjectId.isValid(teamId)) {
        return socket.emit('error', { message: 'Invalid team ID' })
      }

      const userId = connectedUsers.get(socket.id)
      if (!userId) return socket.emit('error', { message: 'Not authenticated' })

      const Room = (await import('./models/Room.js')).default
      const Team = (await import('./models/Team.js')).default

      const room = await Room.findById(roomId)
      if (!room) {
        return socket.emit('error', { message: 'Room not found' })
      }

      // Check if team battle is active and mode is student-choice
      if (!room.settings?.teamBattleActive || room.settings?.teamBattleConfig?.groupingMode !== 'student-choice') {
        return socket.emit('error', { message: 'Manual team selection is not active for this room' })
      }

      // Check if target team exists and belongs to this room
      const targetTeam = await Team.findOne({ _id: teamId, roomId })
      if (!targetTeam) {
        return socket.emit('error', { message: 'Team not found' })
      }

      // Check if team is full
      const maxTeamSize = room.settings?.teamBattleConfig?.teamSize || 3
      if (targetTeam.members.length >= maxTeamSize) {
        return socket.emit('error', { message: 'This team is already full' })
      }

      // Remove user from any other team in this room
      await Team.updateMany(
        { roomId },
        { $pull: { members: userId } }
      )

      // Add user to the target team
      targetTeam.members.addToSet(userId)
      await targetTeam.save()

      // Fetch all updated teams to broadcast
      const { getTeamsByRoom } = await import('./services/teamService.js')
      const updatedTeams = await getTeamsByRoom(roomId)

      // Broadcast updated teams to everyone in the room
      const roomCode = socket.roomCode || room.code
      if (roomCode) {
        io.to(roomCode).emit('team:updated', {
          teams: updatedTeams
        })
      }

      // Automatically join the socket room for the new team
      socket.join(`team:${teamId}`)
      socket.teamId = teamId

      // Send a confirmation to the joining student
      socket.emit('team:joined_successfully', { team: targetTeam })

    } catch (error) {
      console.error('Error in team:join socket handler:', error)
      socket.emit('error', { message: 'Failed to join team' })
    }
  })

  // Team: Leave team in student-choice mode
  socket.on('team:leave', async ({ roomId }) => {
    try {
      if (typeof roomId !== 'string' || !mongoose.Types.ObjectId.isValid(roomId)) return
      const userId = connectedUsers.get(socket.id)
      if (!userId) return

      const Team = (await import('./models/Team.js')).default
      const Room = (await import('./models/Room.js')).default
      const room = await Room.findById(roomId)

      // Remove user from any team in this room
      await Team.updateMany(
        { roomId },
        { $pull: { members: userId } }
      )

      if (socket.teamId) {
        socket.leave(`team:${socket.teamId}`)
        socket.teamId = null
      }

      // Fetch and broadcast updated teams
      const { getTeamsByRoom } = await import('./services/teamService.js')
      const updatedTeams = await getTeamsByRoom(roomId)

      const roomCode = socket.roomCode || (room ? room.code : null)
      if (roomCode) {
        io.to(roomCode).emit('team:updated', {
          teams: updatedTeams
        })
      }

      socket.emit('team:left_successfully')
    } catch (error) {
      console.error('Error in team:leave socket handler:', error)
    }
  })

  // ========================
  // PROCTORED POLL LOCK EVENTS
  // ========================

  // proctor:violation — student triggered a fullscreen/tab-switch violation
  // Forwarded to the teacher's room channel for live monitoring
  socket.on('proctor:violation', ({ roomCode, studentId, violationCount, reason }) => {
    if (!roomCode || typeof roomCode !== 'string') return
    if (!studentId || typeof violationCount !== 'number') return
    // Rule 10: only broadcast into the room the socket actually joined
    const targetRoom = socket.roomCode || roomCode
    // Emit to room (teacher will receive this and show a warning badge)
    socket.to(targetRoom).emit('proctor:violation_alert', {
      studentId,
      violationCount,
      reason,
      timestamp: new Date().toISOString()
    })
    console.log(`[Proctor] Room ${targetRoom} — student ${studentId} violation #${violationCount}: ${reason}`)
  })

  socket.on('disconnect', () => {
    const userId = connectedUsers.get(socket.id)
    connectedUsers.delete(socket.id)
    socketRateLimiters.delete(socket.id)
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