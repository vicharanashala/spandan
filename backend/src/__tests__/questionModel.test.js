import Question from '../models/Question.js'

describe('Question model bank metadata', () => {
  it('stores teacher-saved template metadata and tags', () => {
    const question = new Question({
      roomId: '507f1f77bcf86cd799439011',
      type: 'MCQ',
      question: 'What is 2 + 2?',
      options: [{ text: '3', isCorrect: false }, { text: '4', isCorrect: true }],
      savedByTeacher: true,
      isTemplate: true,
      tags: ['math', 'arithmetic']
    })

    expect(question.savedByTeacher).toBe(true)
    expect(question.isTemplate).toBe(true)
    expect(question.tags).toEqual(['math', 'arithmetic'])
  })

  it('defaults bank metadata to false and empty tags', () => {
    const question = new Question({
      roomId: '507f1f77bcf86cd799439011',
      type: 'TF',
      question: 'The sky is blue.',
      options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }]
    })

    expect(question.savedByTeacher).toBe(false)
    expect(question.isTemplate).toBe(false)
    expect(question.tags).toEqual([])
  })
})
