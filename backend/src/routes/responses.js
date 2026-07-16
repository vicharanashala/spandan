import express from 'express'
import mongoose from 'mongoose'
import { authenticate, authorize } from '../middleware/auth.js'
import Response from '../models/Response.js'
import Question from '../models/Question.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import User from '../models/User.js'
import { getLeaderboard, getTopN, updateLeaderboard } from '../services/leaderboardService.js'

const router = express.Router()

// Module-level Maps for broadcast throttling (not on io object)
const lastLeaderboardBroadcast = new Map()
const lastCountBroadcast = new Map()

// Apply authentication to all routes
router.use(authenticate)

// POST /api/responses - Save a student's answer
// Authorization: student only, and studentId must match authenticated user
// Also updates Redis leaderboard and pushes via Socket.IO — single source of truth
router.post('/', authorize('student'), async (req, res) => {
  try {
    const { roomId, questionId, selectedOptions, responseTime } = req.body
    const studentId = req.user._id

    // Verify student is in the room
    const isMember = await RoomMember.findOne({ roomId, studentId })
    if (!isMember) {
      return res.status(403).json({ error: 'You have not joined this room' })
    }

    // Reject responses to ended rooms
    const roomDoc = await Room.findById(roomId).select('isActive endedAt').lean()
    if (!roomDoc || roomDoc.isActive === false) {
      return res.status(400).json({ error: 'This room has ended' })
    }

    if (!roomId || !questionId || !selectedOptions || !Array.isArray(selectedOptions)) {
      return res.status(400).json({ error: 'Missing required fields: roomId, questionId, and selectedOptions (array)' })
    }

    const question = await Question.findById(questionId)
    if (!question) {
      return res.status(404).json({ error: 'Question not found' })
    }

    let isCorrect = false

    if (question.type === 'MSQ') {
      const correctIndices = question.options
        .map((opt, idx) => opt.isCorrect ? idx : -1)
        .filter(idx => idx !== -1)
      const selectedSet = new Set(selectedOptions)
      const correctSet = new Set(correctIndices)
      const allCorrectSelected = correctIndices.every(idx => selectedSet.has(idx))
      const noIncorrectSelected = selectedOptions.every(idx => correctSet.has(idx))
      isCorrect = allCorrectSelected && noIncorrectSelected
    } else {
      const selectedOptionData = question.options[selectedOptions[0]]
      isCorrect = selectedOptionData?.isCorrect || false
    }

    const maxPoints = question.points || 100
    const tta = question.timeToAnswer || 30
    const respTime = responseTime || 0
    let points = 0

    if (isCorrect) {
      const timeRemaining = Math.max(0, tta - respTime)
      const timeDecayFactor = Math.max(0.1, timeRemaining / tta)
      points = Math.round(maxPoints * timeDecayFactor)
    }

    // Look up room code once (needed for both DB save and Socket.IO)
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    const roomCode = room.code

    // Save response — compound unique index {roomId, questionId, studentId}
    // prevents duplicates at DB level. If race occurs, catch error 11000.
    const response = new Response({
      roomId,
      questionId,
      studentId,
      selectedOption: selectedOptions[0],
      selectedOptions,
      isCorrect,
      responseTime: respTime,
      points
    })

    // Rely on the unique index {roomId,questionId,studentId} to reject duplicates instead
    // of a separate findOne pre-check (which was both an extra query on the hot path and a
    // check-then-act race). A duplicate insert throws E11000, which we map to 409.
    try {
      await response.save()
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        const existingResponse = await Response.findOne({ roomId, questionId, studentId })
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
      throw saveErr
    }

    // Trigger the throttled, server-authoritative live update for this room (leaderboard +
    // answer counts) and return this student's current rank ("rank on submit"), so clients
    // never poll the leaderboard endpoint during a live session.
    const live = req.app.get('liveUpdates')
    live?.schedule(roomId)
    const rankInfo = (live ? await live.getRank(roomId, studentId) : null) || {}

    // Also emit real-time updates via Socket.IO for backward compatibility
    const io = req.app.get('io')
    if (io && roomCode) {
      // 1. Update Redis leaderboard (O(log N))
      await updateLeaderboard(roomId, studentId, points, isCorrect, req.user.name)

      // 2. Send confirmation to THIS student only — O(1) via reverse index
      const studentSocketId = io._studentSocketIndex?.get(studentId.toString())
      if (studentSocketId) {
        const studentSocket = io.sockets.sockets.get(studentSocketId)
        if (studentSocket && studentSocket.data.roomCode === roomCode) {
          studentSocket.emit('response:saved', {
            questionId,
            studentId,
            selectedOption: selectedOptions[0],
            selectedOptions,
            responseTime: respTime,
            points,
            isCorrect
          })
        }
      }

      // 3. Debounced leaderboard broadcast — max 1 per 3 seconds per room
      const now = Date.now()
      const lastLB = lastLeaderboardBroadcast.get(roomCode) || 0
      if (now - lastLB >= 3000) {
        lastLeaderboardBroadcast.set(roomCode, now)
        const topStudents = await getTopN(roomId, 50)
        io.to(roomCode).emit('leaderboard:updated', { leaderboard: topStudents })
      }

      // 4. Broadcast response count to teacher (throttled per room)
      const lastCnt = lastCountBroadcast.get(roomCode) || 0
      if (now - lastCnt >= 2000) {
        lastCountBroadcast.set(roomCode, now)
        const totalResponses = await Response.countDocuments({ roomId })
        const uniqueStudents = await Response.distinct('studentId', { roomId })

        // Per-question breakdown for live teacher view
        const questionBreakdown = await Response.aggregate([
          { $match: { roomId: new mongoose.Types.ObjectId(roomId) } },
          { $group: {
            _id: '$questionId',
            count: { $sum: 1 },
            correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } }
          }}
        ])
        const questionCounts = {}
        const questionCorrect = {}
        questionBreakdown.forEach(qb => {
          questionCounts[qb._id.toString()] = qb.count
          questionCorrect[qb._id.toString()] = qb.correctCount
        })

        io.to(roomCode).emit('response:count', {
          totalResponses,
          uniqueStudents: uniqueStudents.length,
          questionCounts,
          questionCorrect
        })
      }
    }

    res.status(201).json({
      success: true,
      response: {
        ...response.toObject(),
        isCorrect,
        points
      },
      rank: rankInfo.rank ?? null,
      totalParticipants: rankInfo.totalParticipants ?? null
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

    // Get question-level breakdown using single aggregation (no N+1)
    const questionStats = await Question.find({ roomId }).lean()
    
    // Single aggregation to get all response counts per question
    const allResponseCounts = await Response.aggregate([
      { $match: { roomId: new mongoose.Types.ObjectId(roomId) } },
      { $group: {
        _id: { questionId: '$questionId', selectedOption: '$selectedOption' },
        count: { $sum: 1 },
        correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } }
      }}
    ])
    
    // Build a map: questionId -> { optionCounts: {idx: count}, totalResponses, correctCount }
    const responseMap = new Map()
    for (const bucket of allResponseCounts) {
      const qId = bucket._id.questionId.toString()
      if (!responseMap.has(qId)) {
        responseMap.set(qId, { optionCounts: {}, totalResponses: 0, correctCount: 0 })
      }
      const entry = responseMap.get(qId)
      entry.optionCounts[bucket._id.selectedOption] = bucket.count
      entry.totalResponses += bucket.count
      entry.correctCount += bucket.correctCount
    }
    
    const stats = questionStats.map(q => {
      const qId = q._id.toString()
      const data = responseMap.get(qId) || { optionCounts: {}, totalResponses: 0, correctCount: 0 }
      return {
        questionId: q._id,
        question: q.question,
        type: q.type,
        totalResponses: data.totalResponses,
        correctCount: data.correctCount,
        answerCounts: data.optionCounts
      }
    })

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
    
    // If student, verify they are a member of this room (or have existing responses)
    if (!isTeacher && isSelf) {
      const isMember = await RoomMember.findOne({ roomId, studentId: currentUser._id })
      const hasExistingResponses = await Response.findOne({ roomId, studentId: currentUser._id })
      if (!isMember && !hasExistingResponses) {
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
      responseMap[qId] = r
    })

    // Get all approved questions for this room (launched to students)
    const questions = await Question.find({ 
      roomId: roomObjectId, 
      status: 'approved'
    }).sort({ createdAt: -1 }).lean()

    // Merge questions with response data
    const questionsWithResponses = questions.map(q => {
      const qIdStr = toIdString(q._id)
      const studentResponse = responseMap[qIdStr]
      
      return {
        _id: qIdStr,
        question: q.question,
        type: q.type,
        options: q.options,
        explanation: q.explanation,
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
// Uses Redis sorted sets when available for O(1) reads, falls back to MongoDB aggregation
router.get('/leaderboard/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    const currentUser = req.user

    // Check access
    const room = await Room.findById(roomId)
    const isTeacher = room && room.teacher.toString() === currentUser._id.toString()
    const isStudentMember = await RoomMember.findOne({ roomId, studentId: currentUser._id })

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to view this leaderboard' })
    }

    // Try Redis leaderboard first (O(1) read)
    const redisResult = await getLeaderboard(roomId, {
      studentId: currentUser._id.toString()
    })

    if (redisResult && redisResult.leaderboard.length > 0) {
      let visibleLeaderboard = redisResult.leaderboard
      let userRank = redisResult.userRank

      if (!isTeacher) {
        visibleLeaderboard = redisResult.leaderboard.slice(0, 10)
        if (userRank && userRank > 10) {
          const userEntry = redisResult.leaderboard.find(e => e.studentId === currentUser._id.toString())
          if (userEntry && !visibleLeaderboard.some(e => e.studentId === userEntry.studentId)) {
            visibleLeaderboard.push({ ...userEntry, isCurrentUser: true })
            visibleLeaderboard.sort((a, b) => a.rank - b.rank)
          }
        }
      }

      return res.json({
        success: true,
        leaderboard: visibleLeaderboard,
        isTeacher,
        userRank,
        totalParticipants: redisResult.totalParticipants,
        source: 'redis'
      })
    }

    // Fallback to MongoDB aggregation
    const leaderboardData = await Response.aggregate([
      { $match: { roomId: new mongoose.Types.ObjectId(roomId) } },
      { $group: {
        _id: '$studentId',
        totalPoints: { $sum: '$points' },
        correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } },
        totalAnswered: { $sum: 1 }
      }},
      { $sort: { totalPoints: -1 } }
    ])

    // Resolve student names in a SINGLE batched query instead of one findById per
    // participant. The old N+1 loop issued up to 1000 user lookups per leaderboard
    // request, and this endpoint is polled heavily during live sessions.
    const studentIds = leaderboardData.map(entry => entry._id)
    const users = await User.find({ _id: { $in: studentIds } })
      .select('name email')
      .lean()
    const userById = new Map(users.map(u => [u._id.toString(), u]))

    const leaderboard = leaderboardData.map((entry, index) => {
      const user = userById.get(entry._id.toString())
      return {
        rank: index + 1,
        studentId: entry._id.toHexString(),
        studentName: user?.name || user?.email || 'Unknown Student',
        totalPoints: entry.totalPoints,
        correctCount: entry.correctCount,
        totalAnswered: entry.totalAnswered
      }
    })

    let visibleLeaderboard = leaderboard
    let userRank = null

    if (!isTeacher) {
      const userEntry = leaderboard.find(e => e.studentId === currentUser._id.toString())
      userRank = userEntry?.rank || null
      visibleLeaderboard = leaderboard.slice(0, 10)
      if (userEntry && userEntry.rank > 10) {
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
      totalParticipants: leaderboard.length,
      source: 'mongodb'
    })
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    res.status(500).json({ error: 'Failed to fetch leaderboard' })
  }
})

export default router

// Cleanup function for room-related throttle maps (call on room end/shutdown)
export function cleanupRoomThrottles(roomCode) {
  lastLeaderboardBroadcast.delete(roomCode)
  lastCountBroadcast.delete(roomCode)
}
