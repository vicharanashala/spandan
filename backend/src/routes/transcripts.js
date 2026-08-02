import express from 'express'
import Transcript from '../models/Transcript.js'
import { authenticate } from '../middleware/auth.js'
import { roomAccess } from '../middleware/roomAccess.js'

const router = express.Router()

// Create a new transcript entry.
// Authorization: only the room's OWNING teacher may write a transcript for it.
router.post('/', authenticate, roomAccess('owner'), async (req, res) => {
  try {
    const { roomId, segmentIndex, text, duration, wordCount, source } = req.body

    if (segmentIndex === undefined || !text) {
      return res.status(400).json({ error: 'roomId, segmentIndex, and text are required' })
    }

    const transcript = new Transcript({
      roomId,
      segmentIndex,
      source: source === 'paste' ? 'paste' : 'audio',
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
router.get('/room/:roomId', authenticate, roomAccess('member'), async (req, res) => {
  try {
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
router.get('/:roomId/:segmentIndex', authenticate, roomAccess('member'), async (req, res) => {
  try {
    const { roomId, segmentIndex } = req.params

    const transcript = await Transcript.findOne({ 
      roomId: roomId,
      segmentIndex: parseInt(segmentIndex)
    })

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