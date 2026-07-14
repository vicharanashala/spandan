import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import Room from '../models/Room.js'
import MisconceptionAnalysis from '../models/MisconceptionAnalysis.js'
import Homework from '../models/Homework.js'
import RevisionSheet from '../models/RevisionSheet.js'
import SessionAnalytics from '../models/SessionAnalytics.js'
import StudentWeakTopic from '../models/StudentWeakTopic.js'
import { analyzeMisconceptions, getMisconceptionHeatmap } from '../services/misconceptionService.js'
import { generateHomework, generateHomeworkForAll, getStudentHomework, getPendingHomework } from '../services/homeworkService.js'
import { generateRevisionSheet, generateSessionRevisionSheet, getRevisionSheets, updateRevisionSheet } from '../services/revisionService.js'

const router = express.Router()
router.use(authenticate)

// ─── Misconception Heatmap ────────────────────────────────────────────

// GET /api/insights/misconceptions/:roomId - Get aggregated heatmap for a room
router.get('/misconceptions/:roomId', authorize('teacher'), async (req, res) => {
  try {
    const heatmap = await getMisconceptionHeatmap(req.params.roomId)
    const analyses = await MisconceptionAnalysis.find({ roomId: req.params.roomId })
      .sort({ generatedAt: -1 })
      .populate('questionId', 'question')

    res.json({ success: true, heatmap, analyses })
  } catch (error) {
    console.error('Error fetching misconception heatmap:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch misconception heatmap' })
  }
})

// GET /api/insights/misconceptions/:roomId/student/:studentId - Student weak topics
router.get('/misconceptions/:roomId/student/:studentId', async (req, res) => {
  try {
    const weakTopic = await StudentWeakTopic.findOne({
      studentId: req.params.studentId,
      roomId: req.params.roomId
    })
    res.json({ success: true, weakTopic })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch student weak topics' })
  }
})

// ─── Homework ─────────────────────────────────────────────────────────

// POST /api/insights/homework/generate-all - Generate homework for all students
router.post('/homework/generate-all', authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.body
    if (!roomId) return res.status(400).json({ error: 'roomId is required' })

    const questions = await Question.find({ roomId, status: 'approved' }).sort({ createdAt: -1 })
    const allResponses = await Response.find({ roomId })

    if (questions.length === 0) {
      return res.status(400).json({ error: 'No approved questions found for this room' })
    }

    const homeworks = await generateHomeworkForAll(roomId, allResponses, questions)
    res.json({ success: true, homeworks, count: homeworks.length })
  } catch (error) {
    console.error('Error generating homework for all:', error)
    res.status(500).json({ success: false, error: 'Failed to generate homework' })
  }
})

// POST /api/insights/homework/generate-student - Generate homework for one student
router.post('/homework/generate-student', authorize('teacher'), async (req, res) => {
  try {
    const { roomId, studentId } = req.body
    if (!roomId || !studentId) return res.status(400).json({ error: 'roomId and studentId required' })

    const questions = await Question.find({ roomId, status: 'approved' }).sort({ createdAt: -1 })
    const allResponses = await Response.find({ roomId })
    const latestQuestion = questions[0]

    if (!latestQuestion) return res.status(400).json({ error: 'No questions found' })

    const homework = await generateHomework(studentId, roomId, latestQuestion, allResponses)
    res.json({ success: true, homework })
  } catch (error) {
    console.error('Error generating student homework:', error)
    res.status(500).json({ success: false, error: 'Failed to generate homework' })
  }
})

// GET /api/insights/homework/:roomId - Get all pending homework for a room
router.get('/homework/:roomId', authorize('teacher'), async (req, res) => {
  try {
    const homework = await getPendingHomework(req.params.roomId)
    res.json({ success: true, homework })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch homework' })
  }
})

// GET /api/insights/homework/student/:studentId/:roomId - Get student's homework
router.get('/homework/student/:studentId/:roomId', async (req, res) => {
  try {
    const homework = await getStudentHomework(req.params.studentId, req.params.roomId)
    res.json({ success: true, homework })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch student homework' })
  }
})

// ─── Revision Sheets ──────────────────────────────────────────────────

// POST /api/insights/revision/generate - Generate a session-wide revision sheet
// Uses all questions and responses for the room — no single questionId required
router.post('/revision/generate', authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.body

    if (!roomId) {
      return res.status(400).json({ success: false, message: 'roomId is missing' })
    }

    console.log('Generating session revision sheet for roomId:', roomId)

    const questions = await Question.find({ roomId, status: 'approved' }).sort({ createdAt: -1 })

    if (questions.length === 0) {
      return res.status(400).json({ success: false, message: 'No approved questions found for this session. Complete a poll first.' })
    }

    const allResponses = await Response.find({ roomId })

    console.log(`Found ${questions.length} question(s) and ${allResponses.length} response(s)`)

    const sheet = await generateSessionRevisionSheet(roomId, questions, allResponses)

    const ioInstance = req.app.get('io')
    if (ioInstance) {
      const room = await Room.findById(roomId)
      if (room) {
        ioInstance.to(room.code).emit('revision_sheet_generated', { sheet })
      }
    }

    res.json({ success: true, sheet })
  } catch (error) {
    console.error('Error generating session revision sheet:', error)
    res.status(500).json({ success: false, message: 'Failed to generate revision sheet' })
  }
})

