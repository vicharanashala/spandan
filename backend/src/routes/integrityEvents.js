// POST /api/integrity-events — student submits one integrity event.
// GET  /api/integrity-events?roomId=:id — teacher fetches events for a room.
//
// The POST is a hot path (fires on every tab switch / paste during a live
// quiz) so it is kept as lean as possible: authenticate, validate, write,
// respond — no heavy lookups. The membership check uses the same in-memory
// cache pattern as responses.js so repeated calls don't hammer Mongo.

import express from 'express'
import mongoose from 'mongoose'
import { authenticate, authorize } from '../middleware/auth.js'
import IntegrityEvent from '../models/IntegrityEvent.js'
import RoomMember from '../models/RoomMember.js'

const router = express.Router()
router.use(authenticate)

// ── Membership cache (mirrors responses.js pattern) ───────────────────────
const MEMBER_TTL_MS = Number(process.env.MEMBER_CACHE_TTL_MS) || 60_000
const memberCache   = new Map()   // `${roomId}:${studentId}` → expiresAt(ms)

async function isRoomMember(roomId, studentId) {
  const key = `${roomId}:${studentId}`
  const exp = memberCache.get(key)
  if (exp && exp > Date.now()) return true
  const found = await RoomMember.findOne({ roomId, studentId }).select('_id').lean()
  if (found) {
    if (memberCache.size > 50_000) memberCache.clear()
    memberCache.set(key, Date.now() + MEMBER_TTL_MS)
    return true
  }
  return false
}

// ─── POST /api/integrity-events ──────────────────────────────────────────────
// Student submits a single integrity event. Returns immediately — the save
// happens asynchronously so the client isn't blocked.
const VALID_TYPES = new Set(['tab_switch', 'window_blur', 'fullscreen_exit', 'paste'])

router.post('/', authorize('student'), async (req, res) => {
  try {
    const { roomId, questionId, eventType, metadata } = req.body
    const studentId = req.user._id

    if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ error: 'valid roomId required' })
    }
    if (!eventType || !VALID_TYPES.has(eventType)) {
      return res.status(400).json({ error: `eventType must be one of: ${[...VALID_TYPES].join(', ')}` })
    }
    if (questionId && !mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({ error: 'questionId is invalid' })
    }

    // Verify student is a member of the room (cached).
    const member = await isRoomMember(roomId, studentId)
    if (!member) {
      return res.status(403).json({ error: 'Not a member of this room' })
    }

    // Respond immediately — don't block the student on the DB write.
    res.status(201).json({ success: true })

    // Fire-and-forget save + socket broadcast.
    ;(async () => {
      try {
        const doc = await IntegrityEvent.create({
          roomId,
          studentId,
          questionId: questionId || null,
          eventType,
          metadata: metadata || {}
        })

        // Broadcast to teacher via socket so the HostRiskPanel can show a flag
        // in real time. Uses the same io / connectedUsers pattern as responses.js.
        const io             = req.app.get('io')
        const connectedUsers = req.app.get('connectedUsers')
        if (!io || !connectedUsers) return

        // Resolve teacher + co-hosts for this room (lean query, no cache needed
        // — integrity events are infrequent compared to responses).
        const Room = (await import('../models/Room.js')).default
        const room = await Room.findById(roomId)
          .select('teacher coHosts')
          .lean()
        if (!room) return

        const hostIds = new Set([
          room.teacher.toString(),
          ...(room.coHosts || []).map(id => id.toString())
        ])

        // Resolve student name for the alert payload.
        const User    = (await import('../models/User.js')).default
        const student = await User.findById(studentId).select('name').lean()

        const payload = {
          eventId:     doc._id.toString(),
          roomId:      roomId.toString(),
          studentId:   studentId.toString(),
          studentName: student?.name ?? 'Student',
          questionId:  questionId || null,
          eventType,
          metadata:    metadata || {},
          createdAt:   doc.createdAt
        }

        for (const [sockId, uid] of connectedUsers.entries()) {
          if (hostIds.has(uid)) {
            io.to(sockId).emit('integrity:event', payload)
          }
        }
      } catch (err) {
        console.error('[integrity] save/broadcast failed:', err.message)
      }
    })()

  } catch (error) {
    console.error('[integrity] POST error:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to log event' })
  }
})

// ─── GET /api/integrity-events?roomId=:id ─────────────────────────────────
// Teacher fetches all events for a room, newest first, grouped by student.
// Returns lightweight summary objects — full event list can be added later.
router.get('/', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Teacher role required' })
    }

    const { roomId } = req.query
    if (!roomId || !mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ error: 'valid roomId required' })
    }

    // Verify teacher owns / co-hosts this room.
    const Room = (await import('../models/Room.js')).default
    const room = await Room.findById(roomId).select('teacher coHosts').lean()
    if (!room) return res.status(404).json({ error: 'Room not found' })

    const uid = req.user.id.toString()
    const isHost = room.teacher.toString() === uid ||
      (room.coHosts || []).map(id => id.toString()).includes(uid)
    if (!isHost) return res.status(403).json({ error: 'Not authorized for this room' })

    const events = await IntegrityEvent.find({ roomId })
      .sort({ createdAt: -1 })
      .populate('studentId', 'name email')
      .populate('questionId', 'question')
      .lean()

    return res.json({ success: true, events })
  } catch (error) {
    console.error('[integrity] GET error:', error)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to fetch events' })
  }
})

export default router
