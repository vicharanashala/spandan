// Shared per-room "live state" cache — { currentQuestion, endedAt } — used by POST /responses to
// decide whether a poll is still answerable (Phase 3 response-window enforcement) WITHOUT a Mongo
// read on every submit. The value lives in Redis (shared across both prod instances), so it stays
// consistent without any in-process cache-coherence dance.
//
// Correctness by design — the LAUNCH is the sole writer of the value and the ROOM-END deletes it:
//   * setRoomLive(roomId, questionId)  — on every poll launch: SET {currentQuestion, endedAt:null}
//   * invalidateRoomLive(roomId)       — on room end: DEL (next read falls back to fresh Mongo)
//   * getRoomLive(Room, roomId)        — on POST: Redis GET (hit → use); miss / Redis-off → Mongo
//                                        read, returned WITHOUT populating.
// Because reads never write the key, there is no read-populate race that could resurrect a stale
// value after a launch overwrote it. If Redis is down, every step degrades to the plain Mongo path
// (identical behaviour to Phase 3 without this cache), so it is a pure optimisation, never a
// correctness dependency. The TTL is only a backstop for a missed DEL; it is refreshed on each launch
// and comfortably exceeds a session, so the key does not expire mid-session under normal use.
import { getRedisClient, isRedisEnabled } from '../config/redis.js'

const KEY = (roomId) => `live:room:${roomId}`
const TTL_SEC = Number(process.env.ROOM_LIVE_CACHE_TTL_SEC) || 7200 // 2h backstop; refreshed each launch

// Poll launched → room is live and this is the current question.
export async function setRoomLive(roomId, questionId) {
  if (!isRedisEnabled()) return
  try {
    await getRedisClient().set(
      KEY(roomId),
      JSON.stringify({ currentQuestion: String(questionId), endedAt: null }),
      { EX: TTL_SEC }
    )
  } catch { /* non-fatal — POST /responses falls back to a fresh Mongo read */ }
}

// Room ended (or any time we want reads to re-read Mongo). DEL so the next getRoomLive misses and
// reads the fresh endedAt from Mongo.
export async function invalidateRoomLive(roomId) {
  if (!isRedisEnabled()) return
  try { await getRedisClient().del(KEY(roomId)) } catch { /* non-fatal */ }
}

// Read the room's live state for the POST guard. Redis hit → no Mongo. Miss / Redis-off → fresh Mongo
// read, NOT written back (launch is the sole value-writer → no read-populate race).
export async function getRoomLive(Room, roomId) {
  if (isRedisEnabled()) {
    try {
      const v = await getRedisClient().get(KEY(roomId))
      if (v) {
        const o = JSON.parse(v)
        return { currentQuestion: o.currentQuestion || null, endedAt: o.endedAt || null }
      }
    } catch { /* fall through to Mongo */ }
  }
  const room = await Room.findById(roomId).select('currentQuestion endedAt').lean()
  if (!room) return null
  return {
    currentQuestion: room.currentQuestion ? String(room.currentQuestion) : null,
    endedAt: room.endedAt || null
  }
}
