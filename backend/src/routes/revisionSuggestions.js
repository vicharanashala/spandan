import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import Room from '../models/Room.js'
import {
  analyzeQuestion,
  classifyQuestions,
  generateRecommendation,
  parseThreshold,
  getStudentTopicPerformance
} from '../services/revisionService.js'
import Note from '../models/Note.js'

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

// GET /api/revision-suggestions/:roomId/student/:studentId
router.get('/:roomId/student/:studentId', authorize('student'), async (req, res) => {
  try {
    const { roomId, studentId } = req.params

    // Ensure students can only request their own suggestions
    if (req.user._id.toString() !== studentId) {
      return res.status(403).json({ success: false, error: 'Not authorized to view other students suggestions' })
    }

    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' })
    }

    const questions = await Question.find({ roomId, status: 'approved' }).lean()
    const studentResponses = await Response.find({ roomId, studentId }).lean()

    const weakTopics = getStudentTopicPerformance(questions, studentResponses)

    // Try to attach Note IDs if they exist for that segment

    const enrichedWeakTopics = await Promise.all(weakTopics.map(async (topic) => {
      // Prefer a targeted per-question note released specifically for this student
      if (topic.questionIds && topic.questionIds.length > 0) {
        const questionNote = await Note.findOne({
          roomId,
          questionId: { $in: topic.questionIds },
          targetStudentIds: studentId,
          status: 'released'
        }).lean()
        if (questionNote) {
          return { ...topic, noteId: questionNote._id, noteTitle: questionNote.title, noteStatus: 'released' }
        }
      }
      // Fall back to a general segment-level note
      if (topic.segmentIndex !== undefined && topic.segmentIndex !== null) {
        const note = await Note.findOne({ roomId, segmentIndex: topic.segmentIndex, status: 'released' }).lean()
        if (note) {
          return { ...topic, noteId: note._id, noteTitle: note.title, noteStatus: 'released' }
        }
      }
      return { ...topic, noteStatus: 'missing' }
    }))

    res.json({ success: true, weakTopics: enrichedWeakTopics })
  } catch (error) {
    console.error('Error generating student revision suggestions:', error)
    res.status(500).json({ success: false, error: 'Failed to generate suggestions' })
  }
})

export default router
