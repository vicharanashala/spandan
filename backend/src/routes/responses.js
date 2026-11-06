import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { isBatchEnabled, bufferResponse } from '../services/responseBuffer.js'
import * as resultsSnapshot from '../services/resultsSnapshot.js'
import { PICKS_EXPR, buildQuestionStats } from '../services/questionStats.js'
import { computeRankedIncremental } from '../services/leaderboardCache.js'
import { anonymizeBoard, buildStudentBoard } from '../services/anonymizeLeaderboard.js'
import { checkRoomOwnership } from '../utils/roomOwnership.js'
import { computeInsights } from '../services/insightsService.js'
import { getInsightsBody, roomVersion } from '../services/insightsCache.js'
import { debug } from '../utils/debug.js'
import { computeRanked } from '../services/leaderboardAgg.js'
import { isMembershipPresent } from '../services/attendanceService.js'

const router = express.Router()

// How many ranks are shown publicly to a student.
const LEADERBOARD_TOP_N = Number(process.env.LEADERBOARD_TOP_N) || 10

// Apply authentication to all routes.
router.use(authenticate)

// --- Hot-path read caches ----------------------------------------------------

const MEMBER_TTL_MS = Number(process.env.MEMBER_CACHE_TTL_MS) || 60000
const memberCache = new Map()

async function isRoomMember(RoomMember, roomId, studentId) {
  const key = `${roomId}:${studentId}`
  const exp = memberCache.get(key)

  if (exp && exp > Date.now()) return true

  const found = await RoomMember.findOne({
    roomId,
    studentId,
    // Waiting / rejected students are not members yet: they must not be able to submit answers.
    status: { $nin: ['waiting', 'rejected'] }
  })
    .select('_id')
    .lean()

  if (found) {
    if (memberCache.size > 50000) memberCache.clear()
    memberCache.set(key, Date.now() + MEMBER_TTL_MS)
    return true
  }

  return false
}

const QUESTION_TTL_MS = Number(process.env.QUESTION_CACHE_TTL_MS) || 30000
const questionCache = new Map()

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

const ROOM_QUESTIONS_TTL_MS =
  Number(process.env.ROOM_QUESTIONS_CACHE_TTL_MS) || 10000

const roomQuestionsCache = new Map()
const roomQuestionsInflight = new Map()

async function getRoomQuestionsCached(Question, roomObjectId) {
  const key = String(roomObjectId)
  const hit = roomQuestionsCache.get(key)

  if (hit && hit.expiresAt > Date.now()) return hit.questions

  const inflight = roomQuestionsInflight.get(key)
  if (inflight) return inflight

  const p = (async () => {
    try {
      const questions = await Question.find({
        roomId: roomObjectId,
        status: 'approved'
      }).sort({ createdAt: -1 }).lean()

      if (roomQuestionsCache.size > 50000) roomQuestionsCache.clear()

      roomQuestionsCache.set(key, {
        questions,
        expiresAt: Date.now() + ROOM_QUESTIONS_TTL_MS
      })

      return questions
    } finally {
      roomQuestionsInflight.delete(key)
    }
  })()

  roomQuestionsInflight.set(key, p)
  return p
}

// -----------------------------------------------------------------------------
// POST /api/responses - Save a student's answer
// -----------------------------------------------------------------------------

