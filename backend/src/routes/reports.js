import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { AsyncParser } from 'json2csv'
import PDFDocument from 'pdfkit'
import User from '../models/User.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import Response from '../models/Response.js'
import Question from '../models/Question.js'
import { GoogleClassroomConnector } from '../services/lms/GoogleClassroomConnector.js'
import { MoodleConnector } from '../services/lms/MoodleConnector.js'

const router = express.Router()

// Ensure only teachers can access reporting
router.use(authenticate, authorize('teacher'))

// Helper to verify room ownership
const verifyRoomOwnership = async (roomId, teacherId) => {
  const room = await Room.findById(roomId)
  if (!room) throw new Error('Room not found')
  if (room.teacher.toString() !== teacherId.toString()) throw new Error('Not authorized for this room')
  return room
}

// GET /api/reports/:roomId/attendance.csv
router.get('/:roomId/attendance.csv', async (req, res) => {
  try {
    await verifyRoomOwnership(req.params.roomId, req.user._id)
    
    // Get all members who joined the room
    const members = await RoomMember.find({ roomId: req.params.roomId }).populate('studentId')
    
    // Get all responses to determine participation
    const responses = await Response.aggregate([
      { $match: { roomId: req.params.roomId } },
      { $group: { _id: '$studentId', count: { $sum: 1 } } }
    ])
    
    const responseCountMap = {}
    responses.forEach(r => {
      responseCountMap[r._id.toString()] = r.count
    })

    const records = members.map(m => {
      const student = m.studentId
      if (!student) return null // handle deleted users
      
      const questionsAnswered = responseCountMap[student._id.toString()] || 0
      
      // Calculate total time spent (in minutes)
      const joinedAt = m.joinedAt || new Date()
      const leftAt = m.leftAt || new Date()
      const timeInRoomMs = Math.max(0, leftAt - joinedAt)
      const timeInRoomMin = (timeInRoomMs / 60000).toFixed(2)

      return {
        StudentName: student.name || student.email,
        Email: student.email,
        JoinedAt: m.joinedAt ? m.joinedAt.toISOString() : 'N/A',
        TimeSpentMinutes: timeInRoomMin,
        QuestionsAnswered: questionsAnswered,
        Participated: questionsAnswered > 0 ? 'Yes' : 'No'
      }
    }).filter(r => r !== null)

    const parser = new AsyncParser()
    const csv = await parser.parse(records).promise()

    res.header('Content-Type', 'text/csv')
    res.attachment(`attendance-${req.params.roomId}.csv`)
    res.send(csv)
  } catch (error) {
    console.error('Error generating attendance CSV:', error)
    res.status(500).json({ error: error.message || 'Failed to generate attendance export' })
  }
})

// GET /api/reports/:roomId/analytics/csv
router.get('/:roomId/analytics/csv', async (req, res) => {
  try {
    await verifyRoomOwnership(req.params.roomId, req.user._id)
    
    // Get leaderboard
    const leaderboardData = await Response.aggregate([
      { $match: { roomId: req.params.roomId } },
      { $group: {
        _id: '$studentId',
        totalPoints: { $sum: '$points' },
        correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } },
        totalAnswered: { $sum: 1 },
        avgResponseTime: { $avg: '$responseTime' },
        tabSwitches: { $sum: { $cond: ['$tabSwitched', 1, 0] } }
      }},
      { $sort: { totalPoints: -1 } }
    ])
    
    // Fetch user details for all in leaderboard
    const userIds = leaderboardData.map(d => d._id)
    const users = await User.find({ _id: { $in: userIds } })
    const userMap = {}
    users.forEach(u => { userMap[u._id.toString()] = u })

    // Generate CSV data
    const records = leaderboardData.map((d, index) => {
      const user = userMap[d._id.toString()]
      return {
        Rank: index + 1,
        StudentName: user ? (user.name || user.email) : 'Unknown',
        Email: user ? user.email : 'Unknown',
        TotalScore: d.totalPoints,
        CorrectAnswers: d.correctCount,
        QuestionsAnswered: d.totalAnswered,
        AvgResponseTimeSec: d.avgResponseTime ? (d.avgResponseTime / 1000).toFixed(2) : '0.00',
        TabSwitches: d.tabSwitches || 0
      }
    })

    const parser = new AsyncParser()
    const csv = await parser.parse(records).promise()

    res.header('Content-Type', 'text/csv')
    res.attachment(`analytics-${req.params.roomId}.csv`)
    res.send(csv)
  } catch (error) {
    console.error('Error generating analytics CSV:', error)
    res.status(500).json({ error: error.message || 'Failed to generate analytics export' })
  }
})

