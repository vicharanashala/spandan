import express from 'express'
import { createRoom, getRoomById, getRoomByCode, getRoomsByTeacher, getRoomsByStudent, getActiveRoomsByStudent, updateRoom, deleteRoom } from '../services/roomService.js'
import { authenticate } from '../middleware/auth.js'
import { authorize, requireApprovedTeacher } from '../middleware/auth.js'
import { validate, createRoomSchema, roomUpdateSchema } from '../middleware/validation.js'
import { rebuildSnapshot } from '../services/resultsSnapshot.js'
import { prewarmInsights, invalidateInsights } from '../services/insightsCache.js'
import { countPresent, finalizeRoomAttendance } from '../services/attendanceService.js'
import {
  getWaitingRoomConfig,
  getGraceDeadline,
  getClassStartAt,
  ensureMembership,
  buildWaitingRoomSnapshot,
  admitWaitingStudents,
  rejectWaitingStudents,
  setWaitingRoomMode,
  listAdmittedParticipants,
  emitWaitingRoomUpdate
} from '../services/waitingRoomService.js'

const router = express.Router()

// Create new room
router.post('/', authenticate, authorize('teacher'), requireApprovedTeacher, validate(createRoomSchema), async (req, res) => {
  try {
    const { name, settings } = req.validatedBody
    const room = await createRoom(name, req.user._id, settings)

    res.status(201).json({
      message: 'Room created successfully',
      room
    })
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      code: error.code,
      activeRoomId: error.activeRoomId
    })
  }
})

