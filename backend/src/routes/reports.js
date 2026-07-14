import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import QuestionReport from '../models/QuestionReport.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import Room from '../models/Room.js'
import { aiService } from '../services/aiService.js'
import { sanitizeObject } from '../utils/sanitize.js'

const router = express.Router()

router.use(authenticate)

// GET /api/reports/analytics - Report analytics for a room
router.get('/analytics', authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.query
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' })
    }

    const room = await Room.findById(roomId)
    if (!room || room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    const reports = await QuestionReport.find({ roomId }).lean()
    const total = reports.length
    const pending = reports.filter(r => r.status === 'Pending').length
    const accepted = reports.filter(r => r.status === 'Accepted').length
    const rejected = reports.filter(r => r.status === 'Rejected').length
    const reviewed = reports.filter(r => r.status === 'Reviewed').length

    const questionCounts = {}
    reports.forEach(r => {
      const qId = r.questionId.toString()
      questionCounts[qId] = (questionCounts[qId] || 0) + 1
    })
    const mostReported = Object.entries(questionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([questionId, count]) => ({ questionId, count }))

    const studentCounts = {}
    reports.forEach(r => {
      const sId = r.studentId.toString()
      studentCounts[sId] = (studentCounts[sId] || 0) + 1
    })
    const frequentReporters = Object.entries(studentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([studentId, count]) => {
        const report = reports.find(r => r.studentId.toString() === studentId)
        return { studentId, studentName: report?.studentName || 'Unknown', count }
      })

    res.json({
      success: true,
      analytics: { total, pending, accepted, rejected, reviewed, mostReported, frequentReporters }
    })
  } catch (error) {
    console.error('Error fetching report analytics:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' })
  }
})

// POST /api/reports - Student submits a question report
router.post('/', authorize('student'), async (req, res) => {
  try {
    const { roomId, questionId, reportType, message } = req.body
    const studentId = req.user._id
    const studentName = req.user.name || req.user.email

    if (!roomId || !questionId || !reportType || !message) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Check safety/anti-spam: Prevent duplicate reports from the same student for this question
    const existing = await QuestionReport.findOne({ questionId, studentId })
    if (existing) {
      return res.status(409).json({ error: 'You have already reported this question.' })
    }

    // Fetch question to verify it exists and analyze with Gemini
    const question = await Question.findById(questionId)
    if (!question) {
      return res.status(404).json({ error: 'Question not found' })
    }

    // Fetch room
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // AI Assistance: Ask Gemini to analyze the report
    console.log(`AI analyzing student report for question: ${questionId}...`)
    const aiAnalysis = await aiService.analyzeQuestionReport(question, reportType, message)

    const report = new QuestionReport({
      roomId,
      questionId,
      studentId,
      studentName,
      reportType,
      message,
      aiAnalysis,
      originalQuestionSnapshot: {
        question: question.question,
        options: question.options,
        explanation: question.explanation,
        points: question.points,
        timeToAnswer: question.timeToAnswer
      }
    })

    await report.save()

    // Emit Socket.io event: question_reported
    const ioInstance = req.app.get('io')
    if (ioInstance) {
      console.log(`Emitting question_reported event to room ${room.code}`)
      ioInstance.to(room.code).emit('question_reported', {
        reportId: report._id,
        roomId,
        questionId,
        questionText: question.question,
        studentId,
        studentName,
        reportType,
        message,
        aiAnalysis,
        timestamp: report.timestamp
      })
    }

    res.status(201).json({
      success: true,
      message: 'Your report has been sent to the teacher.',
      report
    })
  } catch (error) {
    console.error('Error creating question report:', error)
    res.status(500).json({ success: false, error: 'Failed to submit report' })
  }
})

