// Shared leaderboard aggregation — the SINGLE source of truth for the ranked board. Used by both
// the live socket broadcaster (index.js broadcastLeaderboard) and the results snapshot / on-demand
// REST endpoints (responses.js). Keeping ONE implementation guarantees the live socket board, the
// cached results board, and the REST fallback can never diverge in shape or ranking.

import mongoose from 'mongoose'

let ResponseModel = null
let UserModel = null

async function models() {
  if (!ResponseModel) ResponseModel = (await import('../models/Response.js')).default
  if (!UserModel) UserModel = (await import('../models/User.js')).default
  return { Response: ResponseModel, User: UserModel }
}

// Compute the full ranked leaderboard for a room in one points-per-student aggregation plus a
// single batched name lookup (no N+1). Returns { full, rankByStudent }:
//   full          — ranked array [{ rank, studentId, studentName, totalPoints, correctCount,
//                    totalAnswered }], rank 1..N by totalPoints desc.
//   rankByStudent — Map studentId -> rank, for the "rank on submit" cache.
export async function computeRanked(roomId) {
  const { Response, User } = await models()
  const roomObjId = new mongoose.Types.ObjectId(roomId)

  const ranked = await Response.aggregate([
    { $match: { roomId: roomObjId } },
    { $group: {
      _id: '$studentId',
      totalPoints: { $sum: '$points' },
      correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } },
      totalAnswered: { $sum: 1 }
    } },
    { $sort: { totalPoints: -1 } }
  ])

  const users = await User.find({ _id: { $in: ranked.map(e => e._id) } })
    .select('name email')
    .lean()
  const nameById = new Map(users.map(u => [u._id.toString(), u.name || u.email || 'Unknown Student']))

  const rankByStudent = new Map()
  const full = ranked.map((e, i) => {
    const sid = e._id.toString()
    rankByStudent.set(sid, i + 1)
    return {
      rank: i + 1,
      studentId: sid,
      studentName: nameById.get(sid) || 'Unknown Student',
      totalPoints: e.totalPoints,
      correctCount: e.correctCount,
      totalAnswered: e.totalAnswered
    }
  })

  return { full, rankByStudent }
}
