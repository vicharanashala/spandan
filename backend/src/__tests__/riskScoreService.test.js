// Pure-logic tests for riskScoreService.
// Follows the existing convention in msqCorrectness.test.js:
// import pure functions, assert on their outputs. No DB, no sockets.

import {
  zoneFromScore,
  streakNeededFromScore,
  computeEventDelta,
  computeLatencyPenalty,
  computeRiskUpdate,
  aggregateHistoryIntoDailyBuckets,
  rangeToDays,
  SAFE_THRESHOLD,
  WARNING_THRESHOLD,
  SKIP_PENALTY,
  WRONG_PENALTY,
  CORRECT_REWARD
} from '../services/riskScoreService.js'

describe('zoneFromScore', () => {
  test('safe at and above safe threshold', () => {
    expect(zoneFromScore(SAFE_THRESHOLD)).toBe('safe')
    expect(zoneFromScore(100)).toBe('safe')
  })
  test('warning between warning threshold and safe threshold', () => {
    expect(zoneFromScore(WARNING_THRESHOLD)).toBe('warning')
    expect(zoneFromScore(SAFE_THRESHOLD - 1)).toBe('warning')
  })
  test('risk below warning threshold', () => {
    expect(zoneFromScore(WARNING_THRESHOLD - 1)).toBe('risk')
    expect(zoneFromScore(0)).toBe('risk')
  })
})

describe('streakNeededFromScore', () => {
  test('zero when already safe', () => {
    expect(streakNeededFromScore(SAFE_THRESHOLD)).toBe(0)
    expect(streakNeededFromScore(100)).toBe(0)
  })
  test('at least 1 when below safe', () => {
    expect(streakNeededFromScore(SAFE_THRESHOLD - 1)).toBeGreaterThanOrEqual(1)
    expect(streakNeededFromScore(0)).toBeGreaterThanOrEqual(1)
  })
  test('capped at sane upper bound (20)', () => {
    expect(streakNeededFromScore(0)).toBeLessThanOrEqual(20)
  })
})

describe('computeEventDelta', () => {
  test('correct gives positive reward', () => {
    expect(computeEventDelta({ type: 'correct' })).toBe(CORRECT_REWARD)
    expect(CORRECT_REWARD).toBeGreaterThan(0)
  })
  test('wrong gives negative penalty', () => {
    expect(computeEventDelta({ type: 'wrong' })).toBe(WRONG_PENALTY)
    expect(WRONG_PENALTY).toBeLessThan(0)
  })
  test('skip gives larger (more negative) penalty than wrong', () => {
    // The spec's central rule: SKIP_PENALTY must be more negative than WRONG_PENALTY.
    expect(SKIP_PENALTY).toBeLessThan(WRONG_PENALTY)
    expect(computeEventDelta({ type: 'skip' })).toBeLessThan(computeEventDelta({ type: 'wrong' }))
  })
  test('unknown type returns 0 (defensive)', () => {
    expect(computeEventDelta({ type: 'wat' })).toBe(0)
    expect(computeEventDelta(null)).toBe(0)
  })
})

describe('computeLatencyPenalty', () => {
  test('fast answer incurs no penalty', () => {
    expect(computeLatencyPenalty(2000, 30000)).toBe(0)         // 2s of 30s
    expect(computeLatencyPenalty(100, 30000)).toBe(0)          // 0.1s
  })
  test('slow answer incurs penalty capped at threshold', () => {
    const slow = computeLatencyPenalty(60000, 30000)            // 60s vs 30s
    const verySlow = computeLatencyPenalty(600000, 30000)       // 10 min
    expect(slow).toBeLessThan(0)
    expect(verySlow).toBe(slow)                                 // capped
  })
  test('returns 0 when timing info missing', () => {
    expect(computeLatencyPenalty(null, 30000)).toBe(0)
    expect(computeLatencyPenalty(2000, null)).toBe(0)
  })
})

