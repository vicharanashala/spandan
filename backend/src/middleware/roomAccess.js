import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import { checkRoomOwnership } from '../utils/roomOwnership.js'
import { declarePolicy } from './routePolicy.js'

// Room-scoped access, in one place.
//
// Almost everything this API serves belongs to a room, and "may this caller touch that room?" was
// answered by a hand-written block at the top of ten different handlers. They drifted, as copies
// do: one forgot to scope the query to the caller (GET /api/responses, which returned the whole
// room's answers to any member), one checked role but never ownership (POST /api/questions), one
// checked nothing at all. Each was then fixed on its own, in its own commit, in its own shape.
//
// The rule is not per-handler knowledge, so it should not live per-handler. A route says which
// relationship it requires and gets `req.room` already loaded:
//
//   router.get('/counts/:roomId', roomAccess('owner'),  handler)   // the room's teacher
//   router.get('/leaderboard/:roomId', roomAccess('member'), handler)   // teacher or a joined student
//
// Handlers that serve both audiences branch on `req.isRoomOwner` instead of re-deriving it.
//
// `teacher` is populated down to its name, so no handler can accidentally forward the teacher's
// email to a room member — the shape of req.room makes that leak unavailable rather than merely
// unwritten. checkRoomOwnership compares by id either way (raw ObjectId or populated doc).

// Where a room is identified varies by route and there is no ambiguity to resolve: no route carries
// two different room ids. Checked in this order.
const ROOM_ID_SOURCES = [
  (req) => req.params?.roomId,
  (req) => req.params?.id,
  (req) => req.query?.roomId,
  (req) => req.body?.roomId
]

const resolveRoomId = (req) => {
  for (const source of ROOM_ID_SOURCES) {
    const id = source(req)
    if (id) return id
  }
  return null
}

/**
 * @param {'owner'|'member'} scope
 *   'owner'  — only the teacher who owns the room.
 *   'member' — the owning teacher, or a student who has joined it.
 */
export const roomAccess = (scope) => {
  if (scope !== 'owner' && scope !== 'member') {
    throw new Error(`roomAccess: unknown scope '${scope}'`)
  }

  return declarePolicy(async (req, res, next) => {
    try {
      const roomId = resolveRoomId(req)
      if (!roomId) {
        return res.status(400).json({ error: 'roomId is required' })
      }

      // An id that is not a valid ObjectId is a bad request, not a server error — findById would
      // otherwise throw a CastError into the error handler and answer 500 to a probe.
      const room = await Room.findById(roomId).populate('teacher', 'name').catch(() => null)

      const ownership = checkRoomOwnership(room, req.user._id)
      if (ownership.ok) {
        req.room = room
        req.isRoomOwner = true
        return next()
      }

      // 404 (room does not exist) is not an authorization answer — report it as-is for either scope.
      if (ownership.status === 404) {
        return res.status(404).json({ error: 'Room not found' })
      }

      if (scope === 'member') {
        const membership = await RoomMember.findOne({ roomId: room._id, studentId: req.user._id })
        if (membership) {
          req.room = room
          req.isRoomOwner = false
          return next()
        }
      }

      return res.status(403).json({ error: 'Not authorized for this room' })
    } catch (error) {
      next(error)
    }
  }, `room:${scope}`)
}
