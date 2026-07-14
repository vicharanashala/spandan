import MisconceptionAnalysis from '../models/MisconceptionAnalysis.js'
import StudentWeakTopic from '../models/StudentWeakTopic.js'
import { aiService } from './aiService.js'

export async function analyzeMisconceptions(question, responses, roomId) {
  const totalResponses = responses.length
  const correctCount = responses.filter(r => r.isCorrect).length
  const correctPercentage = totalResponses > 0 ? Math.round((correctCount / totalResponses) * 100) : 0
  const incorrectResponses = responses.filter(r => !r.isCorrect)

  const correctOption = question.options.find(o => o.isCorrect)
  const distractorCounts = {}
  incorrectResponses.forEach(r => {
    distractorCounts[r.selectedOption] = (distractorCounts[r.selectedOption] || 0) + 1
  })

  try {
    const aiAnalysis = await aiService.generateMisconceptionAnalysis(question, responses, {
      correctPercentage,
      totalResponses,
      incorrectCount: totalResponses - correctCount,
      distractorCounts,
      correctOptionText: correctOption?.text || ''
    })

    const analysis = new MisconceptionAnalysis({
      roomId,
      questionId: question._id,
      topic: aiAnalysis.topic || question.bloomLevel || 'General',
      subtopics: (aiAnalysis.subtopics || []).map(s => ({
        name: s.name,
        confusionScore: Math.min(100, Math.max(0, s.confusionScore || 0)),
        studentsAffected: s.studentsAffected || 0,
        recommendation: s.recommendation || ''
      })),
      overallConfusionScore: aiAnalysis.overallConfusionScore ?? (100 - correctPercentage),
      totalStudentsAnalyzed: totalResponses
    })

    await analysis.save()
    await updateStudentWeakTopics(question, responses, roomId, aiAnalysis)
    return analysis
  } catch (error) {
    console.error('AI misconception analysis failed, using local fallback:', error.message)
    return generateLocalFallback(question, responses, roomId, { totalResponses, correctCount, correctPercentage, distractorCounts, correctOption })
  }
}

async function updateStudentWeakTopics(question, responses, roomId, aiAnalysis) {
  const incorrectResponses = responses.filter(r => !r.isCorrect)
  const subtopics = aiAnalysis.subtopics || []

  for (const response of incorrectResponses) {
    const studentId = response.studentId
    let weakTopic = await StudentWeakTopic.findOne({ studentId, roomId })
    if (!weakTopic) {
      weakTopic = new StudentWeakTopic({ studentId, roomId })
    }

    const studentResponses = responses.filter(r => r.studentId.equals(studentId))
    weakTopic.overallAccuracy = studentResponses.length > 0
      ? Math.round((studentResponses.filter(r => r.isCorrect).length / studentResponses.length) * 100)
      : 0
    weakTopic.averageResponseTime = studentResponses.length > 0
      ? Math.round(studentResponses.reduce((s, r) => s + (r.responseTime || 0), 0) / studentResponses.length)
      : 0
    weakTopic.totalQuestionsAttempted += 1
    weakTopic.totalCorrect += response.isCorrect ? 1 : 0
    weakTopic.participationRate = 100

    // Associate weak subtopics
    subtopics.forEach(st => {
      const existing = weakTopic.subtopics.find(s => s.name === st.name)
      if (existing) {
        existing.score = Math.max(existing.score, st.confusionScore || 0)
        if (!existing.questionsWrong.find(q => q.equals(question._id))) {
          existing.questionsWrong.push(question._id)
        }
      } else {
        weakTopic.subtopics.push({
          name: st.name,
          score: st.confusionScore || 0,
          questionsWrong: [question._id]
        })
      }
    })

    weakTopic.topic = aiAnalysis.topic || question.bloomLevel || 'General'
    weakTopic.updatedAt = new Date()
    await weakTopic.save()
  }
}

function generateLocalFallback(question, responses, roomId, data) {
  const { totalResponses, correctCount, correctPercentage, distractorCounts, correctOption } = data
  const incorrectCount = totalResponses - correctCount

  const subtopics = []
  const topDistractors = Object.entries(distractorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  topDistractors.forEach(([idx, count]) => {
    const opt = question.options[parseInt(idx)]
    if (opt) {
      const confusionPct = Math.round((count / totalResponses) * 100)
      subtopics.push({
        name: `Confusion: "${opt.text.substring(0, 40)}"`,
        confusionScore: confusionPct,
        studentsAffected: count,
        recommendation: correctOption
          ? `Compare "${opt.text}" with "${correctOption.text}" to clarify the difference.`
          : `Review why this option is incorrect with an example.`
      })
    }
  })

  if (subtopics.length === 0 && correctPercentage < 100) {
    subtopics.push({
      name: 'General concept understanding',
      confusionScore: 100 - correctPercentage,
      studentsAffected: incorrectCount,
      recommendation: 'Re-teach this concept with additional examples and a step-by-step walkthrough.'
    })
  }

  return new MisconceptionAnalysis({
    roomId,
    questionId: question._id,
    topic: question.bloomLevel || 'Core Concept',
    subtopics: subtopics.length > 0 ? subtopics : [{
      name: 'Core concept',
      confusionScore: 0,
      studentsAffected: 0,
      recommendation: 'Students demonstrated good understanding. Proceed to next topic.'
    }],
    overallConfusionScore: 100 - correctPercentage,
    totalStudentsAnalyzed: totalResponses
  }).save()
}

export async function getMisconceptionHeatmap(roomId) {
  const analyses = await MisconceptionAnalysis.find({ roomId })
    .sort({ generatedAt: -1 })
    .populate('questionId', 'question type')

  const topicMap = {}
  analyses.forEach(a => {
    const topic = a.topic || 'General'
    if (!topicMap[topic]) {
      topicMap[topic] = { topic, subtopics: {}, totalScore: 0, count: 0 }
    }
    a.subtopics.forEach(st => {
      if (!topicMap[topic].subtopics[st.name]) {
        topicMap[topic].subtopics[st.name] = { name: st.name, confusionScore: 0, studentsAffected: 0, occurrences: 0 }
      }
      topicMap[topic].subtopics[st.name].confusionScore = Math.max(
        topicMap[topic].subtopics[st.name].confusionScore,
        st.confusionScore
      )
      topicMap[topic].subtopics[st.name].studentsAffected += st.studentsAffected
      topicMap[topic].subtopics[st.name].occurrences += 1
      topicMap[topic].totalScore += st.confusionScore
      topicMap[topic].count += 1
    })
  })

  return Object.values(topicMap).map(t => ({
    topic: t.topic,
    subtopics: Object.values(t.subtopics).map(st => ({
      name: st.name,
      confusionScore: st.confusionScore,
      studentsAffected: st.studentsAffected
    })),
    overallConfusionScore: t.count > 0 ? Math.round(t.totalScore / t.count) : 0
  }))
}
