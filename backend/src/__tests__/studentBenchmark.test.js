import { normalizeRoomBenchmarkData, summarizeBenchmark } from '../services/studentBenchmark.js'

describe('student benchmark calculations', () => {
  it('computes a student score against the room cohort using only valid room responses', () => {
    const studentId = 'student-1'
    const roomIds = ['room-1', 'room-2']
    const responses = [
      { roomId: 'room-1', studentId: 'student-1', isCorrect: true },
      { roomId: 'room-1', studentId: 'student-2', isCorrect: false },
      { roomId: 'room-1', studentId: 'student-3', isCorrect: true },
      { roomId: 'room-2', studentId: 'student-1', isCorrect: true },
      { roomId: 'room-2', studentId: 'student-2', isCorrect: true },
      { roomId: 'room-2', studentId: 'student-3', isCorrect: false },
      { roomId: 'room-3', studentId: 'student-1', isCorrect: true }
    ]

    const data = normalizeRoomBenchmarkData(studentId, roomIds, responses)

    expect(data.studentAccuracy).toBeCloseTo(100, 5)
    expect(data.cohortAverage).toBeCloseTo(50, 5)

    const summary = summarizeBenchmark(data.studentAccuracy, data.cohortAverage)
    expect(summary.studentAccuracy).toBe(100)
    expect(summary.cohortAverage).toBe(50)
    expect(summary.delta).toBe(50)
    expect(summary.status).toBe('Above cohort average')
  })
})
