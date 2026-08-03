// Results snapshot — kills the end-of-session "results stampede".
//
// When a big room ends, all ~N students navigate to the results page at once and each fires the
// same expensive reads: the ranked leaderboard (full-room aggregation), their own per-question
// breakdown, and (for the teacher) the per-question stats. Computed per-request that is ~3N
// full-room reads landing in one ~1s window — enough to spike a 2-core box (observed load 7.61 at
// 587 students). But once a room has ENDED its data is IMMUTABLE, and every student's payload is
// just their slice of the SAME room-wide scan. So we compute the whole room's results ONCE and
// serve everyone from a shared cache.
//
// Design:
//   - Only ENDED rooms are snapshotted (that's when the stampede happens; live single-student
//     peeks stay on the direct-compute path — we never scan the whole room for one live viewer).
//   - Gated purely on redis.enabled (REDIS_URL). No Redis (local/single-instance) => every helper
//     no-ops and callers fall back to direct compute = today's exact behavior. No feature flag.
//   - Transparent cache-with-fallback: any miss/error returns null and the caller computes
//     directly. The worst case is "cache didn't help", never a wrong or broken result.
//   - Single source of truth for the ranked board: computeRanked() (shared with the live socket
//     broadcaster) so the cached board can't diverge from the live one.
//
// Cache keys (per roomId), TTL = SNAPSHOT_TTL_MS, rebuilt on miss:
//   results:lb:<roomId>       STRING  JSON ranked leaderboard[]          -> GET /leaderboard
//   results:students:<roomId> HASH    field=studentId -> JSON questions  -> GET /room/:id/student/:sid
//   results:stats:<roomId>    STRING  JSON { ...room stats, questionStats } -> GET /stats/room

import mongoose from 'mongoose'
import { isRedisEnabled, getRedisClient } from '../config/redis.js'
import { computeRanked } from './leaderboardAgg.js'

const SNAPSHOT_TTL_MS = 600000 // 10 min — an ended room's results never change; rebuilt on miss.
const LOCK_MS = 10000          // single-flight build lock
const WAIT_STEP_MS = 50        // poll interval while another instance builds
const WAIT_MAX_STEPS = 20      // ~1s max wait before giving up and falling back to direct compute

let ResponseModel = null
let QuestionModel = null
let RoomMemberModel = null

async function models() {
  if (!ResponseModel) ResponseModel = (await import('../models/Response.js')).default
  if (!QuestionModel) QuestionModel = (await import('../models/Question.js')).default
  if (!RoomMemberModel) RoomMemberModel = (await import('../models/RoomMember.js')).default
  return { Response: ResponseModel, Question: QuestionModel, RoomMember: RoomMemberModel }
}

