import {
  getTopicLabel,
  analyzeQuestion,
  classifyQuestions,
  getStudentTopicPerformance
} from '../services/revisionService.js'
import { DEFAULT_WRONG_THRESHOLD, MIN_WRONG_FOR_NOTES } from '../config/revision.js'

describe('Revision Suggestions Logic', () => {

  describe('getTopicLabel', () => {
    it('uses topic when set, otherwise question text', () => {
      expect(getTopicLabel({ topic: 'Algebra', question: 'Q1' })).toBe('Algebra')
      expect(getTopicLabel({ question: 'What is gravity?' })).toBe('What is gravity?')
    })
  })

  describe('analyzeQuestion', () => {
    it('computes wrong count, percentage, and segmentIndex from responses', () => {
      const result = analyzeQuestion(
        { _id: 'q1', question: '2+2?', segmentIndex: 3, type: 'MCQ' },
        [{ isCorrect: true }, { isCorrect: false }, { isCorrect: false }]
      )
      expect(result.wrongCount).toBe(2)
      expect(result.wrongPercentage).toBe(67)
      expect(result.segmentIndex).toBe(3)
      expect(result.type).toBe('MCQ')
    })
  })

  describe('classifyQuestions', () => {
    it('splits high vs low mistake items by threshold', () => {
      const items = [
        { questionId: '1', wrongCount: 8, wrongPercentage: 80 },
        { questionId: '2', wrongCount: MIN_WRONG_FOR_NOTES, wrongPercentage: 20 },
        { questionId: '3', wrongCount: 0, wrongPercentage: 0 }
      ]
      const { reviseInClass, provideNotes } = classifyQuestions(items, 50)
      expect(reviseInClass.map(q => q.questionId)).toEqual(['1'])
      expect(provideNotes.map(q => q.questionId)).toEqual(['2'])
    })
  })

  describe('getStudentTopicPerformance', () => {
    it('groups mistakes by topic, tracks segmentIndex, and sorts worst first', () => {
      const questions = [
        { _id: 'q1', topic: 'Math', segmentIndex: 1 },
        { _id: 'q2', topic: 'Math', segmentIndex: 1 },
        { _id: 'q3', topic: 'Science', segmentIndex: 2 }
      ]
      
      const responses = [
        { questionId: 'q1', isCorrect: false },
        { questionId: 'q2', isCorrect: false },
        { questionId: 'q3', isCorrect: true },
      ]

      const results = getStudentTopicPerformance(questions, responses)
      expect(results.length).toBe(1)
      expect(results[0].topic).toBe('Math')
      expect(results[0].wrongCount).toBe(2)
      expect(results[0].segmentIndex).toBe(1)
    })
  })
})
