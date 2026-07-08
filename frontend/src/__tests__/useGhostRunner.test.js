import {
  computeGhostDuration,
  ghostRunnerKey,
  ghostProgress,
  GHOST_RUNNER_DEFAULTS_MS
} from '../hooks/useGhostRunner.js'

describe('useGhostRunner — pure helpers', () => {
  describe('GHOST_RUNNER_DEFAULTS_MS', () => {
    test('TF baseline is 4500 ms', () => {
      expect(GHOST_RUNNER_DEFAULTS_MS.TF).toBe(4500)
    })

    test('MCQ baseline is 15000 ms', () => {
      expect(GHOST_RUNNER_DEFAULTS_MS.MCQ).toBe(15000)
    })

    test('MSQ baseline is 15000 ms', () => {
      expect(GHOST_RUNNER_DEFAULTS_MS.MSQ).toBe(15000)
    })
  })

  describe('computeGhostDuration', () => {
    test('uses explicit timeToAnswer when present (seconds → ms)', () => {
      expect(computeGhostDuration({ type: 'MCQ', timeToAnswer: 30 })).toBe(30000)
      expect(computeGhostDuration({ type: 'TF', timeToAnswer: 4 })).toBe(4000)
      expect(computeGhostDuration({ type: 'MSQ', timeToAnswer: 12 })).toBe(12000)
    })

    test('rounds fractional timeToAnswer safely', () => {
      expect(computeGhostDuration({ type: 'MCQ', timeToAnswer: 4.5 })).toBe(4500)
    })

    test('falls back to MCQ default when type is missing', () => {
      expect(computeGhostDuration({})).toBe(GHOST_RUNNER_DEFAULTS_MS.MCQ)
    })

    test('falls back to type default when timeToAnswer is missing', () => {
      expect(computeGhostDuration({ type: 'TF' })).toBe(GHOST_RUNNER_DEFAULTS_MS.TF)
      expect(computeGhostDuration({ type: 'MCQ' })).toBe(GHOST_RUNNER_DEFAULTS_MS.MCQ)
      expect(computeGhostDuration({ type: 'MSQ' })).toBe(GHOST_RUNNER_DEFAULTS_MS.MSQ)
    })

    test('normalises mixed-case type', () => {
      expect(computeGhostDuration({ type: 'tf' })).toBe(GHOST_RUNNER_DEFAULTS_MS.TF)
      expect(computeGhostDuration({ type: 'mcq' })).toBe(GHOST_RUNNER_DEFAULTS_MS.MCQ)
    })

    test('falls back to MCQ default for unknown types', () => {
      expect(computeGhostDuration({ type: 'ESSAY' })).toBe(GHOST_RUNNER_DEFAULTS_MS.MCQ)
    })

    test('falls back to MCQ default for null/undefined input', () => {
      expect(computeGhostDuration(null)).toBe(GHOST_RUNNER_DEFAULTS_MS.MCQ)
      expect(computeGhostDuration(undefined)).toBe(GHOST_RUNNER_DEFAULTS_MS.MCQ)
    })

    test('ignores invalid timeToAnswer values and uses type default', () => {
      expect(computeGhostDuration({ type: 'MCQ', timeToAnswer: 0 })).toBe(GHOST_RUNNER_DEFAULTS_MS.MCQ)
      expect(computeGhostDuration({ type: 'MCQ', timeToAnswer: -1 })).toBe(GHOST_RUNNER_DEFAULTS_MS.MCQ)
      expect(computeGhostDuration({ type: 'MCQ', timeToAnswer: NaN })).toBe(GHOST_RUNNER_DEFAULTS_MS.MCQ)
      expect(computeGhostDuration({ type: 'MCQ', timeToAnswer: '30' })).toBe(GHOST_RUNNER_DEFAULTS_MS.MCQ)
    })
  })

  describe('ghostRunnerKey', () => {
    test('uses _id when present', () => {
      expect(ghostRunnerKey({ _id: 'q1' })).toBe('ghost:q1')
    })

    test('falls back to id when no _id', () => {
      expect(ghostRunnerKey({ id: 'q2' })).toBe('ghost:q2')
    })

    test('falls back to type+text when no id', () => {
      expect(ghostRunnerKey({ type: 'MCQ', question: 'What is 2+2?' }))
        .toBe('ghost:MCQ:What is 2+2?')
    })

    test('returns sentinel for null/undefined', () => {
      expect(ghostRunnerKey(null)).toBe('ghost:none')
      expect(ghostRunnerKey(undefined)).toBe('ghost:none')
    })

    test('two different questions produce different keys', () => {
      expect(ghostRunnerKey({ _id: 'a' })).not.toBe(ghostRunnerKey({ _id: 'b' }))
    })

    test('same _id always produces same key (stability)', () => {
      const a = ghostRunnerKey({ _id: 'q1' })
      const b = ghostRunnerKey({ _id: 'q1' })
      expect(a).toBe(b)
    })
  })

  describe('ghostProgress', () => {
    test('returns 1 at elapsed=0', () => {
      expect(ghostProgress(0, 15000)).toBe(1)
    })

    test('returns 0 at elapsed>=total', () => {
      expect(ghostProgress(15000, 15000)).toBe(0)
      expect(ghostProgress(20000, 15000)).toBe(0)
    })

    test('returns midpoint value at half elapsed', () => {
      expect(ghostProgress(7500, 15000)).toBeCloseTo(0.5, 5)
    })

    test('clamps negative elapsed to 1', () => {
      expect(ghostProgress(-100, 15000)).toBe(1)
    })

    test('returns 1 when total is zero or invalid', () => {
      expect(ghostProgress(100, 0)).toBe(1)
      expect(ghostProgress(100, -1)).toBe(1)
      expect(ghostProgress(100, NaN)).toBe(1)
    })

    test('returns 1 when elapsed is not finite', () => {
      expect(ghostProgress(NaN, 15000)).toBe(1)
      expect(ghostProgress(Infinity, 15000)).toBe(1)
    })

    test('monotonically decreases as elapsed increases', () => {
      const total = 15000
      const samples = [0, 1000, 5000, 10000, 14000, 14999, 15000]
      const values = samples.map((e) => ghostProgress(e, total))
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeLessThanOrEqual(values[i - 1])
      }
    })
  })
})