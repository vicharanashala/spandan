import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { isBatchEnabled, bufferResponse } from '../services/responseBuffer.js'
import * as resultsSnapshot from '../services/resultsSnapshot.js'
import { debug } from '../utils/debug.js'
const router = express.Router()

// Apply authentication to all routes
router.use(authenticate)

// --- Hot-path read caches (Stage 2, Fix 4 + Fix 3a) --------------------------------------------
// The POST /responses handler runs on every student answer; under a synchronized burst that is
// hundreds of concurrent requests. Two of its DB reads are cacheable because their inputs are
// effectively immutable during a live poll, so we cache them to cut per-response Mongo round-trips
// WITHOUT changing how/when the response itself is written (dedup, points, durability unchanged).

// Membership: cache ONLY confirmed memberships (never negatives) and always fall through to the DB
// on a miss — so a student who just joined is never wrongly rejected. Short TTL bounds staleness
// (a student who left still passes for up to TTL, which is benign).
const MEMBER_TTL_MS = Number(process.env.MEMBER_CACHE_TTL_MS) || 60000
const memberCache = new Map() // `${roomId}:${studentId}` -> expiresAt(ms)

async function isRoomMember(RoomMember, roomId, studentId) {
  const key = `${roomId}:${studentId}`
  const exp = memberCache.get(key)
  if (exp && exp > Date.now()) return true
  const found = await RoomMember.findOne({ roomId, studentId }).select('_id').lean()
  if (found) {
    if (memberCache.size > 50000) memberCache.clear() // safe bound: a miss just re-hits the DB
    memberCache.set(key, Date.now() + MEMBER_TTL_MS)
    return true
  }
  return false
}

// Question: an approved question is immutable while it is being answered (teacher edits happen
// pre-launch), so cache the lean doc used for scoring. Short TTL so any change still propagates.
const QUESTION_TTL_MS = Number(process.env.QUESTION_CACHE_TTL_MS) || 30000
const questionCache = new Map() // questionId -> { q, expiresAt(ms) }

async function getQuestionCached(Question, questionId) {
  const id = String(questionId)
  const hit = questionCache.get(id)
  if (hit && hit.expiresAt > Date.now()) return hit.q
  const q = await Question.findById(questionId).lean()
  if (q) {
    if (questionCache.size > 50000) questionCache.clear()
    questionCache.set(id, { q, expiresAt: Date.now() + QUESTION_TTL_MS })
  }
  return q
}

// The GET /responses/room/:id/student/:id read path fetches the room's FULL approved-question list.
// That list is student-INDEPENDENT (identical for everyone in the room), yet every student hits the
// endpoint when their poll timer expires — at classroom scale that is hundreds of identical
// Question.find + serializations per poll transition. Cache the list per room so the herd collapses
// to ~one query per TTL per instance. The per-student response merge in the handler stays fresh (it
// comes from a separate Response.find); the cached array is only ever read, never mutated. Staleness
// is bounded by the TTL and benign: a question is approved at launch (~a poll-length before its poll
// ends), so it is always in the cache by the time students read; the live question arrives via the
// new_question socket, not this endpoint.
const ROOM_QUESTIONS_TTL_MS = Number(process.env.ROOM_QUESTIONS_CACHE_TTL_MS) || 10000
const roomQuestionsCache = new Map()    // roomId(str) -> { questions, expiresAt(ms) }
const roomQuestionsInflight = new Map() // roomId(str) -> Promise<questions>  (single-flight)

async function getRoomQuestionsCached(Question, roomObjectId) {
  const key = String(roomObjectId)
  const hit = roomQuestionsCache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.questions
  // Single-flight: if a query for this room is already running, share it instead of firing another.
  // This matters most at a congested transition where the whole room misses at once and the first
  // query is slow — without this, everyone who arrives before it returns would each hit Mongo.
  const inflight = roomQuestionsInflight.get(key)
  if (inflight) return inflight
  const p = (async () => {
    try {
      const questions = await Question.find({ roomId: roomObjectId, status: 'approved' })
        .sort({ createdAt: -1 }).lean()
      if (roomQuestionsCache.size > 50000) roomQuestionsCache.clear()
      roomQuestionsCache.set(key, { questions, expiresAt: Date.now() + ROOM_QUESTIONS_TTL_MS })
      return questions
    } finally {
      roomQuestionsInflight.delete(key)
    }
  })()
  roomQuestionsInflight.set(key, p)
  return p
}
// ----------------------------------------------------------------------------------------------

