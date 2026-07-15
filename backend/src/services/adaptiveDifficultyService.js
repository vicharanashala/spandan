import Question from '../models/Question.js'
import Response from '../models/Response.js'

export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard']

// >=80% correct on the last batch steps difficulty up; <=40% steps it down; the middle band holds.
export const ADAPTIVE_UP_THRESHOLD = 80
export const ADAPTIVE_DOWN_THRESHOLD = 40
// Guards against one or two early responders swinging the whole class's difficulty.
export const MIN_RESPONSES_FOR_ADAPTATION = 3

// Pure step function: one level up/down per batch, clamped at the ends of DIFFICULTY_LEVELS.
export function stepDifficulty(currentDifficulty, correctnessPct) {
  const idx = DIFFICULTY_LEVELS.indexOf(currentDifficulty)
  const currentIdx = idx === -1 ? DIFFICULTY_LEVELS.indexOf('medium') : idx

  if (correctnessPct >= ADAPTIVE_UP_THRESHOLD) {
    return DIFFICULTY_LEVELS[Math.min(currentIdx + 1, DIFFICULTY_LEVELS.length - 1)]
  }
  if (correctnessPct <= ADAPTIVE_DOWN_THRESHOLD) {
    return DIFFICULTY_LEVELS[Math.max(currentIdx - 1, 0)]
  }
  return DIFFICULTY_LEVELS[currentIdx]
}

// Looks at the most recently approved question batch (all questions sharing its segmentIndex)
// and how the class scored on it, then returns the difficulty the NEXT batch should use.
export async function resolveAdaptiveDifficulty(roomId, currentDifficulty) {
  const lastQuestion = await Question.findOne({ roomId, status: 'approved' }).sort({ createdAt: -1 })

  if (!lastQuestion) {
    return { difficulty: currentDifficulty, sampleSize: 0, correctnessPct: null }
  }

  const batchQuestions = await Question.find({
    roomId,
    status: 'approved',
    segmentIndex: lastQuestion.segmentIndex
  }).select('_id')
  const batchIds = batchQuestions.map(q => q._id)

  // aggregate() doesn't auto-cast query filters the way find()/findOne() do, so match on
  // lastQuestion.roomId (already a real ObjectId) rather than the raw roomId param.
  const [agg] = await Response.aggregate([
    { $match: { roomId: lastQuestion.roomId, questionId: { $in: batchIds } } },
    { $group: { _id: null, total: { $sum: 1 }, correct: { $sum: { $cond: ['$isCorrect', 1, 0] } } } }
  ])

  const total = agg?.total || 0
  if (total < MIN_RESPONSES_FOR_ADAPTATION) {
    return { difficulty: currentDifficulty, sampleSize: total, correctnessPct: null }
  }

  const correctnessPct = Math.round((agg.correct / total) * 100)
  const difficulty = stepDifficulty(currentDifficulty, correctnessPct)

  return { difficulty, sampleSize: total, correctnessPct }
}
