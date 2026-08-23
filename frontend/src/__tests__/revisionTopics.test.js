import { getTopRevisionTopics } from '../utils/revisionTopics'

const wrong = (topic) => ({ answered: true, isCorrect: false, topic })
const correct = (topic) => ({ answered: true, isCorrect: true, topic })

describe('getTopRevisionTopics', () => {
  it('groups incorrect answers by topic and counts mistakes', () => {
    expect(getTopRevisionTopics([
      wrong('Backpropagation'),
      wrong('Backpropagation'),
      wrong('Gradient Descent')
    ])).toEqual([
      { topic: 'Backpropagation', missedCount: 2 },
      { topic: 'Gradient Descent', missedCount: 1 }
    ])
  })

  it('returns only the three topics with the most mistakes', () => {
    const questions = [
      ...Array(5).fill(null).map(() => wrong('A')),
      ...Array(3).fill(null).map(() => wrong('B')),
      ...Array(2).fill(null).map(() => wrong('C')),
      wrong('D')
    ]
    expect(getTopRevisionTopics(questions).map((item) => item.topic)).toEqual(['A', 'B', 'C'])
  })

  it('returns an empty list when every answer is correct', () => {
    expect(getTopRevisionTopics([correct('A'), correct('B')])).toEqual([])
  })

  it('ignores missing, null, and blank topics safely', () => {
    expect(getTopRevisionTopics([wrong(), wrong(null), wrong('  '), wrong('Valid')]))
      .toEqual([{ topic: 'Valid', missedCount: 1 }])
  })

  it('preserves first occurrence order when mistake counts tie', () => {
    expect(getTopRevisionTopics([wrong('Second'), wrong('First')]).map((item) => item.topic))
      .toEqual(['Second', 'First'])
  })
})
