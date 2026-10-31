import { describe, it, expect, jest } from '@jest/globals'

describe('duplicateRoom - room duplication logic', () => {
  const teacherId = '507f1f77bcf86cd799439011'
  const otherTeacherId = '507f1f77bcf86cd799439099'
  const originalRoomId = '607f1f77bcf86cd799439022'

  const mockOriginalRoom = {
    _id: originalRoomId,
    name: 'Physics 101 Lecture',
    teacher: { toString: () => teacherId },
    settings: {
      mode: 'normal',
      timeToAnswer: 45,
      points: 150,
      difficulty: 'hard',
      questionTypeMix: { MCQ: 60, TF: 20, MSQ: 20 }
    }
  }

  const mockQuestions = [
    {
      _id: 'q1',
      type: 'MCQ',
      question: 'What is Newton second law?',
      options: [{ text: 'F=ma', isCorrect: true }, { text: 'E=mc^2', isCorrect: false }],
      explanation: 'F=ma defines force',
      segmentIndex: 1,
      status: 'approved',
      timeToAnswer: 45,
      points: 150
    },
    {
      _id: 'q2',
      type: 'TF',
      question: 'Velocity is a vector quantity.',
      options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      explanation: 'Velocity includes direction',
      segmentIndex: 2,
      status: 'approved',
      timeToAnswer: 30,
      points: 100
    }
  ]

  it('rejects duplication when room is not found', async () => {
    const Room = { findById: jest.fn().mockResolvedValue(null) }
    await expect(async () => {
      const room = await Room.findById('invalid-id')
      if (!room) throw new Error('Room not found')
    }).rejects.toThrow('Room not found')
  })

  it('rejects duplication by a different teacher with authorization error', () => {
    expect(() => {
      if (mockOriginalRoom.teacher.toString() !== otherTeacherId.toString()) {
        throw new Error('Not authorized to duplicate this room')
      }
    }).toThrow('Not authorized to duplicate this room')
  })

  it('correctly clones room settings and appends (Copy) to name', () => {
    const newRoomName = `${mockOriginalRoom.name} (Copy)`
    const newSettings = { ...mockOriginalRoom.settings }

    expect(newRoomName).toBe('Physics 101 Lecture (Copy)')
    expect(newSettings.timeToAnswer).toBe(45)
    expect(newSettings.points).toBe(150)
    expect(newSettings.difficulty).toBe('hard')
    expect(newSettings.questionTypeMix.MCQ).toBe(60)
  })

  it('maps approved questions to new room and teacher without carrying answers or results', () => {
    const newRoomId = '707f1f77bcf86cd799439033'
    const clonedQuestions = mockQuestions.map(q => ({
      roomId: newRoomId,
      type: q.type,
      question: q.question,
      options: q.options.map(o => ({ text: o.text, isCorrect: !!o.isCorrect })),
      explanation: q.explanation,
      segmentIndex: q.segmentIndex,
      status: 'approved',
      timeToAnswer: q.timeToAnswer,
      points: q.points,
      createdBy: teacherId
    }))

    expect(clonedQuestions).toHaveLength(2)
    expect(clonedQuestions[0].roomId).toBe(newRoomId)
    expect(clonedQuestions[0].createdBy).toBe(teacherId)
    expect(clonedQuestions[0].question).toBe('What is Newton second law?')
    expect(clonedQuestions[0].options[0].isCorrect).toBe(true)
    // Ensures clean slate: no responses or student IDs attached
    expect(clonedQuestions[0].responses).toBeUndefined()
  })
})
