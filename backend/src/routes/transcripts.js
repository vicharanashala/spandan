import express from 'express'
import Transcript from '../models/Transcript.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = express.Router()

// Create a new transcript entry
router.post('/', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { roomId, segmentIndex, text, duration, wordCount } = req.body

    if (!roomId || segmentIndex === undefined || !text) {
      return res.status(400).json({ error: 'roomId, segmentIndex, and text are required' })
    }

    const transcript = new Transcript({
      roomId,
      segmentIndex,
      teacherId: req.user._id,
      text,
      duration: duration || 0,
      wordCount: wordCount || text.split(/\s+/).length
    })

    await transcript.save()

    res.status(201).json({
      success: true,
      transcript
    })
  } catch (error) {
    console.error('Failed to save transcript:', error)
    res.status(500).json({ error: 'Failed to save transcript' })
  }
})

// Get all transcripts for a room
router.get('/room/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params
    const currentUser = req.user

    // Verify room exists and user has access
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Check access: teacher owns room OR student is a member
    const isTeacher = room.teacher.toString() === currentUser._id.toString()
    const isStudentMember = await RoomMember.findOne({ roomId, studentId: currentUser._id })

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to access transcripts for this room' })
    }

    const transcripts = await Transcript.find({ 
      roomId: req.params.roomId 
    }).sort({ segmentIndex: 1 })

    res.json({
      success: true,
      transcripts
    })
  } catch (error) {
    console.error('Failed to fetch transcripts:', error)
    res.status(500).json({ error: 'Failed to fetch transcripts' })
  }
})

// Get transcript by room and segment
router.get('/:roomId/:segmentIndex', authenticate, async (req, res) => {
  try {
    const { roomId, segmentIndex } = req.params
    const currentUser = req.user

    // Verify room exists and user has access
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Check access: teacher owns room OR student is a member
    const isTeacher = room.teacher.toString() === currentUser._id.toString()
    const isStudentMember = await RoomMember.findOne({ roomId, studentId: currentUser._id })

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to access this transcript' })
    }

    const transcript = await Transcript.findOne({ 
      roomId: roomId,
      segmentIndex: parseInt(segmentIndex)
    })

    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' })
    }

    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' })
    }

    res.json({
      success: true,
      transcript
    })
  } catch (error) {
    console.error('Failed to fetch transcript:', error)
    res.status(500).json({ error: 'Failed to fetch transcript' })
  }
})

export default router