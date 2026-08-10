// Incremental, instance-aware leaderboard cache.
//
// The ranked board is recomputed once per SEGMENT (the teacher's question pop-up closing), not per
// answer and not by re-summing the whole room. We keep a per-room running total and, on each fold,
// scan only the questions we have NOT folded in yet — so the cost of a board is bounded to one
// segment's answers regardless of how long the session has run.
//
// INSTANCE-AWARE. The running total lives in Redis (shared across backend instances) when Redis is
// enabled, and in a process-local Map otherwise. Redis-off implies single-instance in this
// architecture (the socket.io fan-out itself needs the Redis adapter), so the in-process store is
// correct there. Either way the memo is a pure cache: Mongo stays authoritative, and losing it
// (restart, eviction, first fold, a Redis hiccup) costs exactly one full re-scan and nothing else.
//
// Correctness under concurrency: each fold reads a COPY of the cached state, folds onto the copy,
// and writes the whole thing back. Two overlapping folds therefore derive the same next state from
// the same base and last-write-wins is harmless. A Redis NX lock serialises folds across instances
// as a best-effort optimisation; it is never required for correctness.

import mongoose from 'mongoose'
import { isRedisEnabled, getRedisClient } from '../config/redis.js'

let ResponseModel = null
let UserModel = null
async function models() {
  if (!ResponseModel) ResponseModel = (await import('../models/Response.js')).default
  if (!UserModel) UserModel = (await import('../models/User.js')).default
  return { Response: ResponseModel, User: UserModel }
}

const CACHE_TTL_S = Number(process.env.LEADERBOARD_CACHE_TTL_S) || 6 * 60 * 60 // rebuildable; TTL just bounds leaks
const MEMO_MAX_ROOMS = 200
const memo = new Map() // roomId -> { totals: Map(sid -> {points,correct,answered}), done: Set(qid) }

const kCache = (id) => `lb:cache:${id}`
const kLock = (id) => `lb:cache:lock:${id}`

function takeMemo(id) {
  const hit = memo.get(id)
  if (hit) { memo.delete(id); memo.set(id, hit); return hit } // move to MRU end
  if (memo.size >= MEMO_MAX_ROOMS) memo.delete(memo.keys().next().value) // evict LRU
  const fresh = { totals: new Map(), done: new Set() }
  memo.set(id, fresh)
  return fresh
}

const copyTotals = (src) => new Map([...src].map(([k, v]) => [k, { points: v.points, correct: v.correct, answered: v.answered }]))

// Read the cached {totals, done} as a fresh COPY (never hand back the live object).
async function readCache(id) {
  if (isRedisEnabled()) {
    try {
      const raw = await getRedisClient().get(kCache(id))
      if (!raw) return { totals: new Map(), done: new Set() }
      const o = JSON.parse(raw)
      const totals = new Map()
      for (const [sid, arr] of Object.entries(o.totals || {})) {
        totals.set(sid, { points: arr[0], correct: arr[1], answered: arr[2] })
      }
      return { totals, done: new Set(o.done || []) }
    } catch (e) {
      return { totals: new Map(), done: new Set() } // treat as cache miss -> full re-scan this time
    }
  }
  const h = takeMemo(id)
  return { totals: copyTotals(h.totals), done: new Set(h.done) }
}

async function writeCache(id, totals, done) {
  if (isRedisEnabled()) {
    try {
      const o = { totals: {}, done: [...done] }
      for (const [sid, v] of totals) o.totals[sid] = [v.points, v.correct, v.answered]
      await getRedisClient().set(kCache(id), JSON.stringify(o), { EX: CACHE_TTL_S })
    } catch (e) { /* non-fatal: next fold just re-scans */ }
    return
  }
  memo.set(id, { totals: copyTotals(totals), done: new Set(done) })
}

// Drop a room's cache so the next board is rebuilt from scratch (e.g. at room end, or if responses
// are edited after the fact).
export async function invalidateLeaderboardCache(roomId) {
  const id = String(roomId)
  if (isRedisEnabled()) { try { await getRedisClient().del(kCache(id)) } catch (e) { /* non-fatal */ } }
  else memo.delete(id)
}

