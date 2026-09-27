import Question from '../models/Question.js'
import Response from '../models/Response.js'

export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard']

// >=80% correct on the last batch steps difficulty up; <=40% steps it down; the middle band holds.
export const ADAPTIVE_UP_THRESHOLD = 80
export const ADAPTIVE_DOWN_THRESHOLD = 40
// Guards against one or two early responders swinging the whole class's difficulty.
// Counts DISTINCT students, not raw responses — a single student answering several
// questions in the batch must not on its own clear the bar.
export const MIN_STUDENTS_FOR_ADAPTATION = 3

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

// Looks at the most recently approved question batch and how the class scored on it, then returns
// the difficulty the NEXT batch should use.
//
// The batch is NOT "all approved questions sharing a segmentIndex": segmentIndex is a reused counter
// (it resets to 1 on every fresh recording start, and pasted batches reuse it too), so a room used
// across sessions has several distinct batches sharing one segmentIndex — grouping by it alone pools
// responses from stale/unrelated batches. Instead we take the newest approved question and walk back
// through createdAt-ordered questions while the segmentIndex stays equal, i.e. the top contiguous run
// of same-segment questions. Any earlier batch that happens to reuse the segmentIndex is separated by
// the intervening segments' questions, so it's correctly excluded.
export async function resolveAdaptiveDifficulty(roomId, currentDifficulty) {
  const recent = await Question.find({ roomId, status: 'approved' })
    .sort({ createdAt: -1 })
    .select('_id segmentIndex roomId')

  const lastQuestion = recent[0]
  if (!lastQuestion) {
    return { difficulty: currentDifficulty, sampleSize: 0, correctnessPct: null }
  }

  const batchIds = []
  for (const q of recent) {
    if (q.segmentIndex !== lastQuestion.segmentIndex) break
    batchIds.push(q._id)
  }

  // aggregate() doesn't auto-cast query filters the way find()/findOne() do, so match on
  // lastQuestion.roomId (already a real ObjectId) rather than the raw roomId param.
  const [agg] = await Response.aggregate([
    { $match: { roomId: lastQuestion.roomId, questionId: { $in: batchIds } } },
    {
      $group: {
        _id: null,
        students: { $addToSet: '$studentId' },
        total: { $sum: 1 },
        correct: { $sum: { $cond: ['$isCorrect', 1, 0] } }
      }
    },
    { $project: { studentCount: { $size: '$students' }, total: 1, correct: 1 } }
  ])

  const studentCount = agg?.studentCount || 0
  if (studentCount < MIN_STUDENTS_FOR_ADAPTATION) {
    return { difficulty: currentDifficulty, sampleSize: studentCount, correctnessPct: null }
  }

  const correctnessPct = Math.round((agg.correct / agg.total) * 100)
  const difficulty = stepDifficulty(currentDifficulty, correctnessPct)

  return { difficulty, sampleSize: studentCount, correctnessPct }
}
