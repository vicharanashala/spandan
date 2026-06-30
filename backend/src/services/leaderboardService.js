import mongoose from 'mongoose'
import Response from '../models/Response.js'
import Question from '../models/Question.js'
import User from '../models/User.js'
import FrozenLeaderboard from '../models/FrozenLeaderboard.js'

/**
 * Computes and freezes the official leaderboard for a room.
 * Sorting rules:
 * 1. Higher accuracy (primary)
 * 2. Lower average response time (secondary)
 * 
 * @param {string} roomId 
 */
export const freezeLeaderboard = async (roomId) => {
  // Check if leaderboard is already frozen for this room
  const alreadyFrozen = await FrozenLeaderboard.findOne({ roomId })
  if (alreadyFrozen) {
    console.log(`[leaderboardService] Leaderboard for room ${roomId} is already frozen.`)
    return
  }

  // Count approved questions in the room
  const totalQuestionsInRoom = await Question.countDocuments({ roomId, status: 'approved' })
  if (totalQuestionsInRoom === 0) {
    console.log(`[leaderboardService] No approved questions found in room ${roomId}. Nothing to freeze.`)
    return
  }

  // Aggregate student response stats
  const aggregatedData = await Response.aggregate([
    { $match: { roomId: typeof roomId === 'string' ? new mongoose.Types.ObjectId(roomId) : roomId } },
    { $group: {
      _id: '$studentId',
      totalPoints: { $sum: '$points' },
      correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } },
      totalAnswered: { $sum: 1 },
      totalResponseTime: { $sum: '$responseTime' }
    }}
  ])

  // Resolve user details and calculate metrics
  const entries = await Promise.all(aggregatedData.map(async (entry) => {
    const student = await User.findById(entry._id).lean()
    const accuracy = (entry.correctCount / totalQuestionsInRoom) * 100
    const averageResponseTime = entry.totalAnswered > 0 
      ? entry.totalResponseTime / entry.totalAnswered 
      : 0

    return {
      studentId: entry._id,
      studentName: student?.name || student?.email || 'Unknown Student',
      correctCount: entry.correctCount,
      totalAnswered: entry.totalAnswered,
      accuracy,
      averageResponseTime,
      totalPoints: entry.totalPoints
    }
  }))

  // Sort by accuracy (descending), then averageResponseTime (ascending)
  entries.sort((a, b) => {
    if (Math.abs(b.accuracy - a.accuracy) > 0.001) {
      return b.accuracy - a.accuracy // Higher accuracy first
    }
    return a.averageResponseTime - b.averageResponseTime // Lower response time first
  })

  // Assign ranks with tie-breaking
  let rank = 1
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) {
      const prev = entries[i - 1]
      const curr = entries[i]
      const sameAccuracy = Math.abs(curr.accuracy - prev.accuracy) < 0.001
      const sameTime = Math.abs(curr.averageResponseTime - prev.averageResponseTime) < 0.001
      if (!sameAccuracy || !sameTime) {
        rank = i + 1
      }
    }
    entries[i].rank = rank
  }

  // Insert into FrozenLeaderboard
  const docs = entries.map(entry => ({
    roomId,
    studentId: entry.studentId,
    studentName: entry.studentName,
    rank: entry.rank,
    correctCount: entry.correctCount,
    totalAnswered: entry.totalAnswered,
    accuracy: entry.accuracy,
    averageResponseTime: entry.averageResponseTime,
    totalPoints: entry.totalPoints
  }))

  if (docs.length > 0) {
    await FrozenLeaderboard.insertMany(docs)
    console.log(`[leaderboardService] Frozen ${docs.length} leaderboard entries for room ${roomId}`)
  } else {
    console.log(`[leaderboardService] No student responses to freeze for room ${roomId}`)
  }
}
