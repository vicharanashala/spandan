import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import Room from '../models/Room.js'
import {
  analyzeQuestion,
  classifyQuestions,
  generateRecommendation,
  parseThreshold
} from '../services/revisionService.js'

const router = express.Router()

router.use(authenticate)

// GET /api/revision-suggestions/:roomId?threshold=50
router.get('/:roomId', authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.params
    const threshold = parseThreshold(req.query.threshold)

    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' })
    }
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized to view suggestions for this room' })
    }

    const questions = await Question.find({ roomId, status: 'approved' }).lean()

    const questionAnalysis = await Promise.all(
      questions.map(async (q) => {
        const responses = await Response.find({ roomId, questionId: q._id }).lean()
        return analyzeQuestion(q, responses)
      })
    )

    const answeredQuestions = questionAnalysis.filter(q => q.totalResponses > 0)
    const { reviseInClass, provideNotes, hardestQuestion, mostWrongTopic } =
      classifyQuestions(answeredQuestions, threshold)

    const recommendation = generateRecommendation(reviseInClass, provideNotes, mostWrongTopic)

    res.json({
      success: true,
      reviseInClass,
      provideNotes,
      hardestQuestion: hardestQuestion?.wrongCount > 0 ? hardestQuestion : null,
      mostWrongTopic: mostWrongTopic?.totalWrong > 0 ? mostWrongTopic : null,
      recommendation,
      threshold,
      totalQuestions: questions.length,
      totalAnswered: answeredQuestions.length
    })
  } catch (error) {
    console.error('Error generating revision suggestions:', error)
    res.status(500).json({ success: false, error: 'Failed to generate revision suggestions' })
  }
})

export default router
