import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { getDiscussionForRoom } from './transcription.js'

const router = express.Router()

// GET /api/discussion/:roomId/transcript
// Returns a formatted discussion transcript string for the given room
router.get('/:roomId/transcript', authenticate, authorize('teacher'), (req, res) => {
  try {
    const { roomId } = req.params
    if (!roomId) return res.status(400).json({ success: false, error: 'roomId required' })

    const entries = getDiscussionForRoom(roomId)

    // Build formatted transcript in chronological order
    // Format each entry as: "Teacher: text" or "Student (Name): text"
    const lines = entries.map(e => {
      const roleLabel = e.speakerRole === 'teacher' ? 'Teacher' : 'Student'
      const namePart = e.speakerName ? ` (${e.speakerName})` : ''
      return `${roleLabel}${namePart}: ${e.text}`
    })

    const formatted = lines.join('\n\n')
    const hasStudentEntries = entries.some(e => e.speakerRole === 'student')

    res.json({ success: true, transcript: formatted, entriesCount: entries.length, hasStudentEntries })
  } catch (err) {
    console.error('Failed to get discussion transcript:', err)
    res.status(500).json({ success: false, error: 'Failed to retrieve discussion transcript' })
  }
})

export default router
