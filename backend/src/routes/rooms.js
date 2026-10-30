import express from 'express'
import { createRoom, getRoomById, getRoomByCode, joinRoomByCode, getRoomsByTeacher, getRoomsByStudent, getActiveRoomsByStudent, updateRoom, deleteRoom } from '../services/roomService.js'
import { authenticate } from '../middleware/auth.js'
import { authorize, requireApprovedTeacher } from '../middleware/auth.js'
import { validate, createRoomSchema, roomUpdateSchema, waitingDecisionSchema } from '../middleware/validation.js'
import { rebuildSnapshot } from '../services/resultsSnapshot.js'
import { prewarmInsights } from '../services/insightsCache.js'
import {
  admitRoomMember,
  rejectRoomMember,
  listWaitingMembers,
  countParticipants,
  countWaiting,
  participantsChannel,
  viewersChannel
} from '../services/waitingRoom.js'
import { processRoomAttendance, getStudentAttendanceSummary } from '../services/attendanceLedger.js'
import { readCookie } from '../services/spurtiLive.js'
import { invalidateMemberCache } from './responses.js'

const router = express.Router()

// Broadcast a waiting-room snapshot (participants + waiting counts) to BOTH channels. Participants
// (room.code) show the teacher's live count; viewers (viewers:<code>) use it to show how many are
// ahead of them in the lobby. Both channels must stay in sync (see waitingRoom.js channel model).
async function broadcastLobby(io, room) {
  if (!io || !room?.code) return
  const [participants, waiting] = await Promise.all([
    countParticipants(room._id),
    countWaiting(room._id)
  ])
  const payload = { roomCode: room.code, participants, waiting }
  io.to(participantsChannel(room.code)).emit('room:lobby', payload)
  if (waiting > 0) io.to(viewersChannel(room.code)).emit('room:lobby', payload)
}

// Fire the same enriched join payload over the student's personal socket channel so an admit/reject
// that happened while they were on another device still reaches them.
function emitJoinState(io, studentId, room, evaluation) {
  if (!io) return
  io.to('user:' + studentId).emit('room:waiting', {
    roomCode: room.code,
    roomId: room._id,
    admissionStatus: evaluation.state,
    admitted: evaluation.admitted,
    waitingRoom: evaluation.waitingRoom,
    watchOnly: evaluation.watchOnly,
    attendanceStatus: evaluation.attendanceStatus,
    notification: evaluation.notification
  })
}

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
    res.status(500).json({ error: error.message })
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
    const participants = await countParticipants(req.params.id)

    res.json({ room, participants })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Join room by code (for students). Returns the enriched payload: the room PLUS the waiting-room
// decision (admitted / waiting / rejected), attendance classification and a notification string.
router.get('/join/:code', authenticate, authorize('student'), async (req, res) => {
  try {
    const payload = await joinRoomByCode(req.params.code, req.user._id)

    // Subtle teacher chime: fire only on the transition INTO the waiting room, and only when the
    // room settings have not turned it off. Best-effort — a missing socket layer must not fail the join.
    if (payload.becameWaiting && payload.room?.settings?.waitingRoomChime !== false) {
      const io = req.app.get('io')
      const teacherId = payload.room?.teacher?._id || payload.room?.teacher
      if (io && teacherId) {
        try {
          const waiting = await countWaiting(payload.room._id)
          io.to('user:' + teacherId).emit('waiting:new', { roomCode: payload.room.code, waiting })
        } catch (e) { /* non-fatal */ }
      }
    }

    res.json({
      room: payload.room,
      admitted: payload.admitted,
      waitingRoom: payload.waitingRoom,
      watchOnly: payload.watchOnly,
      admissionStatus: payload.admissionStatus,
      attendanceStatus: payload.attendanceStatus,
      lateMinutes: payload.lateMinutes,
      waitingRoomEnabled: payload.waitingRoomEnabled,
      policy: payload.policy,
      notification: payload.notification,
      attendance: payload.attendance
    })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404
      : /ended/i.test(error.message) ? 400
      : 500
    res.status(status).json({ error: error.message })
  }
})

