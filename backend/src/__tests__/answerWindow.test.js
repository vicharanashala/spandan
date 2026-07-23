// Unit tests for the server-side answer-window enforcement (utils/answerWindow.js) used by
// POST /api/responses. Regression coverage for two exploits documented in
// security-poc/leaderboard_bot.mjs:
//   1. Answering a question long after its timeToAnswer window has closed.
//   2. Forging a near-zero responseTime to farm max points regardless of actual reaction time.

const {
  ANSWER_GRACE_S,
  RESPONSE_TIME_SLACK_S,
  secondsSinceLaunch,
  isWithinAnswerWindow,
  resolveResponseTime
} = require('../utils/answerWindow.js')

describe('secondsSinceLaunch', () => {
  it('returns 0 when launchedAt is missing', () => {
    expect(secondsSinceLaunch(null)).toBe(0)
    expect(secondsSinceLaunch(undefined)).toBe(0)
  })

  it('computes elapsed seconds from a Date', () => {
    const now = 1_000_000
    const launchedAt = new Date(now - 10_000) // 10s ago
    expect(secondsSinceLaunch(launchedAt, now)).toBeCloseTo(10, 5)
  })

  it('computes elapsed seconds from an ISO string (as read back from Mongo)', () => {
    const now = Date.now()
    const launchedAt = new Date(now - 5000).toISOString()
    expect(secondsSinceLaunch(launchedAt, now)).toBeCloseTo(5, 1)
  })
})

describe('isWithinAnswerWindow', () => {
  const tta = 30 // typical timeToAnswer

  it('allows a submission within the window', () => {
    expect(isWithinAnswerWindow(0, tta)).toBe(true)
    expect(isWithinAnswerWindow(29, tta)).toBe(true)
  })

  it('allows a submission inside the grace buffer past the window', () => {
    expect(isWithinAnswerWindow(tta + ANSWER_GRACE_S, tta)).toBe(true)
    expect(isWithinAnswerWindow(tta + ANSWER_GRACE_S - 0.01, tta)).toBe(true)
  })

  it('rejects a submission past the window + grace', () => {
    expect(isWithinAnswerWindow(tta + ANSWER_GRACE_S + 0.01, tta)).toBe(false)
  })

  it('rejects the leaderboard_bot.mjs scenario: joining an hour into a live session', () => {
    const elapsedS = 60 * 60 // 1 hour after launch
    expect(isWithinAnswerWindow(elapsedS, tta)).toBe(false)
  })
})

describe('resolveResponseTime', () => {
  it('trusts a plausible client value close to real elapsed time', () => {
    // Legit client: clicked at 12s in, jitter delay adds ~1s network time before it lands.
    const elapsedS = 13
    expect(resolveResponseTime(12, elapsedS)).toBe(12)
  })

  it('floors a forged near-zero responseTime to the real elapsed time (minus the response slack)', () => {
    // security-poc/leaderboard_bot.mjs default: --responseTime=1
    const elapsedS = 20
    const resolved = resolveResponseTime(1, elapsedS)
    expect(resolved).toBe(Math.max(0, elapsedS - RESPONSE_TIME_SLACK_S))
    expect(resolved).toBeGreaterThan(1)
  })

  it('floors a missing/zero responseTime the same way', () => {
    const elapsedS = 25
    expect(resolveResponseTime(undefined, elapsedS)).toBe(elapsedS - RESPONSE_TIME_SLACK_S)
    expect(resolveResponseTime(0, elapsedS)).toBe(elapsedS - RESPONSE_TIME_SLACK_S)
  })

  it('never returns a negative responseTime under clock skew', () => {
    expect(resolveResponseTime(0, -5)).toBe(0)
  })

  it('does not penalize a genuinely instant, honestly-reported answer', () => {
    // Real click at t=0, request lands ~0.2s later — well inside the slack window.
    expect(resolveResponseTime(0, 0.2)).toBe(0)
  })

  it('uses a slack strictly smaller than the deadline grace (they serve different purposes)', () => {
    // The deadline grace tolerates a late *arrival*; the response-time slack bounds how much a
    // claimed *reaction time* may undercut reality. Conflating them (using ANSWER_GRACE_S for
    // both) lets every submission shave a flat multi-second discount off its score regardless of
    // when it actually landed — this asserts the two stay independently tunable and separate.
    expect(RESPONSE_TIME_SLACK_S).toBeLessThan(ANSWER_GRACE_S)
  })
})

describe('end-to-end scoring impact (mirrors the formula in routes/responses.js)', () => {
  function scoreFor(clientResponseTime, launchedAt, tta, maxPoints, now = Date.now()) {
    const elapsedS = secondsSinceLaunch(launchedAt, now)
    if (!isWithinAnswerWindow(elapsedS, tta)) return { rejected: true }
    const respTime = resolveResponseTime(clientResponseTime, elapsedS)
    const timeDecayFactor = Math.max(0.1, Math.max(0, tta - respTime) / tta)
    return { rejected: false, points: Math.round(maxPoints * timeDecayFactor) }
  }

  it('rejects a bot answering a question launched an hour ago, regardless of forged responseTime', () => {
    const launchedAt = new Date(Date.now() - 60 * 60 * 1000)
    const result = scoreFor(1, launchedAt, 30, 100)
    expect(result.rejected).toBe(true)
  })

  it('caps a forged near-zero responseTime far below what it used to earn', () => {
    const now = Date.now()
    const launchedAt = new Date(now - 25_000) // answered with 25s of real elapsed time
    const forged = scoreFor(1, launchedAt, 30, 100, now) // bot claims responseTime=1
    const honest = scoreFor(25, launchedAt, 30, 100, now) // honest student reports the true 25s

    // Before this fix, a forged responseTime=1 against tta=30 scored round(100*(29/30)) = 97 —
    // nearly the maximum, regardless of the 25s that actually elapsed. The floor (elapsedS - grace)
    // caps that: it can still edge out an honest report by at most the grace window's worth of
    // points, never back up near the old 97.
    expect(forged.rejected).toBe(false)
    expect(forged.points).toBeLessThanOrEqual(honest.points + 20)
    expect(forged.points).toBeLessThan(50)
  })
})