// Get rooms for current teacher
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
    const skip = (pageNum - 1) * limitNum

    if (req.user.role === 'teacher') {
      const [rooms, total] = await Promise.all([
        getRoomsByTeacher(req.user._id, { skip, limit: limitNum }),
        req.user.model || Promise.resolve(null)
      ])
      // Count total rooms for teacher
      const Room = (await import('../models/Room.js')).default
      const totalCount = await Room.countDocuments({ teacher: req.user._id })
      res.json({ 
        rooms,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          pages: Math.ceil(totalCount / limitNum)
        }
      })
    } else {
      res.status(403).json({ error: 'Only teachers can view room list' })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get room by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const room = await getRoomById(req.params.id)
    const RoomMember = (await import('../models/RoomMember.js')).default
    
    // Check if user is the room teacher (owner) or a student member
    const isOwner = room.teacher._id.toString() === req.user._id.toString()
    const isStudentMember = await RoomMember.findOne({ roomId: req.params.id, studentId: req.user._id })
    
    // Only the room owner OR room members can access
    if (!isOwner && !isStudentMember) {
      return res.status(403).json({ error: 'Access denied' })
    }

    // Seed the live participant count so a teacher opening/refreshing the room sees the current
    // number immediately (the room:joined/room:left socket events keep it updated after load).
    // Waiting-room students do not count as participants until the teacher admits them.
    const participants = await countPresent(req.params.id)

    // The teacher console seeds its waiting-room panel from this snapshot on load.
    const waitingRoom = isOwner ? await buildWaitingRoomSnapshot(room) : undefined

    res.json({ room, participants, waitingRoom })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Join room by code (for students)
router.get('/join/:code', authenticate, authorize('student'), async (req, res) => {
  try {
    const room = await getRoomByCode(req.params.code)
    
    // Check if room has ended
    if (room.endedAt) {
      return res.status(400).json({ error: 'This room has ended and can no longer be joined' })
    }

    // When linked to a class, enforce that the student is an active class member
    if (room.classId) {
      const ClassMember = (await import('../models/ClassMember.js')).default
      const membership = await ClassMember.findOne({
        classId: room.classId,
        studentId: req.user._id,
        status: 'active'
      })
      if (!membership) {
        return res.status(403).json({ error: 'You must be enrolled in this class to join the session' })
      }
    }
    
    // Resolve the membership (idempotent). With the waiting room on, a new student is held as
    // 'waiting' and must be admitted by the teacher before they can see the live session.
    const member = await ensureMembership({ room, studentId: req.user._id })
    const config = getWaitingRoomConfig(room)
    const membership = {
      enabled: config.enabled,
      mode: config.mode,
      graceSeconds: config.graceSeconds,
      scheduledAt: config.scheduledAt,
      reconnectAllowanceSeconds: config.reconnectAllowanceSeconds,
      classStartsAt: getClassStartAt(room),
      graceEndsAt: getGraceDeadline(room),
      status: member.status || 'admitted',
      onTime: member.onTime !== false,
      joinedAt: member.joinedAt,
      admittedAt: member.admittedAt || null
    }
    const isWaiting = config.enabled && member.status === 'waiting'
    const isRejected = config.enabled && member.status === 'rejected'

    // Late-join recovery: check if there is an active question student hasn't answered. Students in
    // the waiting room (or rejected) must not receive the live question.
    let activeQuestion = null
    if (!isWaiting && !isRejected && room.currentQuestion) {
      try {
        const Question = (await import('../models/Question.js')).default
        const Response = (await import('../models/Response.js')).default
        const q = await Question.findById(room.currentQuestion).lean()
        if (q && (!q.closeAt || new Date(q.closeAt) > new Date())) {
          const alreadyAnswered = await Response.findOne({ questionId: q._id, studentId: req.user._id })
          if (!alreadyAnswered) {
            const { explanation, ...rest } = q
            if (Array.isArray(rest.options)) {
              rest.options = rest.options.map(o =>
                (o && typeof o === 'object') ? (({ isCorrect, ...opt }) => opt)(o) : o
              )
            }
            activeQuestion = {
              questionId: q._id,
              question: rest,
              timer: q.timeToAnswer || 30,
              startTime: Date.now()
            }
          }
        }
      } catch { /* non-fatal */ }
    }
    
    res.json({ room, activeQuestion, waitingRoom: membership })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// --- Waiting room (teacher controls) ------------------------------------------------------------

// Resolve the room and ensure the caller owns it. Returns null when a response was already sent.
const loadOwnedRoom = async (req, res) => {
  const room = await getRoomById(req.params.id)
  if (room.teacher._id.toString() !== req.user._id.toString()) {
    res.status(403).json({ error: 'Only the room owner can manage the waiting room' })
    return null
  }
  return room
}

// Admitted participants in join order — powers the teacher's clickable participant count.
router.get('/:id/participants', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const room = await loadOwnedRoom(req, res)
    if (!room) return
    const participants = await listAdmittedParticipants(room._id)
    res.json({ participants })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Excuse a student's absence (valid, documented reason). The attendance finalizer applies a 0%
// deduction for them; on an ended room the scores are recomputed immediately and the caches dropped.
router.post('/:id/participants/:studentId/excuse', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const room = await loadOwnedRoom(req, res)
    if (!room) return
    const RoomMember = (await import('../models/RoomMember.js')).default

    const member = await RoomMember.findOne({ roomId: room._id, studentId: req.params.studentId })
    if (!member) return res.status(404).json({ error: 'Participant not found' })

    const excused = req.body?.excused !== false
    member.attendanceExcused = excused
    await member.save()

    let attendance = null
    if (room.endedAt) {
      // Recompute this one student from their raw points, then refresh every points reader.
      attendance = await finalizeRoomAttendance({ room, studentIds: [req.params.studentId], force: true })
      req.app.get('liveUpdates')?.refreshLeaderboardNow(room._id)
      rebuildSnapshot(room._id).catch((e) => console.error('[rooms] snapshot rebuild after excuse failed:', e.message))
      invalidateInsights(room._id).catch(() => {})
    }

    const waitingRoom = await emitWaitingRoomUpdate(req.app.get('io'), room)
    res.json({ success: true, excused, attendance, waitingRoom })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Admit one/several/all waiting students. In automatic mode a bare admit releases the on-time
// cohort and flips the room to manual.
router.post('/:id/waiting-room/admit', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const room = await loadOwnedRoom(req, res)
    if (!room) return
    const body = req.body || {}
    const studentIds = Array.isArray(body.studentIds) ? body.studentIds.filter(Boolean) : []
    const result = await admitWaitingStudents({
      io: req.app.get('io'),
      room,
      studentIds,
      all: body.all === true
    })
    res.json({ success: true, ...result })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Reject one/several/all waiting students (manual review).
router.post('/:id/waiting-room/reject', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const room = await loadOwnedRoom(req, res)
    if (!room) return
    const body = req.body || {}
    const studentIds = Array.isArray(body.studentIds) ? body.studentIds.filter(Boolean) : []
    const result = await rejectWaitingStudents({
      io: req.app.get('io'),
      room,
      studentIds,
      all: body.all === true
    })
    res.json({ success: true, ...result })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Switch between automatic and manual admission.
router.post('/:id/waiting-room/mode', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const room = await loadOwnedRoom(req, res)
    if (!room) return
    const mode = req.body?.mode === 'manual' ? 'manual' : 'automatic'
    const result = await setWaitingRoomMode({ io: req.app.get('io'), room, mode })
    res.json({ success: true, ...result })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Get rooms student has attended (for room history)
router.get('/student/room-history', authenticate, authorize('student'), async (req, res) => {
  try {
    const rooms = await getRoomsByStudent(req.user._id)
    res.json({ rooms })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get active rooms for student (rooms that can be rejoined)
router.get('/student/active', authenticate, authorize('student'), async (req, res) => {
  try {
    const rooms = await getActiveRoomsByStudent(req.user._id)
    res.json({ rooms })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update room
router.put('/:id', authenticate, authorize('teacher'), requireApprovedTeacher, validate(roomUpdateSchema), async (req, res) => {
  try {
    const room = await getRoomById(req.params.id)
    
    if (room.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the room owner can update the room' })
    }

    // Prevent reactivating an ended room
    if (room.endedAt && req.body.isActive === true) {
      return res.status(400).json({ error: 'Cannot reactivate an ended room' })
    }

    const updatedRoom = await updateRoom(req.params.id, req.body)
    
    // If room is being ended, emit socket event to notify all participants
    if (req.body.isActive === false && updatedRoom.endedAt) {
      // Settle attendance FIRST: it rewrites Response.points, so the leaderboard, results snapshot
      // and insights recomputed below all read the final, deducted scores.
      await finalizeRoomAttendance({ room: updatedRoom })

      const io = req.app.get('io')
      io.to(room.code).emit('room:ended', { roomId: room._id, endedAt: updatedRoom.endedAt })
      if (updatedRoom.classId) {
        io.emit('class:updated', { classId: updatedRoom.classId, hasActiveSession: false, endedRoomId: room._id })
      }
      // Force a final leaderboard recompute+broadcast so the settled board is complete — the live
      // board is otherwise deferred to the quiet-debounce window and may not have fired yet.
      req.app.get('liveUpdates')?.refreshLeaderboardNow(room._id)
      // Pre-warm the results snapshot so the ~N students about to open the results page all read a
      // shared cache instead of each triggering full-room aggregations (the end-session stampede).
      // Fire-and-forget + no-op when Redis is off; never blocks or fails the room-end response.
      rebuildSnapshot(room._id).catch((e) => console.error('[rooms] snapshot pre-warm failed:', e.message))
      // Same for the results-page insights: computed once here (works with or without Redis).
      prewarmInsights(room._id).catch((e) => console.error('[rooms] insights pre-warm failed:', e.message))
    }
    
    res.json({ message: 'Room updated successfully', room: updatedRoom })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Delete room
router.delete('/:id', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const room = await getRoomById(req.params.id)
    
    if (room.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the room owner can delete the room' })
    }

    await deleteRoom(req.params.id)
    res.json({ message: 'Room deleted successfully' })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

export default router