import {
  PEER_ACCURACY_FLOOR,
  PEER_ACCURACY_WINDOW,
  PEER_DURATION_CAP_MS,
  PEER_GHOST_FALLBACK_MS,
  PEER_RUBRIC_MIN,
  PEER_RUBRIC_MAX,
  BROADCAST_CHANNEL_NAME,
  BROADCAST_MESSAGE_TYPES,
  PEER_REVIEW_STATES,
  clampRubric,
  isValidGrade,
  gradesAgree,
  computeRollingAccuracy,
  meetsAccuracyFloor,
  isGhostFallbackActive,
  isRoundExpired,
  remainingMs,
  deadlineFromStart,
  pairingKey,
  trimRollingWindow,
  recordGrade,
  isValidBroadcastMessage,
  makeBroadcastMessage,
  defaultPeerReviewState
} from '../stores/peerReviewHelpers.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('peerReviewHelpers -- constants', () => {
  test('PEER_ACCURACY_FLOOR is 0.60', () => {
    expect(PEER_ACCURACY_FLOOR).toBe(0.60)
  })
  test('PEER_ACCURACY_WINDOW is 20', () => {
    expect(PEER_ACCURACY_WINDOW).toBe(20)
  })
  test('PEER_DURATION_CAP_MS is 90000', () => {
    expect(PEER_DURATION_CAP_MS).toBe(90000)
  })
  test('PEER_GHOST_FALLBACK_MS is 2500', () => {
    expect(PEER_GHOST_FALLBACK_MS).toBe(2500)
  })
  test('PEER_RUBRIC_MIN is 0, PEER_RUBRIC_MAX is 2', () => {
    expect(PEER_RUBRIC_MIN).toBe(0)
    expect(PEER_RUBRIC_MAX).toBe(2)
  })
  test('BROADCAST_CHANNEL_NAME is "spandan:peer-review"', () => {
    expect(BROADCAST_CHANNEL_NAME).toBe('spandan:peer-review')
  })
  test('BROADCAST_MESSAGE_TYPES is a frozen allow-list', () => {
    expect(Array.isArray(BROADCAST_MESSAGE_TYPES)).toBe(true)
    expect(Object.isFrozen(BROADCAST_MESSAGE_TYPES)).toBe(true)
    expect(BROADCAST_MESSAGE_TYPES.length).toBeGreaterThan(0)
  })
  test('PEER_REVIEW_STATES includes the locked set', () => {
    expect(PEER_REVIEW_STATES).toContain('idle')
    expect(PEER_REVIEW_STATES).toContain('requesting')
    expect(PEER_REVIEW_STATES).toContain('paired')
    expect(PEER_REVIEW_STATES).toContain('ghost')
    expect(PEER_REVIEW_STATES).toContain('grading')
    expect(PEER_REVIEW_STATES).toContain('submitted')
    expect(PEER_REVIEW_STATES).toContain('expired')
  })
})

// ---------------------------------------------------------------------------
// clampRubric
// ---------------------------------------------------------------------------

