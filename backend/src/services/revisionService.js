import RevisionSheet from '../models/RevisionSheet.js'
import Response from '../models/Response.js'
import { aiService } from './aiService.js'

export async function generateRevisionSheet(roomId, question, responses) {
  const correctOption = question.options.find(o => o.isCorrect)
  const totalResponses = responses.length
  const correctCount = responses.filter(r => r.isCorrect).length
  const correctPercentage = totalResponses > 0 ? Math.round((correctCount / totalResponses) * 100) : 0

  const answerDist = {}
  question.options.forEach((opt, idx) => {
    answerDist[idx] = responses.filter(r => r.selectedOption === idx).length
  })

  const topDistractor = responses
    .filter(r => !r.isCorrect)
    .reduce((acc, r) => {
      acc[r.selectedOption] = (acc[r.selectedOption] || 0) + 1
      return acc
    }, {})

  try {
    const aiSheet = await aiService.generateRevisionSheet(question, responses, {
      correctPercentage,
      correctOptionText: correctOption?.text || '',
      answerDistribution: answerDist,
      topDistractor
    })

    const sheet = new RevisionSheet({
      roomId,
      questionId: question._id,
      title: aiSheet.title || `Revision: ${question.question.substring(0, 60)}`,
      topic: aiSheet.topic || question.bloomLevel || 'General',
      definitions: (aiSheet.definitions || []).map(d => ({ term: d.term || '', definition: d.definition || '' })),
      importantFormulae: (aiSheet.importantFormulae || []).map(f => ({ formula: f.formula || '', description: f.description || '' })),
      keyConcepts: (aiSheet.keyConcepts || []).map(k => ({ concept: k.concept || '', definition: k.definition || '' })),
      examples: (aiSheet.examples || []).map(e => ({ title: e.title || '', content: e.content || '' })),
      commonMistakes: (aiSheet.commonMistakes || []).map(m => ({ mistake: m.mistake || '', correction: m.correction || '' })),
      frequentlyConfused: (aiSheet.frequentlyConfused || []).map(f => ({ concept1: f.concept1 || '', concept2: f.concept2 || '', distinction: f.distinction || '' })),
      memoryTips: (aiSheet.memoryTips || []).map(t => ({ tip: t.tip || '', topic: t.topic || '' })),
      examTips: (aiSheet.examTips || []).map(t => ({ tip: t.tip || '' })),
      quickReferenceTable: (aiSheet.quickReferenceTable || []).map(r => ({ category: r.category || '', details: r.details || '' })),
      summary: aiSheet.summary || '',
      practiceQuestions: (aiSheet.practiceQuestions || []).map(p => ({ question: p.question || '', answer: p.answer || '', difficulty: p.difficulty || 'medium' })),
      vivaQuestions: (aiSheet.vivaQuestions || []).map(v => ({ question: v.question || '', answer: v.answer || '' })),
      mcqs: (aiSheet.mcqs || []).map(m => ({
        question: m.question || '',
        options: (m.options || []).map(o => ({ text: o.text || '', isCorrect: o.isCorrect || false })),
        explanation: m.explanation || ''
      }))
    })

    await sheet.save()
    return sheet
  } catch (error) {
    console.error('AI revision sheet failed, using local fallback:', error.message)
    return generateLocalSheet(roomId, question, responses, correctOption, correctPercentage)
  }
}

function generateLocalSheet(roomId, question, responses, correctOption, correctPercentage) {
  const allOptionsText = question.options.map((o, i) =>
    `${String.fromCharCode(65 + i)}. ${o.text}${o.isCorrect ? ' ✓' : ''}`
  ).join('\n')

  const wrongCount = responses.filter(r => !r.isCorrect).length
  const commonMistakes = wrongCount > 0
    ? [{ mistake: `${wrongCount} student(s) selected an incorrect option`, correction: `The correct answer is: ${correctOption?.text || 'Review below'}` }]
    : []

  return new RevisionSheet({
    roomId,
    questionId: question._id,
    title: `Revision: ${question.question.substring(0, 60)}`,
    topic: question.bloomLevel || 'Core Concept',
    definitions: [{ term: 'Key Concept', definition: correctOption?.text || question.question }],
    keyConcepts: [{
      concept: question.question,
      definition: question.explanation || correctOption
        ? `Correct answer: ${correctOption.text}. ${question.explanation || 'Review the explanation provided by your teacher.'}`
        : 'Study the question and options carefully.'
    }],
    commonMistakes,
    examTips: [{ tip: 'Carefully read all options before selecting your answer.' }],
    summary: `${correctPercentage}% of students answered correctly. ${wrongCount > 0 ? `${wrongCount} student(s) selected an incorrect option, indicating areas that need review.` : 'All students answered correctly.'}`,
    practiceQuestions: [{
      question: `Create a similar question about: ${question.question}`,
      answer: correctOption?.text || 'Refer to your notes',
      difficulty: 'medium'
    }]
  }).save()
}

