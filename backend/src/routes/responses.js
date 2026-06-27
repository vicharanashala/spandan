import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
const router = express.Router()

// Apply authentication to all routes
router.use(authenticate)

// POST /api/responses - Save a student's answer
// Authorization: student only, and studentId must match authenticated user
router.post('/', authorize('student'), async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default
    
    const { roomId, questionId, selectedOptions, responseTime } = req.body
    const studentId = req.user._id // Must be authenticated user

    // Verify student is in the room (member of RoomMember)
    const isMember = await RoomMember.findOne({ roomId, studentId })
    if (!isMember) {
      return res.status(403).json({ error: 'You have not joined this room' })
    }

    if (!roomId || !questionId || !selectedOptions || !Array.isArray(selectedOptions)) {
      return res.status(400).json({ error: 'Missing required fields: roomId, questionId, and selectedOptions (array)' })
    }

    // Get the question to check correct answer and points
    const question = await Question.findById(questionId)
    if (!question) {
      return res.status(404).json({ error: 'Question not found' })
    }

    // Check if answer is correct based on question type
    let isCorrect = false
    
    if (question.type === 'MSQ') {
      // MSQ: ALL correct options must be selected AND NO incorrect options selected
      const correctIndices = question.options
        .map((opt, idx) => opt.isCorrect ? idx : -1)
        .filter(idx => idx !== -1)
      
      const selectedSet = new Set(selectedOptions)
      const correctSet = new Set(correctIndices)
      
      // Check all correct are selected AND no incorrect selected
      const allCorrectSelected = correctIndices.every(idx => selectedSet.has(idx))
      const noIncorrectSelected = selectedOptions.every(idx => correctSet.has(idx))
      
      isCorrect = allCorrectSelected && noIncorrectSelected
    } else {
      // MCQ/TF: Single correct answer
      const selectedOptionData = question.options[selectedOptions[0]]
      isCorrect = selectedOptionData?.isCorrect || false
    }
    
    // Time-decay points calculation
    // Formula: earnedPoints = isCorrect ? maxPoints × max(0.1, (tta - responseTime) / tta) : 0
    // Minimum 10% of max points for correct answers (even if time runs out)
    const maxPoints = question.points || 100
    const tta = question.timeToAnswer || 30
    const respTime = responseTime || 0
    let points = 0
    
    if (isCorrect) {
      const timeRemaining = Math.max(0, tta - respTime)
      const timeDecayFactor = Math.max(0.1, timeRemaining / tta) // Minimum 10% even if slow
      points = Math.round(maxPoints * timeDecayFactor)
    }
    // Incorrect answers get 0 points

    const response = new Response({
      roomId,
      questionId,
      studentId,
      selectedOption: selectedOptions[0], // Store first selection for MCQ compatibility
      selectedOptions, // Store all selections for MSQ
      isCorrect,
      responseTime: respTime,
      points
    })

    // Check if already responded to prevent duplicates
    const existingResponse = await Response.findOne({ roomId, questionId, studentId })
    if (existingResponse) {
      return res.status(409).json({ 
        success: false, 
        error: 'Already responded to this question',
        existingResponse: {
          selectedOption: existingResponse.selectedOption,
          selectedOptions: existingResponse.selectedOptions,
          isCorrect: existingResponse.isCorrect,
          points: existingResponse.points
        }
      })
    }

    await response.save()

    res.status(201).json({
      success: true,
      response: {
        ...response.toObject(),
        isCorrect,
        points
      }
    })
  } catch (error) {
    console.error('Error saving response:', error)
    res.status(500).json({ success: false, error: 'Failed to save response' })
  }
})

