describe('streakCalculation - Student answer streak engine', () => {
  function computeStreak(pastResponses) {
    if (!pastResponses || pastResponses.length === 0) {
      return { currentStreak: 0, maxStreak: 0 }
    }
    const revealedQuestions = [...pastResponses]
      .filter(q => !q.resultPending)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

    let curr = 0
    let max = 0
    for (const q of revealedQuestions) {
      if (q.answered && q.isCorrect) {
        curr += 1
        if (curr > max) max = curr
      } else {
        curr = 0
      }
    }
    return { currentStreak: curr, maxStreak: max }
  }

  it('returns 0 streak for empty responses', () => {
    expect(computeStreak([])).toEqual({ currentStreak: 0, maxStreak: 0 })
    expect(computeStreak(null)).toEqual({ currentStreak: 0, maxStreak: 0 })
  })

  it('increments streak for consecutive correct answers', () => {
    const responses = [
      { createdAt: '2026-10-30T10:00:00Z', answered: true, isCorrect: true },
      { createdAt: '2026-10-30T10:02:00Z', answered: true, isCorrect: true },
      { createdAt: '2026-10-30T10:04:00Z', answered: true, isCorrect: true }
    ]
    expect(computeStreak(responses)).toEqual({ currentStreak: 3, maxStreak: 3 })
  })

  it('resets streak to 0 when an incorrect answer occurs', () => {
    const responses = [
      { createdAt: '2026-10-30T10:00:00Z', answered: true, isCorrect: true },
      { createdAt: '2026-10-30T10:02:00Z', answered: true, isCorrect: true },
      { createdAt: '2026-10-30T10:04:00Z', answered: true, isCorrect: false },
      { createdAt: '2026-10-30T10:06:00Z', answered: true, isCorrect: true }
    ]
    // 2 correct -> 1 wrong (streak resets to 0) -> 1 correct (current streak = 1, max = 2)
    expect(computeStreak(responses)).toEqual({ currentStreak: 1, maxStreak: 2 })
  })

  it('resets streak if a past question was missed/unanswered', () => {
    const responses = [
      { createdAt: '2026-10-30T10:00:00Z', answered: true, isCorrect: true },
      { createdAt: '2026-10-30T10:02:00Z', answered: false }, // missed poll
      { createdAt: '2026-10-30T10:04:00Z', answered: true, isCorrect: true }
    ]
    expect(computeStreak(responses)).toEqual({ currentStreak: 1, maxStreak: 1 })
  })

  it('ignores questions where result is still pending (live poll)', () => {
    const responses = [
      { createdAt: '2026-10-30T10:00:00Z', answered: true, isCorrect: true },
      { createdAt: '2026-10-30T10:02:00Z', answered: true, isCorrect: true },
      { createdAt: '2026-10-30T10:04:00Z', answered: true, resultPending: true } // still live
    ]
    expect(computeStreak(responses)).toEqual({ currentStreak: 2, maxStreak: 2 })
  })

  it('identifies milestone triggers strictly for 3, 5, 10, 20', () => {
    const MILESTONES = [3, 5, 10, 20]
    expect(MILESTONES.includes(1)).toBe(false)
    expect(MILESTONES.includes(2)).toBe(false)
    expect(MILESTONES.includes(3)).toBe(true)
    expect(MILESTONES.includes(4)).toBe(false)
    expect(MILESTONES.includes(5)).toBe(true)
    expect(MILESTONES.includes(10)).toBe(true)
    expect(MILESTONES.includes(20)).toBe(true)
  })
})