router.post('/', authorize('student'), async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default

    const { roomId, questionId, selectedOptions, responseTime } = req.body
    const studentId = req.user._id

    const isMember = await isRoomMember(RoomMember, roomId, studentId)

    if (!isMember) {
      return res.status(403).json({
        error: 'You have not joined this room'
      })
    }

    if (
      !roomId ||
      !questionId ||
      !selectedOptions ||
      !Array.isArray(selectedOptions)
    ) {
      return res.status(400).json({
        error: 'Missing required fields: roomId, questionId, and selectedOptions (array)'
      })
    }

    // Fresh presence gate. `isRoomMember` above is cached for 60s, so it cannot tell whether the
    // student is in the room RIGHT NOW. Attention tracking closes the open presence interval when
    // the Spandan window has been hidden/unfocused (or the tab disconnected), so answering while
    // away must be refused instead of silently recorded. A membership with no presence history at
    // all (written before tracking existed) is treated as present for backward compatibility.
    const liveMember = await RoomMember.findOne({
      roomId,
      studentId,
      status: { $nin: ['waiting', 'rejected'] }
    })
      .select('leftAt presence')
      .lean()

    if (!liveMember) {
      return res.status(403).json({ error: 'You have not joined this room' })
    }

    const hasOpenPresence = isMembershipPresent(liveMember)
    if (!hasOpenPresence) {
      return res.status(409).json({
        code: 'AWAY',
        error: 'attendance_required',
        message: 'You are marked away. Return to the Spandan window to answer.'
      })
    }

    const question = await getQuestionCached(Question, questionId)

    if (!question) {
      return res.status(404).json({ error: 'Question not found' })
    }

    const Room = (await import('../models/Room.js')).default
    const { getRoomLive } = await import('../services/roomLiveCache.js')

    const roomLive = await getRoomLive(Room, roomId)

    if (!roomLive || roomLive.endedAt) {
      return res.status(409).json({ error: 'poll_closed' })
    }

    if (String(questionId) !== String(roomLive.currentQuestion || '')) {
      const fresh = await Question.findById(questionId).select('closeAt')
      const closeAt = fresh?.closeAt
        ? new Date(fresh.closeAt).getTime()
        : 0

      if (!closeAt || Date.now() >= closeAt) {
        return res.status(409).json({ error: 'poll_closed' })
      }
    }

    let isCorrect = false

    if (question.type === 'MSQ') {
      const correctIndices = question.options
        .map((opt, idx) => opt.isCorrect ? idx : -1)
        .filter(idx => idx !== -1)

      const selectedSet = new Set(selectedOptions)
      const correctSet = new Set(correctIndices)

      const allCorrectSelected = correctIndices.every(
        idx => selectedSet.has(idx)
      )

      const noIncorrectSelected = selectedOptions.every(
        idx => correctSet.has(idx)
      )

      isCorrect = allCorrectSelected && noIncorrectSelected
    } else {
      const selectedOptionData = question.options[selectedOptions[0]]
      isCorrect = selectedOptionData?.isCorrect || false
    }

    const maxPoints = question.points || 100
    const tta = question.timeToAnswer || 30

    const rawRespTime = Number(responseTime)
    const respTime = (
      Number.isFinite(rawRespTime) &&
      rawRespTime >= 0 &&
      rawRespTime <= tta
    ) ? rawRespTime : tta

    let points = 0

    if (isCorrect) {
      const timeRemaining = Math.max(0, tta - respTime)
      const timeDecayFactor = Math.max(0.1, timeRemaining / tta)
      points = Math.round(maxPoints * timeDecayFactor)
    }

    points = Math.max(0, Math.min(points, maxPoints))

    const responseData = {
      roomId,
      questionId,
      studentId,
      selectedOption: selectedOptions[0],
      selectedOptions,
      isCorrect,
      responseTime: respTime,
      points
    }

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
          const existingResponse = await Response.findOne({
            roomId,
            questionId,
            studentId
          })

          return res.status(409).json({
            success: false,
            error: 'Already responded to this question',
            existingResponse: existingResponse ? {
              selectedOption: existingResponse.selectedOption,
              selectedOptions: existingResponse.selectedOptions
            } : undefined
          })
        }

        throw saveErr
      }
    }

    const live = req.app.get('liveUpdates')
    live?.scheduleCounts(roomId)

    const rankInfo = (
      live ? await live.getRank(roomId, studentId) : null
    ) || {}

    const {
      isCorrect: _omitIsCorrect,
      points: _omitPoints,
      ...safeResponse
    } = savedResponse

    res.status(201).json({
      success: true,
      response: safeResponse,
      rank: rankInfo.rank ?? null,
      totalParticipants: rankInfo.totalParticipants ?? null
    })
  } catch (error) {
    console.error('Error saving response:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to save response'
    })
  }
})

// -----------------------------------------------------------------------------
// GET /api/responses
// -----------------------------------------------------------------------------

router.get('/', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default

    const {
      roomId,
      studentId,
      page = 1,
      limit = 50
    } = req.query

    const currentUser = req.user

    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' })
    }

    const room = await Room.findById(roomId)

    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    const isTeacher =
      room.teacher.toString() === currentUser._id.toString()

    const isStudentMember = await RoomMember.findOne({
      roomId,
      studentId: currentUser._id,
      status: { $nin: ['waiting', 'rejected'] }
    })

    if (
      currentUser.role === 'student' &&
      studentId &&
      studentId !== currentUser._id.toString()
    ) {
      return res.status(403).json({
        error: 'Not authorized to view other students\' responses'
      })
    }

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({
        error: 'Not authorized to access responses for this room'
      })
    }

    const filter = { roomId }

    if (isTeacher) {
      if (studentId) filter.studentId = studentId
    } else {
      filter.studentId = currentUser._id
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50))
    const skip = (pageNum - 1) * limitNum

    const [responses, total] = await Promise.all([
      Response.find(filter)
        .populate('questionId')
        .skip(skip)
        .limit(limitNum)
        .sort({ createdAt: -1 })
        .lean(),
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
    res.status(500).json({
      success: false,
      error: 'Failed to fetch responses'
    })
  }
})

// -----------------------------------------------------------------------------
// GET /api/responses/stats/student/:studentId
// -----------------------------------------------------------------------------

router.get('/stats/student/:studentId', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default

    const { studentId } = req.params
    const currentUser = req.user

    const isSelf = currentUser._id.toString() === studentId

    if (currentUser.role === 'student' && !isSelf) {
      return res.status(403).json({
        error: 'Not authorized to view other students\' stats'
      })
    }

    if (currentUser.role === 'teacher') {
      const studentRoomMember = await RoomMember.find({ studentId })
      const teacherRooms = await Room.find({ teacher: currentUser._id })
      const teacherRoomIds = teacherRooms.map(r => r._id.toString())

      const hasAccess = studentRoomMember.some(
        m => teacherRoomIds.includes(m.roomId.toString())
      )

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Not authorized to view this student\'s stats'
        })
      }
    }

    const roomMemberships = await RoomMember.find({ studentId })
    const roomIdsMember = roomMemberships.map(m => m.roomId)

    const uniqueRoomIdsFromResponse = await Response.distinct(
      'roomId',
      { studentId }
    )

    const allRoomIds = [
      ...new Set([
        ...roomIdsMember.map(id => id.toString()),
        ...uniqueRoomIdsFromResponse.map(id => id.toString())
      ])
    ]

    const existingRoomIds = (
      await Room.distinct('_id', {
        _id: { $in: allRoomIds }
      })
    ).map(id => id.toString())

    const totalRooms = existingRoomIds.length
    const roomIds = roomMemberships.map(m => m.roomId)

    const pollsTaken = await Response.countDocuments({ studentId })
    const responses = await Response.find({ studentId })

    const totalPoints = responses.reduce((sum, r) => sum + r.points, 0)
    const average = pollsTaken > 0
      ? Math.round((totalPoints / (pollsTaken * 100)) * 100)
      : 0

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
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats'
    })
  }
})

