import useWagerStore, { _resetWagerStoreForTests } from '../stores/wagerStore.js'
import {
  WAGER_STOPS,
  MIN_WAGER_PCT,
  MAX_WAGER_PCT,
  DEFAULT_WAGER_PCT,
  isValidWagerPct,
  clampToStop,
  payoutOnWin,
  payoutOnMiss,
  defaultWagerState,
  activeQuestionId,
  computeOutcomePoints
} from '../stores/wagerHelpers.js'

describe('wagerHelpers -- pure constants', () => {
  test('WAGER_STOPS is exactly [0, 25, 50, 75, 100] and frozen', () => {
    expect(WAGER_STOPS).toEqual([0, 25, 50, 75, 100])
    expect(Object.isFrozen(WAGER_STOPS)).toBe(true)
  })
  test('min/max/default are 0/100/0', () => {
    expect(MIN_WAGER_PCT).toBe(0)
    expect(MAX_WAGER_PCT).toBe(100)
    expect(DEFAULT_WAGER_PCT).toBe(0)
  })
  test('defaultWagerState shape', () => {
    const s = defaultWagerState()
    expect(s.baseScore).toBe(0)
    expect(s.wagerPct).toBe(0)
    expect(s.locked).toBe(false)
    expect(s.questionId).toBe('')
    expect(s.cumulativeDelta).toBe(0)
    expect(Object.isFrozen(s)).toBe(true)
  })
})

describe('wagerHelpers -- pure math', () => {
  describe('isValidWagerPct', () => {
    test.each([
      [0, true],
      [25, true],
      [50, true],
      [75, true],
      [100, true]
    ])('valid stop %i -> %s', (pct, expected) => {
      expect(isValidWagerPct(pct)).toBe(expected)
    })
    test.each([
      [null], [undefined], ['25'], [12.5], [-1], [101], [NaN], [Infinity]
    ])('rejects %p', (pct) => {
      expect(isValidWagerPct(pct)).toBe(false)
    })
  })

  describe('clampToStop', () => {
    test('rounds down below first stop', () => {
      expect(clampToStop(-5)).toBe(0)
    })
    test('rounds to nearest stop for mid-range values', () => {
      expect(clampToStop(30)).toBe(25)
      expect(clampToStop(40)).toBe(50)
      expect(clampToStop(60)).toBe(50)
      expect(clampToStop(80)).toBe(75)
    })
    test('rounds up above last stop', () => {
      expect(clampToStop(120)).toBe(100)
    })
    test('non-finite input -> default', () => {
      expect(clampToStop(NaN)).toBe(0)
      expect(clampToStop('x')).toBe(0)
      expect(clampToStop(null)).toBe(0)
      expect(clampToStop(undefined)).toBe(0)
    })
  })

  describe('payoutOnWin', () => {
    test('pct=0 returns base only', () => {
      expect(payoutOnWin(100, 0)).toBe(100)
      expect(payoutOnWin(50, 0)).toBe(50)
    })
    test('pct=50 returns 1.5x rounded', () => {
      expect(payoutOnWin(100, 50)).toBe(150)
      expect(payoutOnWin(99, 50)).toBe(149)
    })
    test('pct=100 returns 2x', () => {
      expect(payoutOnWin(100, 100)).toBe(200)
    })
    test('pct=25 returns 1.25x', () => {
      expect(payoutOnWin(100, 25)).toBe(125)
    })
    test('pct=75 returns 1.75x', () => {
      expect(payoutOnWin(100, 75)).toBe(175)
    })
    test('non-finite base -> 0', () => {
      expect(payoutOnWin(-1, 50)).toBe(0)
      expect(payoutOnWin(NaN, 50)).toBe(0)
      expect(payoutOnWin(undefined, 50)).toBe(0)
      expect(payoutOnWin(null, 50)).toBe(0)
    })
    test('invalid pct -> treated as default 0', () => {
      expect(payoutOnWin(100, 33)).toBe(100)
      expect(payoutOnWin(100, -25)).toBe(100)
    })
    test('rounding: integer points only', () => {
      expect(payoutOnWin(7, 50)).toBe(11)
    })
  })

  describe('payoutOnMiss', () => {
    test('always 0 regardless of base', () => {
      expect(payoutOnMiss(100)).toBe(0)
      expect(payoutOnMiss(0)).toBe(0)
      expect(payoutOnMiss(999)).toBe(0)
      expect(payoutOnMiss(NaN)).toBe(0)
    })
  })

  describe('activeQuestionId', () => {
    test('reads _id, falls back to id, returns empty for null/empty', () => {
      expect(activeQuestionId({ _id: 'q1' })).toBe('q1')
      expect(activeQuestionId({ id: 'q2' })).toBe('q2')
      expect(activeQuestionId(null)).toBe('')
      expect(activeQuestionId(undefined)).toBe('')
      expect(activeQuestionId({})).toBe('')
    })
  })

  describe('computeOutcomePoints', () => {
    test('returns 0 when locked=false', () => {
      expect(computeOutcomePoints(
        { locked: false, baseScore: 100, wagerPct: 50 }, 'win'
      )).toBe(0)
    })
    test('win uses payoutOnWin', () => {
      expect(computeOutcomePoints(
        { locked: true, baseScore: 100, wagerPct: 50 }, 'win'
      )).toBe(150)
    })
    test('miss returns 0', () => {
      expect(computeOutcomePoints(
        { locked: true, baseScore: 100, wagerPct: 50 }, 'miss'
      )).toBe(0)
    })
    test('unknown outcome -> 0', () => {
      expect(computeOutcomePoints(
        { locked: true, baseScore: 100, wagerPct: 50 }, 'draw'
      )).toBe(0)
    })
  })
})

