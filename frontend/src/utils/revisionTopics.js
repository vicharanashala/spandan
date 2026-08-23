export function getTopRevisionTopics(questions, limit = 3) {
  const topics = new Map()

  for (const question of questions || []) {
    if (!question?.answered || question.isCorrect !== false) continue

    const topic = typeof question.topic === 'string' ? question.topic.trim() : ''
    if (!topic) continue

    const existing = topics.get(topic)
    if (existing) {
      existing.missedCount += 1
    } else {
      topics.set(topic, { topic, missedCount: 1, firstOccurrence: topics.size })
    }
  }

  return [...topics.values()]
    .sort((a, b) => b.missedCount - a.missedCount || a.firstOccurrence - b.firstOccurrence)
    .slice(0, limit)
    .map(({ firstOccurrence, ...item }) => item)
}
