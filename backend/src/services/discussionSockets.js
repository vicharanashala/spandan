import Room from '../models/Room.js'
import User from '../models/User.js'
import { participant, readDiscussion, changeDiscussion, denied } from './discussionService.js'

export function leaveSubscribedRooms(socket) {
  for (const room of socket.rooms) if (room !== socket.id) socket.leave(room)
}

export function discussionStateForRecipient(state, user) {
  const userId = String(user?.userId ?? user?._id ?? '')
  if (user?.role === 'teacher') return state
  if (user?.role !== 'student' || !userId) return null
  return {
    ...state,
    pendingHands: (state.pendingHands || []).filter(hand => String(hand.studentId) === userId),
    speaker: state.speaker && String(state.speaker.studentId) === userId ? state.speaker : null,
    entries: (state.entries || []).filter(entry => String(entry.speakerId) === userId)
  }
}

async function roomSockets(io, roomCode) {
  if (!io?.in) return []
  try {
    return await io.in(roomCode).fetchSockets()
  } catch (error) {
    console.error('Failed to enumerate discussion room sockets:', error.message)
    return []
  }
}

export async function broadcastDiscussionUpdate(io, roomCode, state) {
  const sockets = await roomSockets(io, roomCode)
  for (const recipient of sockets) {
    const filtered = discussionStateForRecipient(state, recipient.data)
    if (filtered) recipient.emit('discussion:update', filtered)
  }
}

export async function broadcastDiscussionTranscript(io, roomCode, entry) {
  const sockets = await roomSockets(io, roomCode)
  for (const recipient of sockets) {
    const role = recipient.data?.role
    const userId = String(recipient.data?.userId || '')
    if (role === 'teacher' || (role === 'student' && userId === String(entry.speakerId))) {
      recipient.emit('discussion:transcript', { roomCode, session: entry.session, entry })
    }
  }
}

export function registerDiscussionSockets(io, socket) {
  for (const action of ['sync', 'start', 'end', 'raise-hand', 'approve', 'reject', 'remove-speaker']) {
    socket.on(`discussion:${action}`, async (data = {}, ack) => {
      try {
        if (!socket.data?.userId || typeof socket.data.tokenExp !== 'number' || socket.data.tokenExp * 1000 <= Date.now()) throw denied('Session expired')
        if (typeof data.roomCode !== 'string' || !socket.rooms.has(data.roomCode)) throw denied()
        const [room, user] = await Promise.all([
          Room.findByCode(data.roomCode), User.findById(socket.data.userId).lean()
        ])
        await participant(user, room)
        const state = action === 'sync' ? await readDiscussion(room) : await changeDiscussion(room, action, user, data.studentId)
        if (action === 'sync') socket.emit('discussion:update', discussionStateForRecipient(state, user))
        else await broadcastDiscussionUpdate(io, room.code, state)
        if (typeof ack === 'function') ack({ ok: true })
      } catch (e) {
        const message = e.status ? e.message : 'Discussion request failed'
        socket.emit('discussion:error', { roomCode: data?.roomCode, message })
        if (typeof ack === 'function') ack({ ok: false, error: message })
      }
    })
  }
}

// Sent only to the newly authorized socket, avoiding N-squared sync requests
// when the official room:joined count broadcast reaches every participant.
export async function sendDiscussionSnapshot(socket, room) {
  try {
    if (!socket.data?.userId || typeof socket.data.tokenExp !== 'number' || socket.data.tokenExp * 1000 <= Date.now()) return
    const user = await User.findById(socket.data.userId).lean()
    await participant(user, room)
    socket.emit('discussion:update', discussionStateForRecipient(await readDiscussion(room), user))
  } catch {
    socket.emit('discussion:error', { roomCode: room.code, message: 'Discussion state unavailable' })
  }
}
