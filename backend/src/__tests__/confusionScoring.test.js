// confusionScoring.test.js -- pure-function tests for the weighted scoring
// service that powers Milestone 3 (alert tiers + topic heat).

import {
  scoreEvent,
  tierForScore,
  buildTopicHeat,
  buildHeatmap,
  TIER_BANDS,
  tierToClass
} from '../services/confusionScoring.js'

describe('confusionScoring -- tierForScore', () => {
  test('returns null for non-numeric', () => {
    expect(tierForScore('50')).toBeNull()
    expect(tierForScore(null)).toBeNull()
    expect(tierForScore(NaN)).toBeNull()
  })

  test('returns green band for low scores', () => {
    expect(tierForScore(0).name).toBe('green')
    expect(tierForScore(15).name).toBe('green')
    expect(tierForScore(29).name).toBe('green')
    expect(tierForScore(29.999).name).toBe('green')
  })

  test('returns yellow band for moderate', () => {
    expect(tierForScore(30).name).toBe('yellow')
    expect(tierForScore(45).name).toBe('yellow')
    expect(tierForScore(59).name).toBe('yellow')
    expect(tierForScore(59.999).name).toBe('yellow')
  })

  test('returns red band for high', () => {
    expect(tierForScore(60).name).toBe('red')
    expect(tierForScore(85).name).toBe('red')
    expect(tierForScore(100).name).toBe('red')
  })
})

describe('confusionScoring -- scoreEvent', () => {
  const NOW = 1_700_000_000_000
  const FIVE_MIN_AGO = NOW - 5 * 60 * 1000
  const ONE_MIN_AGO = NOW - 60 * 1000

  test('zero students + no source + no signal => green band at zero', () => {
    const out = scoreEvent({
      confusedStudentCount: 0,
      startTimestamp: null,
      latestTimestamp: null,
      topicSource: 'none',
      nowMs: NOW
    })
    expect(out.score).toBe(0)
    expect(out.tier.name).toBe('green')
  })

  test('one recent student + teacher marker => tier matches axis sum', () => {
    const out = scoreEvent({
      confusedStudentCount: 1,
      startTimestamp: ONE_MIN_AGO,
      latestTimestamp: ONE_MIN_AGO,
      topicSource: 'marker',
      nowMs: NOW
    })
    // count(1) ~= 7.5, duration 0, recency(NOW-60s) ~= 6.25, source 15 => raw ~28.75 -> green
    expect(out.score).toBeGreaterThanOrEqual(20)
    expect(out.score).toBeLessThan(40)
    expect(out.tier.name).toBe('green')
    expect(out.components.source).toBe(15)
  })

  test('5 students bubbling 90s + auto topic => red', () => {
    const out = scoreEvent({
      confusedStudentCount: 5,
      startTimestamp: NOW - 90 * 1000,
      latestTimestamp: NOW,
      topicSource: 'auto',
      nowMs: NOW
    })
    // count~20 + duration~22.5 + recency~25 + source~10 ~= 77.5
    expect(out.score).toBeGreaterThanOrEqual(60)
    expect(out.tier.name).toBe('red')
  })

  test('recency decays -- older event scores lower even with same count', () => {
    const fresh = scoreEvent({
      confusedStudentCount: 4,
      startTimestamp: NOW - 5 * 1000,
      latestTimestamp: NOW,
      topicSource: 'auto',
      nowMs: NOW
    })
    const stale = scoreEvent({
      confusedStudentCount: 4,
      startTimestamp: NOW - 5 * 60 * 1000,
      latestTimestamp: NOW - 4 * 60 * 1000,
      topicSource: 'auto',
      nowMs: NOW
    })
    expect(fresh.score).toBeGreaterThan(stale.score)
    expect(fresh.components.recency).toBeGreaterThan(stale.components.recency)
  })

  test('duration capped at 120s', () => {
    const just = scoreEvent({
      confusedStudentCount: 3, startTimestamp: NOW - 119 * 1000, latestTimestamp: NOW,
      topicSource: 'none', nowMs: NOW
    })
    const way = scoreEvent({
      confusedStudentCount: 3, startTimestamp: NOW - 600 * 1000, latestTimestamp: NOW,
      topicSource: 'none', nowMs: NOW
    })
    // Both should saturate near 30 (one is 119/120*30 = 29.75 -> 29.8, other is 30.0)
    expect(just.components.duration).toBeGreaterThanOrEqual(29)
    expect(way.components.duration).toBeGreaterThanOrEqual(29)
    expect(Math.abs(just.components.duration - way.components.duration)).toBeLessThan(1)
  })

  test('count curve is monotonically increasing', () => {
    let prev = -1
    for (const c of [1, 2, 3, 5, 10, 20, 100]) {
      const out = scoreEvent({
        confusedStudentCount: c,
        startTimestamp: NOW, latestTimestamp: NOW,
        topicSource: 'none', nowMs: NOW
      })
      expect(out.components.count).toBeGreaterThan(prev)
      prev = out.components.count
    }
  })

  test('score clamps to [0, 100]', () => {
    const max = scoreEvent({
      confusedStudentCount: 200,
      startTimestamp: NOW - 999 * 1000,
      latestTimestamp: NOW,
      topicSource: 'marker',
      nowMs: NOW
    })
    expect(max.score).toBeLessThanOrEqual(100)
    expect(max.tier.name).toBe('red')
  })

  test('handles malformed input gracefully', () => {
    const out = scoreEvent({
      confusedStudentCount: undefined,
      startTimestamp: null,
      latestTimestamp: undefined,
      topicSource: 'marker',
      nowMs: NOW
    })
    expect(out.score).toBeGreaterThanOrEqual(0)
    expect(out.score).toBeLessThanOrEqual(100)
    expect(out.tier).toBeTruthy()
  })

  test('source-axis values are correct', () => {
    const mk = scoreEvent({ confusedStudentCount: 1, startTimestamp: NOW, latestTimestamp: NOW, topicSource: 'marker', nowMs: NOW })
    const au = scoreEvent({ confusedStudentCount: 1, startTimestamp: NOW, latestTimestamp: NOW, topicSource: 'auto', nowMs: NOW })
    const ts = scoreEvent({ confusedStudentCount: 1, startTimestamp: NOW, latestTimestamp: NOW, topicSource: 'transcript', nowMs: NOW })
    const nn = scoreEvent({ confusedStudentCount: 1, startTimestamp: NOW, latestTimestamp: NOW, topicSource: 'none', nowMs: NOW })
    expect(mk.components.source).toBe(15)
    expect(au.components.source).toBe(10)
    expect(ts.components.source).toBe(5)
    expect(nn.components.source).toBe(0)
  })
})

