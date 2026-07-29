// sessionSummaryService.js
// Generates AI-powered post-session summaries for teachers to review student performance
// and identify areas where the class struggled most.

/**
 * Generate a session summary from room questions, responses, and transcripts
 * @param {Object} room - The room object
 * @param {Array} questions - Array of questions from the session
 * @param {Array} responses - Array of responses from the session
 * @param {Array} transcripts - Array of transcripts from the session
 * @returns {Object} Summary object with insights and recommendations
 */
export async function generateSessionSummary(room, questions, responses, transcripts) {
  // Calculate basic statistics
  const totalQuestions = questions.length
  const totalResponses = responses.length
  
  // Get unique students who responded
  const uniqueStudents = [...new Set(responses.map(r => r.studentId.toString()))]
  const totalStudents = uniqueStudents.length
  const averageParticipation = totalQuestions > 0 ? Math.round((totalResponses / totalQuestions) * 100) : 0

  // Calculate correctness rate per question
  const questionStats = questions.map(q => {
    const questionResponses = responses.filter(r => r.questionId.toString() === q._id.toString())
    const correctCount = questionResponses.filter(r => r.isCorrect).length
    const totalQuestionResponses = questionResponses.length
    const correctnessRate = totalQuestionResponses > 0 ? Math.round((correctCount / totalQuestionResponses) * 100) : 0

    // Calculate per-option answer counts for analysis
    const answerCounts = {}
    q.options.forEach((opt, idx) => {
      answerCounts[idx] = questionResponses.filter(r => 
        r.selectedOption === idx || r.selectedOptions?.includes(idx)
      ).length
    })

    return {
      question: q.question,
      type: q.type,
      correctnessRate,
      timesAnswered: totalQuestionResponses,
      answerCounts,
      struggle: correctnessRate < 70,
      explanation: q.explanation || ''
    }
  })

  // Identify struggling questions (correctness < 70%)
  const strugglingQuestions = questionStats
    .filter(q => q.struggle && q.timesAnswered > 0)
    .sort((a, b) => a.correctnessRate - b.correctnessRate)

  // Calculate average points
  const totalPoints = responses.reduce((sum, r) => sum + (r.points || 0), 0)
  const averagePoints = totalResponses > 0 ? Math.round(totalPoints / totalResponses) : 0

  // Extract key topics from transcripts
  const keyTopics = extractKeyTopics(transcripts)

  // Top performers (students with highest points)
  const studentScores = {}
  responses.forEach(r => {
    const studentId = r.studentId.toString()
    studentScores[studentId] = (studentScores[studentId] || 0) + (r.points || 0)
  })

  const topPerformers = Object.entries(studentScores)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)

  const narrativeSummary = generateNarrativeSummary(totalQuestions, totalResponses, totalStudents, averagePoints, strugglingQuestions, keyTopics, averageParticipation)

  return {
    sessionId: room._id,
    sessionName: room.name,
    sessionCode: room.code,
    generatedAt: new Date().toISOString(),
    overview: {
      totalQuestions,
      totalResponses,
      totalStudents,
      averageParticipation,
      averagePoints
    },
    narrativeSummary,
    strugglingQuestions,
    keyTopics,
    topPerformers,
    quickRecommendations: generateRecommendations(strugglingQuestions, keyTopics)
  }
}

/**
 * Generate a short narrative summary (5 lines) from the session data
 */
function generateNarrativeSummary(totalQuestions, totalResponses, totalStudents, averagePoints, strugglingQuestions, keyTopics, averageParticipation) {
  const struggleCount = strugglingQuestions.length
  const topTopics = keyTopics.slice(0, 3).join(', ')
  const lines = []

  lines.push(`This session covered ${totalQuestions} question(s) with ${totalStudents} student(s) participating, achieving an average of ${averagePoints} points and ${averageParticipation}% participation rate.`)

  if (struggleCount > 0) {
    lines.push(`The class struggled with ${struggleCount} question(s) where fewer than 70% answered correctly — review these concepts for better understanding.`)
  } else {
    lines.push(`The class performed well across all questions, with most students answering correctly.`)
  }

  if (topTopics) {
    lines.push(`Key topics discussed included: ${topTopics}.`)
  }

  if (totalResponses > 0) {
    const avgCorrectRate = Math.round(strugglingQuestions.reduce((s, q) => s + q.correctnessRate, 0) / Math.max(struggleCount, 1))
    if (struggleCount > 0) {
      lines.push(`Areas needing attention had an average correctness of ${avgCorrectRate}% — consider re-teaching these concepts in the next session.`)
    }
  }

  lines.push(`Session completed successfully — use the question-by-question breakdown below to identify specific gaps.`)

  return lines.join(' ')
}

/**
 * Extract key topics from transcripts using simple keyword analysis
 * In production, this would use NLP/embeddings
 */
function extractKeyTopics(transcripts) {
  const allText = transcripts.map(t => t.text || '').join(' ')
  const words = allText.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4)

  const freq = {}
  words.forEach(w => {
    freq[w] = (freq[w] || 0) + 1
  })

  return Object.entries(freq)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word)
}

/**
 * Generate quick recommendations based on session data
 */
function generateRecommendations(strugglingQuestions, keyTopics) {
  const recommendations = []

  if (strugglingQuestions.length > 0) {
    recommendations.push(`Review ${strugglingQuestions.length} concept(s) where students struggled`)
  }

  if (keyTopics.length > 0) {
    recommendations.push(`Key topics covered: ${keyTopics.slice(0, 3).join(', ')}`)
  }

  recommendations.push('Consider re-teaching concepts with low correctness rates')
  
  if (recommendations.length === 1) {
    recommendations.push('Great session! Students grasped most concepts well.')
  }

  return recommendations
}

/**
 * Format summary for display in the UI
 */
export function formatSummaryForDisplay(summary) {
  return {
    title: `Session Summary: ${summary.sessionName}`,
    timestamp: summary.generatedAt,
    stats: [
      { label: 'Total Questions', value: summary.overview.totalQuestions },
      { label: 'Total Responses', value: summary.overview.totalResponses },
      { label: 'Students Participated', value: summary.overview.totalStudents },
      { label: 'Avg Participation', value: `${summary.overview.averageParticipation}%` },
      { label: 'Avg Points', value: summary.overview.averagePoints }
    ],
    struggling: summary.strugglingQuestions.map(q => ({
      question: q.question,
      rate: `${q.correctnessRate}%`,
      answered: q.timesAnswered
    })),
    topics: summary.keyTopics.slice(0, 5),
    recommendations: summary.quickRecommendations
  }
}

export default {
  generateSessionSummary,
  formatSummaryForDisplay
}