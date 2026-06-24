import mongoose from 'mongoose'
import Response from '../models/Response.js'
import Question from '../models/Question.js'
import RoomMember from '../models/RoomMember.js'

/**
 * Analytics Service
 * 
 * Computes psychometric quality scores for quiz questions.
 * Uses established educational measurement metrics:
 * - Difficulty Index: proportion of students who answered correctly
 * - Discrimination Index: whether strong students outperform weak students
 * - Option Distribution: spread of selections across options
 * - Composite Quality Score: weighted combination of all metrics
 */

/**
 * Convert a string ID to a Mongoose ObjectId safely.
 */
const toObjectId = (id) => {
  if (!id) return null
  if (typeof id === 'object' && id._bsontype === 'ObjectId') return id
  if (mongoose.Types.ObjectId.isValid(id)) {
    return new mongoose.Types.ObjectId(id)
  }
  return id
}

/**
 * Calculate question quality metrics for all questions in a room.
 * 
 * @param {string} roomId - The room to analyze
 * @returns {Array} Array of question quality objects
 */
export async function getQuestionQuality(roomId) {
  const roomObjectId = toObjectId(roomId)

  // Get all approved questions for this room
  const questions = await Question.find({
    roomId: roomObjectId,
    status: 'approved'
  }).sort({ createdAt: 1 }).lean()

  if (questions.length === 0) {
    return []
  }

  // Get all responses for this room in one query (efficient)
  const allResponses = await Response.find({
    roomId: roomObjectId
  }).lean()

  // Get total participants in the room
  const totalParticipants = await RoomMember.countDocuments({ roomId: roomObjectId })

  // Group responses by questionId for fast lookup
  const responsesByQuestion = {}
  allResponses.forEach(r => {
    const qId = r.questionId.toString()
    if (!responsesByQuestion[qId]) {
      responsesByQuestion[qId] = []
    }
    responsesByQuestion[qId].push(r)
  })

  // Compute per-student total points for discrimination index
  const studentTotals = computeStudentTotals(allResponses)

  // Calculate quality metrics for each question
  const results = questions.map(question => {
    const qId = question._id.toString()
    const responses = responsesByQuestion[qId] || []

    return computeQuestionMetrics(question, responses, studentTotals, totalParticipants)
  })

  return results
}

/**
 * Compute total points per student across all questions in the room.
 * Used for discrimination index (top 27% vs bottom 27%).
 * 
 * @param {Array} allResponses - All responses in the room
 * @returns {Map} studentId -> totalPoints
 */
function computeStudentTotals(allResponses) {
  const totals = new Map()
  allResponses.forEach(r => {
    const sId = r.studentId.toString()
    totals.set(sId, (totals.get(sId) || 0) + r.points)
  })
  return totals
}

/**
 * Compute all quality metrics for a single question.
 * 
 * Metrics:
 * - difficulty: % correct (0 = impossible, 1 = trivial, ideal = 0.3-0.7)
 * - discriminationIndex: top 27% accuracy - bottom 27% accuracy (-1 to +1, ideal > 0.3)
 * - responseRate: % of room participants who answered
 * - avgResponseTime: average seconds to answer
 * - optionDistribution: how many students chose each option
 * - qualityScore: composite score 0-100
 * - qualityLabel: human-readable quality category
 */
function computeQuestionMetrics(question, responses, studentTotals, totalParticipants) {
  const responseCount = responses.length
  const optionCount = question.options?.length || 0

  // --- Difficulty Index ---
  // Proportion of students who got it right
  const correctCount = responses.filter(r => r.isCorrect).length
  const difficulty = responseCount > 0 ? correctCount / responseCount : 0

  // --- Response Rate ---
  const responseRate = totalParticipants > 0 ? responseCount / totalParticipants : 0

  // --- Average Response Time ---
  const totalTime = responses.reduce((sum, r) => sum + (r.responseTime || 0), 0)
  const avgResponseTime = responseCount > 0 ? Math.round((totalTime / responseCount) * 10) / 10 : 0

  // --- Option Distribution ---
  // Count how many students selected each option
  const optionDistribution = new Array(optionCount).fill(0)
  responses.forEach(r => {
    // Use selectedOptions array (works for both MCQ and MSQ)
    const selections = (r.selectedOptions && r.selectedOptions.length > 0)
      ? r.selectedOptions
      : (r.selectedOption !== undefined ? [r.selectedOption] : [])

    selections.forEach(idx => {
      if (idx >= 0 && idx < optionCount) {
        optionDistribution[idx]++
      }
    })
  })

  // --- Discrimination Index ---
  // Split students into top 27% and bottom 27% by total room performance
  // Then compare: do strong students get this question right more than weak students?
  const discriminationIndex = computeDiscriminationIndex(responses, studentTotals)

  // --- Composite Quality Score (0-100) ---
  const qualityScore = computeQualityScore(difficulty, discriminationIndex, responseRate, avgResponseTime, question.timeToAnswer || 30)

  // --- Quality Label ---
  const qualityLabel = getQualityLabel(difficulty, discriminationIndex, responseCount)

  return {
    questionId: question._id,
    questionText: question.question,
    type: question.type,
    segmentIndex: question.segmentIndex || 0,
    optionCount,
    responseCount,
    correctCount,
    difficulty: Math.round(difficulty * 100) / 100,
    discriminationIndex: Math.round(discriminationIndex * 100) / 100,
    responseRate: Math.round(responseRate * 100) / 100,
    avgResponseTime,
    optionDistribution,
    qualityScore,
    qualityLabel
  }
}

