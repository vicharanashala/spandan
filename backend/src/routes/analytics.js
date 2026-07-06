import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import mongoose from 'mongoose'

const router = express.Router()

router.use(authenticate)

// Helper to get models
const getModels = async () => {
  const Response = (await import('../models/Response.js')).default
  const Question = (await import('../models/Question.js')).default
  const Room = (await import('../models/Room.js')).default
  const User = (await import('../models/User.js')).default
  const RoomMember = (await import('../models/RoomMember.js')).default
  return { Response, Question, Room, User, RoomMember }
}

// GET /api/analytics/room/:roomId/questions - Question Performance
router.get('/room/:roomId/questions', authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.params
    const { Response, Question, Room } = await getModels()

    // Verify ownership
    const room = await Room.findById(roomId)
    if (!room || room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized access to room analytics' })
    }

    const questions = await Question.find({ roomId }).sort({ createdAt: 1 }).lean()
    const questionIds = questions.map(q => q._id)

    // Aggregate responses per question
    const stats = await Response.aggregate([
      { $match: { questionId: { $in: questionIds } } },
      {
        $group: {
          _id: '$questionId',
          totalAnswers: { $sum: 1 },
          correctAnswers: { $sum: { $cond: ['$isCorrect', 1, 0] } },
          avgResponseTime: { $avg: '$responseTime' }
        }
      }
    ])

    const statsMap = stats.reduce((acc, stat) => {
      acc[stat._id.toString()] = stat
      return acc
    }, {})

    const results = questions.map(q => {
      const qStats = statsMap[q._id.toString()] || { totalAnswers: 0, correctAnswers: 0, avgResponseTime: 0 }
      return {
        _id: q._id,
        text: q.question,
        type: q.type,
        timeToAnswer: q.timeToAnswer,
        totalAnswers: qStats.totalAnswers,
        correctAnswers: qStats.correctAnswers,
        correctRate: qStats.totalAnswers > 0 ? (qStats.correctAnswers / qStats.totalAnswers) * 100 : 0,
        avgResponseTime: qStats.avgResponseTime || 0
      }
    })

    res.json({ success: true, questions: results })
  } catch (error) {
    console.error('Error fetching question analytics:', error)
    res.status(500).json({ error: 'Failed to fetch question analytics' })
  }
})

// GET /api/analytics/room/:roomId/students - Student Performance
router.get('/room/:roomId/students', authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.params
    const { Response, Room, RoomMember, Question } = await getModels()

    const room = await Room.findById(roomId)
    if (!room || room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized access to room analytics' })
    }

    const totalQuestions = await Question.countDocuments({ roomId })
    
    // Get all students in the room
    const members = await RoomMember.find({ roomId }).populate('studentId', 'name email').lean()
    
    // Aggregate responses per student
    const stats = await Response.aggregate([
      { $match: { roomId: new mongoose.Types.ObjectId(roomId) } },
      {
        $group: {
          _id: '$studentId',
          questionsAnswered: { $sum: 1 },
          correctAnswers: { $sum: { $cond: ['$isCorrect', 1, 0] } },
          totalPoints: { $sum: '$points' },
          avgResponseTime: { $avg: '$responseTime' }
        }
      }
    ])

    const statsMap = stats.reduce((acc, stat) => {
      acc[stat._id.toString()] = stat
      return acc
    }, {})

    const results = members.map(member => {
      if (!member.studentId) return null // Handle deleted users
      
      const sStats = statsMap[member.studentId._id.toString()] || { 
        questionsAnswered: 0, correctAnswers: 0, totalPoints: 0, avgResponseTime: 0 
      }
      
      return {
        _id: member.studentId._id,
        name: member.studentId.name,
        email: member.studentId.email,
        joinedAt: member.joinedAt,
        questionsAnswered: sStats.questionsAnswered,
        participationScore: totalQuestions > 0 ? (sStats.questionsAnswered / totalQuestions) * 100 : 0,
        correctAnswers: sStats.correctAnswers,
        correctRate: sStats.questionsAnswered > 0 ? (sStats.correctAnswers / sStats.questionsAnswered) * 100 : 0,
        totalPoints: sStats.totalPoints,
        avgResponseTime: sStats.avgResponseTime || 0
      }
    }).filter(Boolean)

    res.json({ success: true, students: results, totalQuestions })
  } catch (error) {
    console.error('Error fetching student analytics:', error)
    res.status(500).json({ error: 'Failed to fetch student analytics' })
  }
})

// GET /api/analytics/history - Historical Analytics
router.get('/history', authorize('teacher'), async (req, res) => {
  try {
    const { Response, Room, Question, RoomMember } = await getModels()
    const teacherId = req.user._id

    // Get all rooms for this teacher
    const rooms = await Room.find({ teacher: teacherId }).sort({ createdAt: -1 }).lean()
    const roomIds = rooms.map(r => r._id)

    const totalSessions = rooms.length
    
    // Aggregate members to find total unique students taught
    const totalStudentsTaughtArray = await RoomMember.distinct('studentId', { roomId: { $in: roomIds } })
    const totalStudentsTaught = totalStudentsTaughtArray.length

    // Aggregate questions asked
    const totalQuestions = await Question.countDocuments({ roomId: { $in: roomIds } })

    // Aggregate global response stats
    const globalStats = await Response.aggregate([
      { $match: { roomId: { $in: roomIds } } },
      {
        $group: {
          _id: null,
          totalAnswers: { $sum: 1 },
          correctAnswers: { $sum: { $cond: ['$isCorrect', 1, 0] } }
        }
      }
    ])

    let avgCorrectRate = 0
    if (globalStats.length > 0 && globalStats[0].totalAnswers > 0) {
      avgCorrectRate = (globalStats[0].correctAnswers / globalStats[0].totalAnswers) * 100
    }

    // Prepare session-by-session history for a chart
    const recentRooms = rooms.slice(0, 10).reverse() // Chronological order
    const recentRoomIds = recentRooms.map(r => r._id)
    
    const sessionStats = await Response.aggregate([
      { $match: { roomId: { $in: recentRoomIds } } },
      {
        $group: {
          _id: '$roomId',
          answers: { $sum: 1 },
          correct: { $sum: { $cond: ['$isCorrect', 1, 0] } }
        }
      }
    ])
    
    const sessionStatsMap = sessionStats.reduce((acc, stat) => {
      acc[stat._id.toString()] = stat
      return acc
    }, {})

    const trends = recentRooms.map(room => {
      const stat = sessionStatsMap[room._id.toString()] || { answers: 0, correct: 0 }
      return {
        roomId: room._id,
        roomName: room.name,
        date: room.createdAt,
        correctRate: stat.answers > 0 ? (stat.correct / stat.answers) * 100 : 0,
        engagement: stat.answers
      }
    })

    res.json({
      success: true,
      summary: {
        totalSessions,
        totalStudentsTaught,
        totalQuestions,
        avgCorrectRate
      },
      trends,
      recentRooms: rooms.slice(0, 5)
    })
  } catch (error) {
    console.error('Error fetching historical analytics:', error)
    res.status(500).json({ error: 'Failed to fetch historical analytics' })
  }
})

export default router
