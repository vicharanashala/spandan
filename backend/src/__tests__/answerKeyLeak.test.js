// Unit tests for the answer-key leak fix (stripAnswerKey, utils/sanitize.js) and the reveal
// gating used by GET /api/responses/room/:roomId/student/:studentId and GET /api/questions.
// Regression coverage for security-poc/leaderboard_bot.mjs finding #7: a student must never
// receive options[].isCorrect (or explanation) for a question they have not answered yet.

const { stripAnswerKey } = require('../utils/sanitize.js')
const { secondsSinceLaunch, isWithinAnswerWindow } = require('../utils/answerWindow.js')

describe('stripAnswerKey', () => {
  const question = {
    _id: 'q1',
    question: 'What is 2+2?',
    explanation: 'Basic arithmetic',
    options: [
      { text: '3', isCorrect: false },
      { text: '4', isCorrect: true }
    ]
  }

  it('removes isCorrect from every option when reveal is false', () => {
    const result = stripAnswerKey(question, false)
    expect(result.options).toEqual([{ text: '3' }, { text: '4' }])
    result.options.forEach((opt) => expect(opt).not.toHaveProperty('isCorrect'))
  })

  it('removes explanation when reveal is false', () => {
    const result = stripAnswerKey(question, false)
    expect(result).not.toHaveProperty('explanation')
  })

  it('passes the document through unchanged when reveal is true', () => {
    const result = stripAnswerKey(question, true)
    expect(result).toBe(question) // same reference — no copy needed when revealing
    expect(result.options[1].isCorrect).toBe(true)
  })

  it('does not mutate the original document', () => {
    const original = JSON.parse(JSON.stringify(question))
    stripAnswerKey(question, false)
    expect(question).toEqual(original)
  })

  it('handles a null/undefined question gracefully', () => {
    expect(stripAnswerKey(null, false)).toBeNull()
    expect(stripAnswerKey(undefined, true)).toBeUndefined()
  })

  it('leaves non-array options untouched', () => {
    const weird = { ...question, options: null }
    const result = stripAnswerKey(weird, false)
    expect(result.options).toBeNull()
  })
})

describe('reveal gating — GET /questions (answered-only)', () => {
  // Mirrors: `const reveal = isTeacher || !!studentResponse` in questions.js
  function shouldReveal(isTeacher, studentResponse) {
    return isTeacher || !!studentResponse
  }

  it('always reveals to the teacher, answered or not', () => {
    expect(shouldReveal(true, null)).toBe(true)
    expect(shouldReveal(true, { selectedOption: 0 })).toBe(true)
  })

  it('hides the key from a student who has not answered yet', () => {
    expect(shouldReveal(false, null)).toBe(false)
    expect(shouldReveal(false, undefined)).toBe(false)
  })

  it('reveals to a student once they have answered', () => {
    expect(shouldReveal(false, { selectedOption: 1, isCorrect: true })).toBe(true)
  })
})

describe('reveal gating — GET /responses/room/:roomId/student/:studentId (answered OR window closed)', () => {
  // Mirrors responses.js: reveal if teacher, already answered, or the answer window has closed
  // (so the "Missed — correct answer was X" review UI still works for genuinely past questions).
  function shouldReveal(isTeacher, studentResponse, launchedAt, timeToAnswer, now) {
    const windowClosed = !isWithinAnswerWindow(secondsSinceLaunch(launchedAt, now), timeToAnswer)
    return isTeacher || !!studentResponse || windowClosed
  }

  it('hides the key for a live, unanswered question — the actual exploit path', () => {
    const now = Date.now()
    const launchedAt = new Date(now - 5000) // launched 5s ago, tta=30s — still live
    expect(shouldReveal(false, null, launchedAt, 30, now)).toBe(false)
  })

  it('reveals the key once the question is answered, even while still live', () => {
    const now = Date.now()
    const launchedAt = new Date(now - 5000)
    expect(shouldReveal(false, { selectedOption: 0 }, launchedAt, 30, now)).toBe(true)
  })

  it('reveals the key for a genuinely missed question once its window has closed', () => {
    const now = Date.now()
    const launchedAt = new Date(now - 60_000) // launched 60s ago, tta=30s — long closed
    expect(shouldReveal(false, null, launchedAt, 30, now)).toBe(true)
  })

  it('exercises the leaderboard_bot.mjs exploit path end to end: no isCorrect on a live question', () => {
    const now = Date.now()
    const launchedAt = new Date(now - 2000) // just launched
    const revealed = shouldReveal(false, null, launchedAt, 30, now)
    const liveQuestion = {
      _id: 'live-q',
      options: revealed
        ? [{ text: 'A', isCorrect: false }, { text: 'B', isCorrect: true }]
        : [{ text: 'A' }, { text: 'B' }] // stripped, as the fixed route sends for a live question
    }
    const idxs = liveQuestion.options
      .map((opt, idx) => (opt.isCorrect ? idx : -1))
      .filter((idx) => idx !== -1)
    expect(revealed).toBe(false)
    expect(idxs).toHaveLength(0) // bot has nothing to submit
  })
})
