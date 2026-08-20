import { calculateStudentMetrics } from '../services/learningReportService.js'
import Response from '../models/Response.js'
import Question from '../models/Question.js'

jest.mock('../models/Response.js', () => ({
  __esModule: true,
  default: {
    find: jest.fn()
  }
}))

jest.mock('../models/Question.js', () => ({
  __esModule: true,
  default: {
    find: jest.fn()
  }
}))

describe('calculateStudentMetrics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calculates student performance correctly', async () => {
    Response.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          questionId: 'q1',
          isCorrect: true,
          points: 10,
          responseTime: 5
        },
        {
          questionId: 'q2',
          isCorrect: false,
          points: 0,
          responseTime: 10
        },
        {
          questionId: 'q3',
          isCorrect: true,
          points: 20,
          responseTime: 15
        }
      ])
    })

    Question.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { _id: 'q1' },
        { _id: 'q2' },
        { _id: 'q3' },
        { _id: 'q4' }
      ])
    })

    const result = await calculateStudentMetrics('room1', 'student1')

    expect(result).toEqual({
      totalQuestions: 4,
      attempted: 3,
      correct: 2,
      accuracy: 66.67,
      totalPoints: 30,
      averageResponseTime: 10
    })
  })

  it('handles a student who answered nothing', async () => {
    Response.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([])
    })

    Question.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { _id: 'q1' },
        { _id: 'q2' }
      ])
    })

    const result = await calculateStudentMetrics('room1', 'student1')

    expect(result).toEqual({
      totalQuestions: 2,
      attempted: 0,
      correct: 0,
      accuracy: 0,
      totalPoints: 0,
      averageResponseTime: 0
    })
  })
})