// -----------------------------------------------------------------------------
// GET /api/responses/performance/student/:studentId
// Student Performance Journey + Answering Pattern analytics
// -----------------------------------------------------------------------------

router.get('/performance/student/:studentId', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default
    const mongoose = (await import('mongoose')).default

    const { studentId } = req.params
    const { classId } = req.query
    const currentUser = req.user

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: 'Invalid studentId' })
    }

    const isSelf = currentUser._id.toString() === studentId

    if (currentUser.role === 'student' && !isSelf) {
      return res.status(403).json({
        error: 'Not authorized to view other students\' performance'
      })
    }

    const studentObjectId = new mongoose.Types.ObjectId(studentId)
    if (classId && !mongoose.Types.ObjectId.isValid(classId)) {
      return res.status(400).json({ error: 'Invalid classId' })
    }
    const classObjectId = classId ? new mongoose.Types.ObjectId(classId) : null

    if (currentUser.role === 'teacher') {
      const [studentRoomIds, teacherRoomIds] = await Promise.all([
        RoomMember.distinct('roomId', { studentId: studentObjectId }),
        Room.distinct('_id', { teacher: currentUser._id })
      ])

      const teacherRoomSet = new Set(
        teacherRoomIds.map(id => id.toString())
      )

      const hasAccess = studentRoomIds.some(
        id => teacherRoomSet.has(id.toString())
      )

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Not authorized to view this student\'s performance'
        })
      }
    }

    const [memberships, respondedRoomIds] = await Promise.all([
      RoomMember.find({ studentId: studentObjectId })
        .select('roomId joinedAt')
        .lean(),
      Response.distinct('roomId', { studentId: studentObjectId })
    ])

    const attendanceByRoom = new Map(
      memberships.map(m => [
        m.roomId.toString(),
        { attended: true, joinedAt: m.joinedAt }
      ])
    )

    const candidateRoomIds = [...new Set([
      ...memberships.map(m => m.roomId.toString()),
      ...respondedRoomIds.map(id => id.toString())
    ])]

    if (!candidateRoomIds.length) {
      return res.json({
        success: true,
        summary: {
          totalSessions: 0,
          averageScore: 0,
          overallAccuracy: 0,
          averageRank: null,
          currentRank: null,
          totalQuestions: 0,
          attemptedQuestions: 0,
          missedQuestions: 0,
          correctAnswers: 0,
          incorrectAnswers: 0,
          bestPerformance: null,
          weakestPerformance: null,
          recentComparison: null
        },
        history: [],
        trends: { score: [], accuracy: [], rank: [] },
        answeringPattern: {
          averageResponseTime: null,
          totalResponses: 0,
          questionTypes: []
        }
      })
    }

    const roomObjectIds = candidateRoomIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id))

    const completedRoomFilter = {
      _id: { $in: roomObjectIds },
      endedAt: { $ne: null }
    }
    if (classObjectId) completedRoomFilter.classId = classObjectId

    const completedRooms = await Room.find(completedRoomFilter)
      .select('_id name code createdAt updatedAt endedAt')
      .sort({ endedAt: 1 })
      .lean()

    if (!completedRooms.length) {
      return res.json({
        success: true,
        summary: {
          totalSessions: 0,
          averageScore: 0,
          overallAccuracy: 0,
          averageRank: null,
          currentRank: null,
          totalQuestions: 0,
          attemptedQuestions: 0,
          missedQuestions: 0,
          correctAnswers: 0,
          incorrectAnswers: 0,
          bestPerformance: null,
          weakestPerformance: null,
          recentComparison: null
        },
        history: [],
        trends: { score: [], accuracy: [], rank: [] },
        answeringPattern: {
          averageResponseTime: null,
          totalResponses: 0,
          questionTypes: []
        }
      })
    }

    const completedRoomIds = completedRooms.map(r => r._id)
    const roomKey = id => id.toString()

    const questionTotals = await Question.aggregate([
      {
        $match: {
          roomId: { $in: completedRoomIds },
          status: 'approved'
        }
      },
      {
        $group: {
          _id: '$roomId',
          totalQuestions: { $sum: 1 },
          possiblePoints: {
            $sum: { $ifNull: ['$points', 100] }
          }
        }
      }
    ])

    const questionTotalsByRoom = new Map(
      questionTotals.map(q => [
        roomKey(q._id),
        {
          totalQuestions: q.totalQuestions || 0,
          possiblePoints: q.possiblePoints || 0
        }
      ])
    )

    const studentStats = await Response.aggregate([
      {
        $match: {
          studentId: studentObjectId,
          roomId: { $in: completedRoomIds }
        }
      },
      {
        $group: {
          _id: '$roomId',
          attempted: { $sum: 1 },
          correct: {
            $sum: { $cond: ['$isCorrect', 1, 0] }
          },
          points: { $sum: { $ifNull: ['$points', 0] } },
          averageResponseTime: { $avg: '$responseTime' }
        }
      }
    ])

    const studentStatsByRoom = new Map(
      studentStats.map(s => [roomKey(s._id), s])
    )

    const rankedRows = await Response.aggregate([
      {
        $match: {
          roomId: { $in: completedRoomIds }
        }
      },
      {
        $group: {
          _id: {
            roomId: '$roomId',
            studentId: '$studentId'
          },
          totalPoints: {
            $sum: { $ifNull: ['$points', 0] }
          }
        }
      },
      {
        $sort: {
          '_id.roomId': 1,
          totalPoints: -1,
          '_id.studentId': 1
        }
      }
    ])

    const rankByRoomStudent = new Map()
    const participantCountByRoom = new Map()

    let activeRoom = null
    let rank = 0

    for (const row of rankedRows) {
      const rid = roomKey(row._id.roomId)

      if (rid !== activeRoom) {
        activeRoom = rid
        rank = 0
        participantCountByRoom.set(rid, 0)
      }

      rank += 1
      participantCountByRoom.set(rid, rank)

      rankByRoomStudent.set(
        `${rid}:${row._id.studentId.toString()}`,
        rank
      )
    }

    const history = completedRooms.map(room => {
      const rid = roomKey(room._id)

      const q = questionTotalsByRoom.get(rid) || {
        totalQuestions: 0,
        possiblePoints: 0
      }

      const s = studentStatsByRoom.get(rid) || {
        attempted: 0,
        correct: 0,
        points: 0
      }

      const attempted = s.attempted || 0
      const totalQuestions = q.totalQuestions || 0
      const missed = Math.max(0, totalQuestions - attempted)
      const incorrect = Math.max(0, attempted - (s.correct || 0))

      const score = q.possiblePoints > 0
        ? Math.round((s.points / q.possiblePoints) * 100)
        : 0

      const accuracy = attempted > 0
        ? Math.round(((s.correct || 0) / attempted) * 100)
        : 0

      const rankValue =
        rankByRoomStudent.get(`${rid}:${studentId}`) ?? null

      const participantCount = participantCountByRoom.get(rid) || 0
      const attended = attendanceByRoom.has(rid)

      return {
        roomId: rid,
        name: room.name || 'Untitled session',
        code: room.code || null,
        date: room.endedAt || room.updatedAt || room.createdAt,
        attended,
        score,
        accuracy,
        rank: rankValue,
        participantCount,
        totalQuestions,
        attemptedQuestions: attempted,
        missedQuestions: missed,
        correctAnswers: s.correct || 0,
        incorrectAnswers: incorrect,
        averageResponseTime: attempted > 0 &&
          Number.isFinite(s.averageResponseTime)
          ? Math.round(s.averageResponseTime * 10) / 10
          : null,
        pointsEarned: s.points || 0,
        possiblePoints: q.possiblePoints || 0
      }
    })

    const attendedHistory = history.filter(item => item.attended)
    const rankedHistory = attendedHistory.filter(item => item.rank != null)

    const attendedCompletedRoomIds = completedRooms
      .filter(room => attendanceByRoom.has(roomKey(room._id)))
      .map(room => room._id)

    // -----------------------------------------------------------------------
    // Answering Pattern analytics
    // Uses actual saved response records and existing question types.
    // No topic tags are assumed.
    // -----------------------------------------------------------------------

    const questionTypeStats = attendedCompletedRoomIds.length
      ? await Response.aggregate([
        {
          $match: {
            studentId: studentObjectId,
            roomId: { $in: attendedCompletedRoomIds }
          }
        },
        {
          $lookup: {
            from: Question.collection.name,
            localField: 'questionId',
            foreignField: '_id',
            as: 'question'
          }
        },
        { $unwind: '$question' },
        {
          $group: {
            _id: '$question.type',
            attempted: { $sum: 1 },
            correct: {
              $sum: { $cond: ['$isCorrect', 1, 0] }
            },
            incorrect: {
              $sum: { $cond: ['$isCorrect', 0, 1] }
            },
            averageResponseTime: { $avg: '$responseTime' }
          }
        },
        { $sort: { _id: 1 } }
      ])
      : []

    const totalTypeResponses = questionTypeStats.reduce(
      (sum, item) => sum + item.attempted,
      0
    )

    const averageResponseTime = totalTypeResponses > 0
      ? Math.round((
        questionTypeStats.reduce(
          (sum, item) =>
            sum + (item.averageResponseTime || 0) * item.attempted,
          0
        ) / totalTypeResponses
      ) * 10) / 10
      : null

    const answeringPattern = {
      averageResponseTime,
      totalResponses: totalTypeResponses,
      questionTypes: questionTypeStats.map(item => ({
        type: item._id,
        attempted: item.attempted,
        correct: item.correct,
        incorrect: item.incorrect,
        accuracy: item.attempted > 0
          ? Math.round((item.correct / item.attempted) * 100)
          : 0,
        averageResponseTime: Number.isFinite(item.averageResponseTime)
          ? Math.round(item.averageResponseTime * 10) / 10
          : null
      }))
    }

    const totalSessions = attendedHistory.length

    const totalQuestions = attendedHistory.reduce(
      (sum, s) => sum + s.totalQuestions,
      0
    )

    const attemptedQuestions = attendedHistory.reduce(
      (sum, s) => sum + s.attemptedQuestions,
      0
    )

    const missedQuestions = attendedHistory.reduce(
      (sum, s) => sum + s.missedQuestions,
      0
    )

    const correctAnswers = attendedHistory.reduce(
      (sum, s) => sum + s.correctAnswers,
      0
    )

    const incorrectAnswers = attendedHistory.reduce(
      (sum, s) => sum + s.incorrectAnswers,
      0
    )

    const overallAccuracy = attemptedQuestions > 0
      ? Math.round((correctAnswers / attemptedQuestions) * 100)
      : 0

    const averageScore = totalSessions > 0
      ? Math.round(
        attendedHistory.reduce((sum, s) => sum + s.score, 0) /
        totalSessions
      )
      : 0

    const averageRank = rankedHistory.length > 0
      ? Math.round((
        rankedHistory.reduce((sum, s) => sum + s.rank, 0) /
        rankedHistory.length
      ) * 10) / 10
      : null

    const current = attendedHistory[attendedHistory.length - 1] || null
    const previous = attendedHistory[attendedHistory.length - 2] || null

    const best = attendedHistory.length
      ? attendedHistory.reduce(
        (bestItem, item) =>
          item.score > bestItem.score ? item : bestItem
      )
      : null

    const weakest = attendedHistory.length
      ? attendedHistory.reduce(
        (weakItem, item) =>
          item.score < weakItem.score ? item : weakItem
      )
      : null

    const summary = {
      totalSessions,
      averageScore,
      overallAccuracy,
      averageRank,
      currentRank: current?.rank ?? null,
      totalQuestions,
      attemptedQuestions,
      missedQuestions,
      correctAnswers,
      incorrectAnswers,

      bestPerformance: best ? {
        roomId: best.roomId,
        name: best.name,
        score: best.score,
        accuracy: best.accuracy,
        rank: best.rank
      } : null,

      weakestPerformance: weakest ? {
        roomId: weakest.roomId,
        name: weakest.name,
        score: weakest.score,
        accuracy: weakest.accuracy,
        rank: weakest.rank
      } : null,

      recentComparison: current ? {
        current: {
          roomId: current.roomId,
          name: current.name,
          score: current.score,
          accuracy: current.accuracy,
          rank: current.rank
        },

        previous: previous ? {
          roomId: previous.roomId,
          name: previous.name,
          score: previous.score,
          accuracy: previous.accuracy,
          rank: previous.rank
        } : null,

        scoreChange: previous
          ? current.score - previous.score
          : null,

        accuracyChange: previous
          ? current.accuracy - previous.accuracy
          : null,

        rankChange: previous &&
          current.rank != null &&
          previous.rank != null
          ? previous.rank - current.rank
          : null
      } : null
    }

    res.json({
      success: true,
      summary,
      history,
      answeringPattern,
      trends: {
        score: attendedHistory.map(s => ({
          date: s.date,
          value: s.score,
          name: s.name
        })),
        accuracy: attendedHistory.map(s => ({
          date: s.date,
          value: s.accuracy,
          name: s.name
        })),
        rank: rankedHistory.map(s => ({
          date: s.date,
          value: s.rank,
          name: s.name
        }))
      }
    })
  } catch (error) {
    console.error('Error fetching student performance journey:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch student performance'
    })
  }
})

