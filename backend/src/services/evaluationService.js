// Evaluation service — single computation path used by BOTH "preview" and "apply".
// Preview and Apply call the same function, so the numbers can never diverge.
//
// Scalability mandate (see context doc): we compute per-room scores as ONE Mongo
// aggregate over Response, group by studentId, plus ONE RoomMember.find for the
// join roster. No per-student loop in app code. The aggregate is served by the
// existing {roomId:1, studentId:1, points:-1} index on Response.

import mongoose from 'mongoose'
import { normalizeCriterionValue, getCriterion, isKnownCriterion } from './evaluationCriteria.js'

let ResponseModel = null
let RoomMemberModel = null
let QuestionModel = null
let UserModel = null

async function models() {
  if (!ResponseModel) ResponseModel = (await import('../models/Response.js')).default
  if (!RoomMemberModel) RoomMemberModel = (await import('../models/RoomMember.js')).default
  if (!QuestionModel) QuestionModel = (await import('../models/Question.js')).default
  if (!UserModel) UserModel = (await import('../models/User.js')).default
  return { Response: ResponseModel, RoomMember: RoomMemberModel, Question: QuestionModel, User: UserModel }
}

// Compute the overall evaluation score for every joined student in a room, given a profile.
//   profile = { criteria: [{ key, weight }, ...] }   (weights as fractions summing to 1)
// Returns:
//   {
//     roomId,
//     profileId: profile._id|null,
//     totalQuestions, totalAvailablePoints, maxTimeToAnswer,
//     totalJoined, totalScored,
//     scores: [{ studentId, studentName, score, breakdown: { <key>: normalized01 } }],
//     criterionKeys: [ ... ]
//   }
//
// Uses ONE Response.aggregate (per-student group) + ONE RoomMember.find (roster) + ONE User
// name lookup. For a 1000-student room with ~10 responses each, Response.aggregate returns
// <= 1000 rows; the merge takes microseconds.
export async function computeScoresForRoom(roomId, profile) {
  if (!mongoose.Types.ObjectId.isValid(String(roomId))) {
    throw new Error('Invalid roomId')
  }
  const roomObjId = new mongoose.Types.ObjectId(String(roomId))
  const { Response, RoomMember, Question, User } = await models()

  const selectedCriteria = (profile?.criteria || [])
    .filter((c) => isKnownCriterion(c.key) && Number(c.weight) > 0)
    .map((c) => ({ key: c.key, weight: Number(c.weight) }))
  const criterionKeys = selectedCriteria.map((c) => c.key)
  if (criterionKeys.length === 0) {
    throw new Error('Profile has no measurable criteria')
  }

  // Fire all four reads in parallel — room-scoped, indexed, one batched User lookup.
  const [aggregated, joinedDocs, allQuestions] = await Promise.all([
    Response.aggregate([
      { $match: { roomId: roomObjId } },
      {
        $group: {
          _id: '$studentId',
          attempted: { $sum: 1 },
          correct: { $sum: { $cond: ['$isCorrect', 1, 0] } },
          avgResponseTime: { $avg: '$responseTime' },
          totalPoints: { $sum: '$points' }
        }
      }
    ]),
    RoomMember.find({ roomId: roomObjId }, { studentId: 1 }).lean(),
    Question.find({ roomId: roomObjId }, { points: 1, timeToAnswer: 1, status: 1 }).lean()
  ])

  // Denominators computed once from approved questions
  const approvedQuestions = allQuestions.filter((q) => q.status === 'approved')
  const totalQuestions = approvedQuestions.length
  const totalAvailablePoints = approvedQuestions.reduce((s, q) => s + (Number(q.points) || 0), 0)
  const maxTimeToAnswer = approvedQuestions.reduce((m, q) => Math.max(m, Number(q.timeToAnswer) || 0), 0)

  const denominators = { totalQuestions, totalAvailablePoints, maxTimeToAnswer }

  // Per-responder lookup — { studentIdString -> aggregate }
  const aggByStudent = new Map()
  for (const a of aggregated) {
    if (a._id) aggByStudent.set(String(a._id), a)
  }

  // Union: every joined student is included (responders + silent). Teachers get one
  // row per joined student whether or not they answered.
  const joinedIds = new Set()
  for (const m of joinedDocs) {
    if (m.studentId) joinedIds.add(String(m.studentId))
  }
  // Add responders who joined but somehow lost their RoomMember row (defensive — shouldn't happen
  // given current joins, but keeps output complete)
  for (const sid of aggByStudent.keys()) joinedIds.add(sid)

  // One batched User lookup for names
  const allIds = [...joinedIds].map((s) => {
    try { return new mongoose.Types.ObjectId(s) } catch { return null }
  }).filter(Boolean)
  const userDocs = allIds.length ? await User.find({ _id: { $in: allIds } }, { name: 1, email: 1 }).lean() : []
  const nameByStudent = new Map()
  for (const u of userDocs) {
    nameByStudent.set(String(u._id), u.name || u.email || 'Unknown Student')
  }

  const scores = []
  for (const sid of joinedIds) {
    const agg = aggByStudent.get(sid)
    const responded = !!agg
    // Per-criterion normalized [0, 1] values
    const breakdown = {}
    let total = 0
    for (const c of selectedCriteria) {
      // session_participation reads the `joined` flag — see normalizeCriterionValue
      const value = normalizeCriterionValue(
        c.key,
        agg || { attempted: 0, correct: 0, avgResponseTime: 0, totalPoints: 0 },
        { ...denominators, joined: true }
      )
      breakdown[c.key] = value
      total += value * c.weight
    }
    scores.push({
      studentId: sid,
      studentName: nameByStudent.get(sid) || 'Unknown Student',
      responded,
      score: Number(total.toFixed(4)), // 0..1
      breakdown: Object.fromEntries(
        Object.entries(breakdown).map(([k, v]) => [k, Number(v.toFixed(4))])
      )
    })
  }

  // Sort highest score first (stable for ties: by name)
  scores.sort((a, b) => (b.score - a.score) || a.studentName.localeCompare(b.studentName))

  return {
    roomId: String(roomId),
    profileId: profile?._id ? String(profile._id) : null,
    totalQuestions,
    totalAvailablePoints,
    maxTimeToAnswer,
    totalJoined: joinedIds.size,
    totalScored: scores.length,
    criterionKeys,
    scores
  }
}

// Validate a profile's weight distribution — sum must equal 1.0 (±0.001) and every
// criterion key must be registered. Returns { ok, error }.
export function validateProfileWeights(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return { ok: false, error: 'At least one criterion is required' }
  }
  for (const c of criteria) {
    if (!isKnownCriterion(c.key)) return { ok: false, error: `Unknown criterion: ${c.key}` }
    const w = Number(c.weight)
    if (!Number.isFinite(w) || w < 0 || w > 1) {
      return { ok: false, error: `Criterion "${getCriterion(c.key)?.label || c.key}" weight must be between 0 and 1` }
    }
  }
  const sum = criteria.reduce((s, c) => s + Number(c.weight), 0)
  if (Math.abs(sum - 1) > 0.001) {
    return { ok: false, error: `Weights must sum to 100% (currently ${(sum * 100).toFixed(1)}%)` }
  }
  return { ok: true }
}