// Insights cache — the results-page insights (GET /responses/insights/:roomId) for an ENDED room,
// computed ONCE and served to everyone.
//
// When a room ends, every student opens the results page at once. Computed per request, each one
// re-reads the whole room (questions, every response, members, transcripts) and recomputes the same
// numbers. An ended room never changes, so we compute every view in one pass
// (computeRoomInsights: teacher payload, class payload, each student's `me`) and serve pre-serialised
// JSON strings — no per-request DB scan, compute or JSON.stringify.
//
// Two layers, so it works with or without Redis:
//   L1  in-process memory (per instance), always on. Concurrent misses for the same room share ONE
//       in-flight build, so without Redis (local / single-instance) a stampede is still one build.
//   L2  Redis (when REDIS_URL is set AND the client is connected), shared by all instances; built at
//       room end (prewarmInsights) or lazily under a lock so only one instance builds.
//   Any Redis error, timeout or disconnect → skip L2 and build locally. Worst case = one local
//   build per instance per TTL, never a wrong or broken result.
// Live rooms are never cached here (callers pass ended=false → null → direct compute, as before).
//
// Redis keys (per roomId), TTL = TTL_MS:
//   results:ins:t:<roomId>    STRING  teacher payload JSON (written LAST = the "complete" marker)
//   results:ins:c:<roomId>    STRING  class payload JSON (students)
//   results:ins:m:<roomId>    HASH    studentId -> that student's `me` JSON
//   results:ins:v:<roomId>    STRING  room.updatedAt of the build — any later edit to the room (e.g.
//                                     the anonymous-leaderboard setting) makes every cached copy stale
//   results:ins:lock:<roomId>         single-flight build lock

import { isRedisReady, getRedisClient } from '../config/redis.js'
import { computeRoomInsights } from './insightsService.js'

const TTL_MS = 600000      // 10 min, same as the results snapshot; rebuilt on miss
const L1_MAX_ROOMS = 20
const L1_MAX_CHARS = 16 * 1024 * 1024 // ~16 MB of JSON per instance (a 600-student room is ~2.4 MB); least recently used evicted first
const LOCK_MS = 15000
const WAIT_STEP_MS = 50
const WAIT_MAX_STEPS = 30  // ~1.5 s waiting for another instance's build, then build locally
const REDIS_TIMEOUT_MS = 1500

const local = new Map()    // roomId -> { exp, bundle, size } (Map order = least recently used first)
let localChars = 0
const inflight = new Map() // roomId -> Promise<bundle>

const keys = (roomId) => ({
  t: `results:ins:t:${roomId}`,
  c: `results:ins:c:${roomId}`,
  m: `results:ins:m:${roomId}`,
  v: `results:ins:v:${roomId}`,
  lock: `results:ins:lock:${roomId}`
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Redis is used only when configured AND currently connected: a command sent while disconnected
// would sit in the client's offline queue, so we skip L2 rather than wait on it.
const redis = () => (isRedisReady() ? getRedisClient() : null)
function withTimeout(p, ms = REDIS_TIMEOUT_MS) {
  let timer
  return Promise.race([p, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('redis timeout')), ms) })])
    .finally(() => clearTimeout(timer))
}

// Load everything the insights need. Only the response fields the computation reads.
export async function loadInsightsDocs(roomId) {
  const Room = (await import('../models/Room.js')).default
  const Question = (await import('../models/Question.js')).default
  const Response = (await import('../models/Response.js')).default
  const RoomMember = (await import('../models/RoomMember.js')).default
  const Transcript = (await import('../models/Transcript.js')).default
  const User = (await import('../models/User.js')).default
  const [room, questions, responses, members, transcripts] = await Promise.all([
    Room.findById(roomId).lean(),
    Question.find({ roomId }).lean(),
    Response.find({ roomId }).select('questionId studentId selectedOption selectedOptions isCorrect responseTime points createdAt').lean(),
    RoomMember.find({ roomId }).select('studentId joinedAt').lean(),
    Transcript.find({ roomId }).select('segmentIndex wordCount duration').lean()
  ])
  const ids = [...new Set([...responses.map((r) => String(r.studentId)), ...members.map((m) => String(m.studentId))])]
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select('name email').lean() : []
  return { room, questions, responses, members, transcripts, usersById: new Map(users.map((u) => [String(u._id), u])) }
}

// A cached build is valid only for the same room version AND the same payload format. Room edits bump
// updatedAt (timestamps: true); PAYLOAD_VERSION is bumped whenever computeInsights' output changes, so
// a deploy never serves a bundle built by older code (Redis keeps it up to TTL_MS otherwise).
const PAYLOAD_VERSION = 2 // 2: segments numbered as stored (1-based), 0/-1 grouped as manual / pasted
export const roomVersion = (room) => `p${PAYLOAD_VERSION}:${room?.updatedAt ? new Date(room.updatedAt).getTime() : ''}`

// Every view of the room, serialised once.
export function buildBundle(docs) {
  const { base, teacher, me } = computeRoomInsights({ ...docs, withTeacher: true, meFor: 'all' })
  const meJson = new Map()
  for (const [st, block] of me) meJson.set(st, JSON.stringify(block))
  return { version: roomVersion(docs.room), teacher: JSON.stringify(teacher), base: JSON.stringify(base), me: meJson }
}

// Response bodies, byte-identical to res.json({ success: true, role, ...insights }) on the direct path.
export function teacherBody(bundle) {
  return '{"success":true,"role":"teacher",' + bundle.teacher.slice(1)
}
export function studentBody(bundle, studentId) {
  const me = bundle.me.get(String(studentId))
  if (!me) return null // not in this room's snapshot (e.g. joined after it was built) → direct compute
  return '{"success":true,"role":"student",' + bundle.base.slice(1, -1) + ',"me":' + me + '}'
}

