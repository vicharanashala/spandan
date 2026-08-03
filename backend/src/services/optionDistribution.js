import mongoose from 'mongoose'
import { getRedisClient, isRedisEnabled } from '../config/redis.js'

const key = (roomId) => `live:options:${String(roomId)}`
const lockKey = (roomId) => `live:options:seed:${String(roomId)}`
const totalField = (qid) => `q:${String(qid)}:total`
const optionField = (qid, index) => `q:${String(qid)}:option:${index}`
const TTL = Number(process.env.LIVE_OPTIONS_TTL_SEC) || 86400
const memoryCounters = new Map()
const memorySeedInflight = new Map()

function getMemoryState(roomId) {
  const id = String(roomId)
  const state = memoryCounters.get(id)
  if (state && Date.now() - state.touchedAt > TTL * 1000) {
    memoryCounters.delete(id)
    return null
  }
  return state || null
}

async function seedMemoryRoom(roomId) {
  const id = String(roomId)
  if (getMemoryState(id)) return true
  const inflight = memorySeedInflight.get(id)
  if (inflight) return inflight

  const promise = (async () => {
    try {
      const Response = (await import('../models/Response.js')).default
      const roomObjectId = new mongoose.Types.ObjectId(id)
      const [totals, options] = await Promise.all([
        Response.aggregate([{ $match: { roomId: roomObjectId } }, { $group: { _id: '$questionId', count: { $sum: 1 } } }]),
        Response.aggregate([
          { $match: { roomId: roomObjectId } },
          { $project: { questionId: 1, values: { $setUnion: [{ $ifNull: ['$selectedOptions', []] }, ['$selectedOption']] } } },
          { $unwind: '$values' }, { $match: { values: { $type: 'number' } } },
          { $group: { _id: { q: '$questionId', o: '$values' }, count: { $sum: 1 } } }
        ])
      ])
      const fields = new Map()
      totals.forEach((x) => fields.set(totalField(x._id), x.count))
      options.forEach((x) => fields.set(optionField(x._id.q, x._id.o), x.count))
      memoryCounters.set(id, { fields, touchedAt: Date.now() })
      return true
    } catch (error) {
      console.error('[option-distribution] memory seed failed:', error.message)
      return false
    } finally {
      memorySeedInflight.delete(id)
    }
  })()
  memorySeedInflight.set(id, promise)
  return promise
}

export function distinctNumericOptions(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Number.isInteger).filter((v) => v >= 0))]
}

// Older responses may have only selectedOption, while newer MSQ responses also have
// selectedOptions. Merge both sources and deduplicate without inventing an option when neither
// field contains a valid numeric selection.
export function responseOptionIndices(response) {
  return distinctNumericOptions([
    ...(Array.isArray(response?.selectedOptions) ? response.selectedOptions : []),
    response?.selectedOption
  ])
}

export function buildDistribution(question, totalResponses, counts, revealCorrect = false) {
  const total = Number(totalResponses) || 0
  const result = { totalResponses: total, options: (question.options || []).map((_, optionIndex) => {
    const count = Number(counts.get(optionIndex) || 0)
    return { optionIndex, count, percentage: total ? Number(((count / total) * 100).toFixed(2)) : 0 }
  }) }
  if (revealCorrect) result.correctOptions = (question.options || []).map((o, i) => o.isCorrect ? i : null).filter((i) => i !== null)
  return result
}

export async function ensureRoomSeeded(roomId) {
  if (!isRedisEnabled()) return seedMemoryRoom(roomId)
  const client = getRedisClient(); const roomKey = key(roomId)
  if (await client.exists(roomKey)) return true
  if (await client.set(lockKey(roomId), '1', { NX: true, PX: 10000 }) !== 'OK') {
    for (let i = 0; i < 20; i++) { await new Promise((resolve) => setTimeout(resolve, 25)); if (await client.exists(roomKey)) return true }
    return false
  }
  try {
    if (await client.exists(roomKey)) return true
    const Response = (await import('../models/Response.js')).default
    const roomObjectId = new mongoose.Types.ObjectId(roomId)
    const [totals, options] = await Promise.all([
      Response.aggregate([{ $match: { roomId: roomObjectId } }, { $group: { _id: '$questionId', count: { $sum: 1 } } }]),
      Response.aggregate([
        { $match: { roomId: roomObjectId } },
        { $project: { questionId: 1, values: { $setUnion: [{ $ifNull: ['$selectedOptions', []] }, ['$selectedOption']] } } },
        { $unwind: '$values' }, { $match: { values: { $type: 'number' } } },
        { $group: { _id: { q: '$questionId', o: '$values' }, count: { $sum: 1 } } }
      ])
    ])
    const fields = {}
    totals.forEach((x) => { fields[totalField(x._id)] = x.count })
    options.forEach((x) => { fields[optionField(x._id.q, x._id.o)] = x.count })
    if (Object.keys(fields).length) { await client.hSet(roomKey, fields); await client.expire(roomKey, TTL) }
    return true
  } finally { await client.del(lockKey(roomId)).catch(() => {}) }
}

