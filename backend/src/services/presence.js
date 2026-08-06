import RoomPresence from '../models/RoomPresence.js'
import Room from '../models/Room.js'

// How long a student was actually present in a room. RoomMember can't answer this — it's a
// live "who is currently connected" roster and its row is deleted the moment a student
// leaves (see RoomMember.js / socket room:leave). RoomPresence is the append-only interval
// log this reads from instead: one row per continuous connection, closed on leave/disconnect
// and left open only when nothing got a chance to close it (server restart mid-session).
//
// A student is not guaranteed one interval: reconnects, a second tab, or a phone-then-laptop
// switch each open their own row, and they can overlap. computePresenceSeconds is the pure
// function that turns that raw interval list into a single duration; getPresenceSeconds is
// the thin DB-backed wrapper used to call it for a given room/student.

// intervals: [{ joinedAt, leftAt }] for one student in one room. leftAt null means the
// interval was still open when read (e.g. the room ended while the student was connected,
// or the server restarted) — treated as lasting until sessionEnd, not forever.
export function computePresenceSeconds(intervals, sessionStart, sessionEnd) {
  const start = new Date(sessionStart).getTime()
  const end = new Date(sessionEnd).getTime()
  if (!intervals || intervals.length === 0 || end <= start) return 0

  // Clamp each interval into [sessionStart, sessionEnd], then merge overlapping ranges
  // (simultaneous tabs/reconnects) before summing, so connected time isn't double-counted.
  const ranges = intervals
    .map(({ joinedAt, leftAt }) => {
      const s = Math.min(Math.max(new Date(joinedAt).getTime(), start), end)
      const e = Math.min(Math.max(leftAt ? new Date(leftAt).getTime() : end, start), end)
      return [s, Math.max(s, e)]
    })
    .sort((a, b) => a[0] - b[0])

  let totalMs = 0
  let [curStart, curEnd] = ranges[0]
  for (let i = 1; i < ranges.length; i++) {
    const [s, e] = ranges[i]
    if (s <= curEnd) {
      curEnd = Math.max(curEnd, e)
    } else {
      totalMs += curEnd - curStart
      curStart = s
      curEnd = e
    }
  }
  totalMs += curEnd - curStart

  return Math.max(0, Math.floor(totalMs / 1000))
}

export async function getPresenceSeconds(roomId, studentId) {
  const room = await Room.findById(roomId)
  if (!room) return 0
  const intervals = await RoomPresence.find({ roomId, studentId }, 'joinedAt leftAt').lean()
  return computePresenceSeconds(intervals, room.createdAt, room.endedAt || new Date())
}

// Closes the presence interval a single socket connection opened. Takes a presence _id
// (not a roomId/studentId query) because a student can have more than one open interval at
// once (multiple tabs/devices) — the id is the only unambiguous way to know which one this
// connection owns. Called from both the socket 'room:leave' and 'disconnect' handlers.
export async function closePresenceInterval(presenceId) {
  if (!presenceId) return
  await RoomPresence.updateOne({ _id: presenceId, leftAt: null }, { $set: { leftAt: new Date() } })
}
