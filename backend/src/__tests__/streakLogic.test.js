/**
 * Streak Fire — pure-function tests for streak math.
 *
 * Current spec:
 *   - correct -> currentStreak += 2
 *   - wrong   -> currentStreak -= 3, floored at 0
 *   - missed question -> no-op (route handler handles freeze separately)
 *   - bestStreak = max(bestStreak, currentStreak) AFTER each update (never decreases)
 */
import { applyAnswer, applyMissedQuestion } from '../services/streakService.js'

describe('Streak Fire - applyAnswer', () => {
  test('first correct answer -> currentStreak=2, bestStreak=2, event=increment', () => {
    const r = applyAnswer({ currentStreak: 0, bestStreak: 0 }, true)
    expect(r).toEqual({ currentStreak: 2, bestStreak: 2, changed: true, event: 'increment' })
  })

  test('consecutive correct answers keep incrementing by +2 and lift bestStreak', () => {
    let s = { currentStreak: 0, bestStreak: 0 }
    s = { ...s, ...applyAnswer(s, true) } // 2
    expect(s.currentStreak).toBe(2)
    expect(s.bestStreak).toBe(2)

    s = { ...s, ...applyAnswer(s, true) } // 4
    expect(s.currentStreak).toBe(4)
    expect(s.bestStreak).toBe(4)

    s = { ...s, ...applyAnswer(s, true) } // 6
    expect(s.currentStreak).toBe(6)
    expect(s.bestStreak).toBe(6)
  })

  test('correct after a long pause rebuilds from +2, bestStreak is preserved', () => {
    let s = { currentStreak: 0, bestStreak: 10 }
    s = { ...s, ...applyAnswer(s, true) } // 2
    expect(s.currentStreak).toBe(2)
    expect(s.bestStreak).toBe(10) // best preserved (and 2 < 10 so it stays)
  })

  test('wrong answer subtracts 3 (floored at 0); event=decrement when there was something to lose', () => {
    const r = applyAnswer({ currentStreak: 4, bestStreak: 7 }, false)
    expect(r).toEqual({ currentStreak: 1, bestStreak: 7, changed: true, event: 'decrement' })
  })

  test('wrong answer at streak 1 -> floored to 0, event=decrement', () => {
    const r = applyAnswer({ currentStreak: 1, bestStreak: 5 }, false)
    expect(r).toEqual({ currentStreak: 0, bestStreak: 5, changed: true, event: 'decrement' })
  })

  test('wrong answer when streak is already 0 -> event=noop, bestStreak unchanged', () => {
    const r = applyAnswer({ currentStreak: 0, bestStreak: 3 }, false)
    expect(r).toEqual({ currentStreak: 0, bestStreak: 3, changed: false, event: 'noop' })
  })

  test('bestStreak never decreases, even after a decrement', () => {
    const r = applyAnswer({ currentStreak: 12, bestStreak: 12 }, false)
    expect(r.bestStreak).toBe(12)
    expect(r.currentStreak).toBe(9) // 12 - 3
  })

  test('handles missing fields defensively', () => {
    const r = applyAnswer({}, true)
    expect(r.currentStreak).toBe(2)
    expect(r.bestStreak).toBe(2)
  })
})

describe('Streak Fire - applyMissedQuestion', () => {
  test('missed question is a no-op regardless of current streak', () => {
    const r = applyMissedQuestion({ currentStreak: 5, bestStreak: 5 })
    expect(r).toEqual({ currentStreak: 5, bestStreak: 5, changed: false, event: 'noop' })
  })

  test('missed question with no active streak is also a no-op', () => {
    const r = applyMissedQuestion({ currentStreak: 0, bestStreak: 7 })
    expect(r).toEqual({ currentStreak: 0, bestStreak: 7, changed: false, event: 'noop' })
  })

  test('missed question at high streak preserves both fields', () => {
    const r = applyMissedQuestion({ currentStreak: 12, bestStreak: 12 })
    expect(r.bestStreak).toBe(12)
    expect(r.currentStreak).toBe(12)
  })
})

describe('Streak Fire - sequence simulation', () => {
  // applyAnswer/applyMissedQuestion return { currentStreak, bestStreak, changed, event }.
  // These sequence tests only care about the two numeric state fields.
  const step = (s, c) => {
    const r = c === 'miss' ? applyMissedQuestion(s) : applyAnswer(s, c)
    return { currentStreak: r.currentStreak, bestStreak: r.bestStreak }
  }

  test('correct x3 -> current 6, best 6', () => {
    let s = { currentStreak: 0, bestStreak: 0 }
    ;[true, true, true].forEach(c => { s = step(s, c) }) // 2, 4, 6
    expect(s).toEqual({ currentStreak: 6, bestStreak: 6 })
  })

  test('correct x2, wrong -> current 1 (4 - 3), best 4', () => {
    let s = { currentStreak: 0, bestStreak: 0 }
    ;[true, true].forEach(c => { s = step(s, c) }) // 2, 4
    s = step(s, false)                              // 1
    expect(s).toEqual({ currentStreak: 1, bestStreak: 4 })
  })

  test('correct, missed, correct -> current 4 (2 + skip noop + 2), best 4', () => {
    let s = { currentStreak: 0, bestStreak: 0 }
    s = step(s, true)   // 2
    s = step(s, 'miss') // noop (skipped questions don't touch counter)
    s = step(s, true)   // 4
    expect(s).toEqual({ currentStreak: 4, bestStreak: 4 })
  })

  test('correct x3 (streak 6), wrong x2 (6-3-3=0), correct -> current 2, best 6', () => {
    let s = { currentStreak: 0, bestStreak: 0 }
    ;[true,true,true].forEach(c => { s = step(s, c) }) // 2, 4, 6
    s = step(s, false)                                  // 3
    s = step(s, false)                                  // 0
    s = step(s, true)                                   // 2
    expect(s).toEqual({ currentStreak: 2, bestStreak: 6 })
  })

  test('wrong at streak 1 -> floored to 0, not negative', () => {
    let s = { currentStreak: 0, bestStreak: 0 }
    s = step(s, true)   // 2
    s = step(s, false)  // max(0, 2-3) = 0 (not -1)
    expect(s).toEqual({ currentStreak: 0, bestStreak: 2 })
  })
})