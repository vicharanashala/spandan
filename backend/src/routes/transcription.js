import express from 'express'
import { pipeline } from '@xenova/transformers'
import User from '../models/User.js'
import Room from '../models/Room.js'

// In-memory discussion transcripts: Map<roomId, Array<entry>>
// entry: { speakerRole, speakerName, text, timestamp }
const discussionTranscripts = new Map()

const addDiscussionEntry = (roomId, entry) => {
  if (!roomId) return
  // Only append if a discussion session has been initialized for this room
  if (!discussionTranscripts.has(String(roomId))) return
  discussionTranscripts.get(String(roomId)).push(entry)
}

export const initDiscussionForRoom = (roomId) => {
  if (!roomId) return
  discussionTranscripts.set(String(roomId), [])
}

export const getDiscussionForRoom = (roomId) => {
  return discussionTranscripts.get(roomId) || []
}

export const clearDiscussionForRoom = (roomId) => {
  discussionTranscripts.delete(roomId)
}

const router = express.Router()

let transcriber = null
let isInitialized = false

// Initialize Whisper model
async function initWhisper() {
  if (isInitialized) return transcriber
  
  try {
    console.log('Loading Whisper model on server...')
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base')
    isInitialized = true
    console.log('Whisper model loaded successfully on server!')
    return transcriber
  } catch (error) {
    console.error('Failed to load Whisper model:', error)
    throw error
  }
}

// Health check
router.get('/status', async (req, res) => {
  res.json({ 
    status: isInitialized ? 'ready' : 'loading',
    model: 'whisper-base'
  })
})

// Transcribe audio chunk
router.post('/transcribe', async (req, res) => {
  try {
    if (!transcriber) {
      return res.status(503).json({ error: 'Transcription model not ready' })
    }

    const { audio, sampleRate, speakerRole, speakerId, roomId } = req.body // base64 encoded audio
    if (!audio) {
      return res.status(400).json({ error: 'No audio provided' })
    }

    const audioBuffer = Buffer.from(audio, 'base64')
    
    // For WAV files, skip the header (44 bytes) and get the PCM data
    let pcmData
    if (audioBuffer.length > 44 && audioBuffer.toString('ascii', 0, 4) === 'RIFF') {
      pcmData = audioBuffer.slice(44)
    } else {
      pcmData = audioBuffer
    }
    
    // Convert Int16 PCM to Float32
    const float32Data = new Float32Array(pcmData.length / 2)
    const view = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength)
    for (let i = 0; i < float32Data.length; i++) {
      float32Data[i] = view.getInt16(i * 2, true) / 32768
    }

    if (speakerRole || speakerId || roomId) {
      console.log(`Transcription metadata: role=${speakerRole || 'unknown'} id=${speakerId || 'none'} room=${roomId || 'none'}`)
    }
    
    const result = await transcriber(float32Data, {
      task: 'transcribe',
      language: 'en',
    })

    // After successful transcription, record an in-memory discussion entry
    try {
      const text = result.text || ''
      let speakerName = null
      if (speakerId) {
        const user = await User.findById(speakerId).lean()
        if (user) speakerName = user.name
      }
      // If no speakerName and roomId present, and role is teacher, try to get room teacher name
      if (!speakerName && roomId && speakerRole === 'teacher') {
        const room = await Room.findById(roomId).lean()
        if (room && room.teacher) {
          const teacher = await User.findById(room.teacher).lean()
          if (teacher) speakerName = teacher.name
        }
      }
      const entry = {
        speakerRole: speakerRole || 'unknown',
        speakerName: speakerName || (speakerRole === 'teacher' ? 'Teacher' : 'Student'),
        text,
        timestamp: new Date().toISOString()
      }
      if (roomId) addDiscussionEntry(roomId, entry)
    } catch (err) {
      console.error('Failed to append discussion entry:', err)
    }

    res.json({ 
      text: result.text || '',
      segments: result.segments || [],
      metadata: {
        speakerRole: speakerRole || 'unknown',
        speakerId: speakerId || null,
        roomId: roomId || null
      }
    })
  } catch (error) {
    console.error('Transcription error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Initialize on module load
initWhisper().catch(console.error)

export default router