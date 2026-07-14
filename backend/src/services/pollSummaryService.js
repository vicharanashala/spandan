import Question from '../models/Question.js'
import Response from '../models/Response.js'
import RoomMember from '../models/RoomMember.js'
import Room from '../models/Room.js'
import { aiService } from './aiService.js'

function buildLocalFallback(question, responses, totalStudents, stats) {
  const { totalResponses, correctCount, correctPercentage, incorrectPercentage, participationRate, averageScore } = stats

  const mostSelectedIncorrect = responses
    .filter(r => !r.isCorrect)
    .reduce((acc, curr) => {
      acc[curr.selectedOption] = (acc[curr.selectedOption] || 0) + 1
      return acc
    }, {})

  const correctOption = question.options.find(o => o.isCorrect)
  const correctOptionLabel = correctOption?.text || ''
  const correctOptionLetter = correctOption ? String.fromCharCode(65 + question.options.indexOf(correctOption)) : ''

  let struggledWith = ''
  let struggledCount = 0
  const entries = Object.entries(mostSelectedIncorrect)
  if (entries.length > 0) {
    entries.sort((a, b) => b[1] - a[1])
    struggledCount = entries[0][1]
    const index = parseInt(entries[0][0], 10)
    if (question.options[index]) {
      struggledWith = question.options[index].text
    }
  }

  const struggledPct = totalResponses > 0 ? Math.round((struggledCount / totalResponses) * 100) : 0
  const understoodText = correctPercentage >= 80
    ? `Most students (${correctPercentage}%) correctly identified that "${correctOptionLabel}", demonstrating solid understanding of this concept.`
    : correctPercentage >= 50
      ? `${correctPercentage}% of students answered correctly by selecting "${correctOptionLabel}". Review why the remaining ${incorrectPercentage}% chose other options.`
      : `Only ${correctPercentage}% of students answered correctly. The correct answer is "${correctOptionLabel}" (Option ${correctOptionLetter}), indicating this concept needs more attention.`

  const struggledText = struggledWith
    ? `The most common incorrect choice was "${struggledWith}", selected by ${struggledCount} student(s) (${struggledPct}% of respondents). This suggests confusion between this distractor and the correct concept.`
    : correctPercentage >= 80
      ? 'Most students answered correctly, indicating strong overall understanding.'
      : 'Review the question and options with the class to identify where confusion may lie.'

  let explanationText = ''
  if (question.explanation) {
    explanationText = question.explanation
  } else if (struggledWith && correctOptionLabel) {
    explanationText = `Compare "${correctOptionLabel}" (the correct choice) with "${struggledWith}" (the most common incorrect choice) and highlight the key differences.`
  } else if (correctOptionLabel) {
    explanationText = `Explain why "${correctOptionLabel}" is the correct answer and walk through the reasoning step by step.`
  } else {
    explanationText = 'Review the question with the class, explaining the reasoning for each option.'
  }

  let followUpQuestion = ''
  if (correctOptionLabel && struggledWith) {
    followUpQuestion = `Which of the following best distinguishes "${correctOptionLabel}" from "${struggledWith}"?\nA. They are the same concept described differently\nB. "${correctOptionLabel}" involves reusable results while "${struggledWith}" does not\nC. "${struggledWith}" is always more efficient\nD. Neither concept applies to problem-solving`
  } else {
    followUpQuestion = `Which of the following best explains the core concept?\nA. ${correctOptionLabel || 'The main idea'}\nB. An unrelated approach\nC. A common misconception\nD. A different application entirely`
  }

  let homeworkText = ''
  if (struggledWith) {
    homeworkText = `• Review the difference between "${correctOptionLabel}" and "${struggledWith}" with 2-3 examples\n• Solve 3 practice problems related to this topic\n• Write a brief explanation of why "${correctOptionLabel}" is the correct answer in your own words`
  } else if (correctOptionLabel) {
    homeworkText = `• Solve 3 additional practice problems on this topic\n• Write a brief explanation of why "${correctOptionLabel}" is correct\n• Create your own question similar to this one`
  } else {
    homeworkText = '• Review this topic with additional practice problems\n• Ask a classmate or teacher for clarification on any confusing parts'
  }

  let nextTopicText = ''
  if (correctPercentage >= 80) {
    nextTopicText = correctOptionLabel
      ? `Students have understood "${correctOptionLabel}" well (${correctPercentage}% correct). Proceed to the next related topic, building on this foundation.`
      : 'Students performed well. Proceed to the next topic.'
  } else if (correctPercentage >= 50) {
    nextTopicText = struggledWith
      ? `With ${correctPercentage}% correct, students have partial understanding. Spend 5 minutes reviewing why "${struggledWith}" is incorrect before moving on.`
      : `With ${correctPercentage}% correct, students have partial understanding. Review with one more example before advancing.`
  } else {
    nextTopicText = correctOptionLabel
      ? `Only ${correctPercentage}% answered correctly. Do not advance. Use a diagram or live example to re-explain "${correctOptionLabel}" and why the other options are wrong before re-polling.`
      : `Only ${correctPercentage}% answered correctly. Do not advance. Re-teach this concept with additional examples and re-poll.`
  }

  const summary = `Class Summary — Question: "${question.question.substring(0, 100)}"\n\n• Total Students: ${totalStudents}\n• Participation: ${participationRate}%\n• Correct: ${correctPercentage}% (${correctCount} of ${totalResponses})\n• Incorrect: ${incorrectPercentage}% (${totalResponses - correctCount} of ${totalResponses})\n• Average Score: ${averageScore} points\n\n${understoodText}\n\n${struggledText}\n\nRecommended Action:\n${explanationText}\n\nSuggested Follow-up:\n${followUpQuestion}\n\nHomework:\n${homeworkText}\n\nNext Topic:\n${nextTopicText}`

  return {
    success: true,
    questionId: question._id.toString(),
    pollStats: {
      totalStudents,
      participationRate,
      averageScore,
      correctPercentage,
      incorrectPercentage
    },
    aiSummary: summary,
    recommendations: [
      `Review: ${struggledWith ? `Students confused "${correctOptionLabel}" with "${struggledWith}". Highlight key differences with a comparison table.` : `${correctPercentage >= 80 ? 'Students performed well. Proceed.' : 'Re-teach this concept with additional examples.'}`}`,
      `Explanation: ${explanationText.substring(0, 120)}`,
      `Follow-up: ${followUpQuestion.substring(0, 120)}`,
      `Next step: ${nextTopicText.substring(0, 120)}`
    ],
    charts: {
      correctAnswers: correctCount,
      incorrectAnswers: totalResponses - correctCount,
      answerDistribution: stats.answerDistribution
    },
    aiInsightsDetails: {
      mostUnderstoodConcept: understoodText,
      mostMisunderstoodConcept: struggledText,
      suggestedExplanation: explanationText,
      suggestedFollowUpQuestion: followUpQuestion,
      homeworkRecommendation: homeworkText,
      nextTopicRecommendation: nextTopicText
    },
    isFallback: true
  }
}