describe('wagerStore -- zustand store', () => {
  beforeEach(() => {
    _resetWagerStoreForTests()
  })

  describe('initial state', () => {
    test('matches defaultWagerState()', () => {
      const s = useWagerStore.getState()
      expect(s.baseScore).toBe(0)
      expect(s.wagerPct).toBe(0)
      expect(s.locked).toBe(false)
      expect(s.questionId).toBe('')
      expect(s.cumulativeDelta).toBe(0)
    })
  })

  describe('startQuestion', () => {
    test('first call sets baseScore + resets wager', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      const s = useWagerStore.getState()
      expect(s.questionId).toBe('q1')
      expect(s.baseScore).toBe(100)
      expect(s.wagerPct).toBe(0)
      expect(s.locked).toBe(false)
    })
    test('non-finite or negative baseScore coerced to 0', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, -5)
      expect(useWagerStore.getState().baseScore).toBe(0)
      useWagerStore.getState().startQuestion({ _id: 'q2' }, NaN)
      expect(useWagerStore.getState().baseScore).toBe(0)
    })
    test('same question id is a no-op for wager + lock', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.getState().setWagerPct(50)
      useWagerStore.getState().lockWager()
      const before = { ...useWagerStore.getState() }
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 200)
      const after = useWagerStore.getState()
      expect(after.wagerPct).toBe(before.wagerPct)
      expect(after.locked).toBe(before.locked)
      expect(after.baseScore).toBe(before.baseScore)
    })
    test('different question resets wager and adopts new snapshot', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.getState().setWagerPct(75)
      useWagerStore.getState().lockWager()
      useWagerStore.getState().startQuestion({ _id: 'q2' }, 250)
      const s = useWagerStore.getState()
      expect(s.questionId).toBe('q2')
      expect(s.baseScore).toBe(250)
      expect(s.wagerPct).toBe(0)
      expect(s.locked).toBe(false)
    })
    test('reading the id field via `id` instead of `_id`', () => {
      useWagerStore.getState().startQuestion({ id: 'q99' }, 42)
      expect(useWagerStore.getState().questionId).toBe('q99')
      expect(useWagerStore.getState().baseScore).toBe(42)
    })
  })

  describe('setWagerPct', () => {
    test('accepts all valid stops', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      for (const stop of [0, 25, 50, 75, 100]) {
        useWagerStore.getState().setWagerPct(stop)
        expect(useWagerStore.getState().wagerPct).toBe(stop)
      }
    })
    test('invalid pct is clamped to nearest stop', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.getState().setWagerPct(33)
      expect(useWagerStore.getState().wagerPct).toBe(25)
      useWagerStore.getState().setWagerPct(82)
      expect(useWagerStore.getState().wagerPct).toBe(75)
    })
    test('non-finite pct defaults to 0', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.getState().setWagerPct(NaN)
      expect(useWagerStore.getState().wagerPct).toBe(0)
    })
    test('locked wager cannot be changed', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.getState().setWagerPct(50)
      useWagerStore.getState().lockWager()
      useWagerStore.getState().setWagerPct(100)
      expect(useWagerStore.getState().wagerPct).toBe(50)
    })
  })

  describe('lockWager', () => {
    test('returns false when no question active', () => {
      const ok = useWagerStore.getState().lockWager()
      expect(ok).toBe(false)
      expect(useWagerStore.getState().locked).toBe(false)
    })
    test('returns false when baseScore is 0', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 0)
      const ok = useWagerStore.getState().lockWager()
      expect(ok).toBe(false)
    })
    test('returns false when wagerPct invalid', () => {
      // Bypass sanitisation: lockWager's defensive check needs an
      // invalid wagerPct in state. setWagerPct would scrub it to 0.
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.setState({ wagerPct: NaN })
      const ok = useWagerStore.getState().lockWager()
      expect(ok).toBe(false)
    })
    test('happy path returns true and sets locked', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.getState().setWagerPct(75)
      const ok = useWagerStore.getState().lockWager()
      expect(ok).toBe(true)
      expect(useWagerStore.getState().locked).toBe(true)
    })
    test('idempotent: a second lock call still returns true without toggling', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.getState().setWagerPct(50)
      useWagerStore.getState().lockWager()
      const ok = useWagerStore.getState().lockWager()
      expect(ok).toBe(true)
      expect(useWagerStore.getState().locked).toBe(true)
    })
  })

  describe('unlockWager', () => {
    test('clears locked flag; wagerPct preserved', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.getState().setWagerPct(75)
      useWagerStore.getState().lockWager()
      useWagerStore.getState().unlockWager()
      const s = useWagerStore.getState()
      expect(s.locked).toBe(false)
      expect(s.wagerPct).toBe(75)
    })
  })

  describe('resetForQuestion', () => {
    test('clears wager + sets questionId', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.getState().setWagerPct(75)
      useWagerStore.getState().lockWager()
      useWagerStore.getState().recordOutcome('win')
      useWagerStore.getState().resetForQuestion({ _id: 'q2' })
      const s = useWagerStore.getState()
      expect(s.questionId).toBe('q2')
      expect(s.baseScore).toBe(0)
      expect(s.wagerPct).toBe(0)
      expect(s.locked).toBe(false)
    })
  })

  describe('recordOutcome', () => {
    test('returns 0 when no question', () => {
      expect(useWagerStore.getState().recordOutcome('win')).toBe(0)
    })
    test('returns 0 when not locked', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.getState().setWagerPct(50)
      expect(useWagerStore.getState().recordOutcome('win')).toBe(0)
    })
    test('win: adds (baseScore * (1 + pct/100)) to cumulativeDelta', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.getState().setWagerPct(50)
      useWagerStore.getState().lockWager()
      const pts = useWagerStore.getState().recordOutcome('win')
      expect(pts).toBe(150)
      expect(useWagerStore.getState().cumulativeDelta).toBe(150)
    })
    test('miss: adds 0 to cumulativeDelta; preserves existing', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.getState().setWagerPct(75)
      useWagerStore.getState().lockWager()
      const pts = useWagerStore.getState().recordOutcome('miss')
      expect(pts).toBe(0)
      expect(useWagerStore.getState().cumulativeDelta).toBe(0)
    })
    test('accumulates across multiple questions', () => {
      useWagerStore.getState().startQuestion({ _id: 'q1' }, 100)
      useWagerStore.getState().setWagerPct(50)
      useWagerStore.getState().lockWager()
      useWagerStore.getState().recordOutcome('win')
      useWagerStore.getState().startQuestion({ _id: 'q2' }, 50)
      useWagerStore.getState().setWagerPct(100)
      useWagerStore.getState().lockWager()
      useWagerStore.getState().recordOutcome('win')
      expect(useWagerStore.getState().cumulativeDelta).toBe(250)
    })
  })

  describe('methods preserved across reset', () => {
    test('_resetWagerStoreForTests does NOT wipe methods', () => {
      _resetWagerStoreForTests()
      const s = useWagerStore.getState()
      expect(typeof s.startQuestion).toBe('function')
      expect(typeof s.setWagerPct).toBe('function')
      expect(typeof s.lockWager).toBe('function')
      expect(typeof s.unlockWager).toBe('function')
      expect(typeof s.resetForQuestion).toBe('function')
      expect(typeof s.recordOutcome).toBe('function')
    })
  })
})