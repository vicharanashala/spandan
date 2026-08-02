/**
 * roomJoinAuthz.js
 *
 * Pure authorization logic for the room:join socket event.
 * Keeps the policy in one testable place instead of inline in index.js.
 *
 * Returns { ok: true } when the caller is allowed to join, or
 * { ok: false, error: string } when they should be rejected.
 */

/**
 * @param {{ role: string, userId: string, room: object|null }} params
 * @returns {{ ok: boolean, error?: string }}
 */
export function canJoinRoom({ role, userId, room }) {
  // Room must exist
  if (!room) {
    return { ok: false, error: 'Room not found' }
  }

  // Teacher must own the room
  if (role === 'teacher') {
    if (String(room.teacher) !== String(userId)) {
      return { ok: false, error: 'Not authorized to join this room' }
    }
    return { ok: true }
  }

  // Students may only join active (non-ended) rooms
  if (role === 'student') {
    if (!room.isActive || room.endedAt) {
      return { ok: false, error: 'This room has ended' }
    }
    // Late-join gate: if the teacher has disabled it, only allow if the room has no current question yet
    if (room.settings?.allowLateJoin === false && room.currentQuestion) {
      return { ok: false, error: 'Late joining is not allowed for this room' }
    }
    return { ok: true }
  }

  // Unknown role
  return { ok: false, error: 'Not authorized' }
}
