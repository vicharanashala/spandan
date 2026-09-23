// Broadcast a new question to all sockets in a room.
// This module breaks the circular dependency between index.js and routes/questions.js
// by providing a simple function that reads `io` from the express app at call-time.

import Room from '../models/Room.js'
import Question from '../models/Question.js'
import { setRoomLive } from './roomLiveCache.js'

const GRACE = Number(process.env.POLL_RESPONSE_GRACE_MS) || 10000

/**
 * Sanitize a question object before sending to students — strip isCorrect and explanation.
 */
export function sanitizeQuestionForStudents(q) {
  if (!q || typeof q !== 'object') return q
  const { explanation, ...rest } = (typeof q.toObject === 'function') ? q.toObject() : { ...q }
  if (Array.isArray(rest.options)) {
    rest.options = rest.options.map(o =>
      (o && typeof o === 'object') ? (({ isCorrect, ...opt }) => opt)(o) : o
    )
  }
  return rest
}

/**
 * Mark which question is CURRENTLY LIVE for a room. Set on every launch.
 */
export async function setLiveQuestion(roomId, questionId) {
  try {
    const room = await Room.findById(roomId).select('currentQuestion')
    const outgoing = room?.currentQuestion
    if (outgoing && String(outgoing) !== String(questionId)) {
      await Question.updateOne({ _id: outgoing }, { $set: { closeAt: new Date(Date.now() + GRACE) } })
    }
    await Question.updateOne({ _id: questionId }, { $set: { closeAt: null, launchedAt: new Date() } })
    await Room.updateOne({ _id: roomId }, { currentQuestion: questionId })
    await setRoomLive(roomId, questionId)
    console.log(`[setLiveQuestion] roomId=${roomId} questionId=${questionId} — marked live`)
  } catch (err) {
    console.error('[setLiveQuestion] error:', err)
  }
}

/**
 * Launch a question: mark it live in the DB, then broadcast `new_question` to the Socket.IO room.
 * Called from both the REST endpoint (POST /api/questions) and the socket handler (new_question).
 *
 * @param {object} io          - Socket.IO server instance
 * @param {string} roomId      - Mongo ObjectId of the room
 * @param {string} roomCode    - The room join code (Socket.IO room name)
 * @param {object} questionDoc - The full question document (Mongoose doc or plain object)
 */
export async function launchQuestion(io, roomId, roomCode, questionDoc) {
  const qId = questionDoc._id || questionDoc.id
  if (qId) {
    await setLiveQuestion(roomId, qId)
  }
  const payload = sanitizeQuestionForStudents(questionDoc)
  
  // Debug: log how many sockets are in this room
  const roomSockets = await io.in(roomCode).fetchSockets()
  console.log(`[launchQuestion] Broadcasting new_question to room "${roomCode}" (${roomSockets.length} sockets in room)`)
  for (const s of roomSockets) {
    console.log(`  socket ${s.id} userId=${s.data?.userId} role=${s.data?.role}`)
  }
  
  io.to(roomCode).emit('new_question', payload)
  console.log(`[launchQuestion] new_question emitted to room "${roomCode}"`)
}
