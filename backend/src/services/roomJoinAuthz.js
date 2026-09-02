// Authorization decision for a socket `room:join`.
//
// The socket layer must decide whether a caller may SUBSCRIBE to a room's live
// channel (questions, counts, leaderboard, results) before doing socket.join.
// This is a pure function so it is unit-testable; it runs on the server-derived
// socket identity (role/userId), never on client-claimed fields.
//
// Model: rooms are joined by their short code (the intended UX, mirrored by the
// REST GET /rooms/join/:code). So a student with the code may join an active
// room, and a teacher may join a room they own OR co-host.
// Nobody may subscribe to a room that does not exist or (for students) has ended.
//
// Returns { ok: true } or { ok: false, error: '<reason>' }.
// When ok:true, may also carry { expiredCoHost: true } meaning the co-host's
// validity has lapsed — caller should demote them but not kick them out.
import { isRoomHost } from './roomService.js'

// Returns true if userId appears in coHosts at all (even if expired).
function isAnyCoHost(room, userId) {
  const uid = userId.toString()
  return (room.coHosts || []).some(ch => {
    const chUserId = (ch && typeof ch === 'object' && ch.user)
      ? (ch.user._id || ch.user).toString()
      : ch.toString()
    return chUserId === uid
  })
}

export function canJoinRoom({ role, userId, room }) {
  if (!room) return { ok: false, error: 'Room not found' }

  if (role === 'teacher') {
    // Active owner or active co-host — full privileges
    if (isRoomHost(room, userId)) return { ok: true }

    // Expired co-host — let them stay in the room as a viewer (no host actions),
    // but signal the caller so it can emit cohost:expired to the socket.
    const teacherId = room.teacher?._id
      ? room.teacher._id.toString()
      : room.teacher.toString()
    if (teacherId !== userId.toString() && isAnyCoHost(room, userId)) {
      return { ok: true, expiredCoHost: true }
    }

    return { ok: false, error: 'Not authorized for this room' }
  }

  if (role === 'student') {
    return room.endedAt
      ? { ok: false, error: 'This room has ended' }
      : { ok: true }
  }

  return { ok: false, error: 'Not authorized' }
}
