describe('Doubt Box and Confused feature logic', () => {
  describe('Confused flag handling', () => {
    test('student answer payload correctly preserves isConfused flag', () => {
      const createResponsePayload = ({ questionId, studentId, selectedOptions, isConfused }) => ({
        questionId,
        studentId,
        selectedOptions,
        isConfused: Boolean(isConfused)
      })

      const normalPayload = createResponsePayload({
        questionId: 'q1',
        studentId: 's1',
        selectedOptions: ['opt_a'],
        isConfused: false
      })
      expect(normalPayload.isConfused).toBe(false)

      const confusedPayload = createResponsePayload({
        questionId: 'q1',
        studentId: 's2',
        selectedOptions: ['opt_b'],
        isConfused: true
      })
      expect(confusedPayload.isConfused).toBe(true)
    })

    test('aggregates confused counts per question correctly', () => {
      const responses = [
        { questionId: 'q1', isConfused: true },
        { questionId: 'q1', isConfused: false },
        { questionId: 'q1', isConfused: true },
        { questionId: 'q2', isConfused: true },
        { questionId: 'q3', isConfused: false }
      ]

      const confusedCounts = {}
      for (const r of responses) {
        if (r.isConfused) {
          confusedCounts[r.questionId] = (confusedCounts[r.questionId] || 0) + 1
        }
      }

      expect(confusedCounts['q1']).toBe(2)
      expect(confusedCounts['q2']).toBe(1)
      expect(confusedCounts['q3']).toBeUndefined()
    })
  })

  describe('Doubt Box upvoting and filtering', () => {
    test('idempotent upvote ensures a second tap does not raise the count', () => {
      const applyIdempotentUpvote = (doubt, userId) => {
        const hasUpvoted = doubt.upvotes.includes(userId)
        if (hasUpvoted) return doubt // idempotent: no increase
        const updatedUpvotes = [...doubt.upvotes, userId]
        return {
          ...doubt,
          upvotes: updatedUpvotes,
          upvoteCount: updatedUpvotes.length
        }
      }

      let doubt = {
        _id: 'd1',
        text: 'Can you please explain question 3 again?',
        upvotes: ['u1'],
        upvoteCount: 1,
        isResolved: false
      }

      // First upvote from u2 -> count increments to 2
      doubt = applyIdempotentUpvote(doubt, 'u2')
      expect(doubt.upvoteCount).toBe(2)
      expect(doubt.upvotes).toContain('u2')

      // Second tap from u2 -> count remains 2 (idempotent, does not raise count)
      doubt = applyIdempotentUpvote(doubt, 'u2')
      expect(doubt.upvoteCount).toBe(2)
    })

    test('sorts by most upvoted first, with oldest-first on ties', () => {
      const doubts = [
        { _id: 'd1', text: 'Doubt 1', upvoteCount: 5, createdAt: new Date('2026-10-31T10:05:00Z'), isResolved: false },
        { _id: 'd2', text: 'Doubt 2 (older with 5)', upvoteCount: 5, createdAt: new Date('2026-10-31T10:01:00Z'), isResolved: false },
        { _id: 'd3', text: 'Doubt 3 (most)', upvoteCount: 8, createdAt: new Date('2026-10-31T10:10:00Z'), isResolved: false },
        { _id: 'd4', text: 'Doubt 4 (fewest)', upvoteCount: 1, createdAt: new Date('2026-10-31T10:02:00Z'), isResolved: false }
      ]

      // Sort: Most upvoted first, oldest first on ties (ascending createdAt)
      const sorted = [...doubts].sort((a, b) => (b.upvoteCount - a.upvoteCount) || (new Date(a.createdAt) - new Date(b.createdAt)))
      expect(sorted[0]._id).toBe('d3') // 8 votes
      expect(sorted[1]._id).toBe('d2') // 5 votes (older, 10:01)
      expect(sorted[2]._id).toBe('d1') // 5 votes (newer, 10:05)
      expect(sorted[3]._id).toBe('d4') // 1 vote
    })

    test('anonymization invariant: payload never leaks studentId or upvoter list', () => {
      const rawDbRecord = {
        _id: 'doubt_123',
        roomId: 'room_abc',
        studentId: 'secret_student_author_456',
        text: 'Will this theorem be on the midterm?',
        upvotes: ['secret_student_author_456', 'student_peer_789'],
        upvoteCount: 2,
        isResolved: false,
        createdAt: new Date()
      }

      const currentViewerId = 'student_peer_789'
      const sanitizeDoubtForApi = (d, viewerId) => ({
        _id: d._id,
        text: d.text,
        upvoteCount: d.upvoteCount || 0,
        isResolved: !!d.isResolved,
        createdAt: d.createdAt,
        hasUpvoted: (d.upvotes || []).includes(viewerId)
      })

      const clientPayload = sanitizeDoubtForApi(rawDbRecord, currentViewerId)
      expect(clientPayload.studentId).toBeUndefined()
      expect(clientPayload.authorId).toBeUndefined()
      expect(clientPayload.upvotes).toBeUndefined()
      expect(clientPayload.hasUpvoted).toBe(true)
      expect(clientPayload.upvoteCount).toBe(2)
      expect(clientPayload.text).toBe('Will this theorem be on the midterm?')
    })
  })
})
