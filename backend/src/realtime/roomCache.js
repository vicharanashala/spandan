// Short-lived TTL cache for room-code -> room-id lookups.
//
// Why this exists:
// When 1000+ students hit "Join" within the same few seconds (a live classroom
// starting a quiz), every socket 'room:join' event used to run its own
// `Room.findByCode()` query. That's N nearly-identical reads hitting Mongo at
// once for data that essentially never changes mid-session. Caching the
// roomCode -> roomId mapping for a short TTL turns "N students joining" into
// "1 DB read + (N-1) memory reads".
//
// Rooms are cheap to look up again once the TTL expires, and correctness isn't
// affected because a room's _id and code never change after creation.

const DEFAULT_TTL_MS = Number(process.env.ROOM_CACHE_TTL_MS || 60_000)

class RoomCache {
  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs
    this.map = new Map() // code -> { roomId, teacherId, endedAt, expiresAt }
  }

  get(code) {
    const entry = this.map.get(code)
    if (!entry) return null
    if (entry.expiresAt < Date.now()) {
      this.map.delete(code)
      return null
    }
    return entry
  }

  set(code, { roomId, teacherId, endedAt }) {
    this.map.set(code, {
      roomId,
      teacherId,
      endedAt: endedAt || null,
      expiresAt: Date.now() + this.ttlMs
    })
  }

  invalidate(code) {
    this.map.delete(code)
  }

  // Periodic sweep so the map doesn't grow unbounded across a long-running process.
  sweep() {
    const now = Date.now()
    for (const [code, entry] of this.map) {
      if (entry.expiresAt < now) this.map.delete(code)
    }
  }

  size() {
    return this.map.size
  }
}

export const roomCache = new RoomCache()

// Sweep stale entries periodically instead of on every access.
setInterval(() => roomCache.sweep(), 5 * 60 * 1000).unref()
