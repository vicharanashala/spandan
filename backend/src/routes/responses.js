import express from 'express'
import mongoose from 'mongoose'
import { authenticate, authorize } from '../middleware/auth.js'
import Response from '../models/Response.js'
import Question from '../models/Question.js'
import RoomMember from '../models/RoomMember.js'
import User from '../models/User.js'
import Room from '../models/Room.js'
import { TTLCache } from '../realtime/ttlCache.js'

const router = express.Router()

// A question is immutable while students are answering it, so caching it
// for a few seconds turns "3000 students answering the same question at
// once" from 3000 identical Mongo reads into effectively 1.
const questionCache = new TTLCache(Number(process.env.QUESTION_CACHE_TTL_MS || 10_000))

// Leaderboard snapshots are cheap to serve slightly stale during a live
// session (a 1-2s lag is imperceptible to students watching a leaderboard),
// but caching them absorbs simultaneous refreshes from an entire class
// hitting this endpoint within the same second.
const leaderboardCache = new TTLCache(Number(process.env.LEADERBOARD_CACHE_TTL_MS || 1500))

async function getQuestionCached(questionId) {
  const cached = questionCache.get(questionId)
  if (cached) return cached
  const question = await Question.findById(questionId).lean()
  if (question) questionCache.set(questionId, question)
  return question
}

// Apply authentication to all routes
router.use(authenticate)

// POST /api/responses - Save a student's answer
// Authorization: student only, and studentId must match authenticated user
router.post('/', authorize('student'), async (req, res) => {
  try {
    const { roomId, questionId, selectedOptions, responseTime } = req.body
    const studentId = req.user._id // Must be authenticated user

    if (!roomId || !questionId || !selectedOptions || !Array.isArray(selectedOptions)) {
      return res.status(400).json({ error: 'Missing required fields: roomId, questionId, and selectedOptions (array)' })
    }

    // Verify student is in the room (member of RoomMember)
    const isMember = await RoomMember.findOne({ roomId, studentId }).lean()
    if (!isMember) {
      return res.status(403).json({ error: 'You have not joined this room' })
    }

    // Get the question to check correct answer and points (cached - see above)
    const question = await getQuestionCached(questionId)
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

    // The unique index on { roomId, questionId, studentId } already
    // guarantees one response per student per question. Doing a
    // find-then-save here (as before) is both an extra query on every
    // single submission (3000 students -> 3000 extra reads) *and* still
    // racy - two rapid double-clicks/retries from the same client could
    // both pass the findOne check before either save() lands. Insert
    // directly and let Mongo's index reject the duplicate atomically.
    let response
    try {
      response = await Response.create({
        roomId,
        questionId,
        studentId,
        selectedOption: selectedOptions[0], // Store first selection for MCQ compatibility
        selectedOptions, // Store all selections for MSQ
        isCorrect,
        responseTime: respTime,
        points
      })
    } catch (error) {
      if (error.code === 11000) {
        const existingResponse = await Response.findOne({ roomId, questionId, studentId }).lean()
        return res.status(409).json({
          success: false,
          error: 'Already responded to this question',
          existingResponse: existingResponse ? {
            selectedOption: existingResponse.selectedOption,
            selectedOptions: existingResponse.selectedOptions,
            isCorrect: existingResponse.isCorrect,
            points: existingResponse.points
          } : undefined
        })
      }
      throw error
    }

    leaderboardCache.delete(roomId)

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
    const { roomId } = req.params
    const currentUser = req.user

    const toObjectId = (id) => {
      if (!id) return null
      if (typeof id === 'object' && id._bsontype === 'ObjectId') return id
      return new mongoose.Types.ObjectId(id)
    }

    // Check if teacher owns the room
    const room = await Room.findById(roomId).select('teacher').lean()
    const isTeacher = room && room.teacher.toString() === currentUser._id.toString()

    // Check if student is a member of the room
    const isStudentMember = isTeacher
      ? true
      : await RoomMember.exists({ roomId, studentId: currentUser._id })

    // Deny access if neither
    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to view this leaderboard' })
    }

    // The full leaderboard (aggregation + name resolution) is identical for
    // every viewer of a given room. During a live question, every student
    // and the teacher can all poll this endpoint within the same second -
    // previously that meant N full aggregations *and* N x (participants)
    // individual User.findById calls hitting Mongo simultaneously (a room
    // of 3000 answering one question could mean millions of user lookups
    // for a single leaderboard refresh cycle). Caching the computed result
    // for a short TTL collapses that whole burst into one computation, and
    // fixing the per-row lookup below removes the N+1 within that one
    // computation too.
    let leaderboard = leaderboardCache.get(roomId)
    if (!leaderboard) {
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

      // Resolve all student names in a single query instead of one
      // findById per leaderboard row (that was the N+1: a 3000-student
      // room turned every leaderboard fetch into 3000 extra DB round trips).
      const studentIds = leaderboardData.map(e => e._id)
      const users = await User.find({ _id: { $in: studentIds } }).select('name email').lean()
      const userMap = new Map(users.map(u => [u._id.toString(), u]))

      leaderboard = leaderboardData.map((entry, index) => {
        const user = userMap.get(entry._id.toString())
        return {
          rank: index + 1,
          studentId: entry._id.toHexString(),
          studentName: user?.name || user?.email || 'Unknown Student',
          totalPoints: entry.totalPoints,
          correctCount: entry.correctCount,
          totalAnswered: entry.totalAnswered
        }
      })

      leaderboardCache.set(roomId, leaderboard)
    }

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
          visibleLeaderboard = [...visibleLeaderboard, { ...userEntry, isCurrentUser: true }]
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

export default router
