import { describe, it } from 'node:test'
import assert from 'node:assert'
import { calculateCognitivePoints } from '../routes/responses.js'

describe('Cognitive Fair-Play Points & Anti-Spam Scoring', () => {
  const maxPoints = 100
  const tta = 30

  describe('calculateCognitivePoints', () => {
    it('returns 0 points for incorrect answers regardless of speed', () => {
      assert.strictEqual(calculateCognitivePoints(false, maxPoints, tta, 0.5), 0)
      assert.strictEqual(calculateCognitivePoints(false, maxPoints, tta, 4.0), 0)
      assert.strictEqual(calculateCognitivePoints(false, maxPoints, tta, 20.0), 0)
    })

    it('caps points at 50% baseline for impulsive spam (< 2.0s)', () => {
      // 0.2s - instant button spamming without reading
      assert.strictEqual(calculateCognitivePoints(true, 100, 30, 0.2), 50)
      // 0.8s - fast blind guess
      assert.strictEqual(calculateCognitivePoints(true, 100, 30, 0.8), 50)
      // 1.9s - just under the reading threshold
      assert.strictEqual(calculateCognitivePoints(true, 100, 30, 1.9), 50)
      // Custom maxPoints (e.g. 200) capped at 50% (100)
      assert.strictEqual(calculateCognitivePoints(true, 200, 30, 1.0), 100)
    })

    it('awards 100% full points in the thoughtful reading window (2.0s - 6.0s)', () => {
      // Exactly at 2.0s
      assert.strictEqual(calculateCognitivePoints(true, 100, 30, 2.0), 100)
      // At 3.5s (careful reading + click)
      assert.strictEqual(calculateCognitivePoints(true, 100, 30, 3.5), 100)
      // At 6.0s (end of optimal window)
      assert.strictEqual(calculateCognitivePoints(true, 100, 30, 6.0), 100)
    })

    it('gracefully decays points for thoughtful answers beyond 6.0s', () => {
      // Mid-range: halfway between 6s and 30s is 18s. Decay span = 24s. Remaining = 12s -> 50% of 100 = 50 pts
      assert.strictEqual(calculateCognitivePoints(true, 100, 30, 18), 50)
      // At 24s: remaining = 6s. 6/24 = 25% = 25 pts
      assert.strictEqual(calculateCognitivePoints(true, 100, 30, 24), 25)
    })

    it('enforces a 10% minimum floor for very late answers before poll closes', () => {
      // At 29.5s
      assert.strictEqual(calculateCognitivePoints(true, 100, 30, 29.5), 10)
      // At 30s
      assert.strictEqual(calculateCognitivePoints(true, 100, 30, 30), 10)
    })

    it('safely handles untrusted or negative response times', () => {
      // Negative response time forged by malicious client falls back to tta (10% floor)
      assert.strictEqual(calculateCognitivePoints(true, 100, 30, -5), 10)
      // Non-finite values fall back to tta
      assert.strictEqual(calculateCognitivePoints(true, 100, 30, NaN), 10)
      assert.strictEqual(calculateCognitivePoints(true, 100, 30, undefined), 10)
    })
  })
})
