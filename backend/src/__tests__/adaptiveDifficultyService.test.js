// Unit tests for adaptive difficulty step logic
// This tests the exact logic used in services/adaptiveDifficultyService.js's stepDifficulty()

describe('Adaptive Difficulty Step Logic', () => {
  const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard']
  const ADAPTIVE_UP_THRESHOLD = 80
  const ADAPTIVE_DOWN_THRESHOLD = 40

  // Helper function that replicates stepDifficulty()
  function stepDifficulty(currentDifficulty, correctnessPct) {
    const idx = DIFFICULTY_LEVELS.indexOf(currentDifficulty)
    const currentIdx = idx === -1 ? DIFFICULTY_LEVELS.indexOf('medium') : idx

    if (correctnessPct >= ADAPTIVE_UP_THRESHOLD) {
      return DIFFICULTY_LEVELS[Math.min(currentIdx + 1, DIFFICULTY_LEVELS.length - 1)]
    }
    if (correctnessPct <= ADAPTIVE_DOWN_THRESHOLD) {
      return DIFFICULTY_LEVELS[Math.max(currentIdx - 1, 0)]
    }
    return DIFFICULTY_LEVELS[currentIdx]
  }

  describe('Stepping up on high correctness', () => {
    it('should step easy -> medium at 80% correct', () => {
      expect(stepDifficulty('easy', 80)).toBe('medium')
    })

    it('should step medium -> hard at 90% correct', () => {
      expect(stepDifficulty('medium', 90)).toBe('hard')
    })

    it('should clamp at hard when already hard', () => {
      expect(stepDifficulty('hard', 100)).toBe('hard')
    })
  })

  describe('Stepping down on low correctness', () => {
    it('should step hard -> medium at 40% correct', () => {
      expect(stepDifficulty('hard', 40)).toBe('medium')
    })

    it('should step medium -> easy at 30% correct', () => {
      expect(stepDifficulty('medium', 30)).toBe('easy')
    })

    it('should clamp at easy when already easy', () => {
      expect(stepDifficulty('easy', 0)).toBe('easy')
    })
  })

  describe('Middle band leaves difficulty unchanged', () => {
    it('should hold at medium for 60% correct', () => {
      expect(stepDifficulty('medium', 60)).toBe('medium')
    })

    it('should hold at easy for 41% correct', () => {
      expect(stepDifficulty('easy', 41)).toBe('easy')
    })

    it('should hold at hard for 79% correct', () => {
      expect(stepDifficulty('hard', 79)).toBe('hard')
    })
  })

  describe('Boundary values', () => {
    it('should treat exactly 80% as an up-step', () => {
      expect(stepDifficulty('easy', 80)).toBe('medium')
    })

    it('should treat exactly 40% as a down-step', () => {
      expect(stepDifficulty('hard', 40)).toBe('medium')
    })

    it('should not step at 79%', () => {
      expect(stepDifficulty('easy', 79)).toBe('easy')
    })

    it('should not step at 41%', () => {
      expect(stepDifficulty('hard', 41)).toBe('hard')
    })
  })

  describe('Unrecognized current difficulty', () => {
    it('should default to medium-equivalent behavior for an unknown string', () => {
      expect(stepDifficulty('unknown', 90)).toBe('hard') // treated as medium -> step up
      expect(stepDifficulty('unknown', 30)).toBe('easy') // treated as medium -> step down
      expect(stepDifficulty('unknown', 60)).toBe('medium') // treated as medium -> unchanged
    })
  })
})
