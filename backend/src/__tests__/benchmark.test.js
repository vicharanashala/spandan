// Unit tests for Benchmark and Leaderboard Freeze logic
// Verifies pure logic, dual-metric sorting, and simulation metrics

describe('Benchmark and Dual-Metric Leaderboard Logic', () => {
  describe('Dual-Metric Leaderboard Sorting', () => {
    const students = [
      { studentName: 'Alice', accuracy: 80.0, averageResponseTime: 5.5, totalPoints: 400 },
      { studentName: 'Bob', accuracy: 90.0, averageResponseTime: 12.0, totalPoints: 450 },
      { studentName: 'Charlie', accuracy: 80.0, averageResponseTime: 3.2, totalPoints: 410 },
      { studentName: 'Dave', accuracy: 90.0, averageResponseTime: 8.5, totalPoints: 480 },
      { studentName: 'Eve', accuracy: 50.0, averageResponseTime: 2.0, totalPoints: 200 }
    ]

    it('should sort primarily by accuracy (descending) and secondarily by speed (ascending)', () => {
      const sorted = [...students].sort((a, b) => {
        if (Math.abs(b.accuracy - a.accuracy) > 0.001) {
          return b.accuracy - a.accuracy
        }
        return a.averageResponseTime - b.averageResponseTime
      })

      // Expected order:
      // 1. Dave (90.0% accuracy, 8.5s speed)
      // 2. Bob (90.0% accuracy, 12.0s speed)
      // 3. Charlie (80.0% accuracy, 3.2s speed)
      // 4. Alice (80.0% accuracy, 5.5s speed)
      // 5. Eve (50.0% accuracy, 2.0s speed)
      expect(sorted[0].studentName).toBe('Dave')
      expect(sorted[1].studentName).toBe('Bob')
      expect(sorted[2].studentName).toBe('Charlie')
      expect(sorted[3].studentName).toBe('Alice')
      expect(sorted[4].studentName).toBe('Eve')
    })

    it('should assign ranks correctly, including tie handling', () => {
      const sortedEntries = [
        { studentName: 'Dave', accuracy: 90.0, averageResponseTime: 8.5 },
        { studentName: 'Bob', accuracy: 90.0, averageResponseTime: 8.5 }, // Tie with Dave
        { studentName: 'Charlie', accuracy: 80.0, averageResponseTime: 3.2 },
        { studentName: 'Alice', accuracy: 80.0, averageResponseTime: 5.5 }
      ]

      let rank = 1
      for (let i = 0; i < sortedEntries.length; i++) {
        if (i > 0) {
          const prev = sortedEntries[i - 1]
          const curr = sortedEntries[i]
          const sameAccuracy = Math.abs(curr.accuracy - prev.accuracy) < 0.001
          const sameTime = Math.abs(curr.averageResponseTime - prev.averageResponseTime) < 0.001
          if (!sameAccuracy || !sameTime) {
            rank = i + 1
          }
        }
        sortedEntries[i].rank = rank
      }

      expect(sortedEntries[0].rank).toBe(1)
      expect(sortedEntries[1].rank).toBe(1) // Ties share rank
      expect(sortedEntries[2].rank).toBe(3) // Next rank skips to 3
      expect(sortedEntries[3].rank).toBe(4)
    })
  })

  describe('Benchmark Ranking Simulation & Percentile', () => {
    const frozenLeaderboard = [
      { rank: 1, accuracy: 100.0, averageResponseTime: 4.0 },
      { rank: 2, accuracy: 90.0, averageResponseTime: 6.0 },
      { rank: 3, accuracy: 80.0, averageResponseTime: 5.0 },
      { rank: 4, accuracy: 80.0, averageResponseTime: 10.0 },
      { rank: 5, accuracy: 60.0, averageResponseTime: 15.0 }
    ]

    const simulateMetrics = (userAccuracy, userAvgTime) => {
      let strictlyBetter = 0
      let outperformedCount = 0
      
      for (const entry of frozenLeaderboard) {
        if (entry.accuracy > userAccuracy) {
          strictlyBetter++
        } else if (Math.abs(entry.accuracy - userAccuracy) < 0.001) {
          if (entry.averageResponseTime < userAvgTime) {
            strictlyBetter++
          }
        }

        if (entry.accuracy < userAccuracy) {
          outperformedCount++
        } else if (Math.abs(entry.accuracy - userAccuracy) < 0.001) {
          if (entry.averageResponseTime > userAvgTime) {
            outperformedCount++
          }
        }
      }

      const simulatedRank = strictlyBetter + 1
      const percentile = frozenLeaderboard.length > 0
        ? (outperformedCount / frozenLeaderboard.length) * 100
        : 100

      return { simulatedRank, percentile }
    }

    it('should calculate correct rank and percentile for higher performance', () => {
      const result = simulateMetrics(95.0, 5.0)
      // Beats rank 2, 3, 4, 5. Only rank 1 (100% accuracy) is strictly better.
      expect(result.simulatedRank).toBe(2)
      expect(result.percentile).toBe((4 / 5) * 100) // 80% outperformed
    })

    it('should calculate correct rank and percentile for identical accuracy but slower speed', () => {
      const result = simulateMetrics(80.0, 8.0)
      // Rank 1 and 2 are better because of accuracy.
      // Rank 3 (80.0% accuracy, 5.0s speed) is better because of speed.
      // Rank 4 (80.0% accuracy, 10.0s speed) is outperformed because of user speed.
      // Rank 5 (60.0% accuracy) is outperformed.
      // Strictly better: Rank 1, 2, 3 (3 users)
      // Outperformed: Rank 4, 5 (2 users)
      expect(result.simulatedRank).toBe(4)
      expect(result.percentile).toBe((2 / 5) * 100) // 40% outperformed
    })
  })

  describe('Server-side Timer Persistence on Refresh', () => {
    it('should compute remaining time correctly based on server startTime', () => {
      const startTime = new Date(Date.now() - 12000) // 12 seconds ago
      const timeToAnswer = 30 // 30 seconds limit

      const getRemainingTime = (start, limit) => {
        const elapsed = (Date.now() - start.getTime()) / 1000
        return Math.max(0, Math.round(limit - elapsed))
      }

      const remaining = getRemainingTime(startTime, timeToAnswer)
      expect(remaining).toBeCloseTo(18, 0)
    })

    it('should force timer to 0 when time duration limit is exceeded', () => {
      const startTime = new Date(Date.now() - 35000) // 35 seconds ago
      const timeToAnswer = 30

      const getRemainingTime = (start, limit) => {
        const elapsed = (Date.now() - start.getTime()) / 1000
        return Math.max(0, Math.round(limit - elapsed))
      }

      const remaining = getRemainingTime(startTime, timeToAnswer)
      expect(remaining).toBe(0)
    })
  })
})