describe('computeRiskUpdate (integration of the pure math)', () => {
  test('first correct answer on a fresh student moves them toward safe', () => {
    const result = computeRiskUpdate(null, { type: 'correct', questionId: 'q1', responseTimeMs: 1000, timeToAnswerMs: 30000 })
    // prior was 100, correct bonus pushes the blend upward but decay keeps it modest
    expect(result.newScore).toBeGreaterThan(100 - 0.001) // bounded at 100
    expect(result.newScore).toBeLessThanOrEqual(100)
    expect(result.newZone).toBe('safe')
    expect(result.correctStreakNeeded).toBe(0)
  })

  test('skip reduces score more than wrong at same starting point', () => {
    const start = { currentScore: 80, zone: 'safe', history: [], lastUpdated: new Date() }
    const wrongResult = computeRiskUpdate(start, { type: 'wrong', questionId: 'q1', responseTimeMs: 1000, timeToAnswerMs: 30000 })
    const skipResult  = computeRiskUpdate(start, { type: 'skip',  questionId: 'q1' })
    expect(skipResult.newScore).toBeLessThan(wrongResult.newScore)
  })

  test('zone transitions: enough wrongs cross into warning, then risk', () => {
    let state = null
    for (let i = 0; i < 80; i++) {
      const u = computeRiskUpdate(state, { type: 'wrong', questionId: `q${i}`, responseTimeMs: 1000, timeToAnswerMs: 30000 })
      state = { currentScore: u.newScore, zone: u.newZone, history: [], lastUpdated: new Date() }
      if (state.zone === 'risk') break
    }
    expect(state.zone).toBe('risk')
    expect(state.currentScore).toBeLessThan(WARNING_THRESHOLD)
  })

  test('improving student trends upward (recent events dominate over ancient history)', () => {
    // Start the student badly.
    let state = null
    for (let i = 0; i < 8; i++) {
      const u = computeRiskUpdate(state, { type: 'wrong', questionId: `q${i}`, responseTimeMs: 1000, timeToAnswerMs: 30000 })
      state = { currentScore: u.newScore, zone: u.newZone, history: [], lastUpdated: new Date() }
    }
    const scoreAfterBadStreak = state.currentScore

    // Now the student starts getting everything right.
    for (let i = 0; i < 10; i++) {
      const u = computeRiskUpdate(state, { type: 'correct', questionId: `r${i}`, responseTimeMs: 1000, timeToAnswerMs: 30000 })
      state = { currentScore: u.newScore, zone: u.newZone, history: [], lastUpdated: new Date() }
    }
    expect(state.currentScore).toBeGreaterThan(scoreAfterBadStreak)
    expect(state.zone).toBe('safe')
  })

  test('correctStreakNeeded is set when not safe, zero when safe', () => {
    const lowState = { currentScore: 30, zone: 'risk', history: [], lastUpdated: new Date() }
    const r = computeRiskUpdate(lowState, { type: 'wrong', questionId: 'q1', responseTimeMs: 1000, timeToAnswerMs: 30000 })
    expect(r.correctStreakNeeded).toBeGreaterThan(0)

    const safeState = { currentScore: 90, zone: 'safe', history: [], lastUpdated: new Date() }
    const r2 = computeRiskUpdate(safeState, { type: 'correct', questionId: 'q2', responseTimeMs: 1000, timeToAnswerMs: 30000 })
    expect(r2.correctStreakNeeded).toBe(0)
  })

  test('history entry is populated correctly', () => {
    const result = computeRiskUpdate(null, { type: 'skip', questionId: 'abc123' })
    expect(result.historyEntry.questionId).toBe('abc123')
    expect(result.historyEntry.skipped).toBe(true)
    expect(result.historyEntry.answeredCorrectly).toBe(false)
    expect(result.historyEntry.scoreAfter).toBe(result.newScore)
    expect(result.historyEntry.timestamp).toBeInstanceOf(Date)
  })

  test('score is clamped to 0-100', () => {
    let state = null
    // Drive it to zero with many skips.
    for (let i = 0; i < 40; i++) {
      const u = computeRiskUpdate(state, { type: 'skip', questionId: `s${i}` })
      state = { currentScore: u.newScore, zone: u.newZone, history: [], lastUpdated: new Date() }
    }
    expect(state.currentScore).toBeGreaterThanOrEqual(0)

    // Drive it up with many correct.
    for (let i = 0; i < 40; i++) {
      const u = computeRiskUpdate(state, { type: 'correct', questionId: `c${i}`, responseTimeMs: 1000, timeToAnswerMs: 30000 })
      state = { currentScore: u.newScore, zone: u.newZone, history: [], lastUpdated: new Date() }
    }
    expect(state.currentScore).toBeLessThanOrEqual(100)
  })
})