/**
 * Compute the Discrimination Index using the top-bottom 27% method.
 * 
 * This is a standard psychometric technique:
 * 1. Rank all students by their total score in the room
 * 2. Take the top 27% and bottom 27%
 * 3. For this question, compute accuracy in each group
 * 4. Discrimination = top_accuracy - bottom_accuracy
 * 
 * Result range: -1 to +1
 *   > 0.4 = Excellent discriminator
 *   0.3 - 0.4 = Good
 *   0.2 - 0.3 = Acceptable
 *   < 0.2 = Poor (everyone gets it right OR wrong regardless of ability)
 *   Negative = Inverse (weak students do BETTER, question may be misleading)
 * 
 * @param {Array} responses - Responses for this specific question
 * @param {Map} studentTotals - Map of studentId -> totalPoints in room
 * @returns {number} Discrimination index between -1 and 1
 */
function computeDiscriminationIndex(responses, studentTotals) {
  if (responses.length < 4 || studentTotals.size < 4) {
    // Not enough data for meaningful discrimination analysis
    return 0
  }

  // Sort all students by total points (descending)
  const sortedStudents = [...studentTotals.entries()]
    .sort((a, b) => b[1] - a[1])

  // Take top 27% and bottom 27%
  const groupSize = Math.max(1, Math.ceil(sortedStudents.length * 0.27))
  const topStudentIds = new Set(sortedStudents.slice(0, groupSize).map(s => s[0]))
  const bottomStudentIds = new Set(sortedStudents.slice(-groupSize).map(s => s[0]))

  // Build a map of studentId -> isCorrect for this question
  const responseMap = new Map()
  responses.forEach(r => {
    responseMap.set(r.studentId.toString(), r.isCorrect)
  })

  // Compute accuracy for each group on THIS question
  let topCorrect = 0, topTotal = 0
  let bottomCorrect = 0, bottomTotal = 0

  topStudentIds.forEach(sId => {
    if (responseMap.has(sId)) {
      topTotal++
      if (responseMap.get(sId)) topCorrect++
    }
  })

  bottomStudentIds.forEach(sId => {
    if (responseMap.has(sId)) {
      bottomTotal++
      if (responseMap.get(sId)) bottomCorrect++
    }
  })

  const topAccuracy = topTotal > 0 ? topCorrect / topTotal : 0
  const bottomAccuracy = bottomTotal > 0 ? bottomCorrect / bottomTotal : 0

  return topAccuracy - bottomAccuracy
}

/**
 * Compute a composite quality score from 0 to 100.
 * 
 * Weights:
 * - Difficulty appropriateness (40%): penalize too-easy (>0.9) and too-hard (<0.2)
 * - Discrimination (30%): higher is better
 * - Response rate (20%): higher means more students engaged
 * - Response time appropriateness (10%): penalize if avg time is extremely fast (trivial) or near timeout (confusing)
 */
function computeQualityScore(difficulty, discrimination, responseRate, avgResponseTime, timeToAnswer) {
  // Difficulty score: peaks at 0.5 (ideal), drops toward 0 and 1
  // Using a bell curve centered at 0.5
  const difficultyScore = 1 - Math.pow((difficulty - 0.5) * 2, 2)

  // Discrimination score: 0 to 1 range, capped
  const discScore = Math.max(0, Math.min(1, (discrimination + 0.2) / 0.8))

  // Response rate: direct mapping
  const responseScore = Math.min(1, responseRate)

  // Response time appropriateness: penalize if < 10% of time (too easy) or > 90% of time (too hard)
  const timeRatio = timeToAnswer > 0 ? avgResponseTime / timeToAnswer : 0.5
  const timeScore = 1 - Math.pow((timeRatio - 0.4) * 2, 2)  // peaks around 40% of allotted time
  const clampedTimeScore = Math.max(0, Math.min(1, timeScore))

  // Weighted composite
  const raw = (
    difficultyScore * 0.40 +
    discScore * 0.30 +
    responseScore * 0.20 +
    clampedTimeScore * 0.10
  )

  return Math.round(Math.max(0, Math.min(100, raw * 100)))
}

/**
 * Get a human-readable quality label based on the metrics.
 */
function getQualityLabel(difficulty, discrimination, responseCount) {
  if (responseCount < 3) return 'Insufficient Data'
  if (difficulty > 0.9) return 'Too Easy'
  if (difficulty < 0.2) return 'Too Hard'
  if (discrimination < 0) return 'Misleading'
  if (discrimination < 0.15) return 'Poor Discriminator'
  if (discrimination >= 0.4) return 'Excellent'
  if (discrimination >= 0.3) return 'Good'
  return 'Acceptable'
}
