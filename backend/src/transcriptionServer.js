import express from 'express'
import { pipeline } from '@xenova/transformers'
import { createServer } from 'http'
import { Server } from 'socket.io'

const app = express()
const PORT = process.env.TRANSCRIPTION_PORT || 3002

// CORS configuration from env
const FRONTEND_URL = process.env.FRONTEND_URL || '*'
const CORS_OPTIONS = FRONTEND_URL === '*'
  ? { origin: '*', methods: ['GET', 'POST'] }
  : { origin: FRONTEND_URL, methods: ['GET', 'POST'] }

const httpServer = createServer(app)
const io = new Server(httpServer, { cors: CORS_OPTIONS })

let transcriber = null
let isReady = false

// Health check endpoint
app.get('/api/transcription/status', (req, res) => {
  res.json({
    status: transcriber ? 'ready' : 'loading',
    model: 'whisper-base',
    isReady
  })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Initialize Whisper model
async function initWhisper() {
  try {
    console.log('🔄 Loading Whisper model on server...')
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base')
    isReady = true
    console.log('✅ Whisper model loaded successfully!')
  } catch (error) {
    console.error('❌ Failed to load Whisper model:', error)
    isReady = false
  }
}

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`)
  
  httpServer.close((err) => {
    if (err) {
      console.error('Error during server shutdown:', err)
      process.exit(1)
    }
    console.log('✅ HTTP server closed')
    process.exit(0)
  })
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// WebSocket handling
io.on('connection', (socket) => {
  console.log('🔗 Client connected:', socket.id)

  socket.on('join_transcription', (data) => {
    const { roomId, userId } = data
    socket.join(`transcription:${roomId}`)
    console.log(`👤 User ${userId} joined transcription room ${roomId}`)
  })

  socket.on('leave_transcription', (data) => {
    const { roomId } = data
    socket.leave(`transcription:${roomId}`)
  })

  socket.on('audio_data', async (data) => {
    if (!transcriber) {
      socket.emit('transcription_error', { error: 'Model not loaded' })
      return
    }

    try {
      const { roomId, audioData, sequenceNumber } = data
      const audioBuffer = Buffer.from(audioData, 'base64')
      
      const result = await transcriber(audioBuffer, {
        task: 'transcribe',
        language: 'en',
        chunk_length_s: 30,
        stride_length_s: 5,
      })

      socket.emit('transcription_result', {
        roomId,
        text: result.text || '',
        sequence: sequenceNumber
      })

      socket.to(`transcription:${roomId}`).emit('transcription_broadcast', {
        text: result.text || '',
        sequence: sequenceNumber
      })

    } catch (error) {
      console.error('Transcription error:', error)
      socket.emit('transcription_error', { error: error.message })
    }
  })

  socket.on('audio_chunk', async (data) => {
    if (!transcriber) {
      socket.emit('transcription_error', { error: 'Model not loaded' })
      return
    }

    try {
      const { audio, roomId, chunkId } = data
      const audioBuffer = Buffer.from(audio, 'base64')
      
      const result = await transcriber(audioBuffer, {
        task: 'transcribe',
        language: 'en',
        chunk_length_s: 5,
        stride_length_s: 1,
      })

      if (result.text && result.text.trim()) {
        socket.emit('transcription_partial', {
          roomId,
          text: result.text.trim(),
          chunkId
        })
      }
    } catch (error) {
      // Silently ignore errors for real-time chunks
    }
  })

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id)
  })
})

// Start server
initWhisper().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🎤 Transcription service running on port ${PORT}`)
    console.log(`   WebSocket endpoint: ws://localhost:${PORT}`)
    console.log(`   REST API: http://localhost:${PORT}/api/transcription/status`)
    console.log(`   Health check: http://localhost:${PORT}/health`)
    console.log(`   CORS origin: ${FRONTEND_URL}`)
  })
})

export default app