// -----------------------------------------------------------------------------
// GET /api/responses/stats/room/:roomId
// -----------------------------------------------------------------------------

router.get('/stats/room/:roomId', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default

    const { roomId } = req.params
    const currentUser = req.user

    const room = await Room.findById(roomId)

    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    if (room.teacher.toString() !== currentUser._id.toString()) {
      return res.status(403).json({
        error: 'Not authorized to view this room\'s stats'
      })
    }

    const ended = !!room?.endedAt
    const cachedStats = await resultsSnapshot.getStats(roomId, { ended })

    if (cachedStats) {
      return res.json({ success: true, stats: cachedStats })
    }

    const mongoose = (await import('mongoose')).default
    const roomObjId = new mongoose.Types.ObjectId(roomId)

    // Merge both implementations: keep the custom questionStats response shape used by this
    // branch (answerCounts, correctCount, totalResponses), while using the main branch's grouped
    // aggregation so every selected option is counted correctly for MSQ questions too.
    // This remains one aggregation rather than a per-question query loop.
    const [totalResponses, uniqueStudents, totalJoined, questions, grouped] = await Promise.all([
      Response.countDocuments({ roomId }),
      Response.distinct('studentId', { roomId }),
      RoomMember.countDocuments({ roomId, status: { $nin: ['waiting', 'rejected'] } }),
      Question.find({ roomId }).lean(),
      Response.aggregate([
        { $match: { roomId: roomObjId } },
        {
          $group: {
            _id: '$questionId',
            total: { $sum: 1 },
            correct: { $sum: { $cond: ['$isCorrect', 1, 0] } },
            picks: { $push: PICKS_EXPR }
          }
        }
      ])
    ])

    const tallies = new Map()
    for (const g of grouped) {
      if (!g._id) continue
      const optionCounts = new Map()
      for (const picks of g.picks) {
        for (const optionIndex of picks) {
          if (Number.isInteger(optionIndex)) {
            optionCounts.set(optionIndex, (optionCounts.get(optionIndex) || 0) + 1)
          }
        }
      }
      tallies.set(g._id.toString(), {
        total: g.total,
        correct: g.correct,
        opts: optionCounts
      })
    }

    // Preserve this branch's API fields so the existing frontend continues to work.
    const questionStats = questions.map(question => {
      const tally = tallies.get(question._id.toString()) || {
        total: 0,
        correct: 0,
        opts: new Map()
      }
      const answerCounts = {}
      question.options.forEach((option, index) => {
        answerCounts[index] = tally.opts.get(index) || 0
      })

      return {
        questionId: question._id,
        question: question.question,
        type: question.type,
        totalResponses: tally.total,
        correctCount: tally.correct,
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
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats'
    })
  }
})