// Best-effort cross-instance serialisation of a fold. Not required for correctness (copy-on-write +
// last-write-wins handle races); it just avoids two instances doing redundant work at once.
async function withLock(id, fn) {
  if (!isRedisEnabled()) return fn()
  const client = getRedisClient()
  const lk = kLock(id)
  for (let i = 0; i < 20; i++) {
    let won = null
    try { won = await client.set(lk, '1', { NX: true, PX: 5000 }) } catch (e) { return fn() /* redis hiccup: proceed unlocked */ }
    if (won === 'OK') { try { return await fn() } finally { try { await client.del(lk) } catch (e) { /* non-fatal */ } } }
    await new Promise((r) => setTimeout(r, 50))
  }
  return fn() // gave up waiting — proceed unlocked (still correct)
}

function addInto(map, sid, g) {
  const t = map.get(sid)
  if (t) { t.points += g.points; t.correct += g.correct; t.answered += g.answered }
  else map.set(sid, { points: g.points, correct: g.correct, answered: g.answered })
}

// Fold every question not yet in the cache into the running total, then rank + resolve names.
// Returns { full, rankByStudent } — the SAME shape as leaderboardAgg.computeRanked, so callers are
// interchangeable. On a cold/lost cache this folds every question = a full recompute that once.
export async function computeRankedIncremental(roomId, { fold = true } = {}) {
  const { Response, User } = await models()
  const id = String(roomId)
  const roomObjId = new mongoose.Types.ObjectId(roomId)

  // fold=false → READ-ONLY: return the last-folded (per-segment) board without advancing the cache.
  // Used by the REST GET /leaderboard read, so opening the board stays stable within a segment and
  // only changes when a segment fold runs. fold=true (default) is the per-segment trigger path.
  const totals = !fold
    ? (await readCache(id)).totals
    : await withLock(id, async () => {
    const { totals: base, done } = await readCache(id)

    // Authoritative universe of questions with answers (index DISTINCT_SCAN, not a full pass).
    const allQids = await Response.distinct('questionId', { roomId: roomObjId })
    const allSet = new Set(allQids.map(String))

    // Self-heal: `done` must be a subset of questions that still have answers. If a folded question's
    // responses were deleted out from under us the cached totals are too high — rebuild from scratch.
    let carriedTotals = base
    let carriedDone = done
    for (const qid of done) {
      if (!allSet.has(qid)) { carriedTotals = new Map(); carriedDone = new Set(); break }
    }

    const pending = allQids.filter((q) => !carriedDone.has(String(q)))
    if (pending.length) {
      const rows = await Response.aggregate([
        { $match: { roomId: roomObjId, questionId: { $in: pending } } },
        { $group: {
          _id: '$studentId',
          points: { $sum: '$points' },
          correct: { $sum: { $cond: ['$isCorrect', 1, 0] } },
          answered: { $sum: 1 }
        } }
      ])
      for (const g of rows) addInto(carriedTotals, String(g._id), g)
      for (const q of pending) carriedDone.add(String(q))
      await writeCache(id, carriedTotals, carriedDone)
    }
    return carriedTotals
  })

  // Rank (points desc, tie-break by studentId for a stable board), then batch-resolve names.
  const ranked = [...totals.entries()].sort((a, b) => b[1].points - a[1].points || (a[0] < b[0] ? -1 : 1))
  const users = await User.find({ _id: { $in: ranked.map(([sid]) => sid) } }).select('name').lean()
  const nameById = new Map(users.map((u) => [u._id.toString(), u.name || 'Unknown Student']))

  const rankByStudent = new Map()
  const full = ranked.map(([sid, t], i) => {
    rankByStudent.set(sid, i + 1)
    return {
      rank: i + 1,
      studentId: sid,
      studentName: nameById.get(sid) || 'Unknown Student',
      totalPoints: t.points,
      correctCount: t.correct,
      totalAnswered: t.answered
    }
  })
  return { full, rankByStudent }
}