// GET /api/responses?roomId=xxx&studentId=yyy - Get responses for a room/student
router.get('/', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default
    const { roomId, studentId, page = 1, limit = 50 } = req.query
    const currentUser = req.user

    // Must provide at least roomId
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' })
    }

    // Verify room exists
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Check access: teacher owns room OR student is a member
    const isTeacher = room.teacher.toString() === currentUser._id.toString()
    const isStudentMember = await RoomMember.findOne({ roomId, studentId: currentUser._id })
    
    // If student is querying a different student's data, deny
    if (currentUser.role === 'student' && studentId && studentId !== currentUser._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to view other students\' responses' })
    }

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to access responses for this room' })
    }

    const filter = { roomId }
    if (studentId) filter.studentId = studentId

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50))
    const skip = (pageNum - 1) * limitNum

    const [responses, total] = await Promise.all([
      Response.find(filter).populate('questionId').skip(skip).limit(limitNum).sort({ createdAt: -1 }).lean(),
      Response.countDocuments(filter)
    ])

    res.json({
      success: true,
      responses,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    })
  } catch (error) {
    console.error('Error fetching responses:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch responses' })
  }
})

// GET /api/responses/stats/student/:studentId - Get student stats
router.get('/stats/student/:studentId', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default
    
    const { studentId } = req.params
    const currentUser = req.user

    // Students can only view their own stats
    // Teachers can view stats for students in their rooms
    const isSelf = currentUser._id.toString() === studentId
    
    if (currentUser.role === 'student' && !isSelf) {
      return res.status(403).json({ error: 'Not authorized to view other students\' stats' })
    }
    
    if (currentUser.role === 'teacher') {
      // Verify the student is in one of the teacher's rooms
      const studentRoomMember = await RoomMember.find({ studentId })
      const teacherRooms = await Room.find({ teacher: currentUser._id })
      const teacherRoomIds = teacherRooms.map(r => r._id.toString())
      const hasAccess = studentRoomMember.some(m => teacherRoomIds.includes(m.roomId.toString()))
      
      if (!hasAccess) {
        return res.status(403).json({ error: 'Not authorized to view this student\'s stats' })
      }
    }

    // Total rooms student has joined (from RoomMember) OR answered (from Response)
    const roomMemberships = await RoomMember.find({ studentId })
    const roomIdsMember = roomMemberships.map(m => m.roomId)
    const uniqueRoomIdsFromResponse = await Response.distinct('roomId', { studentId })
    const allRoomIds = [...new Set([...roomIdsMember.map(id => id.toString()), ...uniqueRoomIdsFromResponse.map(id => id.toString())])]
    const totalRooms = allRoomIds.length
    const roomIds = roomMemberships.map(m => m.roomId)
    
    // Total responses (polls taken)
    const pollsTaken = await Response.countDocuments({ studentId })

    // Get all responses for average calculation
    const responses = await Response.find({ studentId })
    const totalPoints = responses.reduce((sum, r) => sum + r.points, 0)
    const average = pollsTaken > 0 ? Math.round((totalPoints / (pollsTaken * 100)) * 100) : 0

    // Count launched polls: questions with 'approved' status (approved & launched to students)
    // Use allRoomIds (RoomMember + Response unique) to count ALL rooms student participated in
    const launchedCount = await Question.countDocuments({
      roomId: { $in: allRoomIds },
      status: 'approved'
    })
    const pollsMissed = Math.max(0, launchedCount - pollsTaken)

    res.json({
      success: true,
      stats: {
        totalRooms,
        pollsTaken,
        pollsMissed,
        average
      }
    })
  } catch (error) {
    console.error('Error fetching student stats:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch stats' })
  }
})

// GET /api/responses/stats/room/:roomId - Get room stats for teacher
router.get('/stats/room/:roomId', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    const Room = (await import('../models/Room.js')).default
    
    const { roomId } = req.params
    const currentUser = req.user

    // Get room and verify teacher ownership
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    
    // Only the room owner (teacher) can view detailed stats
    if (room.teacher.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to view this room\'s stats' })
    }

    // Total responses for this room
    const totalResponses = await Response.countDocuments({ roomId })
    
    // Get unique students who responded
    const uniqueStudents = await Response.distinct('studentId', { roomId })
    
    // Get total questions in this room
    const totalQuestions = await Question.countDocuments({ roomId })

    // Get question-level breakdown
    const questionStats = await Question.find({ roomId }).lean()
    const stats = await Promise.all(questionStats.map(async (q) => {
      const responses = await Response.find({ roomId, questionId: q._id })
      const answerCounts = {}
      let correctCount = 0
      
      q.options.forEach((opt, idx) => {
        const countForOption = responses.filter(r => r.selectedOption === idx).length
        answerCounts[idx] = countForOption
        // If this option is correct, add to correctCount
        if (opt.isCorrect) {
          correctCount += countForOption
        }
      })
      
      return {
        questionId: q._id,
        question: q.question,
        type: q.type,
        totalResponses: responses.length,
        correctCount,
        answerCounts
      }
    }))

    res.json({
      success: true,
      stats: {
        totalResponses,
        totalStudents: uniqueStudents.length,
        totalQuestions,
        questionStats: stats
      }
    })
  } catch (error) {
    console.error('Error fetching room stats:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch stats' })
  }
})

