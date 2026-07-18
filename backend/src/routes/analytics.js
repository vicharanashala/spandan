import express from 'express'
import { authenticate } from '../middleware/auth.js'
import { getQuestionQuality } from '../services/analyticsService.js'

const router = express.Router()

// Apply authentication to all analytics routes
router.use(authenticate)

// GET /api/analytics/question-quality/:roomId
// Returns psychometric quality scores for all questions in a room.
// Authorization: teacher (room owner) or student (room member)
router.get('/question-quality/:roomId', async (req, res) => {
  try {
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default

    const { roomId } = req.params
    const currentUser = req.user

    // Verify room exists
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' })
    }

    // Authorization: teacher must own the room, student must be a member
    const isTeacher = room.teacher.toString() === currentUser._id.toString()
    const isStudentMember = await RoomMember.findOne({
      roomId,
      studentId: currentUser._id
    })

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view analytics for this room'
      })
    }

    // Compute question quality metrics
    const questions = await getQuestionQuality(roomId)

    // Compute room-level summary
    const answeredQuestions = questions.filter(q => q.responseCount >= 3)
    const summary = {
      totalQuestions: questions.length,
      analyzedQuestions: answeredQuestions.length,
      avgDifficulty: avg(answeredQuestions.map(q => q.difficulty)),
      avgDiscrimination: avg(answeredQuestions.map(q => q.discriminationIndex)),
      avgQualityScore: avg(answeredQuestions.map(q => q.qualityScore)),
      avgResponseRate: avg(answeredQuestions.map(q => q.responseRate)),
      labelDistribution: countLabels(answeredQuestions)
    }

    res.json({
      success: true,
      roomId,
      questions,
      summary
    })
  } catch (error) {
    console.error('Error computing question quality:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to compute question quality analytics'
    })
  }
})

/**
 * Compute the average of an array of numbers. Returns 0 for empty arrays.
 */
function avg(arr) {
  if (!arr || arr.length === 0) return 0
  const sum = arr.reduce((s, v) => s + v, 0)
  return Math.round((sum / arr.length) * 100) / 100
}

/**
 * Count how many questions fall into each quality label.
 */
function countLabels(questions) {
  const counts = {}
  questions.forEach(q => {
    counts[q.qualityLabel] = (counts[q.qualityLabel] || 0) + 1
  })
  return counts
}

export default router