describe('confusionScoring -- buildTopicHeat', () => {
  // Anchor events to "now-ish" so scoreEvent produces deterministic values.
  // All fixtures below use NOW as start and end timestamp, which means
  // count + source axis contribute, but recency/duration axes don't.
  const NOW = Date.now()

  test('aggregates by topic, case-insensitive', () => {
    const events = [
      { topic: { label: 'Binary Search', source: 'auto' }, confusedStudentCount: 3, startTimestamp: new Date(NOW), latestTimestamp: new Date(NOW) },
      { topic: { label: 'binary search', source: 'auto' }, confusedStudentCount: 2, startTimestamp: new Date(NOW), latestTimestamp: new Date(NOW) },
      { topic: { label: 'Sorting', source: 'marker' }, confusedStudentCount: 5, startTimestamp: new Date(NOW), latestTimestamp: new Date(NOW) },
      { topic: { label: 'Trees', source: 'transcript' }, confusedStudentCount: 1, startTimestamp: new Date(NOW), latestTimestamp: new Date(NOW) }
    ]
    const heat = buildTopicHeat(events, 10, NOW)
    const bs = heat.find(h => /binary search/i.test(h.topicLabel))
    expect(bs).toBeTruthy()
    expect(bs.eventCount).toBe(2)
    expect(bs.studentCount).toBe(5)
    // totalScore must be > 0 (events are recent and have students)
    expect(bs.totalScore).toBeGreaterThan(0)
  })

  test('sorts descending by totalScore', () => {
    // Make B have a much higher confusedStudentCount so its computed score dominates
    const events = [
      { topic: { label: 'A' }, confusedStudentCount: 1, startTimestamp: new Date(NOW), latestTimestamp: new Date(NOW) },
      { topic: { label: 'B' }, confusedStudentCount: 8, startTimestamp: new Date(NOW), latestTimestamp: new Date(NOW) },
      { topic: { label: 'C' }, confusedStudentCount: 4, startTimestamp: new Date(NOW), latestTimestamp: new Date(NOW) }
    ]
    const heat = buildTopicHeat(events, 10, NOW)
    expect(heat.map(h => h.topicLabel)).toEqual(['B', 'C', 'A'])
  })

  test('respects topN', () => {
    const events = Array.from({ length: 15 }, (_, i) => ({
      topic: { label: 'T' + i },
      confusedStudentCount: 1,
      startTimestamp: new Date(NOW),
      latestTimestamp: new Date(NOW)
    }))
    expect(buildTopicHeat(events, 5, NOW)).toHaveLength(5)
  })

  test('handles no-topic events as a single bucket', () => {
    const events = [
      { topic: { label: '' }, confusedStudentCount: 2, startTimestamp: new Date(NOW), latestTimestamp: new Date(NOW) },
      { topic: null, confusedStudentCount: 1, startTimestamp: new Date(NOW), latestTimestamp: new Date(NOW) }
    ]
    const heat = buildTopicHeat(events, 10, NOW)
    expect(heat).toHaveLength(1)
  })

  test('handles empty / null input', () => {
    expect(buildTopicHeat([], 10, NOW)).toEqual([])
    expect(buildTopicHeat(null, 10, NOW)).toEqual([])
  })
})