// Student attendance summary (streak / late-run) for the dashboard + waiting room.
router.get('/student/attendance', authenticate, authorize('student'), async (req, res) => {
  try {
    // Forward the Samagama SSO cookie (if the browser has one) so the Spurti mirror can identify
    // the student when no Spurti admin token is configured.
    const chatengineToken = readCookie(req.headers.cookie, 'chatengine_token')
    const summary = await getStudentAttendanceSummary(req.user._id, { chatengineToken })
    res.json({ attendance: summary })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Teacher: the current waiting list (students awaiting a manual admit/reject).
router.get('/:id/waiting', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const room = await getRoomById(req.params.id)
    if (room.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the room owner can view the waiting room' })
    }
    const waiting = await listWaitingMembers(room._id)
    const participants = await countParticipants(room._id)
    res.json({
      waiting: waiting.map((m) => ({
        studentId: m.studentId?._id || m.studentId,
        name: m.studentId?.name || 'Student',
        email: m.studentId?.email || '',
        enrollmentNumber: m.studentId?.enrollmentNumber || '',
        requestedAt: m.waitingRequestedAt || m.joinedAt
      })),
      participants,
      waitingCount: waiting.length
    })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Teacher: admit a waiting student. Moves them from the viewers channel to the participants channel,
// stamps attendance from their arrival time, and re-seeds the lobby counts.
router.post('/:id/waiting/:studentId/admit', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const room = await getRoomById(req.params.id)
    if (room.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the room owner can admit students' })
    }
    const result = await admitRoomMember({ room, studentId: req.params.studentId, admittedBy: req.user._id })
    if (!result) return res.status(404).json({ error: 'Student is not in this room' })

    const io = req.app.get('io')
    io?.to('user:' + req.params.studentId).emit('room:admitted', {
      roomCode: room.code,
      roomId: room._id,
      attendanceStatus: result.evaluation.attendanceStatus,
      notification: 'Your teacher admitted you. You are now in the room.'
    })
    emitJoinState(io, req.params.studentId, room, result.evaluation)
    await broadcastLobby(io, room)
    res.json({ message: 'Student admitted', studentId: req.params.studentId, attendanceStatus: result.evaluation.attendanceStatus })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Teacher: reject a waiting student. They remain connected in the viewers channel (watch-only) but
// can never submit responses; the ledger records the attempt as 'excused'.
router.post('/:id/waiting/:studentId/reject', authenticate, authorize('teacher'), requireApprovedTeacher, validate(waitingDecisionSchema), async (req, res) => {
  try {
    const room = await getRoomById(req.params.id)
    if (room.teacher._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the room owner can reject students' })
    }
    const result = await rejectRoomMember({ room, studentId: req.params.studentId, rejectedBy: req.user._id })
    if (!result) return res.status(404).json({ error: 'Student is not in this room' })

    const io = req.app.get('io')
    io?.to('user:' + req.params.studentId).emit('room:rejected', {
      roomCode: room.code,
      roomId: room._id,
      reason: req.body?.reason || '',
      notification: 'Your request to join this room was declined by the teacher.'
    })
    emitJoinState(io, req.params.studentId, room, result.evaluation)
    await broadcastLobby(io, room)
    res.json({ message: 'Student rejected', studentId: req.params.studentId })
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
      const io = req.app.get('io')
      io.to(room.code).emit('room:ended', { roomId: room._id, endedAt: updatedRoom.endedAt })
      // Waiting students never entered room.code, so notify the viewers channel too.
      io.to(viewersChannel(room.code)).emit('room:ended', { roomId: room._id, endedAt: updatedRoom.endedAt })
        // Members still in the lobby when the room ends are campaign-absent; admission cache entries
      // must be dropped so POST /responses sees the ended room rather than a cached admit.
      try {
        const members = await (await import('../models/RoomMember.js')).default.find({ roomId: room._id }).select('studentId').lean()
        for (const m of members) invalidateMemberCache(room._id, m.studentId)
      } catch (e) { /* non-fatal */ }
      // Attendance ledger: fire-and-forget, idempotent via Room.attendanceProcessedAt. This never
      // blocks or fails the room-end response.
      processRoomAttendance(room._id).catch((e) => console.error('[rooms] attendance processing failed:', e.message))
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