// GET /api/responses/room/:roomId/student/:studentId - Get all questions with student's responses
router.get('/room/:roomId/student/:studentId', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    const mongoose = (await import('mongoose')).default
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default
    
    const { roomId, studentId } = req.params
    const currentUser = req.user

    // Teachers can view any student's responses for their own room
    // Students can only view their own responses
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    
    const isTeacher = room.teacher.toString() === currentUser._id.toString()
    const isSelf = currentUser._id.toString() === studentId
    
    // Allow if teacher owns room OR if student is viewing their own data
    if (!isTeacher && !isSelf) {
      return res.status(403).json({ error: 'Not authorized to view this student\'s responses' })
    }
    
    // If student, verify they are a member of this room
    if (!isTeacher && isSelf) {
      const isMember = await RoomMember.findOne({ roomId, studentId: currentUser._id })
      if (!isMember) {
        return res.status(403).json({ error: 'Not a member of this room' })
      }
    }

    // Convert to ObjectId if valid format
    const toObjectId = (id) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        return new mongoose.Types.ObjectId(id)
      }
      return id
    }

    const roomObjectId = toObjectId(roomId)
    const studentObjectId = toObjectId(studentId)

    // Get all responses for this student in this room
    const responses = await Response.find({ 
      roomId: roomObjectId, 
      studentId: studentObjectId 
    }).lean()
    
    // Debug log
    console.log(`[responses] Fetched ${responses.length} responses for student ${studentId} in room ${roomId}`)
    
    // Create a map of questionId -> response for quick lookup
    // Use a helper to safely convert any ID to string
    const toIdString = (id) => {
      if (!id) return String(id)
      if (typeof id === 'string') return id
      if (id.toHexString) return id.toHexString()
      if (id._bsontype === 'ObjectId') return id.toString()
      return String(id)
    }
    
    const responseMap = {}
    responses.forEach(r => {
      const qId = toIdString(r.questionId)
      console.log(`[responses] Response for questionId: ${qId}, selectedOption: ${r.selectedOption}, isCorrect: ${r.isCorrect}`)
      responseMap[qId] = r
    })

    // Get all approved questions for this room (launched to students)
    const questions = await Question.find({ 
      roomId: roomObjectId, 
      status: 'approved'
    }).sort({ createdAt: -1 }).lean()  // Sort by newest first (latest asked question on top)

    console.log(`[responses] Found ${questions.length} questions for room ${roomId}`)

    // Merge questions with response data
    const questionsWithResponses = questions.map(q => {
      const qIdStr = toIdString(q._id)
      const studentResponse = responseMap[qIdStr]
      
      if (studentResponse) {
        console.log(`[responses] Matched question ${qIdStr} with response, selectedOption: ${studentResponse.selectedOption}`)
      }
      
      return {
        _id: qIdStr,
        question: q.question,
        type: q.type,
        options: q.options,
        segmentIndex: q.segmentIndex,
        maxPoints: q.points,
        timeToAnswer: q.timeToAnswer,
        answered: !!studentResponse,
        ...(studentResponse && {
          selectedOption: studentResponse.selectedOption,
          selectedOptions: studentResponse.selectedOptions || [studentResponse.selectedOption],
          isCorrect: studentResponse.isCorrect,
          responseTime: studentResponse.responseTime,
          pointsEarned: studentResponse.points
        }),
        createdAt: q.createdAt
      }
    })

    res.json({
      success: true,
      questions: questionsWithResponses
    })
  } catch (error) {
    console.error('Error fetching student room responses:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch responses' })
  }
})

