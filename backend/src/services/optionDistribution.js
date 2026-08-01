import mongoose from 'mongoose'
import { getRedisClient, isRedisEnabled } from '../config/redis.js'

const key = (roomId) => `live:options:${String(roomId)}`
const lockKey = (roomId) => `live:options:seed:${String(roomId)}`
const totalField = (qid) => `q:${String(qid)}:total`
const optionField = (qid, index) => `q:${String(qid)}:option:${index}`
const TTL = Number(process.env.LIVE_OPTIONS_TTL_SEC) || 86400

export function distinctNumericOptions(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Number.isInteger).filter((v) => v >= 0))]
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
  if (!isRedisEnabled()) return false
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
  if (!isRedisEnabled()) return false
  try {
    const client = getRedisClient(); await client.hIncrBy(key(roomId), totalField(questionId), 1)
    for (const index of distinctNumericOptions(selectedOptions)) await client.hIncrBy(key(roomId), optionField(questionId, index), 1)
    await client.expire(key(roomId), TTL); return true
  } catch (error) { console.error('[option-distribution] increment failed:', error.message); return false }
}

export async function getRoomDistributions(roomId, questions) {
  if (!isRedisEnabled()) return null
  try {
    const hash = await getRedisClient().hGetAll(key(roomId))
    return Object.fromEntries((questions || []).map((q) => {
      const qid = String(q._id); const total = Number(hash[totalField(qid)] || 0)
      const counts = new Map((q.options || []).map((_, i) => [i, Number(hash[optionField(qid, i)] || 0)]))
      return [qid, buildDistribution(q, total, counts)]
    }))
  } catch (error) { console.error('[option-distribution] read failed:', error.message); return null }
}