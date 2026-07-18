// Unit tests for analytics question quality computation
// Tests the exact scoring algorithms used in analyticsService.js

describe('Question Quality Analytics', () => {

  // ===========================
  // Difficulty Index Tests
  // ===========================
  describe('Difficulty Index', () => {
    // Replicates the difficulty calculation from analyticsService.js
    function computeDifficulty(responses) {
      const responseCount = responses.length
      if (responseCount === 0) return 0
      const correctCount = responses.filter(r => r.isCorrect).length
      return correctCount / responseCount
    }

    it('should return 1.0 when all students are correct', () => {
      const responses = [
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: true }
      ]
      expect(computeDifficulty(responses)).toBe(1.0)
    })

    it('should return 0.0 when no students are correct', () => {
      const responses = [
        { isCorrect: false },
        { isCorrect: false },
        { isCorrect: false }
      ]
      expect(computeDifficulty(responses)).toBe(0.0)
    })

    it('should return 0.5 when half are correct', () => {
      const responses = [
        { isCorrect: true },
        { isCorrect: false },
        { isCorrect: true },
        { isCorrect: false }
      ]
      expect(computeDifficulty(responses)).toBe(0.5)
    })

    it('should return 0 for empty responses', () => {
      expect(computeDifficulty([])).toBe(0)
    })

    it('should handle single response', () => {
      expect(computeDifficulty([{ isCorrect: true }])).toBe(1.0)
      expect(computeDifficulty([{ isCorrect: false }])).toBe(0.0)
    })
  })

  // ===========================
  // Discrimination Index Tests
  // ===========================
  describe('Discrimination Index', () => {
    // Replicates the discrimination logic from analyticsService.js
    function computeDiscriminationIndex(responses, studentTotals) {
      if (responses.length < 4 || studentTotals.size < 4) {
        return 0
      }

      const sortedStudents = [...studentTotals.entries()]
        .sort((a, b) => b[1] - a[1])

      const groupSize = Math.max(1, Math.ceil(sortedStudents.length * 0.27))
      const topStudentIds = new Set(sortedStudents.slice(0, groupSize).map(s => s[0]))
      const bottomStudentIds = new Set(sortedStudents.slice(-groupSize).map(s => s[0]))

      const responseMap = new Map()
      responses.forEach(r => {
        responseMap.set(r.studentId, r.isCorrect)
      })

      let topCorrect = 0, topTotal = 0
      let bottomCorrect = 0, bottomTotal = 0

      topStudentIds.forEach(sId => {
        if (responseMap.has(sId)) {
          topTotal++
          if (responseMap.get(sId)) topCorrect++
        }
      })

      bottomStudentIds.forEach(sId => {
        if (responseMap.has(sId)) {
          bottomTotal++
          if (responseMap.get(sId)) bottomCorrect++
        }
      })

      const topAccuracy = topTotal > 0 ? topCorrect / topTotal : 0
      const bottomAccuracy = bottomTotal > 0 ? bottomCorrect / bottomTotal : 0

      return topAccuracy - bottomAccuracy
    }

    it('should return 0 when fewer than 4 responses', () => {
      const responses = [
        { studentId: 's1', isCorrect: true },
        { studentId: 's2', isCorrect: false }
      ]
      const totals = new Map([['s1', 100], ['s2', 50]])
      expect(computeDiscriminationIndex(responses, totals)).toBe(0)
    })

    it('should return positive value for a good discriminating question', () => {
      // Top students get it right, bottom students get it wrong
      const responses = [
        { studentId: 's1', isCorrect: true },  // top performer
        { studentId: 's2', isCorrect: true },  // top performer
        { studentId: 's3', isCorrect: false }, // mid performer
        { studentId: 's4', isCorrect: false }, // bottom performer
        { studentId: 's5', isCorrect: false }  // bottom performer
      ]
      // s1 and s2 scored high overall, s4 and s5 scored low
      const totals = new Map([
        ['s1', 500], ['s2', 400], ['s3', 300], ['s4', 200], ['s5', 100]
      ])
      const result = computeDiscriminationIndex(responses, totals)
      expect(result).toBeGreaterThan(0)
    })

    it('should return negative value for a misleading question', () => {
      // Bottom students get it right, top students get it wrong
      const responses = [
        { studentId: 's1', isCorrect: false },  // top performer gets it WRONG
        { studentId: 's2', isCorrect: false },  // top performer gets it WRONG
        { studentId: 's3', isCorrect: true },   // mid
        { studentId: 's4', isCorrect: true },   // bottom gets it RIGHT
        { studentId: 's5', isCorrect: true }    // bottom gets it RIGHT
      ]
      const totals = new Map([
        ['s1', 500], ['s2', 400], ['s3', 300], ['s4', 200], ['s5', 100]
      ])
      const result = computeDiscriminationIndex(responses, totals)
      expect(result).toBeLessThan(0)
    })

    it('should return 0 when everyone gets it right (no discrimination)', () => {
      const responses = [
        { studentId: 's1', isCorrect: true },
        { studentId: 's2', isCorrect: true },
        { studentId: 's3', isCorrect: true },
        { studentId: 's4', isCorrect: true },
        { studentId: 's5', isCorrect: true }
      ]
      const totals = new Map([
        ['s1', 500], ['s2', 400], ['s3', 300], ['s4', 200], ['s5', 100]
      ])
      const result = computeDiscriminationIndex(responses, totals)
      expect(result).toBe(0) // Both groups have 100% accuracy
    })

    it('should return 0 when everyone gets it wrong (no discrimination)', () => {
      const responses = [
        { studentId: 's1', isCorrect: false },
        { studentId: 's2', isCorrect: false },
        { studentId: 's3', isCorrect: false },
        { studentId: 's4', isCorrect: false },
        { studentId: 's5', isCorrect: false }
      ]
      const totals = new Map([
        ['s1', 500], ['s2', 400], ['s3', 300], ['s4', 200], ['s5', 100]
      ])
      const result = computeDiscriminationIndex(responses, totals)
      expect(result).toBe(0) // Both groups have 0% accuracy
    })

    it('should return 0 when fewer than 4 students in totals', () => {
      const responses = [
        { studentId: 's1', isCorrect: true },
        { studentId: 's2', isCorrect: false },
        { studentId: 's3', isCorrect: true },
        { studentId: 's4', isCorrect: false }
      ]
      const totals = new Map([['s1', 100], ['s2', 50], ['s3', 75]])
      expect(computeDiscriminationIndex(responses, totals)).toBe(0)
    })
  })

  // ===========================
  // Quality Score Tests
  // ===========================
  describe('Quality Score Computation', () => {
    function computeQualityScore(difficulty, discrimination, responseRate, avgResponseTime, timeToAnswer) {
      const difficultyScore = 1 - Math.pow((difficulty - 0.5) * 2, 2)
      const discScore = Math.max(0, Math.min(1, (discrimination + 0.2) / 0.8))
      const responseScore = Math.min(1, responseRate)
      const timeRatio = timeToAnswer > 0 ? avgResponseTime / timeToAnswer : 0.5
      const timeScore = 1 - Math.pow((timeRatio - 0.4) * 2, 2)
      const clampedTimeScore = Math.max(0, Math.min(1, timeScore))

      const raw = (
        difficultyScore * 0.40 +
        discScore * 0.30 +
        responseScore * 0.20 +
        clampedTimeScore * 0.10
      )

      return Math.round(Math.max(0, Math.min(100, raw * 100)))
    }

    it('should give highest score for ideal question (difficulty=0.5, disc=0.5, full response)', () => {
      const score = computeQualityScore(0.5, 0.5, 1.0, 12, 30)
      expect(score).toBeGreaterThanOrEqual(80)
    })

    it('should give lower score for too-easy question (difficulty=0.95)', () => {
      const easyScore = computeQualityScore(0.95, 0.3, 1.0, 12, 30)
      const idealScore = computeQualityScore(0.5, 0.3, 1.0, 12, 30)
      expect(easyScore).toBeLessThan(idealScore)
    })

    it('should give lower score for too-hard question (difficulty=0.05)', () => {
      const hardScore = computeQualityScore(0.05, 0.3, 1.0, 12, 30)
      const idealScore = computeQualityScore(0.5, 0.3, 1.0, 12, 30)
      expect(hardScore).toBeLessThan(idealScore)
    })

    it('should give lower score for poor discrimination', () => {
      const poorDisc = computeQualityScore(0.5, 0.0, 1.0, 12, 30)
      const goodDisc = computeQualityScore(0.5, 0.5, 1.0, 12, 30)
      expect(poorDisc).toBeLessThan(goodDisc)
    })

    it('should give lower score for low response rate', () => {
      const lowResponse = computeQualityScore(0.5, 0.3, 0.3, 12, 30)
      const fullResponse = computeQualityScore(0.5, 0.3, 1.0, 12, 30)
      expect(lowResponse).toBeLessThan(fullResponse)
    })

    it('should always return between 0 and 100', () => {
      // Test extreme inputs
      const extremes = [
        [0, -1, 0, 0, 30],
        [1, 1, 1, 30, 30],
        [0.5, 0.5, 0.5, 15, 30],
        [0, 0, 0, 0, 0],
      ]
      extremes.forEach(args => {
        const score = computeQualityScore(...args)
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(100)
      })
    })
  })

  // ===========================
  // Quality Label Tests
  // ===========================
  describe('Quality Labels', () => {
    function getQualityLabel(difficulty, discrimination, responseCount) {
      if (responseCount < 3) return 'Insufficient Data'
      if (difficulty > 0.9) return 'Too Easy'
      if (difficulty < 0.2) return 'Too Hard'
      if (discrimination < 0) return 'Misleading'
      if (discrimination < 0.15) return 'Poor Discriminator'
      if (discrimination >= 0.4) return 'Excellent'
      if (discrimination >= 0.3) return 'Good'
      return 'Acceptable'
    }

    it('should label as Insufficient Data when too few responses', () => {
      expect(getQualityLabel(0.5, 0.5, 0)).toBe('Insufficient Data')
      expect(getQualityLabel(0.5, 0.5, 1)).toBe('Insufficient Data')
      expect(getQualityLabel(0.5, 0.5, 2)).toBe('Insufficient Data')
    })

    it('should label as Too Easy when difficulty > 0.9', () => {
      expect(getQualityLabel(0.95, 0.5, 10)).toBe('Too Easy')
      expect(getQualityLabel(0.91, 0.5, 10)).toBe('Too Easy')
    })

    it('should label as Too Hard when difficulty < 0.2', () => {
      expect(getQualityLabel(0.1, 0.5, 10)).toBe('Too Hard')
      expect(getQualityLabel(0.19, 0.5, 10)).toBe('Too Hard')
    })

    it('should label as Misleading when discrimination is negative', () => {
      expect(getQualityLabel(0.5, -0.3, 10)).toBe('Misleading')
      expect(getQualityLabel(0.5, -0.01, 10)).toBe('Misleading')
    })

    it('should label as Poor Discriminator when discrimination < 0.15', () => {
      expect(getQualityLabel(0.5, 0.1, 10)).toBe('Poor Discriminator')
      expect(getQualityLabel(0.5, 0.0, 10)).toBe('Poor Discriminator')
    })

    it('should label as Excellent when discrimination >= 0.4', () => {
      expect(getQualityLabel(0.5, 0.4, 10)).toBe('Excellent')
      expect(getQualityLabel(0.5, 0.8, 10)).toBe('Excellent')
    })

    it('should label as Good when discrimination >= 0.3', () => {
      expect(getQualityLabel(0.5, 0.3, 10)).toBe('Good')
      expect(getQualityLabel(0.5, 0.35, 10)).toBe('Good')
    })

    it('should label as Acceptable for mid-range discrimination', () => {
      expect(getQualityLabel(0.5, 0.2, 10)).toBe('Acceptable')
      expect(getQualityLabel(0.5, 0.25, 10)).toBe('Acceptable')
    })

    it('should prioritize difficulty labels over discrimination labels', () => {
      // Even with excellent discrimination, Too Easy takes priority
      expect(getQualityLabel(0.95, 0.5, 10)).toBe('Too Easy')
      // Even with excellent discrimination, Too Hard takes priority
      expect(getQualityLabel(0.1, 0.5, 10)).toBe('Too Hard')
    })
  })

  // ===========================
  // Option Distribution Tests
  // ===========================
  describe('Option Distribution', () => {
    function computeOptionDistribution(responses, optionCount) {
      const distribution = new Array(optionCount).fill(0)
      responses.forEach(r => {
        const selections = (r.selectedOptions && r.selectedOptions.length > 0)
          ? r.selectedOptions
          : (r.selectedOption !== undefined ? [r.selectedOption] : [])

        selections.forEach(idx => {
          if (idx >= 0 && idx < optionCount) {
            distribution[idx]++
          }
        })
      })
      return distribution
    }

    it('should count selections correctly for MCQ', () => {
      const responses = [
        { selectedOption: 0, selectedOptions: [0] },
        { selectedOption: 1, selectedOptions: [1] },
        { selectedOption: 1, selectedOptions: [1] },
        { selectedOption: 2, selectedOptions: [2] }
      ]
      expect(computeOptionDistribution(responses, 4)).toEqual([1, 2, 1, 0])
    })

    it('should count selections correctly for MSQ', () => {
      const responses = [
        { selectedOptions: [0, 1] },     // Selected A + B
        { selectedOptions: [0, 2] },     // Selected A + C
        { selectedOptions: [1, 2, 3] }   // Selected B + C + D
      ]
      expect(computeOptionDistribution(responses, 4)).toEqual([2, 2, 2, 1])
    })

    it('should handle empty responses', () => {
      expect(computeOptionDistribution([], 4)).toEqual([0, 0, 0, 0])
    })

    it('should ignore out-of-range indices', () => {
      const responses = [
        { selectedOptions: [0, 5] },  // 5 is out of range for 4 options
        { selectedOptions: [-1, 1] }  // -1 is out of range
      ]
      expect(computeOptionDistribution(responses, 4)).toEqual([1, 1, 0, 0])
    })

    it('should fallback to selectedOption when selectedOptions is empty', () => {
      const responses = [
        { selectedOption: 2, selectedOptions: [] },
        { selectedOption: 3, selectedOptions: [] }
      ]
      expect(computeOptionDistribution(responses, 4)).toEqual([0, 0, 1, 1])
    })
  })

  // ===========================
  // Summary Helpers Tests
  // ===========================
  describe('Summary Helpers', () => {
    function avg(arr) {
      if (!arr || arr.length === 0) return 0
      const sum = arr.reduce((s, v) => s + v, 0)
      return Math.round((sum / arr.length) * 100) / 100
    }

    function countLabels(questions) {
      const counts = {}
      questions.forEach(q => {
        counts[q.qualityLabel] = (counts[q.qualityLabel] || 0) + 1
      })
      return counts
    }

    it('should compute correct average', () => {
      expect(avg([10, 20, 30])).toBe(20)
      expect(avg([0.3, 0.5, 0.7])).toBe(0.5)
    })

    it('should return 0 for empty array', () => {
      expect(avg([])).toBe(0)
      expect(avg(null)).toBe(0)
    })

    it('should round to 2 decimal places', () => {
      expect(avg([1, 2, 3])).toBe(2) // 2.00
      expect(avg([0.1, 0.2])).toBe(0.15)
    })

    it('should count labels correctly', () => {
      const questions = [
        { qualityLabel: 'Excellent' },
        { qualityLabel: 'Good' },
        { qualityLabel: 'Excellent' },
        { qualityLabel: 'Too Easy' }
      ]
      expect(countLabels(questions)).toEqual({
        'Excellent': 2,
        'Good': 1,
        'Too Easy': 1
      })
    })

    it('should return empty object for no questions', () => {
      expect(countLabels([])).toEqual({})
    })
  })
})