// GET /api/insights/revision/:roomId - Get all revision sheets for a room
router.get('/revision/:roomId', async (req, res) => {
  try {
    const sheets = await getRevisionSheets(req.params.roomId)
    res.json({ success: true, sheets })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch revision sheets' })
  }
})

// PUT /api/insights/revision/:sheetId - Update a revision sheet
router.put('/revision/:sheetId', authorize('teacher'), async (req, res) => {
  try {
    const sheet = await updateRevisionSheet(req.params.sheetId, req.body)
    res.json({ success: true, sheet })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update revision sheet' })
  }
})

// ─── Session Analytics ────────────────────────────────────────────────

// GET /api/insights/analytics/:roomId - Session analytics summary
router.get('/analytics/:roomId', authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.params
    const questions = await Question.find({ roomId, status: 'approved' })
    const allResponses = await Response.find({ roomId })
    const students = await StudentWeakTopic.find({ roomId })
    const homeworks = await Homework.find({ roomId })
    const misconceptions = await MisconceptionAnalysis.find({ roomId })

    const totalQuestions = questions.length
    const totalStudents = students.length
    const totalHomeworkAssigned = homeworks.length
    const totalHomeworkSubmitted = homeworks.filter(h => h.status !== 'pending').length

    const questionCorrectPcts = questions.map(q => {
      const qResponses = allResponses.filter(r => r.questionId.toString() === q._id.toString())
      const correct = qResponses.filter(r => r.isCorrect).length
      return qResponses.length > 0 ? Math.round((correct / qResponses.length) * 100) : 0
    })

    const averageCorrectPercentage = questionCorrectPcts.length > 0
      ? Math.round(questionCorrectPcts.reduce((a, b) => a + b, 0) / questionCorrectPcts.length)
      : 0

    const overallConfusion = misconceptions.length > 0
      ? Math.round(misconceptions.reduce((s, m) => s + (m.overallConfusionScore || 0), 0) / misconceptions.length)
      : 0

    const studentPerformance = students.map(s => ({
      studentId: s.studentId,
      studentName: '',
      accuracy: s.overallAccuracy,
      totalPoints: 0,
      questionsAttempted: s.totalQuestionsAttempted,
      weakTopics: s.subtopics.filter(st => st.score > 50).map(st => st.name)
    }))

    const analytics = {
      roomId,
      totalQuestions,
      totalStudents,
      overallParticipation: students.length > 0
        ? Math.round(students.reduce((s, st) => s + st.participationRate, 0) / students.length)
        : 0,
      averageScore: allResponses.length > 0
        ? Math.round(allResponses.reduce((s, r) => s + (r.points || 0), 0) / allResponses.length)
        : 0,
      averageCorrectPercentage,
      confusionScore: overallConfusion,
      understandingScore: 100 - overallConfusion,
      totalHomeworkAssigned,
      totalHomeworkSubmitted,
      studentPerformance
    }

    res.json({ success: true, analytics })
  } catch (error) {
    console.error('Error fetching session analytics:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' })
  }
})

// POST /api/insights/after-poll - Run after every poll: analyze, homework, revision
router.post('/after-poll', authorize('teacher'), async (req, res) => {
  try {
    const { questionId } = req.body
    if (!questionId) return res.status(400).json({ error: 'questionId is required' })

    const question = await Question.findById(questionId)
    if (!question) return res.status(404).json({ error: 'Question not found' })

    const room = await Room.findById(question.roomId)
    if (!room) return res.status(404).json({ error: 'Room not found' })

    const responses = await Response.find({ questionId })
    const roomId = question.roomId

    // Run misconception analysis
    const analysis = await analyzeMisconceptions(question, responses, roomId)

    // Generate revision sheet
    let revisionSheet = null
    try {
      revisionSheet = await generateRevisionSheet(roomId, question, responses)
    } catch (e) {
      console.error('Revision sheet generation skipped:', e.message)
    }

    const ioInstance = req.app.get('io')
    if (ioInstance) {
      ioInstance.to(room.code).emit('misconception_updated', {
        analysis,
        questionId: question._id.toString()
      })
      if (revisionSheet) {
        ioInstance.to(room.code).emit('revision_sheet_generated', { sheet: revisionSheet })
      }
    }

    res.json({
      success: true,
      analysis,
      revisionSheet,
      message: 'Misconception analysis and revision sheet generated.'
    })
  } catch (error) {
    console.error('Error in after-poll processing:', error)
    res.status(500).json({ success: false, error: 'Failed to process after-poll analysis' })
  }
})

export default router
