import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import User from '../models/User.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import { roomCache } from '../realtime/roomCache.js'
import { roomPresence } from '../realtime/presence.js'
import { createThrottledBroadcaster } from '../realtime/throttledBroadcast.js'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// Tunable via env so ops can adjust without a code change under load.
const PARTICIPANTS_THROTTLE_MS = Number(process.env.RT_PARTICIPANTS_THROTTLE_MS || 500)
const POINTS_THROTTLE_MS = Number(process.env.RT_POINTS_THROTTLE_MS || 1000)
const RESPONSE_BATCH_MS = Number(process.env.RT_RESPONSE_BATCH_MS || 200)

const teacherRoomOf = (roomCode) => `${roomCode}::teacher`

/**
 * Resolve { roomId, teacherId, endedAt } for a room code, using a short TTL
 * cache so a burst of joins to the same room only hits Mongo once.
 */
async function resolveRoom(roomCode) {
  const cached = roomCache.get(roomCode)
  if (cached) return cached

  const room = await Room.findByCode(roomCode).select('_id teacher endedAt').lean()
  if (!room) return null

  const entry = { roomId: room._id, teacherId: room.teacher, endedAt: room.endedAt }
  roomCache.set(roomCode, entry)
  return entry
}

export function registerSocketHandlers(io) {
  // socket.id -> userId, used only for the disconnect log line / cleanup
  const connectedUsers = new Map()

  const participantsBroadcaster = createThrottledBroadcaster({ intervalMs: PARTICIPANTS_THROTTLE_MS })
  const pointsBroadcaster = createThrottledBroadcaster({ intervalMs: POINTS_THROTTLE_MS, maxWaitMs: POINTS_THROTTLE_MS * 2 })
  const responseBatches = new Map() // roomCode -> array of pending response payloads
  const responseBroadcaster = createThrottledBroadcaster({ intervalMs: RESPONSE_BATCH_MS })

  const flushParticipants = (roomCode) => {
    io.to(roomCode).emit('room:joined', {
      roomCode,
      participants: roomPresence.count(roomCode)
    })
  }

  const flushResponses = (roomCode) => {
    const batch = responseBatches.get(roomCode)
    responseBatches.delete(roomCode)
    if (!batch || batch.length === 0) return
    // Teacher-only room: response counters are only ever rendered on the
    // teacher's dashboard, so there is no reason to fan this out to every
    // student socket in the room (that was the O(n^2) bug).
    io.to(teacherRoomOf(roomCode)).emit('response:batch', batch)
  }

  io.on('connection', (socket) => {
    // Authenticate socket
    socket.on('authenticate', (data) => {
      try {
        if (!data?.token) {
          socket.emit('authenticated', { success: false, error: 'No token provided' })
          return
        }
        const decoded = jwt.verify(data.token, JWT_SECRET)
        connectedUsers.set(socket.id, decoded.userId)
        socket.emit('authenticated', { success: true })
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          socket.emit('authenticated', { success: false, error: 'Token expired', expired: true })
        } else {
          socket.emit('authenticated', { success: false, error: 'Invalid token' })
        }
      }
    })

    // Join room
    socket.on('room:join', async ({ roomCode, userId }) => {
      if (!roomCode || !userId || !mongoose.isValidObjectId(userId)) {
        socket.emit('room:joined', { roomCode, userId, participants: 0, error: 'Invalid join request' })
        return
      }

      socket.join(roomCode)
      socket.data.roomCode = roomCode
      socket.data.userId = userId

      // Respond to *this* socket immediately with a best-effort count from
      // memory. This never waits on Mongo, so a burst of joins can't stall
      // each other out or time out on the client (previously each join
      // awaited 2-4 DB calls serially before the client got its ack).
      const isNewParticipant = roomPresence.add(roomCode, userId, socket.id)
      socket.emit('room:joined', { roomCode, userId, participants: roomPresence.count(roomCode) })
      participantsBroadcaster.schedule(roomCode, flushParticipants)

      // Reconnects / duplicate tabs from a user already known to be in the
      // room don't need to re-hit the DB at all.
      if (!isNewParticipant) return

      try {
        const roomInfo = await resolveRoom(roomCode)
        if (!roomInfo) return

        if (roomInfo.teacherId?.toString() === userId) {
          // Teachers get their own sub-room so response/points fan-out can
          // target them specifically instead of the whole class.
          socket.join(teacherRoomOf(roomCode))
          return
        }

        const user = await User.findById(userId).select('role').lean()
        if (user?.role === 'student') {
          await RoomMember.updateOne(
            { roomId: roomInfo.roomId, studentId: userId },
            { $setOnInsert: { roomId: roomInfo.roomId, studentId: userId, joinedAt: new Date() } },
            { upsert: true }
          )
        }
      } catch (error) {
        console.error('Error persisting room:join for', userId, 'room', roomCode, ':', error.message)
      }
    })

    // Leave room
    socket.on('room:leave', async ({ roomCode, userId }) => {
      if (!roomCode || !userId) return

      socket.leave(roomCode)
      const fullyLeft = roomPresence.remove(roomCode, userId, socket.id)

      io.to(roomCode).emit('room:left', { roomCode, participants: roomPresence.count(roomCode) })

      if (!fullyLeft || !mongoose.isValidObjectId(userId)) return

      try {
        const roomInfo = await resolveRoom(roomCode)
        if (!roomInfo) return
        // Best-effort, non-blocking of the emit above - the client doesn't
        // need to wait on this write to know it has left.
        await RoomMember.deleteOne({ roomId: roomInfo.roomId, studentId: userId })
      } catch (error) {
        console.error('Error persisting room:leave for', userId, 'room', roomCode, ':', error.message)
      }
    })

    // Submit response (real-time) - batched and sent to the teacher only.
    socket.on('response:submit', (data) => {
      if (!data?.roomCode) return
      let batch = responseBatches.get(data.roomCode)
      if (!batch) {
        batch = []
        responseBatches.set(data.roomCode, batch)
      }
      batch.push({
        questionId: data.questionId,
        studentId: data.studentId,
        selectedOption: data.selectedOption,
        responseTime: data.responseTime
      })
      responseBroadcaster.schedule(data.roomCode, flushResponses)
    })

    // Points update - throttled per room. The leaderboard only needs to
    // reflect "current standings", not every individual point event, so
    // collapsing a burst of N updates into a bounded number of broadcasts
    // is both safe and required at scale.
    socket.on('points:update', (data) => {
      if (!data?.roomCode) return
      pointsBroadcaster.schedule(data.roomCode, (roomCode) => {
        io.to(roomCode).emit('points:updated', { roomCode })
      })
    })

    // Question events (teacher-initiated, low frequency - no throttling needed)
    socket.on('question:start', (data) => {
      if (!data?.roomCode) return
      io.to(data.roomCode).emit('question:started', {
        questionId: data.questionId,
        question: data.question,
        timer: data.timer,
        startTime: Date.now()
      })
    })

    socket.on('question:end', (data) => {
      if (!data?.roomCode) return
      io.to(data.roomCode).emit('question:ended', {
        questionId: data.questionId,
        results: data.results
      })
    })

    // New question from teacher (manually created) - one event per question, not per student
    socket.on('new_question', (data) => {
      const roomCode = data?.roomCode
      const question = data?.question
      if (roomCode && question) {
        io.to(roomCode).emit('new_question', question)
      }
    })

    // Leaderboard update - also throttled, same reasoning as points:update
    socket.on('leaderboard:update', (data) => {
      if (!data?.roomCode) return
      pointsBroadcaster.schedule(data.roomCode, (roomCode) => {
        io.to(roomCode).emit('leaderboard:updated', { roomCode })
      })
    })

    socket.on('disconnect', () => {
      const userId = connectedUsers.get(socket.id)
      connectedUsers.delete(socket.id)

      const roomCode = socket.data.roomCode
      if (roomCode && userId) {
        const fullyLeft = roomPresence.remove(roomCode, userId, socket.id)
        if (fullyLeft) {
          participantsBroadcaster.schedule(roomCode, flushParticipants)
        }
      }
    })
  })
}
