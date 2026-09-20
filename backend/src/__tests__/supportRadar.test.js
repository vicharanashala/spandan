import { computeSupportRadar } from '../services/supportRadar.js'

describe('computeSupportRadar', () => {
  it('assigns tiers and clears a streak after a correct answer', () => {
    const responses = [
      { _id: 'a-2', studentId: 'student-a', createdAt: '2026-01-01T00:00:02Z', isCorrect: false },
      { _id: 'a-1', studentId: 'student-a', createdAt: '2026-01-01T00:00:01Z', isCorrect: false },
      { _id: 'b-1', studentId: 'student-b', createdAt: '2026-01-01T00:00:01Z', isCorrect: false },
      { _id: 'b-2', studentId: 'student-b', createdAt: '2026-01-01T00:00:02Z', isCorrect: false },
      { _id: 'b-3', studentId: 'student-b', createdAt: '2026-01-01T00:00:03Z', isCorrect: false },
      { _id: 'b-4', studentId: 'student-b', createdAt: '2026-01-01T00:00:04Z', isCorrect: false },
      { _id: 'b-5', studentId: 'student-b', createdAt: '2026-01-01T00:00:05Z', isCorrect: true },
      { _id: 'b-6', studentId: 'student-b', createdAt: '2026-01-01T00:00:06Z', isCorrect: false }
    ]

    expect(computeSupportRadar(responses)).toEqual([
      { studentId: 'student-a', tier: 'Watch' }
    ])
  })

  it('uses _id to break createdAt ties and caps the tier at Needs Help', () => {
    const responses = [
      { _id: '2', studentId: 'student-a', createdAt: '2026-01-01T00:00:00Z', isCorrect: false },
      { _id: '1', studentId: 'student-a', createdAt: '2026-01-01T00:00:00Z', isCorrect: true },
      { _id: '4', studentId: 'student-a', createdAt: '2026-01-01T00:00:01Z', isCorrect: false },
      { _id: '5', studentId: 'student-a', createdAt: '2026-01-01T00:00:02Z', isCorrect: false },
      { _id: '6', studentId: 'student-a', createdAt: '2026-01-01T00:00:03Z', isCorrect: false },
      { _id: '7', studentId: 'student-a', createdAt: '2026-01-01T00:00:04Z', isCorrect: false }
    ]

    expect(computeSupportRadar(responses)).toEqual([
      { studentId: 'student-a', tier: 'Needs Help' }
    ])
  })
})
