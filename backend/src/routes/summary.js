import express from 'express'
import { authenticate } from '../middleware/auth.js'
import * as sessionSummaryService from '../services/sessionSummaryService.js'

const router = express.Router()

// Apply authentication to all routes
router.use(authenticate)

// In-memory cooldown tracker so "Regenerate" can't be spammed and hammer the
// AI provider. Keyed by roomId -> timestamp of last generation attempt.
// This is intentionally process-local (no schema/DB changes needed); worst
// case on a server restart is the cooldown resets, which is harmless.
const lastGenerationAttempt = new Map()
const REGENERATE_COOLDOWN_MS = 15000 // 15s between generate calls per room

/**
 * POST /api/summary/generate/:roomId
 * Generate (or regenerate) a session summary for a room
 * Authorization: teacher who owns the room, OR a student who is a member of the room
 */
router.post('/generate/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params

    const Question = (await import('../models/Question.js')).default
    const Response = (await import('../models/Response.js')).default
    const Transcript = (await import('../models/Transcript.js')).default
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default

    const room = await Room.findById(roomId)
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' })

    const isTeacher = room.teacher.toString() === req.user._id.toString()
    const isStudentMember = isTeacher ? null : await RoomMember.findOne({ roomId, studentId: req.user._id })

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ success: false, error: 'Not authorized' })
    }

    // Basic cooldown to prevent regenerate spam from any one room
    const lastAttempt = lastGenerationAttempt.get(roomId)
    if (lastAttempt && Date.now() - lastAttempt < REGENERATE_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((REGENERATE_COOLDOWN_MS - (Date.now() - lastAttempt)) / 1000)
      return res.status(429).json({
        success: false,
        error: `Please wait ${waitSeconds}s before regenerating again`
      })
    }
    lastGenerationAttempt.set(roomId, Date.now())

    const allQuestions = await Question.find({ roomId, status: 'approved' }).lean()
    const allResponses = await Response.find({ roomId }).lean()
    const allTranscripts = await Transcript.find({ roomId }).lean()

    const summary = await sessionSummaryService.generateSessionSummary(
      room,
      allQuestions,
      allResponses,
      allTranscripts
    )

    await Room.findByIdAndUpdate(roomId, { summary })

    res.json({ success: true, summary })
  } catch (error) {
    console.error('Error generating session summary:', error)
    res.status(500).json({ success: false, error: error.message || 'Failed to generate session summary' })
  }
})

/**
 * GET /api/summary/:roomId
 * Get the session summary for a room
 * Authorization: teacher (must own the room) or student (must be a member)
 */
router.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default
    
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Check access: teacher owns room OR student is a member
    const isTeacher = room.teacher.toString() === req.user._id.toString()
    const isStudentMember = await RoomMember.findOne({ roomId, studentId: req.user._id })

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to view this summary' })
    }
    
    res.json({
      success: true,
      summary: room.summary || null
    })
  } catch (error) {
    console.error('Error fetching session summary:', error)
    res.status(500).json({ error: 'Failed to fetch summary' })
  }
})

export default router