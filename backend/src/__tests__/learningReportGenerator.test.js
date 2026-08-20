import {
  generateStudentLearningReport,
  generateRoomLearningReports
} from '../services/learningReportGenerator.js'

import RoomMember from '../models/RoomMember.js'
import Room from '../models/Room.js'
import Response from '../models/Response.js'
import Question from '../models/Question.js'
import Transcript from '../models/Transcript.js'
import LearningReport from '../models/LearningReport.js'

import { calculateStudentMetrics } from '../services/learningReportService.js'
import { generateLearningReportAI } from '../services/learningReportAIService.js'
jest.mock('../models/Room.js', () => ({
  __esModule: true,
  default: {
    findById: jest.fn()
  }
}))

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

jest.mock('../models/Transcript.js', () => ({
  __esModule: true,
  default: {
    find: jest.fn()
  }
}))

jest.mock('../models/LearningReport.js', () => ({
  __esModule: true,
  default: {
    findOneAndUpdate: jest.fn()
  }
}))

jest.mock('../models/RoomMember.js', () => ({
  __esModule: true,
  default: {
    find: jest.fn()
  }
}))

jest.mock('../services/learningReportService.js', () => ({
  calculateStudentMetrics: jest.fn()
}))

jest.mock('../services/learningReportAIService.js', () => ({
  generateLearningReportAI: jest.fn()
}))

describe('generateStudentLearningReport', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('generates and saves a completed learning report', async () => {
    Room.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'room1',
        endedAt: new Date()
      })
    })

    Response.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          questionId: 'q1',
          isCorrect: true,
          points: 10,
          responseTime: 5
        }
      ])
    })

    Question.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: 'q1',
            question: 'What is supervised learning?',
            segmentIndex: 0
          }
        ])
      })
    })

    Transcript.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            segmentIndex: 0,
            text: 'Supervised learning uses labelled training data.'
          }
        ])
      })
    })

    calculateStudentMetrics.mockResolvedValue({
      totalQuestions: 1,
      attempted: 1,
      correct: 1,
      accuracy: 100,
      totalPoints: 10,
      averageResponseTime: 5
    })

    generateLearningReportAI.mockResolvedValue({
      summary: 'Strong understanding of the session.',
      strengths: ['Understands supervised learning'],
      weaknesses: [],
      recommendations: ['Continue practicing with examples']
    })

    const savedReport = {
      roomId: 'room1',
      studentId: 'student1',
      status: 'completed'
    }

    LearningReport.findOneAndUpdate.mockResolvedValue(savedReport)

    const result = await generateStudentLearningReport(
      'room1',
      'student1'
    )

    expect(calculateStudentMetrics).toHaveBeenCalledWith(
      'room1',
      'student1'
    )

    expect(generateLearningReportAI).toHaveBeenCalledWith(
      expect.objectContaining({
        metrics: expect.objectContaining({
          accuracy: 100
        }),
        transcript: 'Supervised learning uses labelled training data.'
      })
    )

    expect(LearningReport.findOneAndUpdate).toHaveBeenCalledWith(
      { roomId: 'room1', studentId: 'student1' },
      expect.objectContaining({
        roomId: 'room1',
        studentId: 'student1',
        status: 'completed'
      }),
      expect.objectContaining({
        new: true,
        upsert: true
      })
    )

    expect(result).toBe(savedReport)
  })

    it('rejects report generation for an active room', async () => {
    Room.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'room1',
        endedAt: null
      })
    })

    await expect(
      generateStudentLearningReport('room1', 'student1')
    ).rejects.toThrow(
      'Learning report is available only after the session ends'
    )

    expect(generateLearningReportAI).not.toHaveBeenCalled()
    expect(LearningReport.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('generates reports for all students in a completed room', async () => {
    RoomMember.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { studentId: 'student1' },
          { studentId: 'student2' }
        ])
      })
    })

    Room.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'room1',
        endedAt: new Date()
      })
    })

    Response.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([])
    })

    Question.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    })

    Transcript.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    })

    calculateStudentMetrics.mockResolvedValue({
      totalQuestions: 0,
      attempted: 0,
      correct: 0,
      accuracy: 0,
      totalPoints: 0,
      averageResponseTime: 0
    })

    generateLearningReportAI.mockResolvedValue({
      summary: 'No responses recorded.',
      strengths: [],
      weaknesses: [],
      recommendations: []
    })

    LearningReport.findOneAndUpdate
      .mockResolvedValueOnce({
        roomId: 'room1',
        studentId: 'student1',
        status: 'completed'
      })
      .mockResolvedValueOnce({
        roomId: 'room1',
        studentId: 'student2',
        status: 'completed'
      })

    const reports = await generateRoomLearningReports('room1')

    expect(RoomMember.find).toHaveBeenCalledWith({
      roomId: 'room1'
    })

    expect(generateLearningReportAI).toHaveBeenCalledTimes(2)
    expect(LearningReport.findOneAndUpdate).toHaveBeenCalledTimes(2)

    expect(reports).toHaveLength(2)
    expect(reports[0].studentId).toBe('student1')
    expect(reports[1].studentId).toBe('student2')
  })
})