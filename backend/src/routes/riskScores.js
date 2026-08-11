import express from 'express'
import mongoose from 'mongoose'
import { authenticate } from '../middleware/auth.js'
import Room from '../models/Room.js'
import RiskScore from '../models/RiskScore.js'
import {
  getRoomRiskSnapshot,
  getStudentRiskForDate,
  getStudentRiskTrend,
  getStudentDailyTrend
} from '../services/riskScoreService.js'

const router = express.Router()

// ─── Authorization helper ─────────────────────────────────────────────────
// A user can see the "host view" of a room if they are the room's host
// OR one of the room's co-hosts. Mirrors the pattern in responses.js
// (room.teacher.toString() === currentUser._id.toString()), extended
// to also accept co-hosts.
async function isHostOrCoHost(room, userId) {
  if (!room) return false
  const uid = userId.toString()
  if (room.teacher.toString() === uid) return true
  const coHosts = (room.coHosts || []).map(id => id.toString())
  return coHosts.includes(uid)
}

// ─── Student: own risk scores for a given date ─────────────────────────────
// GET /api/risk-scores/me?date=YYYY-MM-DD
// Strict: ignores any studentId param. Returns only req.user.id's data.
router.get('/me', authenticate, async (req, res) => {
  try {
    const { date } = req.query
    if (!date) {
      return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' })
    }
    const parsed = new Date(date)
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'invalid date format' })
    }

    const docs = await getStudentRiskForDate(req.user.id, parsed)
    return res.json({ success: true, entries: docs })
  } catch (error) {
    console.error('[risk-scores] /me error:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to fetch risk scores' })
  }
})

// ─── Student: current live score in a specific room ─────────────────────────
// GET /api/risk-scores/me/room/:roomId
// Used by the widget on mount / page refresh to hydrate from persisted DB state.
// Returns 100/safe defaults when no RiskScore doc exists yet (student hasn't
// answered any question in this room).
router.get('/me/room/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ error: 'invalid roomId' })
    }
    const doc = await RiskScore.findOne({
      studentId: req.user.id,
      roomId
    }).select('currentScore zone correctStreakNeeded lastUpdated').lean()

    return res.json({
      success: true,
      currentScore:         doc?.currentScore        ?? 100,
      zone:                 doc?.zone                ?? 'safe',
      correctStreakNeeded:  doc?.correctStreakNeeded  ?? 0,
      lastUpdated:          doc?.lastUpdated          ?? null
    })
  } catch (error) {
    console.error('[risk-scores] /me/room error:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to fetch score' })
  }
})

// ─── Student: own consecutive-day trend ─────────────────────────────────
// GET /api/risk-scores/me/trend?range=today|7d|30d&roomId=YYY
// Student-only. Returns one bucket per day, oldest first. Never reveals
// another student's data; the controller does not trust any client id.
router.get('/me/trend', authenticate, async (req, res) => {
  try {
    const range = req.query.range || '7d'
    const roomId = req.query.roomId || null
    const trend = await getStudentDailyTrend(req.user.id, range, roomId)
    const points = trend.points
    const last = points[points.length - 1]
    return res.json({
      success: true,
      studentId: req.user.id,
      range: trend.range,
      days: trend.days,
      currentScore: last?.endingScore ?? null,
      currentZone: last?.worstZone ?? null,
      points
    })
  } catch (error) {
    console.error('[risk-scores] /me/trend error:', error)
    return res.status(500).json({ error: 'Failed to fetch trend' })
  }
})

// ─── Teacher: trend across sessions for one student ───────────────────────
// GET /api/risk-scores/student/:studentId/trend
// Teacher-only. Scoped: teacher must own (or co-host) at least one room
// where this student is a RoomMember. Same pattern as responses.js.
router.get('/student/:studentId/trend', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Teacher role required' })
    }

    const { studentId } = req.params
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: 'invalid studentId' })
    }

    // Scoping: teacher can only view students who attended one of THEIR rooms
    // (hosted or co-hosted). This mirrors responses.js line ~339.
    const accessibleRooms = await Room.find({
      $or: [
        { teacher: req.user.id },
        { coHosts: req.user.id }
      ]
    }).select('_id').lean()
    const roomIds = accessibleRooms.map(r => r._id)

    const RoomMember = (await import('../models/RoomMember.js')).default
    const membership = await RoomMember.findOne({
      studentId,
      roomId: { $in: roomIds }
    }).lean()
    if (!membership) {
      return res.status(403).json({ error: 'Not authorized: student not in your rooms' })
    }

    const range = req.query.range || 'session'
    let trend
    if (range === 'today' || range === '7d' || range === '30d') {
      trend = await getStudentDailyTrend(studentId, range, req.query.roomId || null)
    } else {
      trend = await getStudentRiskTrend(studentId, req.query.roomId || null)
    }

    // Resolve student name for the trend page header.
    const User = (await import('../models/User.js')).default
    const student = await User.findById(studentId).select('name email').lean()

    return res.json({
      success: true,
      studentId,
      studentName: student?.name,
      currentScore: trend.currentScore ?? trend.points?.[trend.points.length - 1]?.endingScore ?? null,
      currentZone: trend.currentZone ?? trend.points?.[trend.points.length - 1]?.worstZone ?? null,
      range: trend.range || 'session',
      points: trend.points
    })
  } catch (error) {
    console.error('[risk-scores] /trend error:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to fetch trend' })
  }
})

// ─── Teacher/Co-host: live snapshot for one room ──────────────────────────
// GET /api/risk-scores/room/:roomId
// Host or co-host only. Returns all students' current scores for that room.
router.get('/room/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ error: 'invalid roomId' })
    }
    const room = await Room.findById(roomId)
    if (!room) return res.status(404).json({ error: 'Room not found' })

    if (!(await isHostOrCoHost(room, req.user.id))) {
      return res.status(403).json({ error: 'Not authorized for this room' })
    }

    const snapshot = await getRoomRiskSnapshot(roomId)

    // Build roster from RiskScore docs — these persist even after students leave,
    // so past rooms still show their full student list. RoomMember records are
    // deleted on room:leave and would return an empty list for completed sessions.
    const User = (await import('../models/User.js')).default
    const studentIds = await RiskScore.distinct('studentId', { roomId: room._id })
    const users = await User.find({ _id: { $in: studentIds } })
      .select('name email')
      .lean()
    const roster = users.map(u => ({
      _id: u._id.toString(),
      name: u.name,
      email: u.email
    }))

    return res.json({ success: true, snapshot, roster })
  } catch (error) {
    console.error('[risk-scores] /room error:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to fetch room snapshot' })
  }
})

export default router