describe('peerReviewHelpers -- clampRubric', () => {
  test('returns integer 0..2', () => {
    expect(clampRubric(0)).toBe(0)
    expect(clampRubric(1)).toBe(1)
    expect(clampRubric(2)).toBe(2)
  })
  test('floors floats', () => {
    expect(clampRubric(0.5)).toBe(0)
    expect(clampRubric(1.9)).toBe(1)
  })
  test('clamps below 0', () => {
    expect(clampRubric(-1)).toBe(0)
    expect(clampRubric(-100)).toBe(0)
  })
  test('clamps above 2', () => {
    expect(clampRubric(3)).toBe(2)
    expect(clampRubric(100)).toBe(2)
  })
  test('non-finite -> 0', () => {
    expect(clampRubric(NaN)).toBe(0)
    expect(clampRubric(Infinity)).toBe(0)
    expect(clampRubric(-Infinity)).toBe(0)
  })
  test('non-number -> 0', () => {
    expect(clampRubric('1')).toBe(0)
    expect(clampRubric(null)).toBe(0)
    expect(clampRubric(undefined)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// isValidGrade
// ---------------------------------------------------------------------------

describe('peerReviewHelpers -- isValidGrade', () => {
  test('accepts 0, 1, 2', () => {
    expect(isValidGrade(0)).toBe(true)
    expect(isValidGrade(1)).toBe(true)
    expect(isValidGrade(2)).toBe(true)
  })
  test('rejects out-of-range', () => {
    expect(isValidGrade(-1)).toBe(false)
    expect(isValidGrade(3)).toBe(false)
  })
  test('rejects floats', () => {
    expect(isValidGrade(0.5)).toBe(false)
    expect(isValidGrade(1.999)).toBe(false)
  })
  test('rejects non-numbers', () => {
    expect(isValidGrade('1')).toBe(false)
    expect(isValidGrade(null)).toBe(false)
    expect(isValidGrade(undefined)).toBe(false)
    expect(isValidGrade(NaN)).toBe(false)
    expect(isValidGrade(Infinity)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// gradesAgree
// ---------------------------------------------------------------------------

describe('peerReviewHelpers -- gradesAgree', () => {
  test('exact match agrees', () => {
    expect(gradesAgree(0, 0)).toBe(true)
    expect(gradesAgree(1, 1)).toBe(true)
    expect(gradesAgree(2, 2)).toBe(true)
  })
  test('off-by-one agrees', () => {
    expect(gradesAgree(0, 1)).toBe(true)
    expect(gradesAgree(1, 2)).toBe(true)
  })
  test('off-by-two disagrees', () => {
    expect(gradesAgree(0, 2)).toBe(false)
    expect(gradesAgree(2, 0)).toBe(false)
  })
  test('rejects invalid grades', () => {
    expect(gradesAgree(0, 3)).toBe(false)
    expect(gradesAgree('1', 1)).toBe(false)
    expect(gradesAgree(NaN, 1)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// computeRollingAccuracy
// ---------------------------------------------------------------------------

describe('peerReviewHelpers -- computeRollingAccuracy', () => {
  test('empty array -> 0', () => {
    expect(computeRollingAccuracy([])).toBe(0)
  })
  test('non-array -> 0', () => {
    expect(computeRollingAccuracy(null)).toBe(0)
    expect(computeRollingAccuracy(undefined)).toBe(0)
  })
  test('all correct -> 1', () => {
    const grades = [
      { correct: true }, { correct: true }, { correct: true }
    ]
    expect(computeRollingAccuracy(grades)).toBe(1)
  })
  test('mixed -> ratio', () => {
    const grades = [
      { correct: true },
      { correct: false },
      { correct: true },
      { correct: false }
    ]
    expect(computeRollingAccuracy(grades)).toBe(0.5)
  })
  test('treats non-boolean correct as incorrect (does not skip)', () => {
    const grades = [
      { correct: true },
      { correct: false },
      { correct: 'yes' } // non-boolean -> counts in denominator, NOT in numerator
    ]
    expect(computeRollingAccuracy(grades)).toBeCloseTo(1 / 3, 5)
  })
})

// ---------------------------------------------------------------------------
// meetsAccuracyFloor
// ---------------------------------------------------------------------------

describe('peerReviewHelpers -- meetsAccuracyFloor', () => {
  test('0.60 meets the floor', () => {
    expect(meetsAccuracyFloor(0.60)).toBe(true)
  })
  test('0.59 fails', () => {
    expect(meetsAccuracyFloor(0.59)).toBe(false)
  })
  test('1.00 meets', () => {
    expect(meetsAccuracyFloor(1.00)).toBe(true)
  })
  test('non-finite fails', () => {
    expect(meetsAccuracyFloor(NaN)).toBe(false)
    expect(meetsAccuracyFloor(Infinity)).toBe(false)
  })
  test('non-number fails', () => {
    expect(meetsAccuracyFloor('0.6')).toBe(false)
    expect(meetsAccuracyFloor(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isGhostFallbackActive / isRoundExpired / remainingMs
// ---------------------------------------------------------------------------

describe('peerReviewHelpers -- timing', () => {
  test('isGhostFallbackActive: false below 2.5s, true at/above', () => {
    expect(isGhostFallbackActive(0)).toBe(false)
    expect(isGhostFallbackActive(2499)).toBe(false)
    expect(isGhostFallbackActive(2500)).toBe(true)
    expect(isGhostFallbackActive(5000)).toBe(true)
  })
  test('isGhostFallbackActive: non-finite -> 0 (false)', () => {
    expect(isGhostFallbackActive(NaN)).toBe(false)
    expect(isGhostFallbackActive(undefined)).toBe(false)
  })
  test('isRoundExpired: false below 90s, true at/above', () => {
    expect(isRoundExpired(0)).toBe(false)
    expect(isRoundExpired(89999)).toBe(false)
    expect(isRoundExpired(90000)).toBe(true)
    expect(isRoundExpired(100000)).toBe(true)
  })
  test('remainingMs: clamps to [0, cap]', () => {
    expect(remainingMs(0)).toBe(90000)
    expect(remainingMs(45000)).toBe(45000)
    expect(remainingMs(90000)).toBe(0)
    expect(remainingMs(100000)).toBe(0)
  })
  test('remainingMs: negative or non-finite -> 0', () => {
    expect(remainingMs(-5)).toBe(0)
    expect(remainingMs(NaN)).toBe(0)
  })
  test('deadlineFromStart: add 90s', () => {
    expect(deadlineFromStart(1000)).toBe(91000)
  })
  test('deadlineFromStart: non-finite or 0 -> 0', () => {
    expect(deadlineFromStart(0)).toBe(0)
    expect(deadlineFromStart(NaN)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// pairingKey
// ---------------------------------------------------------------------------

describe('peerReviewHelpers -- pairingKey', () => {
  test('joins questionId and userId with ::', () => {
    expect(pairingKey('q1', 'u1')).toBe('q1::u1')
  })
  test('empty strings -> empty', () => {
    expect(pairingKey('', 'u1')).toBe('')
    expect(pairingKey('q1', '')).toBe('')
  })
  test('non-strings -> empty', () => {
    expect(pairingKey(123, 'u1')).toBe('')
    expect(pairingKey('q1', null)).toBe('')
  })
  test('different inputs produce different keys', () => {
    expect(pairingKey('q1', 'u1')).not.toBe(pairingKey('q2', 'u1'))
  })
})

// ---------------------------------------------------------------------------
// trimRollingWindow / recordGrade
// ---------------------------------------------------------------------------

describe('peerReviewHelpers -- rolling window', () => {
  test('trimRollingWindow: under cap returns copy', () => {
    const arr = [1, 2, 3]
    const out = trimRollingWindow(arr, 10)
    expect(out).toEqual([1, 2, 3])
    expect(out).not.toBe(arr)
  })
  test('trimRollingWindow: over cap returns last N', () => {
    const arr = []
    for (let i = 0; i < 25; i++) arr.push(i)
    expect(trimRollingWindow(arr, 20)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])
  })
  test('trimRollingWindow: non-array -> empty', () => {
    expect(trimRollingWindow(null, 20)).toEqual([])
  })
  test('recordGrade: appends correct:false when my != server by 2', () => {
    const out = recordGrade([], 0, 2, 20)
    expect(out.length).toBe(1)
    expect(out[0].correct).toBe(false)
    expect(out[0].myGrade).toBe(2)
    expect(out[0].serverGrade).toBe(0)
  })
  test('recordGrade: appends correct:true when exact match', () => {
    const out = recordGrade([], 1, 1, 20)
    expect(out[0].correct).toBe(true)
  })
  test('recordGrade: appends correct:true when off-by-one (lenient)', () => {
    const out = recordGrade([], 1, 0, 20)
    expect(out[0].correct).toBe(true)
  })
  test('recordGrade: respects window cap', () => {
    let acc = []
    for (let i = 0; i < 25; i++) {
      acc = recordGrade(acc, 0, 0, 20)
    }
    expect(acc.length).toBe(20)
  })
  test('recordGrade: invalid grades captured as null', () => {
    const out = recordGrade([], null, null, 20)
    expect(out[0].myGrade).toBe(null)
    expect(out[0].serverGrade).toBe(null)
    expect(out[0].correct).toBe(false)
  })
  test('recordGrade: default cap is PEER_ACCURACY_WINDOW', () => {
    let acc = []
    for (let i = 0; i < 25; i++) {
      acc = recordGrade(acc, 0, 0)
    }
    expect(acc.length).toBe(PEER_ACCURACY_WINDOW)
  })
})

// ---------------------------------------------------------------------------
// BroadcastChannel message helpers
// ---------------------------------------------------------------------------

describe('peerReviewHelpers -- broadcast', () => {
  test('isValidBroadcastMessage: accepts a known type', () => {
    expect(isValidBroadcastMessage({ type: 'peer-review:hello', payload: {} })).toBe(true)
  })
  test('isValidBroadcastMessage: rejects unknown type', () => {
    expect(isValidBroadcastMessage({ type: 'bogus', payload: {} })).toBe(false)
  })
  test('isValidBroadcastMessage: rejects missing payload', () => {
    expect(isValidBroadcastMessage({ type: 'peer-review:hello' })).toBe(false)
  })
  test('isValidBroadcastMessage: rejects non-objects', () => {
    expect(isValidBroadcastMessage('peer-review:hello')).toBe(false)
    expect(isValidBroadcastMessage(null)).toBe(false)
    expect(isValidBroadcastMessage(42)).toBe(false)
  })
  test('isValidBroadcastMessage: rejects missing type', () => {
    expect(isValidBroadcastMessage({ payload: {} })).toBe(false)
  })
  test('makeBroadcastMessage: builds a valid message', () => {
    const m = makeBroadcastMessage('peer-review:request', { qid: 'q1' })
    expect(m.type).toBe('peer-review:request')
    expect(m.payload.qid).toBe('q1')
    expect(typeof m.at).toBe('number')
  })
  test('makeBroadcastMessage: returns null for unknown type', () => {
    expect(makeBroadcastMessage('bogus', {})).toBe(null)
  })
  test('makeBroadcastMessage: returns null for non-string type', () => {
    expect(makeBroadcastMessage(42, {})).toBe(null)
  })
  test('makeBroadcastMessage: empty payload -> empty object', () => {
    const m = makeBroadcastMessage('peer-review:hello')
    expect(m.payload).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// defaultPeerReviewState
// ---------------------------------------------------------------------------

describe('peerReviewHelpers -- defaultPeerReviewState', () => {
  test('returns frozen object with locked shape', () => {
    const s = defaultPeerReviewState()
    expect(Object.isFrozen(s)).toBe(true)
    expect(s.status).toBe('idle')
    expect(s.questionId).toBe('')
    expect(s.mySubmission).toBe('')
    expect(s.peerSubmission).toBe('')
    expect(s.myGrade).toBe(null)
    expect(s.peerGrade).toBe(null)
    expect(Array.isArray(s.rollingGrades)).toBe(true)
    expect(s.rollingGrades.length).toBe(0)
    expect(s.rollingAccuracy).toBe(0)
    expect(s.meetsFloor).toBe(false)
    expect(s.startedAt).toBe(0)
    expect(s.deadlineAt).toBe(0)
    expect(s.isGhostMode).toBe(false)
    expect(s.roundExpired).toBe(false)
    expect(s.lastBroadcastAt).toBe(0)
  })
  test('returns a fresh object each call', () => {
    const a = defaultPeerReviewState()
    const b = defaultPeerReviewState()
    expect(a).not.toBe(b)
    expect(a.rollingGrades).not.toBe(b.rollingGrades)
  })
})