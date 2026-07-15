// In-memory presence tracker.
//
// Why this exists:
// The old code re-ran `RoomMember.countDocuments()` against Mongo on every
// single join/leave to compute the participant count. With 3000 students
// joining in a burst that's 3000 COUNT queries competing for the same
// connection pool at the exact moment the DB is also busy with 3000 upserts.
//
// Presence (who's *currently connected*) is fundamentally an in-memory,
// ephemeral concept, so we track it in memory per Node process and only
// touch Mongo for the durable "was this student ever in this room" record
// (RoomMember), which doesn't need to happen synchronously on the hot path.
//
// A Map<roomCode, Map<userId, Set<socketId>>> correctly handles a student
// who has the room open in two tabs (two socket ids, one userId) without
// double-counting or prematurely decrementing when one tab closes.

class RoomPresence {
  constructor() {
    this.rooms = new Map() // roomCode -> Map<userId, Set<socketId>>
  }

  /**
   * Register a socket as present in a room.
   * @returns {boolean} true if this is the user's *first* socket in the room
   *                     (i.e. a genuinely new participant, not a reconnect/2nd tab)
   */
  add(roomCode, userId, socketId) {
    let users = this.rooms.get(roomCode)
    if (!users) {
      users = new Map()
      this.rooms.set(roomCode, users)
    }
    let sockets = users.get(userId)
    const isNewParticipant = !sockets
    if (!sockets) {
      sockets = new Set()
      users.set(userId, sockets)
    }
    sockets.add(socketId)
    return isNewParticipant
  }

  /**
   * Remove a socket from a room.
   * @returns {boolean} true if this was the user's *last* socket in the room
   *                     (i.e. they've fully left, not just closed one tab)
   */
  remove(roomCode, userId, socketId) {
    const users = this.rooms.get(roomCode)
    if (!users) return false
    const sockets = users.get(userId)
    if (!sockets) return false
    sockets.delete(socketId)
    if (sockets.size === 0) {
      users.delete(userId)
      if (users.size === 0) this.rooms.delete(roomCode)
      return true
    }
    return false
  }

  count(roomCode) {
    return this.rooms.get(roomCode)?.size || 0
  }

  // Best-effort cleanup for a socket whose room membership we lost track of
  // (e.g. process restart edge cases). Called on disconnect with the room the
  // socket recorded joining.
  removeSocketEverywhere(userId, socketId) {
    for (const [roomCode, users] of this.rooms) {
      const sockets = users.get(userId)
      if (sockets?.has(socketId)) {
        this.remove(roomCode, userId, socketId)
      }
    }
  }
}

export const roomPresence = new RoomPresence()