export async function recordResponse(roomId, questionId, selectedOptions) {
  if (!isRedisEnabled()) {
    await seedMemoryRoom(roomId)
    const id = String(roomId)
    const state = getMemoryState(id) || { fields: new Map(), touchedAt: Date.now() }
    const total = totalField(questionId)
    state.fields.set(total, Number(state.fields.get(total) || 0) + 1)
    for (const index of distinctNumericOptions(selectedOptions)) {
      const field = optionField(questionId, index)
      state.fields.set(field, Number(state.fields.get(field) || 0) + 1)
    }
    state.touchedAt = Date.now()
    memoryCounters.set(id, state)
    return true
  }
  try {
    const client = getRedisClient()
    const transaction = client.multi().hIncrBy(key(roomId), totalField(questionId), 1)
    for (const index of distinctNumericOptions(selectedOptions)) transaction.hIncrBy(key(roomId), optionField(questionId, index), 1)
    transaction.expire(key(roomId), TTL)
    await transaction.exec()
    return true
  } catch (error) { console.error('[option-distribution] increment failed:', error.message); return false }
}

export const teacherDistributionRoom = (roomCode) => `teacher:distribution:${String(roomCode)}`

export function buildTeacherDistributionPayload(distributions) {
  const safe = Object.fromEntries(Object.entries(distributions || {}).map(([qid, value]) => [qid, {
    totalResponses: value.totalResponses,
    options: value.options
  }]))
  return { distributions: safe }
}

// Live updates are scoped to one aggregate so a delayed event from a completed question cannot
// overwrite the currently active question in a teacher client.
export function buildTeacherDistributionUpdatePayload(roomId, questionId, distribution) {
  const options = Array.isArray(distribution?.options) ? distribution.options : []
  return {
    roomId: String(roomId),
    questionId: String(questionId),
    totalResponses: Number(distribution?.totalResponses) || 0,
    optionCounts: Object.fromEntries(options.map(option => [String(option.optionIndex), Number(option.count) || 0])),
    options: options.map(({ optionIndex, count, percentage }) => ({ optionIndex, count, percentage }))
  }
}

export async function getMongoDistributions(roomId, questions) {
  const Response = (await import('../models/Response.js')).default
  const roomObjectId = new mongoose.Types.ObjectId(roomId)
  const [totals, options] = await Promise.all([
    Response.aggregate([{ $match: { roomId: roomObjectId } }, { $group: { _id: '$questionId', count: { $sum: 1 } } }]),
    Response.aggregate([
      { $match: { roomId: roomObjectId } },
      { $project: { questionId: 1, values: { $setUnion: [{ $ifNull: ['$selectedOptions', []] }, ['$selectedOption']] } } },
      { $unwind: '$values' }, { $match: { values: { $type: 'number' } } },
      { $group: { _id: { q: '$questionId', o: '$values' }, count: { $sum: 1 } } }
    ])
  ])
  const totalByQuestion = new Map(totals.map((x) => [String(x._id), x.count]))
  const countsByQuestion = new Map()
  options.forEach((x) => {
    const qid = String(x._id.q)
    if (!countsByQuestion.has(qid)) countsByQuestion.set(qid, new Map())
    countsByQuestion.get(qid).set(x._id.o, x.count)
  })
  return Object.fromEntries((questions || []).map((q) => [String(q._id), buildDistribution(q, totalByQuestion.get(String(q._id)) || 0, countsByQuestion.get(String(q._id)) || new Map())]))
}
export async function getRoomDistributions(roomId, questions) {
  if (!isRedisEnabled()) {
    const state = getMemoryState(roomId)
    if (!state) return null
    return Object.fromEntries((questions || []).map((q) => {
      const qid = String(q._id)
      const total = Number(state.fields.get(totalField(qid)) || 0)
      const counts = new Map((q.options || []).map((_, i) => [i, Number(state.fields.get(optionField(qid, i)) || 0)]))
      return [qid, buildDistribution(q, total, counts)]
    }))
  }
  try {
    const hash = await getRedisClient().hGetAll(key(roomId))
    return Object.fromEntries((questions || []).map((q) => {
      const qid = String(q._id); const total = Number(hash[totalField(qid)] || 0)
      const counts = new Map((q.options || []).map((_, i) => [i, Number(hash[optionField(qid, i)] || 0)]))
      return [qid, buildDistribution(q, total, counts)]
    }))
  } catch (error) { console.error('[option-distribution] read failed:', error.message); return null }
}
