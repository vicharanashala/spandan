describe('Spandan Engagement Index (SEI) - Unit Tests', () => {
  let scoreQuestion, updateIndex, isDisengaged, recordSignal, clearRoom, SEI_CONFIG

  beforeAll(async () => {
    const service = await import('../services/engagementService.js')
    scoreQuestion = service.scoreQuestion
    updateIndex = service.updateIndex
    isDisengaged = service.isDisengaged
    recordSignal = service.recordSignal
    clearRoom = service.clearRoom
    SEI_CONFIG = service.SEI_CONFIG
  })

  beforeEach(() => {
    // Clear room memory before each test
    if (clearRoom) clearRoom('test-room-123')
  })

  // Test 1: scoreQuestion with simple signals (participation, fast, correct, no switches) -> should return 100
  test('scoreQuestion - full engagement returns 100', () => {
    const signal = {
      answered: true,
      isCorrect: true,
      responseTime: 5,
      timerSeconds: 30,
      answerSwitches: 0
    }
    const score = scoreQuestion(signal)
    expect(score).toBe(100)
  })

  // Test 2: scoreQuestion with non-participation -> should return 0
  test('scoreQuestion - non-participation returns 0', () => {
    const signal = {
      answered: false,
      isCorrect: false,
      responseTime: 0,
      timerSeconds: 30,
      answerSwitches: 0
    }
    const score = scoreQuestion(signal)
    expect(score).toBe(0)
  })

  // Test 3: scoreQuestion with answer switching (decisiveness reduction) -> should return lower score
  test('scoreQuestion - multiple answer switches reduce the score', () => {
    const signalWithSwitches = {
      answered: true,
      isCorrect: true,
      responseTime: 5,
      timerSeconds: 30,
      answerSwitches: 4 // Decisiveness decays when switches > 1
    }
    const fullSignal = {
      answered: true,
      isCorrect: true,
      responseTime: 5,
      timerSeconds: 30,
      answerSwitches: 0
    }
    const scoreWithSwitches = scoreQuestion(signalWithSwitches)
    const fullScore = scoreQuestion(fullSignal)
    expect(scoreWithSwitches).toBeLessThan(fullScore)
    expect(scoreWithSwitches).toBeGreaterThan(0)
  })

  // Test 4: scoreQuestion with slow response timing -> should return lower score than immediate, decaying linearly
  test('scoreQuestion - response timing decay', () => {
    const fastSignal = {
      answered: true,
      isCorrect: true,
      responseTime: 10, // 33% of timer, <= 70% threshold
      timerSeconds: 30,
      answerSwitches: 0
    }
    const slowSignal = {
      answered: true,
      isCorrect: true,
      responseTime: 27, // 90% of timer, decays timing factor
      timerSeconds: 30,
      answerSwitches: 0
    }
    const fastScore = scoreQuestion(fastSignal)
    const slowScore = scoreQuestion(slowSignal)
    expect(fastScore).toBe(100)
    expect(slowScore).toBeLessThan(fastScore)
  })

  // Test 5: scoreQuestion with incorrect answers -> correctness factor of 0.4, should return lower score but above 0 if participated
  test('scoreQuestion - wrong answer still rewards participation and effort', () => {
    const correctSignal = {
      answered: true,
      isCorrect: true,
      responseTime: 5,
      timerSeconds: 30,
      answerSwitches: 0
    }
    const wrongSignal = {
      answered: true,
      isCorrect: false,
      responseTime: 5,
      timerSeconds: 30,
      answerSwitches: 0
    }
    const correctScore = scoreQuestion(correctSignal)
    const wrongScore = scoreQuestion(wrongSignal)
    expect(correctScore).toBe(100)
    expect(wrongScore).toBeLessThan(correctScore)
    expect(wrongScore).toBeGreaterThan(0) // Participation + timing + decisiveness are still positive
  })

  // Test 6: updateIndex EWMA smoothing logic -> blends new score with previous score using alpha=0.4
  test('updateIndex - EWMA calculation', () => {
    // If no previous index, returns the score
    expect(updateIndex(null, 80)).toBe(80)
    expect(updateIndex(undefined, 80)).toBe(80)

    // Blend: 0.4 * newScore + 0.6 * previousIndex
    // 0.4 * 100 + 0.6 * 50 = 40 + 30 = 70
    expect(updateIndex(50, 100)).toBe(70)
  })

  // Test 7: isDisengaged rolling window logic -> returns false if recentScores length is less than WINDOW_SIZE (3)
  test('isDisengaged - requires full window size to check disengagement', () => {
    const recentScores = [10, 15] // average is low, but window is not full (size < 3)
    expect(isDisengaged(recentScores)).toBe(false)
  })

  // Test 8: isDisengaged average below threshold -> returns true if rolling average is < 35
  test('isDisengaged - returns true when average of last 3 is below threshold', () => {
    const lowScores = [30, 20, 40] // average is 30 (< 35)
    const highScores = [30, 40, 40] // average is 36.6 (>= 35)
    expect(isDisengaged(lowScores)).toBe(true)
    expect(isDisengaged(highScores)).toBe(false)
  })

  // Test 9: recordSignal state storage -> correctly stores, updates, and returns the current index
  test('recordSignal - stores and updates index', () => {
    const result1 = recordSignal('test-room-123', 'student-1', {
      answered: true,
      isCorrect: true,
      responseTime: 5,
      timerSeconds: 30,
      answerSwitches: 0
    })
    expect(result1.index).toBe(100)
    expect(result1.disengaged).toBe(false)
    expect(result1.shouldAlert).toBe(false)

    // Record a second signal: previousIndex=100, score=0 (skipped)
    // newIndex = 0.4 * 0 + 0.6 * 100 = 60
    const result2 = recordSignal('test-room-123', 'student-1', { answered: false })
    expect(result2.index).toBe(60)
  })

  // Test 10: recordSignal alerts once -> shouldAlert is true only on the first disengagement episode
  test('recordSignal - triggers alert only once per disengagement episode', () => {
    // Fill the window with low scores to trigger disengagement.
    // 1st skip: index = 0, window = [0]
    recordSignal('test-room-123', 'student-1', { answered: false })
    // 2nd skip: prev=0, score=0 => index = 0, window = [0, 0]
    recordSignal('test-room-123', 'student-1', { answered: false })
    // 3rd skip: prev=0, score=0 => index = 0, window = [0, 0, 0] (Window full, average=0 < 35) -> should alert
    const result3 = recordSignal('test-room-123', 'student-1', { answered: false })
    expect(result3.disengaged).toBe(true)
    expect(result3.shouldAlert).toBe(true)

    // 4th skip: average of window still 0 (< 35), should alert=false since already alerted
    const result4 = recordSignal('test-room-123', 'student-1', { answered: false })
    expect(result4.disengaged).toBe(true)
    expect(result4.shouldAlert).toBe(false)
  })

  // Test 11: recordSignal resets alert status -> alert status resets when index recovers above threshold (average of last 3 >= 35)
  test('recordSignal - alert status resets on recovery', () => {
    // 1. Trigger disengagement
    recordSignal('test-room-123', 'student-1', { answered: false })
    recordSignal('test-room-123', 'student-1', { answered: false })
    const resultAlert = recordSignal('test-room-123', 'student-1', { answered: false })
    expect(resultAlert.shouldAlert).toBe(true)

    // 2. Recover student index
    // 4th question: answered fully. score=100. window = [0, 0, 100]. Avg = 33.3 < 35 => still disengaged
    const resultRecover1 = recordSignal('test-room-123', 'student-1', {
      answered: true,
      isCorrect: true,
      responseTime: 5,
      timerSeconds: 30,
      answerSwitches: 0
    })
    expect(resultRecover1.disengaged).toBe(true)

    // 5th question: answered fully. score=100. window = [0, 100, 100]. Avg = 66.6 >= 35 => recovered!
    const resultRecover2 = recordSignal('test-room-123', 'student-1', {
      answered: true,
      isCorrect: true,
      responseTime: 5,
      timerSeconds: 30,
      answerSwitches: 0
    })
    expect(resultRecover2.disengaged).toBe(false)
    expect(resultRecover2.shouldAlert).toBe(false)

    // 3. Fall into disengagement again, alert should fire again
    recordSignal('test-room-123', 'student-1', { answered: false }) // first skip: avg of [100, 100, 0] = 66.6 >= 35
    const resultAlertAgain = recordSignal('test-room-123', 'student-1', { answered: false }) // second skip: avg of [100, 0, 0] = 33.3 < 35 -> triggers alert!
    expect(resultAlertAgain.disengaged).toBe(true)
    expect(resultAlertAgain.shouldAlert).toBe(true) // Fires alert again for the new episode!
  })

  // Test 12: clearRoom cleans up memory -> clears the room store
  test('clearRoom - clears student state memory for the room', () => {
    // Add student data
    recordSignal('test-room-123', 'student-1', { answered: true, isCorrect: true })
    
    // Clear room
    clearRoom('test-room-123')

    // Adding student data again. Since room was cleared, previous index is null and should be set directly to 100
    const result = recordSignal('test-room-123', 'student-1', { answered: true, isCorrect: true, responseTime: 5, timerSeconds: 30, answerSwitches: 0 })
    expect(result.index).toBe(100) // If it didn't clear, EWMA would blend it to a different value
  })
})