// GET /api/responses/counts/:roomId - Get per-question answer counts
router.get('/counts/:roomId', async (req, res) => {
  try {
    const mongoose = (await import('mongoose')).default
    const Response = (await import('../models/Response.js')).default
    const { roomId } = req.params

    const toObjectId = (id) => {
      if (!id) return null
      if (typeof id === 'object' && id._bsontype === 'ObjectId') return id
      return new mongoose.Types.ObjectId(id)
    }

    // Get count per question
    const counts = await Response.aggregate([
      { $match: { roomId: toObjectId(roomId) } },
      { $group: { _id: '$questionId', count: { $sum: 1 } } }
    ])


    const countMap = {}
    counts.forEach(c => {
      countMap[c._id.toHexString()] = c.count
    })

    res.json({ success: true, counts: countMap })
  } catch (error) {
    console.error('Error fetching answer counts:', error)
    res.status(500).json({ error: 'Failed to fetch counts' })
  }
})

// GET /api/responses/leaderboard/:roomId - Get ranked leaderboard for a room
// Authorization: teacher (owner's room) sees full, students (joined room) see top 3 only
router.get('/leaderboard/:roomId', async (req, res) => {
  try {
    const mongoose = (await import('mongoose')).default
    const Response = (await import('../models/Response.js')).default
    const User = (await import('../models/User.js')).default
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default
    const { roomId } = req.params
    const currentUser = req.user

    const toObjectId = (id) => {
      if (!id) return null
      if (typeof id === 'object' && id._bsontype === 'ObjectId') return id
      return new mongoose.Types.ObjectId(id)
    }

    // Check if teacher owns the room
    const room = await Room.findById(roomId)
    const isTeacher = room && room.teacher.toString() === currentUser._id.toString()
    
    // Check if student is a member of the room
    const isStudentMember = await RoomMember.findOne({ roomId, studentId: currentUser._id })
    
    // Deny access if neither
    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to view this leaderboard' })
    }

    // Aggregate points per student
    const leaderboardData = await Response.aggregate([
      { $match: { roomId: toObjectId(roomId) } },
      { $group: {
        _id: '$studentId',
        totalPoints: { $sum: '$points' },
        correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } },
        totalAnswered: { $sum: 1 }
      }},
      { $sort: { totalPoints: -1 } }
    ])

    // Resolve student names and build ranked response
    const leaderboard = await Promise.all(leaderboardData.map(async (entry, index) => {
      const user = await User.findById(entry._id).lean()
      return {
        rank: index + 1,
        studentId: entry._id.toHexString(),
        studentName: user?.name || user?.email || 'Unknown Student',
        totalPoints: entry.totalPoints,
        correctCount: entry.correctCount,
        totalAnswered: entry.totalAnswered
      }
    }))

    // Students: top 10 + their rank (with ellipsis). Teachers: full leaderboard.
    let visibleLeaderboard = leaderboard
    let userRank = null
    
    if (!isTeacher) {
      // Find current user's rank
      const userEntry = leaderboard.find(e => e.studentId === currentUser._id.toString())
      userRank = userEntry?.rank || null
      
      // Get top 10 + user's entry if not in top 10
      visibleLeaderboard = leaderboard.slice(0, 10)
      
      // If user is beyond top 10, add them in the middle
      if (userEntry && userEntry.rank > 10) {
        // Check if user is already in top 10 (shouldn't be, but safety check)
        const alreadyInTop10 = visibleLeaderboard.some(e => e.studentId === userEntry.studentId)
        if (!alreadyInTop10) {
          visibleLeaderboard.push({ ...userEntry, isCurrentUser: true })
          visibleLeaderboard.sort((a, b) => a.rank - b.rank)
        }
      }
    }

    res.json({ 
      success: true, 
      leaderboard: visibleLeaderboard, 
      isTeacher,
      userRank,
      totalParticipants: leaderboard.length
    })
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    res.status(500).json({ error: 'Failed to fetch leaderboard' })
  }
})

// TAWM: Topic-wise analytics endpoints

