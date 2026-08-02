// Unit tests for TAWM topic aggregation logic
describe('TAWM Topic Aggregation Logic', () => {

  function calculateTopicStats(responses) {
    const topicMap = {}
    
    responses.forEach(r => {
      const topic = r.topic || 'Untagged'
      if (!topicMap[topic]) {
        topicMap[topic] = {
          topic,
          responseCount: 0,
          correctCount: 0,
          totalPoints: 0,
          totalTime: 0
        }
      }
      topicMap[topic].responseCount += 1
      if (r.isCorrect) topicMap[topic].correctCount += 1
      topicMap[topic].totalPoints += r.points || 0
      topicMap[topic].totalTime += r.responseTime || 0
    })
    
    return Object.values(topicMap).map(t => ({
      ...t,
      correctRate: t.responseCount > 0 ? Math.round((t.correctCount / t.responseCount) * 100) : 0,
      avgResponseTime: t.responseCount > 0 ? Math.round(t.totalTime / t.responseCount) : 0,
      status: t.responseCount > 0 && (t.correctCount / t.responseCount) >= 0.7 ? 'strong' :
              t.responseCount > 0 && (t.correctCount / t.responseCount) >= 0.4 ? 'improving' : 'weak'
    }))
  }

  it('should group responses by topic', () => {
    const responses = [
      { topic: 'Math', isCorrect: true, points: 100, responseTime: 5 },
      { topic: 'Math', isCorrect: false, points: 0, responseTime: 10 },
      { topic: 'Science', isCorrect: true, points: 90, responseTime: 8 }
    ]
    const result = calculateTopicStats(responses)
    expect(result).toHaveLength(2)
    expect(result.find(t => t.topic === 'Math').responseCount).toBe(2)
    expect(result.find(t => t.topic === 'Science').responseCount).toBe(1)
  })

  it('should mark untagged responses as Untagged', () => {
    const responses = [{ isCorrect: true, points: 100, responseTime: 5 }]
    const result = calculateTopicStats(responses)
    expect(result[0].topic).toBe('Untagged')
  })

  it('should classify strong vs weak correctly', () => {
    const responses = [
      { topic: 'Strong', isCorrect: true, points: 100, responseTime: 5 },
      { topic: 'Strong', isCorrect: true, points: 100, responseTime: 5 },
      { topic: 'Strong', isCorrect: true, points: 100, responseTime: 5 },
      { topic: 'Weak', isCorrect: false, points: 0, responseTime: 10 },
      { topic: 'Weak', isCorrect: false, points: 0, responseTime: 10 }
    ]
    const result = calculateTopicStats(responses)
    expect(result.find(t => t.topic === 'Strong').status).toBe('strong')
    expect(result.find(t => t.topic === 'Weak').status).toBe('weak')
  })

  it('should handle empty response array', () => {
    const result = calculateTopicStats([])
    expect(result).toHaveLength(0)
  })
})

// Room-scoping tests: verify that filtering by roomId correctly excludes other rooms' data
describe('TAWM Room Scoping Logic', () => {

  const ROOM_A = 'roomA'
  const ROOM_B = 'roomB'

  // Simulates the server-side $match filter applied when roomId is supplied
  function calculateTopicStatsForRoom(allResponses, roomId) {
    const scoped = roomId
      ? allResponses.filter(r => r.roomId === roomId)
      : allResponses
    const topicMap = {}
    scoped.forEach(r => {
      const topic = r.topic || 'Untagged'
      if (!topicMap[topic]) topicMap[topic] = { topic, totalQuestions: 0, correctCount: 0 }
      topicMap[topic].totalQuestions += 1
      if (r.isCorrect) topicMap[topic].correctCount += 1
    })
    return Object.values(topicMap).map(t => ({
      ...t,
      correctRate: t.totalQuestions > 0 ? Math.round((t.correctCount / t.totalQuestions) * 100) : 0,
      status: (t.correctCount / t.totalQuestions) >= 0.7 ? 'strong'
            : (t.correctCount / t.totalQuestions) >= 0.4 ? 'improving'
            : 'weak'
    }))
  }

  const allResponses = [
    { roomId: ROOM_A, topic: 'Math',    isCorrect: true  },
    { roomId: ROOM_A, topic: 'Math',    isCorrect: true  },
    { roomId: ROOM_A, topic: 'Math',    isCorrect: false },
    { roomId: ROOM_B, topic: 'Science', isCorrect: false },
    { roomId: ROOM_B, topic: 'Science', isCorrect: false },
  ]

  it('should exclude responses from other rooms when roomId is specified', () => {
    const result = calculateTopicStatsForRoom(allResponses, ROOM_A)
    const topics = result.map(t => t.topic)
    expect(topics).toContain('Math')
    expect(topics).not.toContain('Science')
  })

  it('should include only responses from the queried room with correct aggregation', () => {
    const result = calculateTopicStatsForRoom(allResponses, ROOM_A)
    expect(result).toHaveLength(1)
    const math = result[0]
    expect(math.totalQuestions).toBe(3)
    expect(math.correctCount).toBe(2)
    expect(math.correctRate).toBe(67)
    expect(math.status).toBe('improving')
  })

  it('should aggregate across all rooms when no roomId is given', () => {
    const result = calculateTopicStatsForRoom(allResponses, null)
    const topics = result.map(t => t.topic)
    expect(topics).toContain('Math')
    expect(topics).toContain('Science')
    expect(result).toHaveLength(2)
  })

  it('should return empty when student has no responses in the queried room', () => {
    const result = calculateTopicStatsForRoom(allResponses, 'roomC')
    expect(result).toHaveLength(0)
  })
})

// Authorization simulation: membership check that guards the scoped endpoint
describe('TAWM Membership Authorization', () => {

  // Simulates the server-side guard: when roomId is provided, student must be a member
  function checkMembership(memberRoomIds, requestedRoomId) {
    if (!requestedRoomId) return { allowed: true }
    if (!memberRoomIds.includes(requestedRoomId)) {
      return { allowed: false, status: 403, error: 'Not a member of this room' }
    }
    return { allowed: true }
  }

  it('should allow access when student is a member of the requested room', () => {
    const result = checkMembership(['roomA', 'roomB'], 'roomA')
    expect(result.allowed).toBe(true)
  })

  it('should deny access with 403 when student is NOT a member of the requested room', () => {
    const result = checkMembership(['roomA'], 'roomZ')
    expect(result.allowed).toBe(false)
    expect(result.status).toBe(403)
    expect(result.error).toBe('Not a member of this room')
  })

  it('should allow access when no roomId is provided (global endpoint, no membership check)', () => {
    const result = checkMembership([], null)
    expect(result.allowed).toBe(true)
  })
})