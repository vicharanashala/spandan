import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import Room from '../models/Room.js'
import Response from '../models/Response.js'
import User from '../models/User.js'
import Question from '../models/Question.js'
import { callProvider } from '../services/aiProviderService.js'
import { config } from '../config.js'

const router = express.Router()

router.use(authenticate)

// Simple in-memory cache for GET endpoints
const cache = new Map()
const CACHE_TTL = 30_000 // 30 seconds

function getCached(key) {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data
  cache.delete(key)
  return null
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() })
  // Evict old entries if cache grows too large
  if (cache.size > 50) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (oldest) cache.delete(oldest[0])
  }
}

// Rate limiter for narrative endpoint (per studentId, 1 request / 30s)
const narrativeRateLimit = new Map()
const NARRATIVE_RATE_WINDOW = 30_000

function checkNarrativeRateLimit(studentId) {
  const last = narrativeRateLimit.get(studentId)
  if (last && Date.now() - last < NARRATIVE_RATE_WINDOW) {
    return Math.ceil((NARRATIVE_RATE_WINDOW - (Date.now() - last)) / 1000)
  }
  narrativeRateLimit.set(studentId, Date.now())
  return 0
}

// Route A: GET /api/analytics/teacher/students (teacher-only)
// Supports pagination: ?page=1&limit=50 (default page=1, limit=50, max 100)
// Supports sorting:  ?sort=name&order=asc  (name/lastActive/averageScore/totalSessions)
router.get('/teacher/students', authorize('teacher'), async (req, res, next) => {
  try {
    const teacherId = req.user._id
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50))
    const skip = (page - 1) * limit
    const allowedSorts = { name: 'name', lastActive: 'lastActive', averageScore: 'averageScore', totalSessions: 'totalSessions' }
    const sortField = allowedSorts[req.query.sort] || 'lastActive'
    const sortOrder = req.query.order === 'asc' ? 1 : -1

    // Check cache (keyed by teacherId + sort/page params)
    const cacheKey = `teacher:${teacherId}:${sortField}:${sortOrder}:${page}:${limit}`
    const cached = getCached(cacheKey)
    if (cached) return res.json(cached)

    // Find all rooms where room.teacher === req.user._id
    const rooms = await Room.find({ teacher: teacherId }).select('_id').lean()

    if (rooms.length === 0) {
      const empty = { success: true, students: [], total: 0, page, limit }
      setCache(cacheKey, empty)
      return res.json(empty)
    }

    const roomIds = rooms.map(r => r._id)

    // Batch-fetch all responses in one query instead of N+1
    const allResponses = await Response.find({
      roomId: { $in: roomIds }
    }).select('studentId roomId isCorrect points createdAt').sort({ createdAt: 1 }).lean()

    if (allResponses.length === 0) {
      const empty = { success: true, students: [], total: 0, page, limit }
      setCache(cacheKey, empty)
      return res.json(empty)
    }

    // Group responses by studentId in memory
    const groupedByStudent = {}
    allResponses.forEach(r => {
      const sId = r.studentId.toString()
      if (!groupedByStudent[sId]) groupedByStudent[sId] = []
      groupedByStudent[sId].push(r)
    })

    const studentIds = Object.keys(groupedByStudent)

    // Batch-fetch all user documents in one query instead of N
    const users = await User.find({ _id: { $in: studentIds } }).select('name email profileImage').lean()
    const userMap = {}
    users.forEach(u => { userMap[u._id.toString()] = u })

    // Compute stats for each student
    const studentsData = studentIds.map(sId => {
      const student = userMap[sId]
      if (!student) return null
      const responses = groupedByStudent[sId]

      const totalQuestions = responses.length
      const totalCorrect = responses.filter(r => r.isCorrect).length
      const averageScore = Math.round((totalCorrect / totalQuestions) * 100) || 0
      const totalPoints = responses.reduce((sum, r) => sum + (r.points || 0), 0)

      const distinctRooms = new Set(responses.map(r => r.roomId.toString()))
      const totalSessions = distinctRooms.size

      const lastActive = responses[responses.length - 1].createdAt

      // Trend: compare first half vs second half (already sorted by createdAt ascending)
      const half = Math.floor(responses.length / 2)
      let trend = 'stable'
      if (half > 0) {
        const firstHalf = responses.slice(0, half)
        const secondHalf = responses.slice(half)
        const firstAcc = firstHalf.filter(r => r.isCorrect).length / firstHalf.length
        const secondAcc = secondHalf.filter(r => r.isCorrect).length / secondHalf.length
        if (secondAcc > firstAcc) trend = 'up'
        else if (secondAcc < firstAcc) trend = 'down'
      }

      return {
        _id: student._id,
        name: student.name,
        email: student.email,
        profileImage: student.profileImage,
        totalSessions,
        totalQuestions,
        totalCorrect,
        averageScore,
        totalPoints,
        lastActive,
        trend
      }
    }).filter(Boolean)

    // Sort
    const sorted = [...studentsData].sort((a, b) => {
      let cmp
      if (sortField === 'name') cmp = (a.name || '').localeCompare(b.name || '')
      else if (sortField === 'averageScore') cmp = a.averageScore - b.averageScore
      else if (sortField === 'totalSessions') cmp = a.totalSessions - b.totalSessions
      else cmp = new Date(a.lastActive) - new Date(b.lastActive) // lastActive
      return sortOrder * cmp
    })

    // Paginate
    const total = sorted.length
    const paginated = sorted.slice(skip, skip + limit)

    const result = { success: true, students: paginated, total, page, limit }
    setCache(cacheKey, result)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

// Route B: GET /api/analytics/student/:studentId/sessions
router.get('/student/:studentId/sessions', async (req, res, next) => {
  try {
    const studentId = req.params.studentId
    const isTeacher = req.user.role === 'teacher'

    // Verify access
    if (!isTeacher && String(req.user._id) !== String(studentId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own journey data'
      })
    }

    // Cache keyed by studentId
    const cacheKey = `sessions:${studentId}`
    const cached = getCached(cacheKey)
    if (cached) return res.json(cached)

    // Student Info
    const studentInfo = await User.findById(studentId).select('name email profileImage').lean()
    if (!studentInfo) {
      return res.status(404).json({ error: 'Student not found', message: 'The requested student does not exist' })
    }

    // Find teacher rooms if teacher is requesting
    let filterRoomIds = null
    if (isTeacher) {
      const teacherRooms = await Room.find({ teacher: req.user._id }).select('_id').lean()
      filterRoomIds = teacherRooms.map(r => r._id)
    }

    // Find all responses for the student
    const responseQuery = { studentId }
    if (filterRoomIds) {
      responseQuery.roomId = { $in: filterRoomIds }
    }

    const responses = await Response.find(responseQuery).populate('roomId').lean()

    if (responses.length === 0) {
      return res.json({
        success: true,
        profile: {
          studentInfo,
          overall: { overallAccuracy: 0, totalSessions: 0, totalQuestions: 0, totalPoints: 0 },
          sessions: [],
          trendData: [],
          weakTopics: [],
          personalBest: null
        }
      })
    }

    // Group responses by roomId
    const responsesByRoom = {}
    responses.forEach(r => {
      if (!r.roomId) return
      const rId = String(r.roomId._id)
      if (!responsesByRoom[rId]) {
        responsesByRoom[rId] = {
          room: r.roomId,
          responses: []
        }
      }
      responsesByRoom[rId].responses.push(r)
    })

    const sessions = []
    let totalQuestions = 0
    let totalCorrect = 0
    let totalPoints = 0

    Object.values(responsesByRoom).forEach(({ room, responses: rList }) => {
      const questionsAttempted = rList.length
      const correctCount = rList.filter(r => r.isCorrect).length
      const accuracy = Math.round((correctCount / questionsAttempted) * 100) || 0
      const sessionPoints = rList.reduce((sum, r) => sum + (r.points || 0), 0)
      const maxPoints = questionsAttempted * 100
      const percentage = Math.round((sessionPoints / maxPoints) * 100) || 0

      const sumResponseTime = rList.reduce((sum, r) => sum + (r.responseTime || 0), 0)
      const avgResponseTime = questionsAttempted > 0
        ? Math.round((sumResponseTime / questionsAttempted) * 10) / 10
        : 0

      totalQuestions += questionsAttempted
      totalCorrect += correctCount
      totalPoints += sessionPoints

      sessions.push({
        roomId: room._id,
        roomName: room.name,
        roomCode: room.code,
        date: room.createdAt,
        questionsAttempted,
        correctCount,
        accuracy,
        totalPoints: sessionPoints,
        maxPoints,
        percentage,
        avgResponseTime
      })
    })

    // Sort sessions by date descending
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date))

    const totalSessions = sessions.length
    const overallAccuracy = Math.round((totalCorrect / totalQuestions) * 100) || 0

    // Trend data: sorted ascending by date
    const trendData = sessions
      .map(s => ({
        roomName: s.roomName,
        accuracy: s.accuracy,
        percentage: s.percentage,
        date: s.date
      }))
      .reverse()

    // Find personal best
    let personalBest = null
    if (sessions.length > 0) {
      personalBest = [...sessions].sort((a, b) => {
        if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy
        return b.totalPoints - a.totalPoints
      })[0]
    }

    // Extract weak topics: keywords from questions student got wrong
    const wrongResponseQuestionIds = responses.filter(r => !r.isCorrect).map(r => r.questionId)
    let weakTopics = []
    if (wrongResponseQuestionIds.length > 0) {
      const wrongQuestions = await Question.find({ _id: { $in: wrongResponseQuestionIds } }).select('question').lean()
      const allWords = wrongQuestions.map(q => q.question || '').join(' ')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 4)

      const freq = {}
      allWords.forEach(w => {
        freq[w] = (freq[w] || 0) + 1
      })

      weakTopics = Object.entries(freq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([word]) => word)
    }

    const result = {
      success: true,
      profile: {
        studentInfo,
        overall: {
          overallAccuracy,
          totalSessions,
          totalQuestions,
          totalPoints
        },
        sessions,
        trendData,
        weakTopics,
        personalBest
      }
    }
    setCache(cacheKey, result)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

