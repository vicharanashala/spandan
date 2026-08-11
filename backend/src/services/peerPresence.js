// Tracks which students currently have a room's RESULTS page open — i.e. who's "live" for peer
// discussion purposes. This is intentionally separate from the main quiz room-join tracking
// (RoomMember / socket.join(roomCode)): a student can be a member of a room without currently
// viewing its results, and peer pairing only makes sense while they're actually there to respond.
//
// Follows the same optional-Redis pattern as the rest of the app (see config/redis.js /
// resultsSnapshot.js): if REDIS_URL is set, presence is stored in Redis so it stays correct
// across multiple backend instances behind a load balancer — a REST request for candidates can
// land on a different process than the socket connection that registered someone as online, and
// a plain in-memory Map would miss them. Falls back to an in-memory Map for single-instance/local
// dev, where that's a non-issue.
import { isRedisEnabled, getRedisClient } from '../config/redis.js'

const PRESENCE_TTL_SECONDS = 60 * 30 // safety net: auto-expire a room's presence set after 30min
                                      // of no activity, in case a leave/disconnect is ever missed

// In-memory fallback: roomId (string) -> Map<studentId (string), { name, socketId }>
const presenceByRoom = new Map()

function redisKey(roomId) {
  return `peer:presence:${roomId}`
}

export async function join(roomId, studentId, meta = {}) {
  if (!roomId || !studentId) return
  if (isRedisEnabled()) {
    const client = getRedisClient()
    const key = redisKey(roomId)
    await client.hSet(key, studentId, JSON.stringify({ name: meta.name || 'Student', socketId: meta.socketId || null }))
    await client.expire(key, PRESENCE_TTL_SECONDS)
    return
  }
  let students = presenceByRoom.get(roomId)
  if (!students) {
    students = new Map()
    presenceByRoom.set(roomId, students)
  }
  students.set(studentId, { name: meta.name || 'Student', socketId: meta.socketId || null })
}

export async function leave(roomId, studentId) {
  if (!roomId || !studentId) return
  if (isRedisEnabled()) {
    await getRedisClient().hDel(redisKey(roomId), studentId)
    return
  }
  const students = presenceByRoom.get(roomId)
  if (!students) return
  students.delete(studentId)
  if (students.size === 0) presenceByRoom.delete(roomId)
}

export async function isOnline(roomId, studentId) {
  if (isRedisEnabled()) {
    return !!(await getRedisClient().hExists(redisKey(roomId), studentId))
  }
  return !!presenceByRoom.get(roomId)?.has(studentId)
}

// Returns [{ studentId, name }] for everyone currently on this room's results page.
export async function listOnline(roomId) {
  if (isRedisEnabled()) {
    const all = await getRedisClient().hGetAll(redisKey(roomId))
    return Object.entries(all || {}).map(([studentId, raw]) => {
      try {
        const parsed = JSON.parse(raw)
        return { studentId, name: parsed.name }
      } catch {
        return { studentId, name: 'Student' }
      }
    })
  }
  const students = presenceByRoom.get(roomId)
  if (!students) return []
  return Array.from(students.entries()).map(([studentId, info]) => ({ studentId, name: info.name }))
}
