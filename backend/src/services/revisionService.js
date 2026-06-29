import { DEFAULT_WRONG_THRESHOLD, MIN_WRONG_FOR_NOTES } from '../config/revision.js'

/**
 * Derive a display label for grouping — topic field if present, else question text.
 */
export function getTopicLabel(question) {
  if (question.topic?.trim()) return question.topic.trim()
  return question.question?.trim() || 'Unknown question'
}

/**
 * Build per-question stats from raw response documents.
 */
export function analyzeQuestion(question, responses) {
  const totalResponses = responses.length
  const correctCount = responses.filter(r => r.isCorrect).length
  const wrongCount = totalResponses - correctCount
  const wrongPercentage = totalResponses > 0
    ? Math.round((wrongCount / totalResponses) * 100)
    : 0

  return {
    questionId: question._id,
    question: question.question,
    topic: getTopicLabel(question),
    type: question.type,
    totalResponses,
    correctCount,
    wrongCount,
    wrongPercentage
  }
}

/**
 * Classify answered questions into teacher action buckets.
 */
export function classifyQuestions(answeredQuestions, threshold = DEFAULT_WRONG_THRESHOLD) {
  const reviseInClass = answeredQuestions
    .filter(q => q.wrongPercentage >= threshold)
    .sort((a, b) => b.wrongPercentage - a.wrongPercentage)

  const provideNotes = answeredQuestions
    .filter(q => q.wrongCount >= MIN_WRONG_FOR_NOTES && q.wrongPercentage > 0 && q.wrongPercentage < threshold)
    .sort((a, b) => b.wrongPercentage - a.wrongPercentage)

  const hardestQuestion = answeredQuestions.length > 0
    ? answeredQuestions.reduce((max, q) =>
        q.wrongPercentage > max.wrongPercentage ? q : max
      , answeredQuestions[0])
    : null

  const topicStats = aggregateByTopic(answeredQuestions)
  const mostWrongTopic = topicStats.length > 0
    ? topicStats.reduce((max, t) => t.totalWrong > max.totalWrong ? t : max, topicStats[0])
    : null

  return { reviseInClass, provideNotes, hardestQuestion, mostWrongTopic }
}

/**
 * Aggregate wrong counts by topic label for summary insights.
 */
export function aggregateByTopic(answeredQuestions) {
  const map = new Map()

  for (const q of answeredQuestions) {
    const label = q.topic || getTopicLabel(q)
    const existing = map.get(label) || { topic: label, totalWrong: 0, questionCount: 0 }
    existing.totalWrong += q.wrongCount
    existing.questionCount += 1
    map.set(label, existing)
  }

  return [...map.values()].sort((a, b) => b.totalWrong - a.totalWrong)
}

/**
 * Generate a short, teacher-facing recommendation message.
 */
export function generateRecommendation(reviseInClass, provideNotes, mostWrongTopic) {
  const parts = []

  if (reviseInClass.length > 0) {
    const topicHint = mostWrongTopic?.topic
      ? ` Focus on "${mostWrongTopic.topic}" — it had the most mistakes.`
      : ''
    parts.push(
      `${reviseInClass.length} question(s) had a high error rate — revise these topics in your next class.${topicHint}`
    )
  }

  if (provideNotes.length > 0) {
    parts.push(
      `${provideNotes.length} question(s) were tricky for only a few students — share short notes or explanations for them.`
    )
  }

  if (parts.length === 0) {
    return 'Great session! All questions were well understood by the class. Keep up the excellent teaching!'
  }

  if (reviseInClass.length > 0 && provideNotes.length === 0) {
    return parts[0] + ' Repeat the difficult concepts in the next class to help students catch up.'
  }

  return parts.join(' ')
}

export function parseThreshold(queryValue) {
  const parsed = parseInt(queryValue, 10)
  if (Number.isNaN(parsed)) return DEFAULT_WRONG_THRESHOLD
  return Math.min(100, Math.max(0, parsed))
}
