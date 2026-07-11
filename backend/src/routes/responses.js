import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { applyAnswer } from '../services/streakService.js'
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
    const mongoose = (await import('mongoose')).default

    const { roomId, questionId, selectedOptions, responseTime } = req.body
    const studentId = req.user._id // Must be authenticated user

    // Verify student is in the room (member of RoomMember)
    // NOTE: keep the doc (not .lean()) so we can persist streak fields later.
    const member = await RoomMember.findOne({ roomId, studentId })
    if (!member) {
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

  // --- Streak Fire: streak multiplier (applied after applyAnswer) ---
  // Multiplier tiers:
  //   0-2  streak → ×1 (base)
  //   3-4  streak → ×2
  //   5-9  streak → ×3
  //   10+  streak → ×5
  // Only correct answers are boosted — wrong answers get 0 either way.
  const computeMultiplier = (s) =>
    s >= 10 ? 5 :
    s >= 5  ? 3 :
    s >= 3  ? 2 : 1
  const basePoints = points
  let multiplier = 1
  let multiplierBoosted = false

    // --- Streak Fire: missed-question sweep ---
    // Find any approved questions in this room that the student did NOT answer
    // between their most recent response and now (before the current question).
    // This is the "missed since last answer" semantics — once a question has
    // been swept and penalized, it won't be detected again on subsequent answers.
    //
    // Why "since last response" and not "all unanswered before current"?
    //   The latter (older behavior) caused the sweep to re-detect the same
    //   skipped questions on every subsequent answer, breaking the streak
    //   infinitely. Now we only count questions in the gap since the last answer.
    const toObjectId = (id) => {
      if (!id) return null
      if (typeof id === 'object' && id._bsontype === 'ObjectId') return id
      return new mongoose.Types.ObjectId(id)
    }
    const sweepEvents = []
    let sweepBrokeStreak = false
    // Tracks whether a streak freeze was consumed this response, and what
    // it blocked. null | 'sweep' | 'wrong_answer'
    let freezeUsed = null
    try {
      // Find the student's most recent response (before the current one).
      // Use a stable tiebreaker: any older response.
      const lastResponse = await Response.findOne({
        roomId: toObjectId(roomId),
        studentId,
        _id: { $ne: response._id }, // exclude the just-saved response
      })
        .sort({ createdAt: -1 })
        .select('createdAt')
        .lean()

      const fromDate = lastResponse ? lastResponse.createdAt : new Date(0)
      // Use `$gte` so we don't miss a question created in the same millisecond
      // as the previous response (with `$gt` we'd skip it).
      const priorQuestions = await Question.find({
        roomId: toObjectId(roomId),
        status: 'approved',
        _id: { $ne: toObjectId(questionId) },
        createdAt: { $gte: fromDate, $lt: question.createdAt },
      }).select('_id').lean()

      const answeredIdsInGap = await Response.distinct('questionId', {
        roomId: toObjectId(roomId),
        studentId,
        questionId: { $in: priorQuestions.map(q => q._id) },
      })
      const answeredSet = new Set(answeredIdsInGap.map(id => id.toString()))
      const missedIds = priorQuestions.filter(q => !answeredSet.has(q._id.toString()))

      // Skipped-question handling under the new spec:
      //   - Freeze present  -> consume the freeze, streak is preserved (no change to counter)
      //   - No freeze left  -> silently ignore; streak counter is NOT touched
      // The streak counter never breaks due to a skip under the new rule;
      // 'sweepBrokeStreak' therefore stays false.
      if (missedIds.length > 0 && member.streakFreezes > 0) {
        member.streakFreezes -= 1
        freezeUsed = 'sweep'
        // Don't change member.currentStreak / bestStreak — streak preserved.
      } else if (missedIds.length > 0) {
        // No freeze left — skip is a silent no-op for the streak counter.
        // (Previously this path would reset the streak. Under the new rule
        // it doesn't.)
      }
    } catch (streakSweepErr) {
      // Don't fail the response on sweep errors; log and continue.
      console.error('[streak] missed-question sweep failed:', streakSweepErr)
    }

    // --- Streak Fire: apply this answer ---
    const after = applyAnswer(member, isCorrect)
    // applyAnswer is pure — it returns the next state but doesn't mutate member.
    // Use after.currentStreak so the multiplier reflects the POST-answer value.
    multiplier = isCorrect ? computeMultiplier(after.currentStreak) : 1
    if (isCorrect && multiplier > 1) {
      const boosted = Math.round(basePoints * multiplier)
      if (boosted !== basePoints) {
        response.points = boosted
        await response.save()
        multiplierBoosted = true
      }
    }
    // --- Wrong-answer streak handling ---
    // Under the current spec, a wrong answer always applies the -3 decrement
    // (floored at 0) computed by applyAnswer. The freeze is reserved for
    // skipped questions only and is never consumed by a wrong answer here.
    member.currentStreak = after.currentStreak
    member.bestStreak    = after.bestStreak
    await member.save()

    res.status(201).json({
      success: true,
      response: {
        ...response.toObject(),
        isCorrect,
        points: response.points,  // reflects multiplier-boosted value if applicable
        basePoints,               // pre-multiplier (for "you got 100 × 3 = 300!" display)
        multiplier                // 1 | 2 | 3 | 5
      },
      streak: {
        currentStreak: member.currentStreak,
        bestStreak: member.bestStreak,
        // Final answer event:
        //   'increment' = correct (+2)
        //   'decrement' = wrong  (-3, floored at 0)
        //   'noop'      = wrong while streak was already 0
        event: after.event,
        // Under the new spec the missed-question sweep never resets the streak,
        // so this array is always empty (kept for backward compatibility with
        // any frontend that still inspects it).
        sweep: sweepEvents,
        // Always false under the new spec (skips no longer break the streak).
        sweepBrokeStreak,
        // Always 0 under the new spec (skips don't trigger reset events).
        missedCount: sweepEvents.length,
        // --- Streak Freeze ---
        // 'sweep' = freeze consumed by a skipped-question sweep (streak preserved)
        // null    = no freeze was used this turn
        // (Previously also 'wrong_answer' when a freeze blocked a wrong-answer
        // reset; that path was removed under the new spec — wrong answers now
        // always apply the -3 decrement and never consume a freeze.)
        freezeUsed,
        // How many freezes the student has left in this room
        streakFreezesRemaining: member.streakFreezes,
        multiplier,
        multiplierBoosted,
      }
    })
  } catch (error) {
    console.error(`[ERROR] POST /api/responses — ${error.message}`)
    console.error('[ERROR] Stack:', error.stack)
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
    console.error(`[ERROR] GET /api/responses — ${error.message}`)
    console.error('[ERROR] Stack:', error.stack)
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

    // --- Streak Fire ---
    // Streaks live on RoomMember, one record per (student, room). Aggregate
    // to give the student a lifetime peak + the strongest active streak.
    const bestStreak = roomMemberships.reduce(
      (max, m) => Math.max(max, m.bestStreak || 0),
      0
    )
    // Active streak: the largest non-zero currentStreak across rooms.
    // (Sums across rooms would inflate numbers; max reflects "best run in
    // progress right now", which is the meaningful display value.)
    const activeStreak = roomMemberships.reduce(
      (max, m) => Math.max(max, m.currentStreak || 0),
      0
    )
    // Total freezes remaining across all active rooms (sum — student could be in
    // multiple rooms, each gives 1 freeze).
    const totalStreakFreezes = roomMemberships.reduce(
      (sum, m) => sum + (m.streakFreezes || 0),
      0
    )

    res.json({
      success: true,
      stats: {
        totalRooms,
        pollsTaken,
        pollsMissed,
        average,
        bestStreak,
        currentStreak: activeStreak,
        streakFreezes: totalStreakFreezes
      }
    })
  } catch (error) {
    console.error(`[ERROR] GET /api/responses/stats/student/:id — ${error.message}`)
    console.error('[ERROR] Stack:', error.stack)
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
    console.error(`[ERROR] GET /api/responses/room/:roomId/student/:studentId — ${error.message}`)
    console.error('[ERROR] Stack:', error.stack)
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
    console.error(`[ERROR] GET /api/responses/room/:roomId/counts — ${error.message}`)
    console.error('[ERROR] Stack:', error.stack)
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

    // Resolve student names and per-room streak fields
    const leaderboard = await Promise.all(leaderboardData.map(async (entry, index) => {
      const user = await User.findById(entry._id).lean()
      const member = await RoomMember.findOne({
        roomId: toObjectId(roomId),
        studentId: entry._id
      }).select('currentStreak bestStreak streakFreezes').lean()
      return {
        rank: index + 1,
        studentId: entry._id.toHexString(),
        studentName: user?.name || user?.email || 'Unknown Student',
        totalPoints: entry.totalPoints,
        correctCount: entry.correctCount,
        totalAnswered: entry.totalAnswered,
        // --- Streak Fire ---
        currentStreak:    member?.currentStreak ?? 0,
        bestStreak:       member?.bestStreak    ?? 0,
        streakFreezes:    member?.streakFreezes ?? 0
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
    console.error(`[ERROR] GET /api/responses/leaderboard/:roomId — ${error.message}`)
    console.error('[ERROR] Stack:', error.stack)
    res.status(500).json({ error: 'Failed to fetch leaderboard' })
  }
})

export default router
