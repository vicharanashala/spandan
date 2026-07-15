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
import transcriptionRoutes from './routes/transcription.js'
import transcriptRoutes from './routes/transcripts.js'
import responseRoutes from './routes/responses.js'

// Import models for reference
import './models/index.js'

// Socket.IO connection/event handling lives in its own module now - see
// backend/src/sockets/socketHandlers.js for the rationale behind the changes
// there (presence tracking, throttled broadcasts, teacher-only targeting).
import { registerSocketHandlers } from './sockets/socketHandlers.js'

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
  },
  // Must match the frontend client's `path` option and the proxy target in
  // the root server.js (which forwards BASE_PATH/socket.io -> this backend's
  // /spandan/socket.io). Without this the default '/socket.io/' path would
  // silently mismatch behind the proxy.
  path: process.env.SOCKET_IO_PATH || '/spandan/socket.io',
  // Under classroom-scale load, slow-transport upgrades and flaky wifi
  // clients can pile up. These keep dead connections from lingering and
  // cap payload size so a misbehaving client can't send oversized frames.
  pingTimeout: 20000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB is plenty for JSON events
  // Lets a client that briefly drops (flaky classroom wifi) resume its
  // session instead of doing a full reconnect + rejoin - which is exactly
  // the kind of thundering-herd re-join storm we're trying to avoid.
  connectionStateRecovery: {
    maxDisconnectionDuration: 60 * 1000,
    skipMiddlewares: true
  }
})

// Make io accessible to routes
app.set('io', io)

// --- Optional horizontal scaling ---------------------------------------
// A single Node process tops out well before 3000 concurrent sockets once
// you add CPU-bound JSON work on top of it. The fixes in this codebase
// (presence tracking, throttled broadcasts, batched DB writes) push that
// ceiling much higher on one process - but if you outgrow a single instance,
// set REDIS_URL and run multiple instances behind a load balancer. The Redis
// adapter makes io.to(room).emit() work correctly across processes. This is
// intentionally best-effort so the app keeps working unmodified for anyone
// running a single instance without the optional packages installed.
if (process.env.REDIS_URL) {
  try {
    const { createAdapter } = await import('@socket.io/redis-adapter')
    const { createClient } = await import('redis')
    const pubClient = createClient({ url: process.env.REDIS_URL })
    const subClient = pubClient.duplicate()
    await Promise.all([pubClient.connect(), subClient.connect()])
    io.adapter(createAdapter(pubClient, subClient))
    console.log('Socket.IO Redis adapter connected - horizontal scaling enabled')
  } catch (error) {
    console.error(
      'REDIS_URL is set but the Redis adapter could not be initialized ' +
      '(run `npm install @socket.io/redis-adapter redis`). Continuing in single-instance mode:',
      error.message
    )
  }
}

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

// Socket.IO connection handling - see backend/src/sockets/socketHandlers.js
registerSocketHandlers(io)

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
      socketTimeoutMS: 45000,
      // Mongoose's default maxPoolSize is 100. Under a join/response burst
      // from 3000 concurrent students, 100 sockets to Mongo becomes the
      // bottleneck long before the DB itself is actually overloaded -
      // requests just queue up waiting for a free connection, timeouts
      // cascade, and socket handlers start throwing. Combined with the
      // query-reduction fixes elsewhere (room cache, presence tracking,
      // batched leaderboard lookups) a larger pool lets the remaining,
      // much smaller number of real queries run in parallel instead of
      // serializing behind 100 slots.
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 300),
      minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 10),
      maxIdleTimeMS: 30000
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