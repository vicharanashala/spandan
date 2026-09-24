import UserRoomStats from '../models/UserRoomStats.js'
import UserLifetimeStats from '../models/UserLifetimeStats.js'

function responseSeconds(responseTime) {
  const value = Number(responseTime)
  return Number.isFinite(value) ? value : null
}

export async function updateRoomStats({ userId, roomCode, isCorrect, responseTime, points }) {
  const seconds = responseSeconds(responseTime)
  const inc = {
    totalAnswers: 1,
    totalPoints: Number(points) || 0,
    ...(isCorrect ? { correctAnswers: 1 } : {}),
    ...(isCorrect && seconds !== null && seconds <= 5 ? { fastAnswers5: 1 } : {}),
    ...(isCorrect && seconds !== null && seconds <= 10 ? { fastAnswers10: 1 } : {})
  }

  const existing = await UserRoomStats.findOne({ userId, roomCode }).select('totalAnswers').lean()
  if ((existing?.totalAnswers || 0) < 5 && isCorrect) inc.firstAnswersCorrect = 1

  let stats = await UserRoomStats.findOneAndUpdate(
    { userId, roomCode },
    { $setOnInsert: { userId, roomCode }, $inc: inc },
    { upsert: true, new: true }
  )

  if (isCorrect) {
    stats.currentStreak += 1
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak)
    if (stats.fastestResponse === null || (seconds !== null && seconds < stats.fastestResponse)) {
      stats.fastestResponse = seconds
    }
  } else {
    stats.currentStreak = 0
  }

  stats.accuracy = stats.totalAnswers > 0
    ? (stats.correctAnswers / stats.totalAnswers) * 100
    : 0

  await stats.save()
  return stats
}

export async function updateLifetimeStats({ userId, isCorrect, responseTime, points }) {
  const seconds = responseSeconds(responseTime)
  const inc = {
    totalAnswers: 1,
    totalPoints: Number(points) || 0,
    ...(isCorrect ? { correctAnswers: 1 } : {}),
    ...(isCorrect && seconds !== null && seconds <= 5 ? { fastAnswers5: 1 } : {}),
    ...(isCorrect && seconds !== null && seconds <= 10 ? { fastAnswers10: 1 } : {})
  }

  let stats = await UserLifetimeStats.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId }, $inc: inc },
    { upsert: true, new: true }
  )

  if (isCorrect) {
    stats.currentStreak += 1
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak)
    if (stats.fastestResponse === null || (seconds !== null && seconds < stats.fastestResponse)) {
      stats.fastestResponse = seconds
    }
  } else {
    stats.currentStreak = 0
  }

  stats.accuracy = stats.totalAnswers > 0
    ? (stats.correctAnswers / stats.totalAnswers) * 100
    : 0

  await stats.save()
  return stats
}
