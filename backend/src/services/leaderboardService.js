/**
 * Redis Leaderboard Service
 * Uses Redis sorted sets for O(1) leaderboard reads and O(log N) updates.
 * Falls back to in-memory when Redis is not available.
 *
 * Key format:
 *   leaderboard:{roomId}              — sorted set of studentId -> totalPoints
 *   leaderboard:{roomId}:meta:{sid}   — hash of { correctCount, totalAnswered, name }
 */

let redisClient = null

export async function initLeaderboardRedis(redisUrl) {
  if (!redisUrl) return null
  try {
    const { createClient } = await import('redis')
    redisClient = createClient({ url: redisUrl })
    await redisClient.connect()
    console.log('Leaderboard Redis connected')
    return redisClient
  } catch (err) {
    console.error('Leaderboard Redis failed:', err.message)
    return null
  }
}

export function getRedisClient() {
  return redisClient
}

// --- Core leaderboard operations (O(1) reads, O(log N) writes) ---

const LEADERBOARD_PREFIX = 'leaderboard:'
const META_PREFIX = 'leaderboard:meta:'

export async function updateLeaderboard(roomId, studentId, points, isCorrect, studentName) {
  if (!redisClient) return null

  const key = `${LEADERBOARD_PREFIX}${roomId}`
  const metaKey = `${META_PREFIX}${roomId}:${studentId}`

  const pipeline = redisClient.multi()

  // Increment total points in sorted set (O(log N))
  if (points > 0) {
    pipeline.zIncrBy(key, points, studentId)
  }

  // Update metadata hash
  pipeline.hIncrBy(metaKey, 'totalAnswered', 1)
  if (isCorrect) {
    pipeline.hIncrBy(metaKey, 'correctCount', 1)
  }
  pipeline.hSet(metaKey, 'name', studentName || 'Unknown')

  // Set TTL (24 hours — auto-cleanup old rooms)
  pipeline.expire(key, 86400)
  pipeline.expire(metaKey, 86400)

  await pipeline.exec()
  return { studentId, points, isCorrect }
}

export async function getLeaderboard(roomId, options = {}) {
  const { offset = 0, count = 50, studentId = null } = options

  if (!redisClient) return null

  const key = `${LEADERBOARD_PREFIX}${roomId}`

  // Get top N by score descending — O(log N + M)
  const rawEntries = await redisClient.zRangeWithScores(key, offset, offset + count - 1, { REV: true })

  if (rawEntries.length === 0) return { leaderboard: [], totalParticipants: 0 }

  // Fetch metadata in bulk
  const metaKeys = rawEntries.map(e => `${META_PREFIX}${roomId}:${e.value}`)
  const metas = metaKeys.length > 0 ? await redisClient.mGet(metaKeys) : []

  const leaderboard = rawEntries.map((entry, idx) => {
    let meta = {}
    try {
      meta = metas[idx] ? JSON.parse(metas[idx]) : {}
    } catch (e) {
      console.warn(`Corrupted leaderboard meta for student ${entry.value}, skipping`)
    }
    return {
      rank: offset + idx + 1,
      studentId: entry.value,
      studentName: meta.name || 'Unknown Student',
      totalPoints: entry.score,
      correctCount: meta.correctCount || 0,
      totalAnswered: meta.totalAnswered || 0
    }
  })

  const totalParticipants = await redisClient.zCard(key)

  // If studentId requested, also get their rank
  let userRank = null
  if (studentId) {
    const rank = await redisClient.zRevRank(key, studentId)
    if (rank !== null) {
      userRank = rank + 1
    }
  }

  return { leaderboard, totalParticipants, userRank }
}

export async function getUserLeaderboardEntry(roomId, studentId) {
  if (!redisClient) return null

  const key = `${LEADERBOARD_PREFIX}${roomId}`
  const metaKey = `${META_PREFIX}${roomId}:${studentId}`

  const [score, meta] = await Promise.all([
    redisClient.zScore(key, studentId),
    redisClient.hGetAll(metaKey)
  ])

  if (score === null) return null

  const rank = await redisClient.zRevRank(key, studentId)

  return {
    studentId,
    totalPoints: score,
    correctCount: parseInt(meta.correctCount || '0', 10),
    totalAnswered: parseInt(meta.totalAnswered || '0', 10),
    studentName: meta.name || 'Unknown Student',
    rank: rank !== null ? rank + 1 : null
  }
}

export async function getTopN(roomId, n) {
  if (redisClient) {
    const key = `${LEADERBOARD_PREFIX}${roomId}`
    const rawEntries = await redisClient.zRangeWithScores(key, 0, n - 1, { REV: true })

    if (rawEntries.length === 0) return []

    const metaKeys = rawEntries.map(e => `${META_PREFIX}${roomId}:${e.value}`)
    const metas = metaKeys.length > 0 ? await redisClient.mGet(metaKeys) : []

    return rawEntries.map((entry, idx) => {
      const meta = metas[idx] ? JSON.parse(metas[idx] || '{}') : {}
      return {
        rank: idx + 1,
        studentId: entry.value,
        studentName: meta.name || 'Unknown Student',
        totalPoints: entry.score,
        correctCount: meta.correctCount || 0,
        totalAnswered: meta.totalAnswered || 0
      }
    })
  }

  // MongoDB fallback when Redis is not configured
  const mongoose = (await import('mongoose')).default
  const Response = (await import('../models/Response.js')).default
  const User = (await import('../models/User.js')).default

  const leaderboardData = await Response.aggregate([
    { $match: { roomId: new mongoose.Types.ObjectId(roomId) } },
    { $group: {
      _id: '$studentId',
      totalPoints: { $sum: '$points' },
      correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } },
      totalAnswered: { $sum: 1 }
    }},
    { $sort: { totalPoints: -1 } },
    { $limit: n }
  ])

  if (leaderboardData.length === 0) return []

  const userIds = leaderboardData.map(e => e._id)
  const users = await User.find({ _id: { $in: userIds } }).select('name').lean()
  const userMap = new Map(users.map(u => [u._id.toString(), u]))

  return leaderboardData.map((entry, idx) => ({
    rank: idx + 1,
    studentId: entry._id.toString(),
    studentName: userMap.get(entry._id.toString())?.name || 'Unknown Student',
    totalPoints: entry.totalPoints,
    correctCount: entry.correctCount,
    totalAnswered: entry.totalAnswered
  }))
}

export async function getTotalParticipants(roomId) {
  if (!redisClient) return 0
  return await redisClient.zCard(`${LEADERBOARD_PREFIX}${roomId}`)
}

export async function cleanupRoom(roomId) {
  if (!redisClient) return
  const key = `${LEADERBOARD_PREFIX}${roomId}`
  const pattern = `${META_PREFIX}${roomId}:*`

  // Delete leaderboard sorted set
  await redisClient.del(key)

  // Delete all meta keys
  const metaKeys = await redisClient.keys(pattern)
  if (metaKeys.length > 0) {
    await redisClient.del(metaKeys)
  }
}