// GET /api/reports - Teacher gets all reports for a room
router.get('/', authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.query
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' })
    }

    // Verify room ownership
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to access reports for this room' })
    }

    const reports = await QuestionReport.find({ roomId }).populate('questionId').sort({ timestamp: -1 }).lean()

    res.json({
      success: true,
      reports
    })
  } catch (error) {
    console.error('Error fetching reports:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch reports' })
  }
})

// POST /api/reports/:reportId/status - Update report status (e.g. 'Rejected'/'Reviewed')
router.post('/:reportId/status', authorize('teacher'), async (req, res) => {
  try {
    const { reportId } = req.params
    const { status } = req.body // 'Rejected' (No Mistake) or 'Reviewed'/'Accepted'

    if (!['Pending', 'Reviewed', 'Accepted', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    const report = await QuestionReport.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    // Verify room ownership
    const room = await Room.findById(report.roomId)
    if (!room || room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    report.status = status
    report.reviewedAt = new Date()
    report.teacherDecision = status === 'Rejected' ? 'No Mistake' : status
    await report.save()

    // If teacher selected 'No Mistake' (Rejected), notify student
    if (status === 'Rejected') {
      const ioInstance = req.app.get('io')
      if (ioInstance) {
        ioInstance.to(room.code).emit('report_rejected', {
          studentId: report.studentId.toString(),
          questionId: report.questionId.toString(),
          message: 'The teacher reviewed your report and confirmed that the original question is correct.'
        })
      }
    }

    res.json({
      success: true,
      report
    })
  } catch (error) {
    console.error('Error updating report status:', error)
    res.status(500).json({ success: false, error: 'Failed to update report status' })
  }
})

// POST /api/reports/:reportId/correct - Teacher corrects question and relaunches
router.post('/:reportId/correct', authorize('teacher'), async (req, res) => {
  try {
    const { reportId } = req.params
    const { question: questionText, options, explanation, points, timeToAnswer, roomCode } = req.body

    if (!questionText || !options?.length) {
      return res.status(400).json({ error: 'Question text and options are required' })
    }

    const report = await QuestionReport.findById(reportId)
    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    const room = await Room.findById(report.roomId)
    if (!room || room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    const questionDoc = await Question.findById(report.questionId)
    if (!questionDoc) {
      return res.status(404).json({ error: 'Question not found' })
    }

    const sanitized = sanitizeObject({
      question: questionText,
      options,
      explanation: explanation || '',
      points: points || questionDoc.points,
      timeToAnswer: timeToAnswer || questionDoc.timeToAnswer
    })

    questionDoc.question = sanitized.question
    questionDoc.options = sanitized.options
    questionDoc.explanation = sanitized.explanation
    questionDoc.points = sanitized.points
    questionDoc.timeToAnswer = sanitized.timeToAnswer
    questionDoc.pollSummary = null
    await questionDoc.save()

    await Response.deleteMany({ questionId: questionDoc._id })

    report.status = 'Accepted'
    report.reviewedAt = new Date()
    report.teacherDecision = 'Corrected'
    report.correctedQuestionSnapshot = {
      question: questionDoc.question,
      options: questionDoc.options,
      explanation: questionDoc.explanation,
      points: questionDoc.points,
      timeToAnswer: questionDoc.timeToAnswer
    }
    await report.save()

    const ioInstance = req.app.get('io')
    const code = roomCode || room.code
    if (ioInstance) {
      ioInstance.to(code).emit('question_corrected', {
        questionId: questionDoc._id.toString(),
        question: questionDoc.toObject(),
        message: `The teacher has corrected Question: ${questionDoc.question.substring(0, 60)}`
      })
      ioInstance.to(code).emit('new_question', questionDoc.toObject())
      ioInstance.to(code).emit('leaderboard:updated', { roomCode: code })
    }

    res.json({
      success: true,
      question: questionDoc,
      report
    })
  } catch (error) {
    console.error('Error correcting question:', error)
    res.status(500).json({ success: false, error: 'Failed to correct question' })
  }
})

export default router