// ─── Daily-bucket aggregation ─────────────────────────────────────────────
describe('rangeToDays', () => {
  test('defaults to 7 days for unknown range', () => {
    expect(rangeToDays('7d')).toBe(7)
    expect(rangeToDays('unknown')).toBe(7)
    expect(rangeToDays(undefined)).toBe(7)
  })
  test('today is 1 day', () => {
    expect(rangeToDays('today')).toBe(1)
  })
  test('30d is 30 days', () => {
    expect(rangeToDays('30d')).toBe(30)
  })
})

describe('aggregateHistoryIntoDailyBuckets', () => {
  const RANGE_START = new Date(Date.UTC(2026, 6, 1)) // 2026-07-01 UTC

  function makeDoc(roomCode, history) {
    return {
      roomId: { code: roomCode },
      history
    }
  }

  test('returns one bucket per day in the window', () => {
    const points = aggregateHistoryIntoDailyBuckets([], 7, RANGE_START, '7d')
    expect(points).toHaveLength(7)
    expect(points.map((p) => p.date)).toEqual([
      '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04',
      '2026-07-05', '2026-07-06', '2026-07-07'
    ])
  })

  test('empty days have null scores and hasData=false', () => {
    const points = aggregateHistoryIntoDailyBuckets([], 3, RANGE_START, '7d')
    for (const p of points) {
      expect(p.hasData).toBe(false)
      expect(p.avgScore).toBeNull()
      expect(p.minScore).toBeNull()
      expect(p.maxScore).toBeNull()
      expect(p.endingScore).toBeNull()
      expect(p.worstZone).toBeNull()
      expect(p.answered).toBe(0)
      expect(p.skipped).toBe(0)
      expect(p.totalEvents).toBe(0)
    }
  })

  test('aggregates answered vs skipped per day', () => {
    const docs = [makeDoc('AAA', [
      { timestamp: new Date(Date.UTC(2026, 6, 3, 10, 0)), scoreAfter: 80, answeredCorrectly: true, skipped: false },
      { timestamp: new Date(Date.UTC(2026, 6, 3, 10, 5)), scoreAfter: 75, answeredCorrectly: false, skipped: false },
      { timestamp: new Date(Date.UTC(2026, 6, 3, 10, 6)), scoreAfter: 60, skipped: true }
    ])]
    const points = aggregateHistoryIntoDailyBuckets(docs, 7, RANGE_START, '7d')
    const day = points.find((p) => p.date === '2026-07-03')
    expect(day.answered).toBe(2)
    expect(day.skipped).toBe(1)
    expect(day.totalEvents).toBe(3)
    expect(day.minScore).toBe(60)
    expect(day.maxScore).toBe(80)
    expect(day.avgScore).toBe(71.7) // (80+75+60)/3 = 71.666... → rounded to 71.7
    expect(day.endingScore).toBe(60)
    expect(day.worstZone).toBe('warning') // min=60 → zone=warning (>=40, <70)
    expect(day.rooms).toEqual(['AAA'])
  })

  test('worstZone reflects the worst (min) score, not the ending score', () => {
    // Started high, dropped into risk mid-day, recovered.
    const docs = [makeDoc('BBB', [
      { timestamp: new Date(Date.UTC(2026, 6, 5, 9, 0)), scoreAfter: 95, answeredCorrectly: true },
      { timestamp: new Date(Date.UTC(2026, 6, 5, 9, 5)), scoreAfter: 35, answeredCorrectly: false }, // risk
      { timestamp: new Date(Date.UTC(2026, 6, 5, 9, 10)), scoreAfter: 90, answeredCorrectly: true }  // recovered
    ])]
    const points = aggregateHistoryIntoDailyBuckets(docs, 7, RANGE_START, '7d')
    const day = points.find((p) => p.date === '2026-07-05')
    expect(day.endingScore).toBe(90)
    expect(day.minScore).toBe(35)
    expect(day.worstZone).toBe('risk')
  })

  test('merges multiple rooms into one day-bucket', () => {
    const docs = [
      makeDoc('ROOM1', [
        { timestamp: new Date(Date.UTC(2026, 6, 2, 9, 0)), scoreAfter: 70, answeredCorrectly: true, skipped: false }
      ]),
      makeDoc('ROOM2', [
        { timestamp: new Date(Date.UTC(2026, 6, 2, 14, 0)), scoreAfter: 65, answeredCorrectly: false, skipped: true }
      ])
    ]
    const points = aggregateHistoryIntoDailyBuckets(docs, 7, RANGE_START, '7d')
    const day = points.find((p) => p.date === '2026-07-02')
    expect(day.rooms.sort()).toEqual(['ROOM1', 'ROOM2'])
    expect(day.totalEvents).toBe(2)
    expect(day.answered).toBe(1)
    expect(day.skipped).toBe(1)
  })

  test('drops events outside the window', () => {
    const docs = [makeDoc('OOO', [
      { timestamp: new Date(Date.UTC(2026, 5, 30, 12, 0)), scoreAfter: 50 }, // June 30 - outside 7d window starting Jul 1
      { timestamp: new Date(Date.UTC(2026, 6, 1, 12, 0)), scoreAfter: 80, answeredCorrectly: true }, // Jul 1 - inside
      { timestamp: new Date(Date.UTC(2026, 6, 7, 23, 0)), scoreAfter: 90, answeredCorrectly: true }  // Jul 7 - inside
    ])]
    const points = aggregateHistoryIntoDailyBuckets(docs, 7, RANGE_START, '7d')
    const july1 = points.find((p) => p.date === '2026-07-01')
    const july7 = points.find((p) => p.date === '2026-07-07')
    expect(july1.hasData).toBe(true)
    expect(july7.hasData).toBe(true)
    // No 'June 30' bucket exists at all in the 7-day window.
    expect(points).toHaveLength(7)
  })

  test('skips events with null scoreAfter', () => {
    const docs = [makeDoc('NULL', [
      { timestamp: new Date(Date.UTC(2026, 6, 4, 10, 0)), scoreAfter: null, answeredCorrectly: true },
      { timestamp: new Date(Date.UTC(2026, 6, 4, 10, 5)), scoreAfter: 80, answeredCorrectly: true }
    ])]
    const points = aggregateHistoryIntoDailyBuckets(docs, 7, RANGE_START, '7d')
    const day = points.find((p) => p.date === '2026-07-04')
    expect(day.totalEvents).toBe(1)
    expect(day.answered).toBe(1)
    expect(day.avgScore).toBe(80)
  })

  test('uses doc.lastUpdated when history.timestamp is missing', () => {
    const docs = [{
      roomId: { code: 'FALLBACK' },
      lastUpdated: new Date(Date.UTC(2026, 6, 6, 12, 0)),
      history: [{ scoreAfter: 75, answeredCorrectly: true }] // no timestamp on the entry
    }]
    const points = aggregateHistoryIntoDailyBuckets(docs, 7, RANGE_START, '7d')
    const day = points.find((p) => p.date === '2026-07-06')
    expect(day.hasData).toBe(true)
    expect(day.rooms).toEqual(['FALLBACK'])
  })
})