router.get('/analytics/topic/:roomId', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    const mongoose = (await import('mongoose')).default
    const Room = (await import('../models/Room.js')).default
    const { roomId } = req.params
    const currentUser = req.user

    const roomObjectId = new mongoose.Types.ObjectId(roomId)

    const room = await Room.findById(roomObjectId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    let matchQuery = { roomId: roomObjectId }
    if (currentUser.role === 'student') {
      const approvedQuestions = await Question.find({
        roomId: roomObjectId,
        status: 'approved'
      }).select('_id')
      matchQuery.questionId = { $in: approvedQuestions.map(q => q._id) }
    }

    const topicStats = await Response.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'questions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'question'
        }
      },
      { $unwind: '$question' },
      {
        $group: {
          _id: { $ifNull: ['$question.topic', 'Untagged'] },
          uniqueQuestions: { $addToSet: '$questionId' },
          responseCount: { $sum: 1 },
          correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } },
          totalPoints: { $sum: '$points' },
          avgResponseTime: { $avg: '$responseTime' }
        }
      },
      {
        $project: {
          topic: '$_id',
          questionCount: { $size: '$uniqueQuestions' },
          responseCount: 1,
          correctCount: 1,
          correctRate: {
            $cond: [
              { $gt: ['$responseCount', 0] },
              { $round: [{ $multiply: [{ $divide: ['$correctCount', '$responseCount'] }, 100] }, 1] },
              0
            ]
          },
          totalPoints: 1,
          avgResponseTime: { $round: ['$avgResponseTime', 1] },
          status: {
            $switch: {
              branches: [
                { case: { $gte: [{ $divide: ['$correctCount', '$responseCount'] }, 0.7] }, then: 'strong' },
                { case: { $gte: [{ $divide: ['$correctCount', '$responseCount'] }, 0.4] }, then: 'improving' }
              ],
              default: 'weak'
            }
          },
          _id: 0
        }
      },
      { $sort: { correctRate: -1 } }
    ])

    res.json({
      success: true,
      roomId,
      topics: topicStats
    })
  } catch (error) {
    console.error('Error fetching topic analytics:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' })
  }
})

router.get('/analytics/student/:studentId/topic', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    const mongoose = (await import('mongoose')).default
    const { studentId } = req.params
    const currentUser = req.user

    if (currentUser.role === 'student' && currentUser._id.toString() !== studentId) {
      return res.status(403).json({ error: 'Not authorized to view this data' })
    }

    let studentObjectId
    try {
      studentObjectId = new mongoose.Types.ObjectId(studentId)
    } catch (e) {
      return res.status(400).json({ error: 'Invalid student ID' })
    }

    const weaknessMap = await Response.aggregate([
      { $match: { studentId: studentObjectId } },
      {
        $lookup: {
          from: 'questions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'question'
        }
      },
      { $unwind: '$question' },
      { $match: { 'question.status': 'approved' } },
      {
        $group: {
          _id: { $ifNull: ['$question.topic', 'Untagged'] },
          totalQuestions: { $sum: 1 },
          correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } },
          totalPoints: { $sum: '$points' }
        }
      },
      {
        $project: {
          topic: '$_id',
          totalQuestions: 1,
          correctCount: 1,
          correctRate: {
            $cond: [
              { $gt: ['$totalQuestions', 0] },
              { $round: [{ $multiply: [{ $divide: ['$correctCount', '$totalQuestions'] }, 100] }, 1] },
              0
            ]
          },
          totalPoints: 1,
          status: {
            $switch: {
              branches: [
                { case: { $gte: [{ $divide: ['$correctCount', '$totalQuestions'] }, 0.7] }, then: 'strong' },
                { case: { $gte: [{ $divide: ['$correctCount', '$totalQuestions'] }, 0.4] }, then: 'improving' }
              ],
              default: 'weak'
            }
          },
          _id: 0
        }
      },
      { $sort: { correctRate: 1 } }
    ])

    res.json({
      success: true,
      studentId,
      weaknesses: weaknessMap
    })
  } catch (error) {
    console.error('Error fetching student weakness map:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch weakness map' })
  }
})


export default router