// GET /api/reports/:roomId/analytics/pdf
router.get('/:roomId/analytics/pdf', async (req, res) => {
  try {
    const room = await verifyRoomOwnership(req.params.roomId, req.user._id)
    
    // Total responses and students
    const totalResponses = await Response.countDocuments({ roomId: req.params.roomId })
    const uniqueStudents = (await Response.distinct('studentId', { roomId: req.params.roomId })).length
    const totalQuestions = await Question.countDocuments({ roomId: req.params.roomId })
    
    // Question breakdown
    const questions = await Question.find({ roomId: req.params.roomId }).lean()
    const questionStats = await Promise.all(questions.map(async (q) => {
      const responses = await Response.find({ roomId: req.params.roomId, questionId: q._id })
      let correctCount = 0
      q.options.forEach((opt, idx) => {
        if (opt.isCorrect) {
          correctCount += responses.filter(r => r.selectedOption === idx).length
        }
      })
      return {
        question: q.question,
        totalResponses: responses.length,
        correctCount,
        accuracy: responses.length > 0 ? Math.round((correctCount / responses.length) * 100) : 0
      }
    }))
    
    const overallAccuracy = totalResponses > 0 
      ? Math.round((questionStats.reduce((sum, q) => sum + q.correctCount, 0) / totalResponses) * 100) 
      : 0

    // Create PDF
    const doc = new PDFDocument()
    res.header('Content-Type', 'application/pdf')
    res.attachment(`analytics-${req.params.roomId}.pdf`)
    doc.pipe(res)

    // Title
    doc.fontSize(20).text(`Session Analytics Report`, { align: 'center' })
    doc.moveDown()
    
    doc.fontSize(14).text(`Room: ${room.name} (${room.code})`)
    doc.fontSize(12).text(`Date: ${room.createdAt.toLocaleDateString()}`)
    doc.moveDown()
    
    // Class Summary
    doc.fontSize(16).text('Class Summary', { underline: true })
    doc.fontSize(12).text(`Total Students Participated: ${uniqueStudents}`)
    doc.text(`Total Questions: ${totalQuestions}`)
    doc.text(`Total Responses: ${totalResponses}`)
    doc.text(`Overall Class Accuracy: ${overallAccuracy}%`)
    doc.moveDown()
    
    // Question Breakdown
    doc.fontSize(16).text('Per-Question Breakdown', { underline: true })
    doc.moveDown()
    
    questionStats.forEach((q, index) => {
      doc.fontSize(12).text(`Q${index + 1}: ${q.question}`, { continued: true }).text(` - ${q.accuracy}% Correct`, { align: 'right' })
      doc.fontSize(10).text(`Responses: ${q.totalResponses} | Correct: ${q.correctCount}`, { color: 'gray' })
      doc.moveDown()
    })
    
    doc.end()
  } catch (error) {
    console.error('Error generating PDF:', error)
    res.status(500).json({ error: error.message || 'Failed to generate PDF' })
  }
})

// POST /api/reports/:roomId/push-grades
router.post('/:roomId/push-grades', async (req, res) => {
  try {
    await verifyRoomOwnership(req.params.roomId, req.user._id)
    
    const { provider, courseId, assignmentId } = req.body
    
    // Calculate session scores for all students
    const leaderboardData = await Response.aggregate([
      { $match: { roomId: req.params.roomId } },
      { $group: {
        _id: '$studentId',
        totalPoints: { $sum: '$points' }
      }}
    ])
    
    const userIds = leaderboardData.map(d => d._id)
    const users = await User.find({ _id: { $in: userIds } })
    const userMap = {}
    users.forEach(u => { userMap[u._id.toString()] = u })

    const sessionResults = leaderboardData.map(d => {
      const user = userMap[d._id.toString()]
      return {
        studentEmail: user ? user.email : '',
        score: d.totalPoints
      }
    }).filter(r => r.studentEmail !== '')

    // Get teacher integrations
    const teacher = await User.findById(req.user._id)
    
    let connector
    let config = { courseId, courseWorkId: assignmentId, assignmentId }
    
    if (provider === 'googleClassroom') {
      connector = new GoogleClassroomConnector()
      config.tokens = teacher.lmsIntegrations?.googleClassroom
      if (!config.tokens || !config.tokens.refreshToken) {
        return res.status(401).json({ error: 'Google Classroom not connected or missing refresh token' })
      }
    } else if (provider === 'moodle') {
      connector = new MoodleConnector()
      config.moodleUrl = teacher.lmsIntegrations?.moodle?.url
      config.token = teacher.lmsIntegrations?.moodle?.token
    } else {
      return res.status(400).json({ error: 'Unsupported LMS provider' })
    }

    const pushResults = await connector.pushGrades(sessionResults, config)

    res.json({ success: true, results: pushResults })
  } catch (error) {
    console.error('Error pushing grades:', error)
    res.status(500).json({ error: error.message || 'Failed to push grades' })
  }
})

export default router