// ── L2 (Redis) ───────────────────────────────────────────────────────────────
async function readRedis(client, k, version) {
  const [t, c, m, v] = await withTimeout(client.multi().get(k.t).get(k.c).hGetAll(k.m).get(k.v).exec())
  if (!t || !c || v !== version) return null // missing, or built from an older version of the room
  return { version: v, teacher: t, base: c, me: new Map(Object.entries(m || {})) }
}
async function writeRedis(client, k, bundle) {
  const ttlSec = Math.ceil(TTL_MS / 1000)
  const tx = client.multi().del(k.m)
  if (bundle.me.size) tx.hSet(k.m, Object.fromEntries(bundle.me)).expire(k.m, ttlSec)
  tx.set(k.v, bundle.version, { EX: ttlSec }).set(k.c, bundle.base, { EX: ttlSec }).set(k.t, bundle.teacher, { EX: ttlSec })
  await withTimeout(tx.exec())
}

// Get the room's bundle: Redis hit → else build (one instance at a time when Redis is up) → write
// back to Redis. force=true skips the Redis read (room-end pre-warm: always build fresh).
// version = the caller's current room version; a Redis copy of another version is ignored.
async function loadBundle(roomId, { force = false, version = null } = {}) {
  const client = redis()
  const k = keys(roomId)
  let haveLock = false
  if (client) {
    try {
      if (!force) {
        const hit = await readRedis(client, k, version)
        if (hit) return hit
      }
      haveLock = (await withTimeout(client.set(k.lock, '1', { NX: true, PX: LOCK_MS }))) === 'OK'
      if (!haveLock && !force) {
        // Another instance is building — wait briefly for its write instead of building a duplicate.
        for (let i = 0; i < WAIT_MAX_STEPS; i++) {
          await sleep(WAIT_STEP_MS)
          if (await withTimeout(client.exists(k.t))) {
            const hit = await readRedis(client, k, version)
            if (hit) return hit
          }
        }
      }
    } catch (e) {
      console.error('[insightsCache] redis read skipped:', e.message)
    }
  }
  try {
    const bundle = buildBundle(await loadInsightsDocs(roomId))
    if (client && (haveLock || force)) {
      await writeRedis(client, k, bundle).catch((e) => console.error('[insightsCache] redis write failed:', e.message))
    }
    return bundle
  } finally {
    if (haveLock) withTimeout(client.del(k.lock)).catch(() => {})
  }
}

// ── L1 (memory) + single-flight ──────────────────────────────────────────────
const bundleChars = (b) => { let n = b.teacher.length + b.base.length; for (const v of b.me.values()) n += v.length; return n }
function dropLocal(roomId) {
  const e = local.get(roomId)
  if (e) { localChars -= e.size; local.delete(roomId) }
}
function getLocal(roomId) {
  const e = local.get(roomId)
  if (!e) return null
  if (e.exp <= Date.now()) { dropLocal(roomId); return null }
  local.delete(roomId); local.set(roomId, e) // mark as recently used
  return e.bundle
}
function setLocal(roomId, bundle) {
  dropLocal(roomId)
  const size = bundleChars(bundle)
  local.set(roomId, { exp: Date.now() + TTL_MS, bundle, size })
  localChars += size
  // Evict least recently used past either cap (the newest entry is always kept, so a room bigger
  // than the budget is still served from memory until the next room arrives).
  while (local.size > 1 && (local.size > L1_MAX_ROOMS || localChars > L1_MAX_CHARS)) dropLocal(local.keys().next().value)
}
function sharedLoad(roomId, opts) {
  let p = inflight.get(roomId)
  if (!p) {
    p = loadBundle(roomId, opts)
      .then((bundle) => { setLocal(roomId, bundle); return bundle })
      .finally(() => inflight.delete(roomId))
    inflight.set(roomId, p)
  }
  return p
}

// The insights response body for an ended room, or null → the caller computes directly
// (live room, student not in the snapshot, or the build failed). version = roomVersion(room) of the
// room the caller just loaded; a cached copy of an older version is rebuilt.
export async function getInsightsBody(roomId, { ended, role, studentId, version = '' } = {}) {
  if (!ended) return null
  const id = String(roomId)
  try {
    let bundle = getLocal(id)
    if (bundle && bundle.version !== version) { dropLocal(id); bundle = null }
    if (!bundle) bundle = await sharedLoad(id, { version })
    return role === 'teacher' ? teacherBody(bundle) : studentBody(bundle, studentId)
  } catch (e) {
    console.error('[insightsCache] build failed, computing directly:', e.message)
    return null
  }
}

// Room-end pre-warm: build fresh into L1 (and Redis when up) before students arrive. Fire-and-forget.
export function prewarmInsights(roomId) {
  return sharedLoad(String(roomId), { force: true }).then(() => true)
}

// Drop a room's cached insights (e.g. if its questions/responses are edited after it ended). Clears
// this instance's L1 and Redis; other instances' L1 expires within TTL_MS.
export async function invalidateInsights(roomId) {
  const id = String(roomId)
  dropLocal(id)
  const client = redis()
  if (!client) return
  const k = keys(id)
  try { await withTimeout(client.del([k.t, k.c, k.m, k.v])) } catch (e) { /* non-fatal */ }
}

// Tests only.
export function _resetInsightsCache() { local.clear(); localChars = 0; inflight.clear() }
