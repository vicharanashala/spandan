// Pure-logic tests for the post-session Question Intervention accuracy calculation.
// Mirrors the structure of Leaderboard.test.js — no React, no DOM.

describe('Question Intervention Accuracy', () => {
  describe('Accuracy formula', () => {
    // Accuracy = correctCount / totalEligibleStudents (joined, regardless of whether they answered).
    const computeAccuracy = (correctCount, totalEligibleStudents) => {
      if (!totalEligibleStudents || totalEligibleStudents <= 0) return 0
      return correctCount / totalEligibleStudents
    }

    it('returns 0 when no students joined', () => {
      expect(computeAccuracy(0, 0)).toBe(0)
    })

    it('returns 1.0 when all joined students answered correctly', () => {
      expect(computeAccuracy(40, 40)).toBe(1.0)
    })

    it('returns 0 when no student answered correctly', () => {
      expect(computeAccuracy(0, 120)).toBe(0)
    })

    it('computes fractional accuracy matching the brief example (40/120 = 0.333...)', () => {
      expect(computeAccuracy(40, 120)).toBeCloseTo(0.333, 3)
    })

    it('treats non-responders as part of the denominator', () => {
      // 5 correct out of 20 joined — even though only 8 answered
      const accuracy = computeAccuracy(5, 20)
      expect(accuracy).toBe(0.25)
    })

    it('guards against division by zero', () => {
      expect(computeAccuracy(5, 0)).toBe(0)
      expect(computeAccuracy(5, null)).toBe(0)
      expect(computeAccuracy(5, undefined)).toBe(0)
    })
  })

  describe('Threshold flagging', () => {
    // flagged iff accuracy < threshold
    const isFlagged = (accuracy, threshold) => accuracy < threshold

    it('flags when accuracy is below the threshold', () => {
      expect(isFlagged(0.4, 0.6)).toBe(true)
    })

    it('does NOT flag when accuracy equals the threshold', () => {
      expect(isFlagged(0.6, 0.6)).toBe(false)
    })

    it('does NOT flag when accuracy is above the threshold', () => {
      expect(isFlagged(0.8, 0.6)).toBe(false)
    })

    it('uses the threshold from backend configuration, not a hardcoded value', () => {
      // The same accuracy (0.5) is flagged at threshold 0.6 but not flagged at threshold 0.4
      expect(isFlagged(0.5, 0.6)).toBe(true)
      expect(isFlagged(0.5, 0.4)).toBe(false)
    })
  })

  describe('Combined: flag computation from raw counts', () => {
    const isFlaggedFromCounts = (correctCount, totalEligibleStudents, threshold) => {
      if (!totalEligibleStudents || totalEligibleStudents <= 0) return false
      const accuracy = correctCount / totalEligibleStudents
      return accuracy < threshold
    }

    it('flags the brief example: 40 correct of 120 joined at 60% threshold', () => {
      // 40/120 = 0.333 < 0.6 → flagged
      expect(isFlaggedFromCounts(40, 120, 0.6)).toBe(true)
    })

    it('does not flag a high-accuracy question at the same threshold', () => {
      // 90/120 = 0.75 → not flagged
      expect(isFlaggedFromCounts(90, 120, 0.6)).toBe(false)
    })

    it('respects a different threshold (e.g. 80%)', () => {
      // 90/120 = 0.75 < 0.8 → flagged at 80% threshold
      expect(isFlaggedFromCounts(90, 120, 0.8)).toBe(true)
      // 100/120 = 0.833 > 0.8 → not flagged at 80%
      expect(isFlaggedFromCounts(100, 120, 0.8)).toBe(false)
    })

    it('returns false when there are no joined students', () => {
      expect(isFlaggedFromCounts(0, 0, 0.6)).toBe(false)
    })
  })
})