// POST /api/responses - Save a student's answer
// Authorization: student only, and studentId must match authenticated user
router.post('/', authorize('student'), async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default
    
    const { roomId, questionId, selectedOptions, responseTime } = req.body
    const studentId = req.user._id // Must be authenticated user

    // Verify student is in the room (member of RoomMember) — cached (Fix 4), DB fallback on miss.
    const isMember = await isRoomMember(RoomMember, roomId, studentId)
    if (!isMember) {
      return res.status(403).json({ error: 'You have not joined this room' })
    }

    if (!roomId || !questionId || !selectedOptions || !Array.isArray(selectedOptions)) {
      return res.status(400).json({ error: 'Missing required fields: roomId, questionId, and selectedOptions (array)' })
    }

    // Get the question to check correct answer and points — cached (Fix 3a); immutable while live.
    const question = await getQuestionCached(Question, questionId)
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

    const responseData = {
      roomId,
      questionId,
      studentId,
      selectedOption: selectedOptions[0], // Store first selection for MCQ compatibility
      selectedOptions, // Store all selections for MSQ
      isCorrect,
      responseTime: respTime,
      points
    }

    // Persist. DEFAULT path: save() immediately and let the unique index
    // {roomId,questionId,studentId} reject duplicates as a 409 (no pre-check → no extra query, no
    // check-then-act race). OPTIONAL path (RESPONSE_BATCH=on, Fix 3b): buffer the doc for a batched
    // insertMany — the SAME unique index still enforces dedup/no-double-scoring at flush, so a
    // duplicate is dropped there rather than returned as a 409. Points are already computed above
    // and returned to the student immediately in BOTH paths.
    let savedResponse = responseData
    if (isBatchEnabled()) {
      await bufferResponse(responseData)
    } else {
      const response = new Response(responseData)
      try {
        await response.save()
        savedResponse = response.toObject()
      } catch (saveErr) {
        if (saveErr.code === 11000) {
          const existingResponse = await Response.findOne({ roomId, questionId, studentId })
          return res.status(409).json({
            success: false,
            error: 'Already responded to this question',
            existingResponse: existingResponse ? {
              selectedOption: existingResponse.selectedOption,
              selectedOptions: existingResponse.selectedOptions,
              points: existingResponse.points
            } : undefined
          })
        }
        throw saveErr
      }
    }

    // Live answer-counts update immediately (throttled) so the teacher's "X/total answered"
    // badge stays current; the ranked leaderboard is DEFERRED to a quiet-debounce (fires once
    // the answer burst has drained) so its expensive recompute never competes with the burst.
    // Return this student's current rank ("rank on submit") from the last settled board — it may
    // lag during a burst (Option A), but the student still gets their points immediately below.
    const live = req.app.get('liveUpdates')
    live?.scheduleCounts(roomId)
    live?.scheduleLeaderboard(roomId)
    const rankInfo = (live ? await live.getRank(roomId, studentId) : null) || {}

    res.status(201).json({
      success: true,
      response: {
        ...savedResponse,
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
    // Count only rooms that still exist. A deleted room leaves orphaned membership/response
    // records whose roomId would otherwise inflate totalRooms (and the launched-poll count below),
    // making the dashboard "Total Rooms" disagree with the existence-checked Room History list.
    const existingRoomIds = (await Room.distinct('_id', { _id: { $in: allRoomIds } })).map(id => id.toString())
    const totalRooms = existingRoomIds.length
    const roomIds = roomMemberships.map(m => m.roomId)
    
    // Total responses (polls taken)
    const pollsTaken = await Response.countDocuments({ studentId })

    // Get all responses for average calculation
    const responses = await Response.find({ studentId })
    const totalPoints = responses.reduce((sum, r) => sum + r.points, 0)
    const average = pollsTaken > 0 ? Math.round((totalPoints / (pollsTaken * 100)) * 100) : 0

    // Count launched polls: questions with 'approved' status (approved & launched to students)
    // Use existingRoomIds (rooms that still exist) to count polls across the student's rooms.
    const launchedCount = await Question.countDocuments({
      roomId: { $in: existingRoomIds },
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
    const RoomMember = (await import('../models/RoomMember.js')).default

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

    // Ended rooms serve stats from the shared snapshot (built once at room end). A miss (live room,
    // Redis off, cache error) falls through to a direct compute that uses ONE grouped aggregation
    // for the per-question counts — no per-question N+1 find loop.
    const ended = !!room?.endedAt
    const cachedStats = await resultsSnapshot.getStats(roomId, { ended })
    if (cachedStats) {
      return res.json({ success: true, stats: cachedStats })
    }

    const mongoose = (await import('mongoose')).default
    const roomObjId = new mongoose.Types.ObjectId(roomId)

    // One pass for the counts (grouped by question × selected option) plus the light room-wide
    // totals, all in parallel — replaces the old N+1 (one Response.find per question).
    const [totalResponses, uniqueStudents, totalJoined, questions, grouped] = await Promise.all([
      Response.countDocuments({ roomId }),
      Response.distinct('studentId', { roomId }),
      RoomMember.countDocuments({ roomId }),
      Question.find({ roomId }).lean(),
      Response.aggregate([
        { $match: { roomId: roomObjId } },
        { $group: { _id: { q: '$questionId', opt: '$selectedOption' }, count: { $sum: 1 } } }
      ])
    ])

    // Index grouped counts: questionId -> per-option counts, and questionId -> total responses
    // (all responses for the question, matching the old responses.length).
    const countsByQuestion = new Map()
    const totalByQuestion = new Map()
    for (const g of grouped) {
      const qid = g._id.q ? g._id.q.toString() : null
      if (!qid) continue
      let m = countsByQuestion.get(qid)
      if (!m) { m = new Map(); countsByQuestion.set(qid, m) }
      m.set(g._id.opt, g.count)
      totalByQuestion.set(qid, (totalByQuestion.get(qid) || 0) + g.count)
    }

    const questionStats = questions.map((q) => {
      const perOption = countsByQuestion.get(q._id.toString()) || new Map()
      const answerCounts = {}
      let correctCount = 0
      q.options.forEach((opt, idx) => {
        const c = perOption.get(idx) || 0
        answerCounts[idx] = c
        if (opt.isCorrect) correctCount += c
      })
      return {
        questionId: q._id,
        question: q.question,
        type: q.type,
        totalResponses: totalByQuestion.get(q._id.toString()) || 0,
        correctCount,
        answerCounts
      }
    })

    res.json({
      success: true,
      stats: {
        totalResponses,
        totalStudents: uniqueStudents.length,
        totalJoined,
        totalQuestions: questions.length,
        questionStats
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

    // Ended rooms serve this student's per-question breakdown from the shared snapshot — an O(1)
    // hash lookup instead of re-reading their responses + all questions on every results-page load.
    // A miss (live room, Redis off, or a non-responder not stored in the snapshot) falls through to
    // the direct compute below, which yields the identical payload.
    const ended = !!room?.endedAt
    const snap = await resultsSnapshot.getStudent(roomId, studentId, { ended })
    if (snap.hit) {
      const safeQuestions = isTeacher ? snap.questions : snap.questions.map(({ options, ...rest }) => ({
        ...rest,
        options: (options || []).map(({ isCorrect, ...opt }) => opt)
      }))
      return res.json({ success: true, questions: safeQuestions })
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
    debug(`[responses] Fetched ${responses.length} responses for student ${studentId} in room ${roomId}`)
    
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
      debug(`[responses] Response for questionId: ${qId}, selectedOption: ${r.selectedOption}, isCorrect: ${r.isCorrect}`)
      responseMap[qId] = r
    })

    // Get all approved questions for this room (launched to students). Cached per-room (short TTL)
    // because this list is identical for every student and the whole room hits this endpoint at once
    // when a poll ends — see getRoomQuestionsCached. Sorted newest-first (latest asked on top).
    const questions = await getRoomQuestionsCached(Question, roomObjectId)

    debug(`[responses] Found ${questions.length} questions for room ${roomId}`)

    // Merge questions with response data
    const questionsWithResponses = questions.map(q => {
      const qIdStr = toIdString(q._id)
      const studentResponse = responseMap[qIdStr]
      
      if (studentResponse) {
        debug(`[responses] Matched question ${qIdStr} with response, selectedOption: ${studentResponse.selectedOption}`)
      }
      
      return {
        _id: qIdStr,
        question: q.question,
        type: q.type,
        options: isTeacher ? q.options : (q.options || []).map(({ isCorrect, ...opt }) => opt),
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

    // Ended rooms serve the ranked board from the shared results snapshot, so a stampede of
    // results-page loads all read one cached board instead of each running this full-room
    // aggregation. On any miss (live room, Redis off, cache error) this is null and we compute
    // directly below — identical result, just not cached.
    const ended = !!room?.endedAt
    let leaderboard = await resultsSnapshot.getLeaderboard(roomId, { ended })

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

      // Resolve student names in a SINGLE batched query instead of one findById per
      // participant. The old N+1 loop issued up to 1000 user lookups per leaderboard
      // request, and this endpoint is polled heavily during live sessions.
      const studentIds = leaderboardData.map(entry => entry._id)
      const users = await User.find({ _id: { $in: studentIds } })
        .select('name email')
        .lean()
      const userById = new Map(users.map(u => [u._id.toString(), u]))

      leaderboard = leaderboardData.map((entry, index) => {
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

// Teacher CSV export of a room's complete results — a gradebook matrix
// (one row per student, one column per question). Reuses buildSnapshot (a single
// aggregation pass = the exact data the results page renders), so it adds no new heavy
// queries; a one-off download does not need the stampede cache. Rows are streamed.
router.get('/room/:roomId/export', async (req, res) => {
  try {
    const Room = (await import('../models/Room.js')).default
    const User = (await import('../models/User.js')).default
    const { roomId } = req.params
    const currentUser = req.user

    const room = await Room.findById(roomId).lean()
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (room.teacher.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to export this room' })
    }

    const { leaderboard, byStudent, stats } = await resultsSnapshot.buildSnapshot(roomId)

    // Question columns in chronological order (Q1 = first asked). Every byStudent array holds the
    // same approved-question set in newest-first order, so take one and reverse.
    const anySid = Object.keys(byStudent)[0]
    const qCols = anySid ? [...byStudent[anySid]].reverse() : []
    const statsByQid = new Map((stats.questionStats || []).map((q) => [q.questionId, q]))

    // Emails for the participant set — one query.
    const sids = leaderboard.map((e) => String(e.studentId))
    const users = await User.find({ _id: { $in: sids } }).select('email').lean()
    const emailById = new Map(users.map((u) => [u._id.toString(), u.email || '']))

    const esc = (v) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const row = (arr) => arr.map(esc).join(',') + '\n'

    const safeName = (room.name || 'room').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60)
    const date = room.endedAt ? new Date(room.endedAt).toISOString().slice(0, 10) : 'session'
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="Spandan_${safeName}_${date}.csv"`)
    res.write('\uFEFF') // UTF-8 BOM so Excel renders names, emails and the check marks correctly

    const qHeaders = qCols.map((_, i) => `Q${i + 1}`)
    res.write(row(['student', 'email', 'points', 'rank', 'correct', 'accuracy', ...qHeaders]))

    for (const e of leaderboard) {
      const byQid = new Map((byStudent[String(e.studentId)] || []).map((q) => [q._id, q]))
      const acc = e.totalAnswered ? (e.correctCount / e.totalAnswered).toFixed(2) : ''
      const cells = qCols.map((qc) => {
        const q = byQid.get(qc._id)
        return !q || !q.answered ? '' : (q.isCorrect ? '✓' : '✗')
      })
      res.write(row([
        e.studentName || '', emailById.get(String(e.studentId)) || '',
        e.totalPoints, e.rank, `${e.correctCount}/${e.totalAnswered}`, acc, ...cells
      ]))
    }

    // Question legend so Q1..Qn are identifiable.
    res.write('\n')
    res.write(row(['Question', 'Text', 'Type', 'Responses', 'Correct %']))
    qCols.forEach((qc, i) => {
      const s = statsByQid.get(qc._id)
      const pct = s && s.totalResponses ? Math.round((s.correctCount / s.totalResponses) * 100) + '%' : ''
      res.write(row([`Q${i + 1}`, qc.question, qc.type, s ? s.totalResponses : '', pct]))
    })
    res.end()
  } catch (error) {
    console.error('CSV export error:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to export results' })
    else res.end()
  }
})

export default router
