import Homework from '../models/Homework.js'
import StudentWeakTopic from '../models/StudentWeakTopic.js'
import { aiService } from './aiService.js'

export async function generateHomework(studentId, roomId, question, responses) {
  const weakTopic = await StudentWeakTopic.findOne({ studentId, roomId })
  const accuracy = weakTopic?.overallAccuracy ?? 100
  const weakSubtopics = (weakTopic?.subtopics || [])
    .filter(s => s.score > 30)
    .map(s => s.name)

  const studentResponses = responses.filter(r => r.studentId.toString() === studentId.toString())
  const correct = studentResponses.filter(r => r.isCorrect).length
  const total = studentResponses.length
  const studentAccuracy = total > 0 ? Math.round((correct / total) * 100) : 100

  try {
    const aiHomework = await aiService.generatePersonalizedHomework(
      question,
      studentResponses,
      { accuracy: studentAccuracy, weakSubtopics, topic: question.bloomLevel || 'General' }
    )

    const items = (aiHomework.items || []).map(item => ({
      type: item.type || 'MCQ',
      question: item.question || '',
      options: item.options || [],
      difficulty: item.difficulty || 'medium',
      topic: item.topic || '',
      bloomLevel: item.bloomLevel || 'Understand'
    }))

    const existing = await Homework.findOne({ studentId, roomId })
    if (existing) {
      existing.items = items
      existing.topic = aiHomework.topic || question.bloomLevel || 'General'
      existing.weakSubtopics = weakSubtopics
      existing.difficulty = studentAccuracy >= 80 ? 'hard' : studentAccuracy >= 50 ? 'medium' : 'easy'
      existing.dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      await existing.save()
      return existing
    }

    const homework = new Homework({
      roomId,
      studentId,
      topic: aiHomework.topic || question.bloomLevel || 'General',
      weakSubtopics,
      items,
      difficulty: studentAccuracy >= 80 ? 'hard' : studentAccuracy >= 50 ? 'medium' : 'easy',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    })

    await homework.save()
    return homework
  } catch (error) {
    console.error('AI homework generation failed, using local fallback:', error.message)
    return generateLocalHomework(studentId, roomId, weakSubtopics, studentAccuracy, question)
  }
}

function generateLocalHomework(studentId, roomId, weakSubtopics, accuracy, question) {
  const difficulty = accuracy >= 80 ? 'hard' : accuracy >= 50 ? 'medium' : 'easy'
  const items = []

  if (accuracy < 50) {
    items.push({
      type: 'MCQ',
      question: `Which of the following best describes the concept tested by: "${question.question}"?\nA. ${question.options.find(o => o.isCorrect)?.text || 'The correct answer'}\nB. An unrelated approach\nC. A common misconception\nD. A different application`,
      options: [
        { text: question.options.find(o => o.isCorrect)?.text || '', isCorrect: true },
        { text: 'An unrelated approach', isCorrect: false },
        { text: 'A common misconception', isCorrect: false },
        { text: 'A different application', isCorrect: false }
      ],
      difficulty: 'easy',
      topic: question.bloomLevel || 'General'
    })
    items.push({
      type: 'SHORT_ANSWER',
      question: `Explain in your own words: ${question.question}`,
      difficulty: 'easy',
      topic: question.bloomLevel || 'General'
    })
    items.push({
      type: 'PRACTICE_PROBLEM',
      question: `Solve a problem related to: ${question.options.find(o => o.isCorrect)?.text || 'this concept'}. Show your work step by step.`,
      difficulty: 'easy',
      topic: question.bloomLevel || 'General'
    })
  } else if (accuracy < 80) {
    items.push({
      type: 'MCQ',
      question: `Which statement about this topic is correct?\nA. ${question.options.find(o => o.isCorrect)?.text || 'Correct statement'}\nB. A partially correct statement\nC. An incorrect statement\nD. An unrelated statement`,
      options: [
        { text: question.options.find(o => o.isCorrect)?.text || '', isCorrect: true },
        { text: 'A partially correct statement', isCorrect: false },
        { text: 'An incorrect statement', isCorrect: false },
        { text: 'An unrelated statement', isCorrect: false }
      ],
      difficulty: 'medium',
      topic: question.bloomLevel || 'General'
    })
    if (weakSubtopics.length > 0) {
      items.push({
        type: 'SHORT_ANSWER',
        question: `Explain the difference between the correct concept and "${weakSubtopics[0]}" with an example.`,
        difficulty: 'medium',
        topic: question.bloomLevel || 'General'
      })
    }
  } else {
    items.push({
      type: 'MCQ',
      question: `Which advanced concept builds upon: "${question.question}"?\nA. An extension of this concept\nB. A prerequisite concept\nC. An unrelated concept\nD. The same concept at a basic level`,
      options: [
        { text: 'An extension of this concept', isCorrect: true },
        { text: 'A prerequisite concept', isCorrect: false },
        { text: 'An unrelated concept', isCorrect: false },
        { text: 'The same concept at a basic level', isCorrect: false }
      ],
      difficulty: 'hard',
      topic: question.bloomLevel || 'General'
    })
    items.push({
      type: 'PRACTICE_PROBLEM',
      question: `Create a challenging problem related to this topic and solve it. Explain your reasoning at each step.`,
      difficulty: 'hard',
      topic: question.bloomLevel || 'General'
    })
  }

  return new Homework({
    roomId, studentId,
    topic: question.bloomLevel || 'General',
    weakSubtopics,
    items,
    difficulty,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  }).save()
}

export async function generateHomeworkForAll(roomId, allResponses, questions) {
  const studentIds = [...new Set(allResponses.map(r => r.studentId.toString()))]
  const homeworks = []

  for (const studentId of studentIds) {
    const studentResponses = allResponses.filter(r => r.studentId.toString() === studentId)
    const latestQuestion = questions[questions.length - 1]
    const hw = await generateHomework(studentId, roomId, latestQuestion, studentResponses)
    homeworks.push(hw)
  }

  return homeworks
}

export async function getStudentHomework(studentId, roomId) {
  return Homework.find({ studentId, roomId }).sort({ createdAt: -1 })
}

export async function getPendingHomework(roomId) {
  return Homework.find({ roomId }).populate('studentId', 'name email').sort({ createdAt: -1 })
}