function keys(roomId) {
  const id = String(roomId)
  return {
    lb: `results:lb:${id}`,
    students: `results:students:${id}`,
    stats: `results:stats:${id}`,
    lock: `results:lock:${id}`
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const toIdStr = (id) => (id && id.toString ? id.toString() : String(id))

// Build the entire room's results in one pass. ~5 DB ops total for the whole room (vs ~3N per
// request today): computeRanked (1 agg + 1 name lookup), one Question.find, one Response.find,
// one RoomMember count. Returns the three artifacts ready to cache.
export async function buildSnapshot(roomId) {
  const { Response, Question, RoomMember } = await models()
  const roomObjId = new mongoose.Types.ObjectId(roomId)

  const [{ full: leaderboard }, allQuestions, responses, totalJoined] = await Promise.all([
    computeRanked(roomId),
    Question.find({ roomId: roomObjId }).lean(),
    Response.find({ roomId: roomObjId }).lean(),
    RoomMember.countDocuments({ roomId: roomObjId })
  ])

  // Group the single response scan two ways: per (student -> question) for the per-student
  // breakdown, and per question for the teacher stats. One iteration.
  const respByStudentQ = new Map() // sid -> Map(qid -> response)
  const respByQuestion = new Map() // qid -> response[]
  const studentSet = new Set()
  for (const r of responses) {
    const sid = toIdStr(r.studentId)
    const qid = toIdStr(r.questionId)
    studentSet.add(sid)
    let byQ = respByStudentQ.get(sid)
    if (!byQ) { byQ = new Map(); respByStudentQ.set(sid, byQ) }
    byQ.set(qid, r)
    let list = respByQuestion.get(qid)
    if (!list) { list = []; respByQuestion.set(qid, list) }
    list.push(r)
  }

  // Approved questions, newest-first — the exact set + order the per-student endpoint renders.
  const approved = allQuestions
    .filter((q) => q.status === 'approved')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  // Per-student breakdown, byte-identical (key order included) to the payload built by
  // GET /responses/room/:roomId/student/:studentId, so cache and direct-compute are indistinguishable.
  const byStudent = {}
  for (const sid of studentSet) {
    const byQ = respByStudentQ.get(sid)
    byStudent[sid] = approved.map((q) => {
      const resp = byQ && byQ.get(toIdStr(q._id))
      return {
        _id: toIdStr(q._id),
        question: q.question,
        type: q.type,
        options: q.options,
        segmentIndex: q.segmentIndex,
        maxPoints: q.points,
        timeToAnswer: q.timeToAnswer,
        answered: !!resp,
        ...(resp && {
          selectedOption: resp.selectedOption,
          selectedOptions: resp.selectedOptions || [resp.selectedOption],
          isCorrect: resp.isCorrect,
          responseTime: resp.responseTime,
          pointsEarned: resp.points
        }),
        createdAt: q.createdAt
      }
    })
  }

  // Per-question stats over ALL questions (matches the current stats/room endpoint, which does not
  // filter by status). One aggregation instead of the old find-per-question N+1 loop.
  const questionStats = allQuestions.map((q) => {
    const list = respByQuestion.get(toIdStr(q._id)) || []
    const answerCounts = {}
    let correctCount = 0
    q.options.forEach((opt, idx) => {
      const c = list.filter((r) => r.selectedOption === idx).length
      answerCounts[idx] = c
      if (opt.isCorrect) correctCount += c
    })
    return {
      questionId: toIdStr(q._id),
      question: q.question,
      type: q.type,
      totalResponses: list.length,
      correctCount,
      answerCounts
    }
  })

  const stats = {
    totalResponses: responses.length,
    totalStudents: studentSet.size,
    totalJoined,
    totalQuestions: allQuestions.length,
    questionStats
  }

  return { leaderboard, byStudent, stats }
}

// Write the three artifacts to Redis with the snapshot TTL. Best-effort; throws are caught by
// callers so a cache-write failure never breaks a request.
async function writeSnapshot(roomId, snap) {
  const client = getRedisClient()
  const k = keys(roomId)
  const ttlSec = Math.ceil(SNAPSHOT_TTL_MS / 1000)

  await client.set(k.lb, JSON.stringify(snap.leaderboard), { EX: ttlSec })
  await client.set(k.stats, JSON.stringify(snap.stats), { EX: ttlSec })

  await client.del(k.students)
  const sids = Object.keys(snap.byStudent)
  if (sids.length) {
    const flat = {}
    for (const sid of sids) flat[sid] = JSON.stringify(snap.byStudent[sid])
    await client.hSet(k.students, flat)
  }
  await client.expire(k.students, ttlSec)
}

// Build + write, forcing a fresh snapshot regardless of any existing one. Used at room-end
// pre-warm so the cache is hot (and current) before students arrive. Single-flight so two
// instances handling the same room-end don't both build.
export async function rebuildSnapshot(roomId) {
  if (!isRedisEnabled()) return false
  const client = getRedisClient()
  const k = keys(roomId)
  try {
    const won = await client.set(k.lock, '1', { NX: true, PX: LOCK_MS })
    if (won !== 'OK') return false // another instance is (re)building — its write will win
    try {
      const snap = await buildSnapshot(roomId)
      await writeSnapshot(roomId, snap)
      return true
    } finally {
      await client.del(k.lock).catch(() => {})
    }
  } catch (e) {
    console.error('[resultsSnapshot] rebuild error:', e.message)
    return false
  }
}

// Ensure a snapshot exists (build it if missing), coordinating so only one instance builds while
// others wait briefly then read. Returns true if the cache is populated, false if unavailable
// (redis off / error / gave up waiting) — in which case the caller falls back to direct compute.
async function ensureBuilt(roomId) {
  if (!isRedisEnabled()) return false
  const client = getRedisClient()
  const k = keys(roomId)
  try {
    if (await client.exists(k.lb)) return true
    const won = await client.set(k.lock, '1', { NX: true, PX: LOCK_MS })
    if (won === 'OK') {
      try {
        const snap = await buildSnapshot(roomId)
        await writeSnapshot(roomId, snap)
        return true
      } finally {
        await client.del(k.lock).catch(() => {})
      }
    }
    // Someone else is building — wait briefly for their write rather than build a duplicate.
    for (let i = 0; i < WAIT_MAX_STEPS; i++) {
      await sleep(WAIT_STEP_MS)
      if (await client.exists(k.lb)) return true
    }
    return false
  } catch (e) {
    console.error('[resultsSnapshot] ensureBuilt error:', e.message)
    return false
  }
}

// ── Read helpers ─────────────────────────────────────────────────────────────
// Each returns the cached value, or null to signal the caller to compute directly. A room that is
// not yet ended is never snapshotted here (caller passes ended=false → we skip straight to null).

export async function getLeaderboard(roomId, { ended } = {}) {
  if (!ended || !isRedisEnabled()) return null
  try {
    if (!(await ensureBuilt(roomId))) return null
    const raw = await getRedisClient().get(keys(roomId).lb)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

export async function getStats(roomId, { ended } = {}) {
  if (!ended || !isRedisEnabled()) return null
  try {
    if (!(await ensureBuilt(roomId))) return null
    const raw = await getRedisClient().get(keys(roomId).stats)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

// Returns { hit: boolean, questions }. hit=false means "not in snapshot" — either the cache is
// unavailable OR this student is a non-responder (not stored); the caller computes just that one
// student directly. This keeps a non-responder's correct (all-unanswered) payload without bloating
// the cache with an entry per joined-but-silent student.
export async function getStudent(roomId, studentId, { ended } = {}) {
  if (!ended || !isRedisEnabled()) return { hit: false }
  try {
    if (!(await ensureBuilt(roomId))) return { hit: false }
    const raw = await getRedisClient().hGet(keys(roomId).students, String(studentId))
    if (!raw) return { hit: false }
    return { hit: true, questions: JSON.parse(raw) }
  } catch (e) {
    return { hit: false }
  }
}

// Drop a room's snapshot (e.g. if its questions/responses are edited after it ended).
export async function invalidate(roomId) {
  if (!isRedisEnabled()) return
  const k = keys(roomId)
  try {
    await getRedisClient().del([k.lb, k.students, k.stats])
  } catch (e) {
    /* non-fatal */
  }
}