describe('confusionScoring -- buildHeatmap', () => {
  const T0 = 1_700_000_000_000

  test('returns heatmap object with computed buckets for empty events (uses fallback window)', () => {
    const r = buildHeatmap([], { bucketMs: 60000, windowMs: 600000, nowMs: T0 })
    expect(Array.isArray(r.buckets)).toBe(true)
    // empty events => all bucket intensities 0
    expect(r.buckets.every(b => b.intensity === 0)).toBe(true)
    expect(r.maxScore).toBe(0)
  })

  test('returns heatmap object with computed buckets and maxScore for events', () => {
    const events = [{
      startTimestamp: new Date(T0 - 5000).toISOString(),
      lastUpdateAt: new Date(T0 - 4000).toISOString(),
      confusedStudentCount: 2,
      topic: { source: 'marker', label: 'Test' }
    }]
    const r = buildHeatmap(events, { bucketMs: 60000, windowMs: 600000, nowMs: T0 })
    expect(Array.isArray(r.buckets)).toBe(true)
    expect(r.maxScore).toBeGreaterThanOrEqual(0)
  })

  test('event contributes score to overlapping bucket', () => {
    const events = [{
      startTimestamp: new Date(T0 - 5000).toISOString(),
      lastUpdateAt: new Date(T0 - 4000).toISOString(),
      confusedStudentCount: 3,
      topic: { source: 'marker', label: 'Test' }
    }]
    const r = buildHeatmap(events, { bucketMs: 60000, windowMs: 600000, nowMs: T0 })
    expect(r.buckets.some(b => b.intensity > 0)).toBe(true)
  })

  test('recovers gracefully with no events and missing timestamps', () => {
    const r = buildHeatmap([{}], { bucketMs: 60000, windowMs: 600000, nowMs: T0 })
    expect(Array.isArray(r.buckets)).toBe(true)
  })
})

describe('confusionScoring -- tierToClass', () => {
  test('maps known tier names', () => {
    expect(tierToClass('green')).toBe('cac-tier--green')
    expect(tierToClass('yellow')).toBe('cac-tier--yellow')
    expect(tierToClass('red')).toBe('cac-tier--red')
  })
  test('null/unknown maps to none', () => {
    expect(tierToClass(null)).toBe('cac-tier--none')
    expect(tierToClass('purple')).toBe('cac-tier--none')
  })
})

describe('confusionScoring -- TIER_BANDS constant', () => {
  test('all bands cover 0..100 contiguously', () => {
    let prevMax = -1
    for (const b of TIER_BANDS) {
      // Allow float bands (max is 29.999/59.999); check contiguity in >= sense
      expect(b.min).toBeGreaterThan(prevMax)
      prevMax = b.max
    }
    expect(prevMax).toBeGreaterThanOrEqual(99)
    // And that they classify the integer boundary values consistently
    expect(tierForScore(0).name).toBe('green')
    expect(tierForScore(30).name).toBe('yellow')
    expect(tierForScore(60).name).toBe('red')
  })
})