// -----------------------------------------------------------------------------
// GET /api/responses/room/:roomId/student/:studentId
// -----------------------------------------------------------------------------

router.get('/room/:roomId/student/:studentId', async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    const mongoose = (await import('mongoose')).default
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default

    const { roomId, studentId } = req.params
    const currentUser = req.user

    const room = await Room.findById(roomId)

    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    const isTeacher =
      room.teacher.toString() === currentUser._id.toString()

    const isSelf = currentUser._id.toString() === studentId

    if (!isTeacher && !isSelf) {
      return res.status(403).json({
        error: 'Not authorized to view this student\'s responses'
      })
    }

    if (!isTeacher && isSelf) {
      const isMember = await RoomMember.findOne({
        roomId,
        studentId: currentUser._id,
        status: { $nin: ['waiting', 'rejected'] }
      })

      if (!isMember) {
        return res.status(403).json({
          error: 'Not a member of this room'
        })
      }
    }

    const ended = !!room?.endedAt
    const snap = await resultsSnapshot.getStudent(
      roomId,
      studentId,
      { ended }
    )

    if (snap.hit) {
      return res.json({ success: true, questions: snap.questions })
    }

    const toObjectId = id => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        return new mongoose.Types.ObjectId(id)
      }
      return id
    }

    const roomObjectId = toObjectId(roomId)
    const studentObjectId = toObjectId(studentId)

    const responses = await Response.find({
      roomId: roomObjectId,
      studentId: studentObjectId
    }).lean()

    debug(
      `[responses] Fetched ${responses.length} responses for student ${studentId} in room ${roomId}`
    )

    const toIdString = id => {
      if (!id) return String(id)
      if (typeof id === 'string') return id
      if (id.toHexString) return id.toHexString()
      if (id._bsontype === 'ObjectId') return id.toString()
      return String(id)
    }

    const responseMap = {}

    responses.forEach(r => {
      const qId = toIdString(r.questionId)
      debug(
        `[responses] Response for questionId: ${qId}, selectedOption: ${r.selectedOption}, isCorrect: ${r.isCorrect}`
      )
      responseMap[qId] = r
    })

    const questions = await getRoomQuestionsCached(Question, roomObjectId)

    debug(`[responses] Found ${questions.length} questions for room ${roomId}`)

    const activeQid =
      (!ended && room?.currentQuestion)
        ? String(room.currentQuestion)
        : null

    const questionsWithResponses = questions.map(q => {
      const qIdStr = toIdString(q._id)
      const studentResponse = responseMap[qIdStr]
      const isActive = !!activeQid && qIdStr === activeQid

      const options = isActive
        ? q.options.map(o =>
          (o && typeof o === 'object')
            ? (({ isCorrect, ...opt }) => opt)(o)
            : o
        )
        : q.options

      if (studentResponse) {
        debug(
          `[responses] Matched question ${qIdStr} with response, selectedOption: ${studentResponse.selectedOption}`
        )
      }

      return {
        _id: qIdStr,
        question: q.question,
        type: q.type,
        options,
        segmentIndex: q.segmentIndex,
        maxPoints: q.points,
        timeToAnswer: q.timeToAnswer,
        answered: !!studentResponse,
        ...(isActive ? { resultPending: true } : {}),
        ...(studentResponse && {
          selectedOption: studentResponse.selectedOption,
          selectedOptions:
            studentResponse.selectedOptions || [studentResponse.selectedOption],
          responseTime: studentResponse.responseTime,
          ...(isActive ? {} : {
            isCorrect: studentResponse.isCorrect,
            pointsEarned: studentResponse.points
          })
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
    res.status(500).json({
      success: false,
      error: 'Failed to fetch responses'
    })
  }
})

// -----------------------------------------------------------------------------
// GET /api/responses/counts/:roomId
// -----------------------------------------------------------------------------

router.get('/counts/:roomId', async (req, res) => {
  try {
    const mongoose = (await import('mongoose')).default
    const Response = (await import('../models/Response.js')).default
    const Room = (await import('../models/Room.js')).default
    const { roomId } = req.params

    const room = await Room.findById(roomId)
    const ownership = checkRoomOwnership(room, req.user._id)

    if (!ownership.ok) {
      return res.status(ownership.status).json({
        error: ownership.error
      })
    }

    const toObjectId = id => {
      if (!id) return null
      if (typeof id === 'object' && id._bsontype === 'ObjectId') return id
      return new mongoose.Types.ObjectId(id)
    }

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
    res.status(500).json({
      error: 'Failed to fetch counts'
    })
  }
})

// -----------------------------------------------------------------------------
// POST /api/responses/leaderboard/:roomId/segment-done
// -----------------------------------------------------------------------------

router.post('/leaderboard/:roomId/segment-done', async (req, res) => {
  try {
    const Room = (await import('../models/Room.js')).default
    const { roomId } = req.params
    const room = await Room.findById(roomId)

    const ownership = checkRoomOwnership(room, req.user._id)

    if (!ownership.ok) {
      return res.status(ownership.status).json({
        error: ownership.error
      })
    }

    req.app.get('liveUpdates')?.scheduleSegmentFold(roomId)

    res.status(202).json({ success: true })
  } catch (error) {
    console.error('segment-done error:', error)
    res.status(500).json({
      error: 'Failed to schedule leaderboard update'
    })
  }
})

// GET /api/responses/insights/:roomId - session insights for the results page (one aggregated payload:
// totals, timeline, join curve, per-question item analysis, score distribution, segments; teachers also
// get the student×question heatmap and names). Teacher = room owner (full); student = room member (class
// aggregates only); anyone else 403.
router.get('/insights/:roomId', async (req, res) => {
  try {
    const mongoose = (await import('mongoose')).default
    const Room = (await import('../models/Room.js')).default
    const Question = (await import('../models/Question.js')).default
    const Response = (await import('../models/Response.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default
    const Transcript = (await import('../models/Transcript.js')).default
    const User = (await import('../models/User.js')).default
    const { roomId } = req.params
    if (!mongoose.Types.ObjectId.isValid(roomId)) return res.status(400).json({ error: 'Invalid room id' })
    const room = await Room.findById(roomId).lean()
    if (!room) return res.status(404).json({ error: 'Room not found' })
    // Access, same rules as the other results reads: the OWNING teacher (checkRoomOwnership) gets the
    // full payload at any time; a student only if they are a member of this room AND the room has
    // ended (the payload carries every correct option and explanation, so it must never be readable
    // while a poll could still be live). Anyone else → 403. authenticate() already runs for every
    // /api/responses route (mounted in index.js) and rejects unapproved teachers.
    const isTeacher = req.user.role === 'teacher' && checkRoomOwnership(room, req.user._id).ok
    if (!isTeacher) {
      if (req.user.role !== 'student') return res.status(403).json({ error: 'Not authorized to view this room' })
      const member = await RoomMember.findOne({
        roomId,
        studentId: req.user._id,
        status: { $nin: ['waiting', 'rejected'] }
      }).lean()
      if (!member) return res.status(403).json({ error: 'Not authorized to view this room' })
      if (!room.endedAt) return res.status(403).json({ error: 'Results are available once the room has ended' })
    }

    // Ended rooms: served from the once-per-room insights cache (memory, plus Redis when connected),
    // so the end-of-session rush doesn't re-read and recompute the whole room per viewer. A miss
    // (live room, Redis down AND build failed, or a student not in the cached build) falls through
    // to the direct compute below.
    const cached = await getInsightsBody(roomId, { ended: !!room.endedAt, role: isTeacher ? 'teacher' : 'student', studentId: req.user._id, version: roomVersion(room) })
    if (cached) return res.type('json').send(cached)

    const [questions, responses, members, transcripts] = await Promise.all([
      Question.find({ roomId }).lean(),
      Response.find({ roomId }).select('questionId studentId selectedOption selectedOptions isCorrect responseTime points createdAt').lean(),
      RoomMember.find({ roomId, status: { $nin: ['waiting', 'rejected'] } })
        .select('studentId joinedAt onTime presence leftAt attendanceExcused attendanceFinalizedAt sessionSeconds presentSeconds forgivenSeconds missedSeconds penaltyPercent rawPoints adjustedPoints')
        .lean(),
      Transcript.find({ roomId }).select('segmentIndex wordCount duration').lean()
    ])
    let usersById = new Map()
    if (isTeacher) {
      const ids = [...new Set([...responses.map((r) => String(r.studentId)), ...members.map((m) => String(m.studentId))])]
      const users = await User.find({ _id: { $in: ids } }).select('name email').lean()
      usersById = new Map(users.map((u) => [String(u._id), u]))
    }
    const insights = computeInsights({ room, questions, responses, members, transcripts, usersById, forTeacher: isTeacher, studentId: isTeacher ? null : req.user._id })
    res.json({ success: true, role: isTeacher ? 'teacher' : 'student', ...insights })
  } catch (error) {
    console.error('Error computing insights:', error)
    res.status(500).json({ success: false, error: 'Failed to compute insights' })
  }
})

// GET /api/responses/leaderboard/:roomId - Get ranked leaderboard for a room
// Authorization: teacher (owner's room) sees full, students (joined room) see top 3 only
router.get('/leaderboard/:roomId', async (req, res) => {
  try {
    const Room = (await import('../models/Room.js')).default
    const RoomMember = (await import('../models/RoomMember.js')).default

    const { roomId } = req.params
    const currentUser = req.user

    const room = await Room.findById(roomId)

    const isTeacher =
      room && room.teacher.toString() === currentUser._id.toString()

    const isStudentMember = await RoomMember.findOne({
      roomId,
      studentId: currentUser._id,
      status: { $nin: ['waiting', 'rejected'] }
    })

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({
        error: 'Not authorized to view this leaderboard'
      })
    }

    const ended = !!room?.endedAt
    let leaderboard = await resultsSnapshot.getLeaderboard(
      roomId,
      { ended }
    )

    if (!leaderboard || leaderboard.length === 0) {
      leaderboard = (await computeRanked(roomId)).full
    }

    const anonymous = !!room?.settings?.anonymousLeaderboard
    const anonPct = room?.settings?.anonymityPercent ?? 0
    const revealBottom =
      anonymous && !!room?.settings?.revealBottomToStudents

    const total = leaderboard.length
    let visibleLeaderboard = leaderboard
    let userRank = null

    if (isTeacher) {
      visibleLeaderboard = anonymous
        ? anonymizeBoard(leaderboard, {
          anonymous,
          pct: anonPct,
          total,
          viewer: 'teacher'
        })
        : leaderboard
    } else if (anonymous) {
      visibleLeaderboard = buildStudentBoard(leaderboard, {
        pct: anonPct,
        total,
        topN: LEADERBOARD_TOP_N,
        revealBottom
      })
      userRank = null
    } else {
      const userEntry = leaderboard.find(
        e => e.studentId === currentUser._id.toString()
      )

      userRank = userEntry?.rank || null
      visibleLeaderboard = leaderboard.slice(0, LEADERBOARD_TOP_N)

      if (userEntry && userEntry.rank > LEADERBOARD_TOP_N) {
        const alreadyInTopN = visibleLeaderboard.some(
          e => e.studentId === userEntry.studentId
        )

        if (!alreadyInTopN) {
          visibleLeaderboard.push({
            ...userEntry,
            isCurrentUser: true
          })

          visibleLeaderboard.sort((a, b) => a.rank - b.rank)
        }
      }
    }

    res.json({
      success: true,
      leaderboard: visibleLeaderboard,
      isTeacher,
      anonymous,
      userRank,
      totalParticipants: leaderboard.length,
      topN: LEADERBOARD_TOP_N
    })
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    res.status(500).json({
      error: 'Failed to fetch leaderboard'
    })
  }
})

// -----------------------------------------------------------------------------
// GET /api/responses/room/:roomId/export
// -----------------------------------------------------------------------------

router.get('/room/:roomId/export', async (req, res) => {
  try {
    const Room = (await import('../models/Room.js')).default
    const User = (await import('../models/User.js')).default

    const { roomId } = req.params
    const currentUser = req.user

    const room = await Room.findById(roomId).lean()

    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    if (room.teacher.toString() !== currentUser._id.toString()) {
      return res.status(403).json({
        error: 'Not authorized to export this room'
      })
    }

    const {
      leaderboard,
      byStudent,
      stats
    } = await resultsSnapshot.buildSnapshot(roomId)

    const anySid = Object.keys(byStudent)[0]
    const qCols = anySid ? [...byStudent[anySid]].reverse() : []

    const statsByQid = new Map(
      (stats.questionStats || []).map(q => [q.questionId, q])
    )

    const sids = leaderboard.map(e => String(e.studentId))

    const users = await User.find({
      _id: { $in: sids }
    }).select('email').lean()

    const emailById = new Map(
      users.map(u => [u._id.toString(), u.email || ''])
    )

    const esc = v => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s)
        ? '"' + s.replace(/"/g, '""') + '"'
        : s
    }

    const row = arr => arr.map(esc).join(',') + '\n'

    const safeName = (room.name || 'room')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 60)

    const date = room.endedAt
      ? new Date(room.endedAt).toISOString().slice(0, 10)
      : 'session'

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Spandan_${safeName}_${date}.csv"`
    )

    res.write('\uFEFF')

    const qHeaders = qCols.map((_, i) => `Q${i + 1}`)

    res.write(row([
      'student',
      'email',
      'points',
      'rank',
      'correct',
      'accuracy',
      ...qHeaders
    ]))

    for (const e of leaderboard) {
      const byQid = new Map(
        (byStudent[String(e.studentId)] || []).map(q => [q._id, q])
      )

      const acc = e.totalAnswered
        ? (e.correctCount / e.totalAnswered).toFixed(2)
        : ''

      const cells = qCols.map(qc => {
        const q = byQid.get(qc._id)
        return !q || !q.answered ? '' : (q.isCorrect ? '✓' : '✗')
      })

      res.write(row([
        e.studentName || '',
        emailById.get(String(e.studentId)) || '',
        e.totalPoints,
        e.rank,
        `${e.correctCount}/${e.totalAnswered}`,
        acc,
        ...cells
      ]))
    }

    res.write('\n')
    res.write(row([
      'Question',
      'Text',
      'Type',
      'Responses',
      'Correct %'
    ]))

    qCols.forEach((qc, i) => {
      const s = statsByQid.get(qc._id)
      const pct = s && s.totalResponses
        ? Math.round((s.correctCount / s.totalResponses) * 100) + '%'
        : ''

      res.write(row([
        `Q${i + 1}`,
        qc.question,
        qc.type,
        s ? s.totalResponses : '',
        pct
      ]))
    })

    res.end()
  } catch (error) {
    console.error('CSV export error:', error)

    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export results' })
    } else {
      res.end()
    }
  }
})

export default router