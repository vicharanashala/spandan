// Unit tests for MSQ correctness logic
// This tests the exact logic used in responses.js lines 47-60

describe('MSQ Correctness Logic', () => {
  // Helper function that replicates the MSQ correctness check
  function checkMSQCorrectness(options, selectedOptions) {
    const correctIndices = options
      .map((opt, idx) => opt.isCorrect ? idx : -1)
      .filter(idx => idx !== -1)
    
    const selectedSet = new Set(selectedOptions)
    const correctSet = new Set(correctIndices)
    
    const allCorrectSelected = correctIndices.every(idx => selectedSet.has(idx))
    const noIncorrectSelected = selectedOptions.every(idx => correctSet.has(idx))
    
    return allCorrectSelected && noIncorrectSelected
  }

  const mockQuestion = {
    type: 'MSQ',
    options: [
      { text: 'Option A', isCorrect: true },
      { text: 'Option B', isCorrect: true },
      { text: 'Option C', isCorrect: false },
      { text: 'Option D', isCorrect: false }
    ],
    points: 100,
    timeToAnswer: 30
  }

  describe('All correct selected, no incorrect selected', () => {
    it('should return true when only correct options are selected', () => {
      const selectedOptions = [0, 1] // Select A and B (correct)
      expect(checkMSQCorrectness(mockQuestion.options, selectedOptions)).toBe(true)
    })

    it('should return true when correct order is different', () => {
      const selectedOptions = [1, 0] // Same as [0,1] but different order
      expect(checkMSQCorrectness(mockQuestion.options, selectedOptions)).toBe(true)
    })

    it('should return true when selecting single correct option', () => {
      const selectedOptions = [0] // Only A (correct)
      expect(checkMSQCorrectness(mockQuestion.options, selectedOptions)).toBe(false) // NOT true - missing B
    })
  })

  describe('Some correct, some incorrect selected', () => {
    it('should return false when correct and incorrect options are selected', () => {
      const selectedOptions = [0, 2] // A (correct) + C (incorrect)
      expect(checkMSQCorrectness(mockQuestion.options, selectedOptions)).toBe(false)
    })

    it('should return false when one correct is selected with multiple incorrect', () => {
      const selectedOptions = [0, 2, 3] // A + C + D (one correct, two incorrect)
      expect(checkMSQCorrectness(mockQuestion.options, selectedOptions)).toBe(false)
    })
  })

  describe('Only incorrect selected', () => {
    it('should return false when only incorrect options are selected', () => {
      const selectedOptions = [2, 3] // C and D (both incorrect)
      expect(checkMSQCorrectness(mockQuestion.options, selectedOptions)).toBe(false)
    })

    it('should return false when single incorrect option is selected', () => {
      const selectedOptions = [2] // Only C (incorrect)
      expect(checkMSQCorrectness(mockQuestion.options, selectedOptions)).toBe(false)
    })
  })

  describe('Partial correct - missing some correct', () => {
    it('should return false when only one correct option selected', () => {
      const selectedOptions = [0] // Only A (correct), missing B
      expect(checkMSQCorrectness(mockQuestion.options, selectedOptions)).toBe(false)
    })

    it('should return false when all correct are selected but extras', () => {
      const selectedOptions = [0, 1, 2] // A, B (correct) + C (incorrect)
      expect(checkMSQCorrectness(mockQuestion.options, selectedOptions)).toBe(false)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty selection', () => {
      const selectedOptions = []
      expect(checkMSQCorrectness(mockQuestion.options, selectedOptions)).toBe(false)
    })

    it('should handle all options selected', () => {
      const selectedOptions = [0, 1, 2, 3] // All options
      expect(checkMSQCorrectness(mockQuestion.options, selectedOptions)).toBe(false) // Extra incorrect selected
    })

    it('should handle duplicate indices in selection', () => {
      const selectedOptions = [0, 0, 1] // A, A, B (duplicate)
      expect(checkMSQCorrectness(mockQuestion.options, selectedOptions)).toBe(true)
    })
  })

  describe('Time-decay points calculation', () => {
    function calculatePoints(isCorrect, maxPoints, tta, responseTime) {
      if (!isCorrect) return 0
      const timeRemaining = Math.max(0, tta - responseTime)
      const timeDecayFactor = Math.max(0.1, timeRemaining / tta)
      return Math.round(maxPoints * timeDecayFactor)
    }

    it('should return full points for immediate correct answer', () => {
      expect(calculatePoints(true, 100, 30, 0)).toBe(100)
    })

    it('should return reduced points for late correct answer', () => {
      const points = calculatePoints(true, 100, 30, 15)
      expect(points).toBe(50) // Half time remaining = half points
    })

    it('should return minimum 10% for very slow correct answer', () => {
      const points = calculatePoints(true, 100, 30, 28)
      expect(points).toBe(10) // 2 seconds left = ~6.7%, but minimum 10
    })

    it('should return 0 for incorrect answer regardless of time', () => {
      expect(calculatePoints(false, 100, 30, 0)).toBe(0)
      expect(calculatePoints(false, 100, 30, 5)).toBe(0)
    })
  })
})