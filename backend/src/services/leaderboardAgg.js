// Shared leaderboard aggregation — the SINGLE source of truth for the ranked board. Used by the
// live socket broadcaster (index.js broadcastLeaderboard), the results snapshot (resultsSnapshot.js)
// and the on-demand REST endpoint (responses.js). Keeping ONE implementation guarantees the live
// socket board, the cached results board and the REST fallback can never diverge in shape or ranking.
//
// INCREMENTAL BY QUESTION. The naive version re-summed every response the room had ever received on
// every call, so the cost of a single board grew with the session — by question 20 it was re-adding
// the first 19 questions' answers for the 20th time. Instead we keep a per-room running total and
// only scan the answers we have not folded in yet.
//
// What makes that safe is that a poll's answers become IMMUTABLE at a known moment: once a question
// is superseded by the next launch it gets a closeAt (= supersede time + POLL_RESPONSE_GRACE_MS) and
// POST /responses refuses it from then on (see setLiveQuestion / the response-window guard). So:
//
//   - questions whose closeAt has passed are FINAL — summed once, then remembered forever;
//   - everything else (the live poll, the one still inside its grace window, and the last poll of a
//     session, which is never superseded) is re-scanned on every call.
//
// That bounds each call to at most a couple of questions' worth of rows regardless of how long the
// session has run. The memo is a pure cache of work already done: it is derived only from responses
// that can no longer change, it lives in process memory, and losing it (restart, eviction, a second
// instance) costs exactly one full re-scan and nothing else. Mongo stays authoritative.

import mongoose from 'mongoose'

let ResponseModel = null
let QuestionModel = null
let UserModel = null

async function models() {
  if (!ResponseModel) ResponseModel = (await import('../models/Response.js')).default
  if (!QuestionModel) QuestionModel = (await import('../models/Question.js')).default
  if (!UserModel) UserModel = (await import('../models/User.js')).default
  return { Response: ResponseModel, Question: QuestionModel, User: UserModel }
}

// roomId -> { totals: Map(studentId -> { points, correct, answered }), done: Set(questionId) }
// where `done` is the set of finalised questions already folded into `totals`.
const memo = new Map()
// Bounds the memory a long-lived process can accumulate; entries are evicted least-recently-used.
// An evicted room just pays one full re-scan on its next board.
const MEMO_MAX_ROOMS = 200

function takeMemo(id) {
  const hit = memo.get(id)
  if (hit) {
    memo.delete(id) // re-insert to move to the MRU end (Map preserves insertion order)
    memo.set(id, hit)
    return hit
  }
  if (memo.size >= MEMO_MAX_ROOMS) memo.delete(memo.keys().next().value)
  const fresh = { totals: new Map(), done: new Set() }
  memo.set(id, fresh)
  return fresh
}

// Drop the running totals for a room (all rooms when called with no argument). The next board is
// recomputed from scratch. Exported for tests and for anything that deletes responses after the fact.
export function resetLeaderboardMemo(roomId) {
  if (roomId === undefined) memo.clear()
  else memo.delete(String(roomId))
}

const copyTotals = (src) => {
  const out = new Map()
  for (const [sid, t] of src) out.set(sid, { points: t.points, correct: t.correct, answered: t.answered })
  return out
}

function addInto(map, sid, g) {
  const t = map.get(sid)
  if (t) {
    t.points += g.points
    t.correct += g.correct
    t.answered += g.answered
  } else {
    map.set(sid, { points: g.points, correct: g.correct, answered: g.answered })
  }
}

// Compute the full ranked leaderboard for a room. Returns { full, rankByStudent }:
//   full          — ranked array [{ rank, studentId, studentName, totalPoints, correctCount,
//                    totalAnswered }], rank 1..N by totalPoints desc.
//   rankByStudent — Map studentId -> rank, for the "rank on submit" cache.
export async function computeRanked(roomId) {
  const { Response, Question, User } = await models()
  const id = String(roomId)
  const roomObjId = new mongoose.Types.ObjectId(roomId)
  let carried = takeMemo(id)

  // Which questions in this room have answers at all. `distinct` on the second field of the
  // {roomId, questionId, studentId} index is a DISTINCT_SCAN: one index seek per question, NOT a
  // pass over every response. This — rather than the room's question list — is the authoritative
  // universe, so a response whose question document has since been deleted still counts, exactly as
  // it did before this was incremental.
  const allQids = await Response.distinct('questionId', { roomId: roomObjId })
  const allSet = new Set(allQids.map(String))

  // Self-heal: `done` should always be a subset of the questions that still have answers. If a
  // finalised question's responses have been deleted out from under us, the carried totals are too
  // high — throw them away and rebuild rather than serve a wrong board.
  for (const qid of carried.done) {
    if (!allSet.has(qid)) {
      carried = { totals: new Map(), done: new Set() }
      memo.set(id, carried)
      break
    }
  }

  const pending = allQids.filter((q) => !carried.done.has(String(q)))

  // Split the un-summed questions into the ones that can still change and the ones that cannot. A
  // question is FINAL once its closeAt has passed — from that instant POST /responses rejects it, so
  // its rows are frozen. A question with no closeAt (the live poll, or a session's last poll, which
  // is never superseded) and one still inside its grace window are OPEN, and are re-scanned every
  // time. Questions the room no longer has a document for count as open, so an orphaned response is
  // still included — it just never gets memoised.
  const closeRows = pending.length
    ? await Question.find({ _id: { $in: pending } }).select('closeAt').lean()
    : []
  const now = Date.now()
  const closedById = new Map(closeRows.map((q) => [String(q._id), q.closeAt && new Date(q.closeAt).getTime() <= now]))
  const finalQids = pending.filter((q) => closedById.get(String(q)))
  const openQids = pending.filter((q) => !closedById.get(String(q)))

  // Two independent sums, each grouped straight to one row per student (grouping per question as
  // well would blow the intermediate set up to students × questions on a cold memo).
  const sumByStudent = (qids) => qids.length
    ? Response.aggregate([
      { $match: { roomId: roomObjId, questionId: { $in: qids } } },
      { $group: {
        _id: '$studentId',
        points: { $sum: '$points' },
        correct: { $sum: { $cond: ['$isCorrect', 1, 0] } },
        answered: { $sum: 1 }
      } }
    ])
    : Promise.resolve([])
  const [finalRows, openRows] = await Promise.all([sumByStudent(finalQids), sumByStudent(openQids)])

  // `totals` is what we return (carried + final + open). `nextTotals` is what we remember (carried +
  // final only). Both start as COPIES: the carried memo is never mutated in place, so two
  // overlapping computeRanked calls on the same room cannot double-count — each derives a complete
  // new state from the same base, and the last write simply wins.
  const totals = copyTotals(carried.totals)
  const nextTotals = finalQids.length ? copyTotals(carried.totals) : null
  for (const g of finalRows) {
    addInto(totals, String(g._id), g)
    addInto(nextTotals, String(g._id), g)
  }
  for (const g of openRows) addInto(totals, String(g._id), g)
  if (nextTotals) {
    memo.set(id, { totals: nextTotals, done: new Set([...carried.done, ...finalQids.map(String)]) })
  }

  // Ties are broken by studentId so the board is stable across recomputes — otherwise students on
  // equal points can swap places between two consecutive broadcasts for no visible reason.
  const ranked = [...totals.entries()].sort((a, b) => b[1].points - a[1].points || (a[0] < b[0] ? -1 : 1))

  const users = await User.find({ _id: { $in: ranked.map(([sid]) => sid) } })
    .select('name')
    .lean()
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