export async function generateAndSavePollSummary(questionId, ioInstance = null) {
  const question = await Question.findById(questionId)
  if (!question) {
    throw new Error('Question not found')
  }

  const room = await Room.findById(question.roomId)
  if (!room) {
    throw new Error('Room not found')
  }

  const responses = await Response.find({ questionId })
  const totalStudents = await RoomMember.countDocuments({ roomId: question.roomId })

  const totalResponses = responses.length
  const correctCount = responses.filter(r => r.isCorrect).length
  const correctPercentage = totalResponses > 0 ? Math.round((correctCount / totalResponses) * 100) : 0
  const incorrectPercentage = 100 - correctPercentage
  const participationRate = totalStudents > 0
    ? Math.min(100, Math.round((totalResponses / totalStudents) * 100))
    : (totalResponses > 0 ? 100 : 0)

  const totalPointsEarned = responses.reduce((sum, r) => sum + (r.points || 0), 0)
  const averageScore = totalResponses > 0 ? Math.round(totalPointsEarned / totalResponses) : 0
  const averageResponseTime = responses.length > 0
    ? Math.round(responses.reduce((sum, r) => sum + (r.responseTime || 0), 0) / responses.length)
    : 0

  const answerDistribution = {}
  question.options.forEach((opt, idx) => {
    answerDistribution[idx] = responses.filter(r => r.selectedOption === idx).length
  })

  const stats = {
    totalResponses,
    correctCount,
    correctPercentage,
    incorrectPercentage,
    participationRate,
    averageScore,
    averageResponseTime,
    answerDistribution,
    totalStudents,
    topic: question.bloomLevel || question.type || ''
  }

  let aiInsight
  try {
    aiInsight = await aiService.generatePollSummary(question, responses, stats)
  } catch (error) {
    console.error('AI poll summary failed, using local fallback:', error)
    aiInsight = null
  }

  let pollSummary
  if (aiInsight) {
    pollSummary = {
      success: true,
      questionId: question._id.toString(),
      pollStats: {
        totalStudents,
        participationRate,
        averageScore,
        correctPercentage,
        incorrectPercentage
      },
      aiSummary: aiInsight.summaryText || '',
      recommendations: aiInsight.recommendations || [
        `Revision topic: Review the concepts tested by this question.`,
        `Follow-up: ${aiInsight.suggestedFollowUpQuestion || 'Ask a student to explain the correct answer aloud.'}`,
        `Homework: ${aiInsight.homeworkRecommendation || 'Practice related problems.'}`,
        `Next topic: ${aiInsight.nextTopicRecommendation || 'Continue with the curriculum.'}`
      ],
      charts: {
        correctAnswers: correctCount,
        incorrectAnswers: totalResponses - correctCount,
        answerDistribution
      },
      aiInsightsDetails: {
        mostUnderstoodConcept: aiInsight.mostUnderstoodConcept || `${correctPercentage}% of students answered correctly, showing understanding of the concept.`,
        mostMisunderstoodConcept: aiInsight.mostMisunderstoodConcept || `${incorrectPercentage}% of students answered incorrectly, indicating areas needing review.`,
        suggestedExplanation: aiInsight.suggestedExplanation || (question.explanation || `Review why the correct answer is right and the distractors are wrong.`),
        suggestedFollowUpQuestion: aiInsight.suggestedFollowUpQuestion || 'Generate a follow-up question testing the same concept.',
        homeworkRecommendation: aiInsight.homeworkRecommendation || `Practice additional problems related to this topic, focusing on the concepts where students struggled most.`,
        nextTopicRecommendation: aiInsight.nextTopicRecommendation || (correctPercentage >= 80
          ? `Students scored ${correctPercentage}%. Proceed to the next topic.`
          : correctPercentage >= 50
            ? `Students scored ${correctPercentage}%. Review briefly before advancing.`
            : `Students scored ${correctPercentage}%. Do not advance; re-teach and re-poll.`)
      },
      isFallback: false
    }
  } else {
    pollSummary = buildLocalFallback(question, responses, totalStudents, stats)
  }

  question.pollSummary = pollSummary
  await question.save()

  if (ioInstance) {
    ioInstance.to(room.code).emit('poll_summary', pollSummary)
    ioInstance.to(room.code).emit('question:ended', {
      questionId: question._id.toString(),
      results: pollSummary
    })
  }

  return pollSummary
}