// Route C: POST /api/analytics/student/:studentId/narrative
router.post('/student/:studentId/narrative', async (req, res, next) => {
  try {
    const studentId = req.params.studentId
    const isTeacher = req.user.role === 'teacher'

    // Rate limit: 1 request per 30 seconds per student
    const retryAfter = checkNarrativeRateLimit(studentId)
    if (retryAfter > 0) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${retryAfter}s before generating another narrative.`
      })
    }

    // Verify access
    if (!isTeacher && String(req.user._id) !== String(studentId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only generate narrative for your own profile or your students'
      })
    }

    // Fetch the student's profile data
    // Find teacher rooms if teacher is requesting
    let filterRoomIds = null
    if (isTeacher) {
      const teacherRooms = await Room.find({ teacher: req.user._id }).select('_id').lean()
      filterRoomIds = teacherRooms.map(r => r._id)
    }

    const responseQuery = { studentId }
    if (filterRoomIds) {
      responseQuery.roomId = { $in: filterRoomIds }
    }

    const responses = await Response.find(responseQuery).lean()
    const studentInfo = await User.findById(studentId).select('name').lean()

    if (!studentInfo || responses.length === 0) {
      return res.json({ success: true, narrative: 'No session data available yet.' })
    }

    const totalQuestions = responses.length
    const totalCorrect = responses.filter(r => r.isCorrect).length
    const overallAccuracy = Math.round((totalCorrect / totalQuestions) * 100) || 0

    // Count distinct rooms
    const distinctRooms = new Set(responses.map(r => r.roomId.toString()))
    const totalSessions = distinctRooms.size

    // Calculate trend
    const responsesAsc = [...responses].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    const half = Math.floor(responsesAsc.length / 2)
    let trend = 'stable'
    if (half > 0) {
      const firstHalf = responsesAsc.slice(0, half)
      const secondHalf = responsesAsc.slice(half)
      const firstAcc = firstHalf.filter(r => r.isCorrect).length / firstHalf.length
      const secondAcc = secondHalf.filter(r => r.isCorrect).length / secondHalf.length
      if (secondAcc > firstAcc) trend = 'improving'
      else if (secondAcc < firstAcc) trend = 'declining'
    }

    // Extract weak topics
    const wrongResponseQuestionIds = responses.filter(r => !r.isCorrect).map(r => r.questionId)
    let weakTopicsText = 'None'
    let personalBestText = 'N/A'

    if (wrongResponseQuestionIds.length > 0) {
      const wrongQuestions = await Question.find({ _id: { $in: wrongResponseQuestionIds } }).select('question').lean()
      const allWords = wrongQuestions.map(q => q.question || '').join(' ')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 4)

      const freq = {}
      allWords.forEach(w => {
        freq[w] = (freq[w] || 0) + 1
      })

      const weakTopics = Object.entries(freq)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([word]) => word)

      if (weakTopics.length > 0) {
        weakTopicsText = weakTopics.join(', ')
      }
    }

    // Find personal best
    // Group responses by roomId
    const responsesByRoom = {}
    responses.forEach(r => {
      const rId = String(r.roomId)
      if (!responsesByRoom[rId]) responsesByRoom[rId] = []
      responsesByRoom[rId].push(r)
    })

    let maxAccuracy = -1
    let bestRoomName = ''
    for (const [rId, rList] of Object.entries(responsesByRoom)) {
      const acc = Math.round((rList.filter(r => r.isCorrect).length / rList.length) * 100) || 0
      if (acc > maxAccuracy) {
        maxAccuracy = acc
        const room = await Room.findById(rId).select('name').lean()
        bestRoomName = room ? room.name : 'Unknown Room'
      }
    }
    if (maxAccuracy >= 0) {
      personalBestText = `${bestRoomName} (${maxAccuracy}% accuracy)`
    }

    // Build Prompt
    const prompt = `You are an educational analyst. Given this student's performance data across multiple sessions, write a 2-3 sentence learning narrative:

Student: ${studentInfo.name}
Total Sessions: ${totalSessions}
Overall Accuracy: ${overallAccuracy}%
Trend: ${trend} (improving/declining/stable)
Weak Topics: ${weakTopicsText}
Personal Best: ${personalBestText}

Write a positive, constructive narrative that highlights growth and suggests focus areas. Do not include any intros or headers, return only the 2-3 sentence narrative.`

    // Select the first enabled provider key
    const provider = config.minimaxApiKey ? 'minimax'
                   : config.openaiApiKey ? 'openai'
                   : config.anthropicApiKey ? 'anthropic'
                   : config.googleApiKey ? 'google'
                   : null

    if (!provider) {
      return res.json({ success: true, narrative: `AI learning narrative cannot be generated because no AI Provider keys are configured.` })
    }

    const narrativeText = await callProvider(provider, prompt)
    res.json({ success: true, narrative: narrativeText.trim() })
  } catch (error) {
    next(error)
  }
})

export default router