export async function generateSessionRevisionSheet(roomId, questions, allResponses) {
  const totalQuestions = questions.length
  const totalResponses = allResponses.length

  let totalCorrect = 0
  allResponses.forEach(r => { if (r.isCorrect) totalCorrect++ })
  const overallAccuracy = totalResponses > 0 ? Math.round((totalCorrect / totalResponses) * 100) : 0

  const avgResponseTime = allResponses.reduce((sum, r) => sum + (r.responseTime || 0), 0) / (totalResponses || 1)

  const topics = [...new Set(questions.map(q => q.bloomLevel || q.type || 'General').filter(Boolean))]

  const stats = { totalQuestions, totalResponses, overallAccuracy, averageResponseTime: Math.round(avgResponseTime * 10) / 10, topics }

  try {
    const aiSheet = await aiService.generateSessionRevisionSheet(questions, allResponses, stats)

    const sheet = new RevisionSheet({
      roomId,
      title: aiSheet.title || `Session Revision: ${new Date().toLocaleDateString()}`,
      topic: aiSheet.topic || topics[0] || 'General',
      definitions: (aiSheet.definitions || []).map(d => ({ term: d.term || '', definition: d.definition || '' })),
      importantFormulae: (aiSheet.importantFormulae || []).map(f => ({ formula: f.formula || '', description: f.description || '' })),
      keyConcepts: (aiSheet.keyConcepts || []).map(k => ({ concept: k.concept || '', definition: k.definition || '' })),
      examples: (aiSheet.examples || []).map(e => ({ title: e.title || '', content: e.content || '' })),
      commonMistakes: (aiSheet.commonMistakes || []).map(m => ({ mistake: m.mistake || '', correction: m.correction || '' })),
      frequentlyConfused: (aiSheet.frequentlyConfused || []).map(f => ({ concept1: f.concept1 || '', concept2: f.concept2 || '', distinction: f.distinction || '' })),
      memoryTips: (aiSheet.memoryTips || []).map(t => ({ tip: t.tip || '', topic: t.topic || '' })),
      examTips: (aiSheet.examTips || []).map(t => ({ tip: t.tip || '' })),
      quickReferenceTable: (aiSheet.quickReferenceTable || []).map(r => ({ category: r.category || '', details: r.details || '' })),
      summary: aiSheet.summary || '',
      practiceQuestions: (aiSheet.practiceQuestions || []).map(p => ({ question: p.question || '', answer: p.answer || '', difficulty: p.difficulty || 'medium' })),
      vivaQuestions: (aiSheet.vivaQuestions || []).map(v => ({ question: v.question || '', answer: v.answer || '' })),
      mcqs: (aiSheet.mcqs || []).map(m => ({
        question: m.question || '',
        options: (m.options || []).map(o => ({ text: o.text || '', isCorrect: o.isCorrect || false })),
        explanation: m.explanation || ''
      }))
    })

    await sheet.save()
    return sheet
  } catch (error) {
    console.error('AI session revision sheet failed, using local fallback:', error.message)
    return generateLocalSessionSheet(roomId, questions, allResponses, overallAccuracy)
  }
}

function generateLocalSessionSheet(roomId, questions, allResponses, overallAccuracy) {
  const items = questions.map((q, idx) => {
    const correctOption = q.options.find(o => o.isCorrect)
    const qResponses = allResponses.filter(r => r.questionId.toString() === q._id.toString())
    const wrongCount = qResponses.filter(r => !r.isCorrect).length
    return {
      question: q.question.substring(0, 100),
      correct: correctOption?.text || 'N/A',
      wrongCount
    }
  })

  const totalWrong = items.reduce((s, i) => s + i.wrongCount, 0)

  return new RevisionSheet({
    roomId,
    title: `Session Revision: ${new Date().toLocaleDateString()}`,
    topic: 'Session Review',
    definitions: items.slice(0, 5).map(i => ({ term: 'Key Concept', definition: `From: "${i.question}" — Correct answer: ${i.correct}` })),
    keyConcepts: items.map(i => ({ concept: i.question.substring(0, 60), definition: `Correct answer: ${i.correct}` })),
    commonMistakes: totalWrong > 0
      ? [{ mistake: `${totalWrong} incorrect answer(s) across ${questions.length} question(s)`, correction: 'Review the correct answers listed above.' }]
      : [],
    examTips: [{ tip: 'Review all session questions and understand why each correct answer is right.' }],
    summary: `${overallAccuracy}% overall accuracy across ${questions.length} question(s). ${totalWrong > 0 ? 'Areas needing review identified above.' : 'All questions answered correctly!'}`,
    practiceQuestions: items.slice(0, 3).map(i => ({
      question: `Practice: ${i.question}`,
      answer: i.correct,
      difficulty: 'medium'
    }))
  }).save()
}

export async function getRevisionSheets(roomId) {
  return RevisionSheet.find({ roomId }).sort({ createdAt: -1 })
}

export async function updateRevisionSheet(sheetId, updates) {
  return RevisionSheet.findByIdAndUpdate(sheetId, updates, { new: true })
}
