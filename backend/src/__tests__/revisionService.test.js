// Unit tests for revision suggestion classification logic
// Mirrors backend/src/services/revisionService.js

describe('Revision Suggestions Logic', () => {
  const DEFAULT_WRONG_THRESHOLD = 50

  function getTopicLabel(question) {
    if (question.topic?.trim()) return question.topic.trim()
    return question.question?.trim() || 'Unknown question'
  }

  function analyzeQuestion(question, responses) {
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
      wrongCount,
      wrongPercentage,
      totalResponses,
      correctCount
    }
  }

  function classifyQuestions(answeredQuestions, threshold = DEFAULT_WRONG_THRESHOLD) {
    const reviseInClass = answeredQuestions
      .filter(q => q.wrongPercentage >= threshold)
      .sort((a, b) => b.wrongPercentage - a.wrongPercentage)

    const provideNotes = answeredQuestions
      .filter(q => q.wrongCount > 0 && q.wrongPercentage > 0 && q.wrongPercentage < threshold)
      .sort((a, b) => b.wrongPercentage - a.wrongPercentage)

    return { reviseInClass, provideNotes }
  }

  describe('getTopicLabel', () => {
    it('uses topic when set, otherwise question text', () => {
      expect(getTopicLabel({ topic: 'Algebra', question: 'Q1' })).toBe('Algebra')
      expect(getTopicLabel({ question: 'What is gravity?' })).toBe('What is gravity?')
    })
  })

  describe('analyzeQuestion', () => {
    it('computes wrong count and percentage from responses', () => {
      const result = analyzeQuestion(
        { _id: 'q1', question: '2+2?' },
        [{ isCorrect: true }, { isCorrect: false }, { isCorrect: false }]
      )
      expect(result.wrongCount).toBe(2)
      expect(result.wrongPercentage).toBe(67)
    })
  })

  describe('classifyQuestions', () => {
    it('splits high vs low mistake items by threshold', () => {
      const items = [
        { questionId: '1', wrongCount: 8, wrongPercentage: 80 },
        { questionId: '2', wrongCount: 2, wrongPercentage: 20 },
        { questionId: '3', wrongCount: 0, wrongPercentage: 0 }
      ]
      const { reviseInClass, provideNotes } = classifyQuestions(items, 50)
      expect(reviseInClass.map(q => q.questionId)).toEqual(['1'])
      expect(provideNotes.map(q => q.questionId)).toEqual(['2'])
    })
  })
})
