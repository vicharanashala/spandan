import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { createServer } from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import mongoose from 'mongoose'

// Import routes
import authRoutes from './routes/auth.js'
import roomRoutes from './routes/rooms.js'
import questionRoutes from './routes/questions.js'

// Import models for reference
import './models/index.js'

dotenv.config()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
})

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later' }
})

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 auth requests per hour
  message: { error: 'Too many authentication attempts, please try again later' }
})

// Middleware
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}))
app.use(express.json())
app.use('/api/', apiLimiter)
app.use('/api/auth/', authLimiter)

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/rooms', roomRoutes)
app.use('/api/questions', questionRoutes)

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
      const jwt = require('jsonwebtoken')
      const decoded = jwt.verify(data.token, process.env.JWT_SECRET || 'your-secret-key-change-in-production')
      connectedUsers.set(socket.id, decoded.userId)
      socket.emit('authenticated', { success: true })
    } catch (error) {
      socket.emit('authenticated', { success: false, error: 'Invalid token' })
    }
  })

  // Join room
  socket.on('room:join', ({ roomCode, userId }) => {
    socket.join(roomCode)
    console.log(`Client ${socket.id} (user: ${userId}) joined room ${roomCode}`)
    io.to(roomCode).emit('room:joined', { 
      roomCode, 
      userId,
      participants: io.sockets.adapter.rooms.get(roomCode)?.size || 0 
    })
  })

  // Leave room
  socket.on('room:leave', ({ roomCode }) => {
    socket.leave(roomCode)
    console.log(`Client ${socket.id} left room ${roomCode}`)
    io.to(roomCode).emit('room:left', { 
      roomCode,
      participants: io.sockets.adapter.rooms.get(roomCode)?.size || 0 
    })
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