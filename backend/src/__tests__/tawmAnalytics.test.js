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