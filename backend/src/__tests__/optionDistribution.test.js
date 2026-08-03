import { buildDistribution, buildTeacherDistributionPayload, buildTeacherDistributionUpdatePayload, distinctNumericOptions, responseOptionIndices, teacherDistributionRoom } from '../services/optionDistribution.js'
import Response from '../models/Response.js'

describe('option distribution', () => {
  const question = { _id: 'q1', options: [{ isCorrect: false }, { isCorrect: true }, { isCorrect: false }] }

  it('calculates MCQ percentages from question respondents and can include correct options', () => {
    const result = buildDistribution(question, 3, new Map([[0, 1], [1, 2]]), true)
    expect(result.options).toEqual([
      { optionIndex: 0, count: 1, percentage: 33.33 },
      { optionIndex: 1, count: 2, percentage: 66.67 },
      { optionIndex: 2, count: 0, percentage: 0 }
    ])
    expect(result.correctOptions).toEqual([1])
  })

  it('calculates True/False percentages with a zero-safe question denominator', () => {
    const result = buildDistribution(
      { _id: 'tf1', options: [{}, {}] },
      1,
      new Map([[0, 1]])
    )
    expect(result.options).toEqual([
      { optionIndex: 0, count: 1, percentage: 100 },
      { optionIndex: 1, count: 0, percentage: 0 }
    ])
  })

  it('deduplicates MSQ selections per respondent', () => {
    expect(distinctNumericOptions([0, 0, 2, 2])).toEqual([0, 2])
  })

  it('falls back to selectedOption for legacy responses without inventing data', () => {
    expect(responseOptionIndices({ selectedOption: 1 })).toEqual([1])
    expect(responseOptionIndices({ selectedOptions: [], selectedOption: 1 })).toEqual([1])
    expect(responseOptionIndices({ selectedOptions: [] })).toEqual([])
  })

  it('uses respondents as the MSQ denominator while counting each option once per respondent', () => {
    const result = buildDistribution(
      { _id: 'msq1', options: [{}, {}, {}] },
      3,
      new Map([[0, 2], [1, 1], [2, 2]])
    )
    expect(result.options).toEqual([
      { optionIndex: 0, count: 2, percentage: 66.67 },
      { optionIndex: 1, count: 1, percentage: 33.33 },
      { optionIndex: 2, count: 2, percentage: 66.67 }
    ])
  })

  it('does not divide by zero', () => {
    const result = buildDistribution(question, 0, new Map(), false)
    expect(result.options.every((option) => option.percentage === 0)).toBe(true)
    expect(result).not.toHaveProperty('correctOptions')
  })

  it('retains the unique room/question/student submission constraint', () => {
    const submissionIndex = Response.schema.indexes().find(([fields]) => (
      fields.roomId === 1 && fields.questionId === 1 && fields.studentId === 1
    ))
    expect(submissionIndex).toBeTruthy()
    expect(submissionIndex[1].unique).toBe(true)
  })

  it('uses isolated teacher rooms and strips private/correct-answer fields', () => {
    expect(teacherDistributionRoom('ROOM-A')).not.toBe(teacherDistributionRoom('ROOM-B'))
    const payload = buildTeacherDistributionPayload({ q1: {
      totalResponses: 2,
      options: [{ optionIndex: 0, count: 2, percentage: 100 }],
      correctOptions: [0],
      studentIds: ['private']
    } })
    expect(payload.distributions.q1).toEqual({
      totalResponses: 2,
      options: [{ optionIndex: 0, count: 2, percentage: 100 }]
    })
    expect(JSON.stringify(payload)).not.toContain('private')
    expect(JSON.stringify(payload)).not.toContain('correctOptions')
  })

  it('builds a question-scoped live aggregate without response documents', () => {
    expect(buildTeacherDistributionUpdatePayload('room-1', 'q1', {
      totalResponses: 2,
      options: [{ optionIndex: 0, count: 1, percentage: 50 }]
    })).toEqual({
      roomId: 'room-1',
      questionId: 'q1',
      totalResponses: 2,
      optionCounts: { '0': 1 },
      options: [{ optionIndex: 0, count: 1, percentage: 50 }]
    })
  })
})
