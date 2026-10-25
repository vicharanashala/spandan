// Student dashboard "Earned points": earned ÷ the answered questions' own maximum points, never above 100%.
import { earnedPercent } from '../services/studentStats.js'

const r = (questionId, points) => ({ questionId, points })

describe('earnedPercent', () => {
  it('divides by each question\'s own points, not answered × 100', () => {
    // 9 questions worth 100 + one worth 1000; 1429 earned. The old formula showed 1429 / 1000 = 143%.
    const max = new Map([...Array.from({ length: 9 }, (_, i) => [`q${i}`, 100]), ['big', 1000]])
    const responses = [...Array.from({ length: 9 }, (_, i) => r(`q${i}`, i === 0 ? 0 : 90)), r('big', 709)]
    expect(earnedPercent(responses, max)).toBe(75) // 1429 / 1900
  })

  it('lets a perfect score reach 100% when questions are worth less than 100', () => {
    expect(earnedPercent([r('a', 50), r('b', 50)], new Map([['a', 50], ['b', 50]]))).toBe(100)
  })

  it('counts a deleted question as 100 points and caps at 100%', () => {
    expect(earnedPercent([r('gone', 80)], new Map())).toBe(80)
    expect(earnedPercent([r('a', 600)], new Map([['a', 500]]))).toBe(100)
  })

  it('is 0 with no answers', () => {
    expect(earnedPercent([], new Map())).toBe(0)
  })
})
