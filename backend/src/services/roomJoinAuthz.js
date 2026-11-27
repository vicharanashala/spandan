// Authorization decision for a socket `room:join`.
//
// The socket layer must decide whether a caller may SUBSCRIBE to a room's live
// channel (questions, counts, leaderboard, results) before doing socket.join.
// This is a pure function so it is unit-testable; it runs on the server-derived
// socket identity (role/userId), never on client-claimed fields.
//
// Model: rooms are joined by their short code (the intended UX, mirrored by the
// REST GET /rooms/join/:code). So a student with the code may join an active
// room, but a teacher may only join a room they OWN, and nobody may subscribe to
// a room that does not exist or (for students) has ended.
//
// Returns { ok: true } or { ok: false, error: '<reason>' }.
export function canJoinRoom({ role, userId, room, isClassMember = false }) {
  if (!room) return { ok: false, error: 'Room not found' }

  // room.teacher may be a raw ObjectId or a populated user doc — handle both.
  const teacherId = String(room.teacher?._id ?? room.teacher)

  if (role === 'teacher') {
    return teacherId === String(userId)
      ? { ok: true }
      : { ok: false, error: 'Not authorized for this room' }
  }

  if (role === 'student') {
    if (room.endedAt) {
      return { ok: false, error: 'This room has ended' }
    }
    if (room.classId && !isClassMember) {
      return { ok: false, error: 'You must be enrolled in this class to join the session' }
    }
    return { ok: true }
  }

  return { ok: false, error: 'Not authorized' }
}
