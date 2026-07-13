import useModifierStore from '../stores/modifierStore.js'
import {
  MODIFIER_IDS,
  MODIFIER_META,
  TIME_FREEZE_MS,
  PEEK_MS,
  defaultHand,
  activeQuestionId,
  consumeHand,
  refundHand
} from '../stores/modifierHelpers.js'
import { _resetModifierStoreForTests } from '../stores/modifierStore.js'

describe('modifierStore — pure helpers', () => {
  describe('MODIFIER_IDS', () => {
    test('contains the 4 expected ids, in fixed order', () => {
      expect(MODIFIER_IDS).toEqual([
        'fiftyFifty',
        'timeFreeze',
        'peek',
        'clearActive'
      ])
    })
    test('is frozen', () => {
      expect(Object.isFrozen(MODIFIER_IDS)).toBe(true)
    })
  })

  describe('MODIFIER_META', () => {
    test('every id has matching meta', () => {
      for (const id of MODIFIER_IDS) {
        expect(MODIFIER_META[id]).toBeDefined()
        expect(MODIFIER_META[id].id).toBe(id)
        expect(typeof MODIFIER_META[id].label).toBe('string')
        expect(typeof MODIFIER_META[id].description).toBe('string')
      }
    })
    test('is frozen', () => {
      expect(Object.isFrozen(MODIFIER_META)).toBe(true)
    })
  })

  describe('constants', () => {
    test('TIME_FREEZE_MS is 5000', () => {
      expect(TIME_FREEZE_MS).toBe(5000)
    })
    test('PEEK_MS is 3000', () => {
      expect(PEEK_MS).toBe(3000)
    })
  })

  describe('defaultHand', () => {
    test('returns one charge for every modifier', () => {
      const h = defaultHand()
      for (const id of MODIFIER_IDS) {
        expect(h[id]).toBe(1)
      }
    })
    test('returns a fresh object each call (no shared reference)', () => {
      const a = defaultHand()
      const b = defaultHand()
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
    })
    test('defaultHand is frozen', () => {
      expect(Object.isFrozen(defaultHand())).toBe(true)
    })
  })

  describe('activeQuestionId', () => {
    test('reads _id when present', () => {
      expect(activeQuestionId({ _id: 'q1' })).toBe('q1')
    })
    test('falls back to id', () => {
      expect(activeQuestionId({ id: 'q2' })).toBe('q2')
    })
    test('returns empty string for missing/null/undefined', () => {
      expect(activeQuestionId(null)).toBe('')
      expect(activeQuestionId(undefined)).toBe('')
      expect(activeQuestionId({})).toBe('')
    })
  })

  describe('consumeHand', () => {
    test('decrements the given id by 1', () => {
      const next = consumeHand(defaultHand(), 'peek')
      expect(next.peek).toBe(0)
      expect(next.fiftyFifty).toBe(1)
    })
    test('does not mutate the input hand', () => {
      const original = defaultHand()
      consumeHand(original, 'peek')
      expect(original.peek).toBe(1)
    })
    test('no-op when id is unknown (returns shallow copy)', () => {
      const original = defaultHand()
      const next = consumeHand(original, 'nope')
      expect(next).toEqual(original)
      expect(next).not.toBe(original)
    })
    test('no-op when charges are already 0', () => {
      const empty = { ...defaultHand(), peek: 0 }
      const next = consumeHand(empty, 'peek')
      expect(next.peek).toBe(0)
    })
    test('treats null hand as a fresh default hand', () => {
      const next = consumeHand(null, 'peek')
      expect(next.peek).toBe(0)
      expect(next.fiftyFifty).toBe(1)
    })
  })

  describe('refundHand', () => {
    test('increments the given id by 1 up to owned cap', () => {
      const spent = { ...defaultHand(), peek: 0 }
      const next = refundHand(spent, 'peek', 1)
      expect(next.peek).toBe(1)
    })
    test('does not exceed owned cap', () => {
      const full = { ...defaultHand(), peek: 1 }
      const next = refundHand(full, 'peek', 1)
      expect(next.peek).toBe(1)
    })
    test('initialises unknown id at 1 (refund from nothing)', () => {
      const spent = { ...defaultHand() }
      delete spent.peek
      const next = refundHand(spent, 'peek', 1)
      expect(next.peek).toBe(1)
    })
    test('ignores invalid owned values', () => {
      const spent = { ...defaultHand(), peek: 0 }
      const next = refundHand(spent, 'peek', NaN)
      expect(next.peek).toBe(1)
    })
    test('does not mutate input', () => {
      const spent = { ...defaultHand(), peek: 0 }
      refundHand(spent, 'peek', 1)
      expect(spent.peek).toBe(0)
    })
  })
})

describe('modifierStore — zustand store', () => {
  beforeEach(() => {
    _resetModifierStoreForTests()
  })

  describe('initial state', () => {
    test('hand has one charge per modifier', () => {
      const s = useModifierStore.getState()
      for (const id of MODIFIER_IDS) {
        expect(s.hand[id]).toBe(1)
      }
    })
    test('questionId is empty', () => {
      expect(useModifierStore.getState().questionId).toBe('')
    })
    test('no flags active', () => {
      const s = useModifierStore.getState()
      expect(s.timeFrozen).toBe(false)
      expect(s.peekActive).toBe(false)
      expect(s.fiftyFiftyOptionMask).toBeNull()
      expect(s.clearActiveRemoved).toBeNull()
    })
    test('deck starts closed', () => {
      expect(useModifierStore.getState().deckOpen).toBe(false)
    })
  })

  describe('resetForQuestion', () => {
    test('updates questionId and refreshes hand', () => {
      useModifierStore.getState().resetForQuestion({ _id: 'q1' })
      useModifierStore.getState().consume('peek')
      expect(useModifierStore.getState().hand.peek).toBe(0)

      useModifierStore.getState().resetForQuestion({ _id: 'q42' })
      const s = useModifierStore.getState()
      expect(s.questionId).toBe('q42')
      expect(s.hand.peek).toBe(1)
    })

    test('clears all transient effect flags', () => {
      useModifierStore.setState({
        timeFrozen: true,
        peekActive: true,
        fiftyFiftyOptionMask: [0, 2],
        clearActiveRemoved: [1, 3]
      })
      useModifierStore.getState().resetForQuestion({ _id: 'q7' })
      const s = useModifierStore.getState()
      expect(s.timeFrozen).toBe(false)
      expect(s.peekActive).toBe(false)
      expect(s.fiftyFiftyOptionMask).toBeNull()
      expect(s.clearActiveRemoved).toBeNull()
    })

    test('handles null question by setting empty id and refreshing hand', () => {
      useModifierStore.getState().consume('timeFreeze')
      useModifierStore.getState().resetForQuestion(null)
      const s = useModifierStore.getState()
      expect(s.questionId).toBe('')
      expect(s.hand.timeFreeze).toBe(1)
    })
  })

  describe('consume', () => {
    beforeEach(() => {
      useModifierStore.getState().resetForQuestion({ _id: 'q1' })
    })

    test('returns ok:true and decrements charge when available', () => {
      const r = useModifierStore.getState().consume('fiftyFifty')
      expect(r).toEqual({ ok: true })
      expect(useModifierStore.getState().hand.fiftyFifty).toBe(0)
    })

    test('returns ok:false when no question is active', () => {
      _resetModifierStoreForTests()
      const r = useModifierStore.getState().consume('fiftyFifty')
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('no-question')
    })

    test('returns ok:false when charges are depleted', () => {
      useModifierStore.getState().consume('peek')
      const r = useModifierStore.getState().consume('peek')
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('no-charges')
      // still 0, not -1
      expect(useModifierStore.getState().hand.peek).toBe(0)
    })

    test('returns ok:false for unknown modifier id', () => {
      const r = useModifierStore.getState().consume('nonsense')
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('unknown-modifier')
    })
  })

  describe('refund', () => {
    beforeEach(() => {
      useModifierStore.getState().resetForQuestion({ _id: 'q1' })
    })

    test('restores a charge', () => {
      useModifierStore.getState().consume('timeFreeze')
      expect(useModifierStore.getState().hand.timeFreeze).toBe(0)
      useModifierStore.getState().refund('timeFreeze')
      expect(useModifierStore.getState().hand.timeFreeze).toBe(1)
    })

    test('does not exceed owned cap', () => {
      useModifierStore.getState().refund('timeFreeze')
      // still 1, not 2
      expect(useModifierStore.getState().hand.timeFreeze).toBe(1)
    })
  })

  describe('deck visibility', () => {
    test('toggleDeck flips deckOpen', () => {
      expect(useModifierStore.getState().deckOpen).toBe(false)
      useModifierStore.getState().toggleDeck()
      expect(useModifierStore.getState().deckOpen).toBe(true)
      useModifierStore.getState().toggleDeck()
      expect(useModifierStore.getState().deckOpen).toBe(false)
    })
    test('openDeck and closeDeck set explicitly', () => {
      useModifierStore.getState().openDeck()
      expect(useModifierStore.getState().deckOpen).toBe(true)
      useModifierStore.getState().closeDeck()
      expect(useModifierStore.getState().deckOpen).toBe(false)
    })
  })

  describe('per-effect setters', () => {
    test('setTimeFrozen toggles flag and timestamp', () => {
      const t = 1700000000000
      useModifierStore.getState().setTimeFrozen(true, t)
      const s = useModifierStore.getState()
      expect(s.timeFrozen).toBe(true)
      expect(s.timeFrozenAt).toBe(t)
    })
    test('setPeekActive toggles flag and computes default expires', () => {
      useModifierStore.getState().setPeekActive(true)
      const s = useModifierStore.getState()
      expect(s.peekActive).toBe(true)
      expect(s.peekExpiresAt).toBeGreaterThan(Date.now())
    })
    test('setFiftyFiftyMask stores a copy, not the same reference', () => {
      const arr = [0, 2]
      useModifierStore.getState().setFiftyFiftyMask(arr)
      const stored = useModifierStore.getState().fiftyFiftyOptionMask
      expect(stored).toEqual([0, 2])
      expect(stored).not.toBe(arr)
    })
    test('setFiftyFiftyMask accepts null to clear', () => {
      useModifierStore.getState().setFiftyFiftyMask([0, 1])
      useModifierStore.getState().setFiftyFiftyMask(null)
      expect(useModifierStore.getState().fiftyFiftyOptionMask).toBeNull()
    })
    test('setClearActiveRemoved stores a copy', () => {
      const arr = [1, 3]
      useModifierStore.getState().setClearActiveRemoved(arr)
      const stored = useModifierStore.getState().clearActiveRemoved
      expect(stored).toEqual([1, 3])
      expect(stored).not.toBe(arr)
    })
  })

  describe('grantOwned', () => {
    test('adds 1 by default', () => {
      useModifierStore.setState({ owned: { ...defaultHand(), peek: 1 } })
      useModifierStore.getState().grantOwned('peek')
      expect(useModifierStore.getState().owned.peek).toBe(2)
    })
    test('adds the explicit count', () => {
      useModifierStore.setState({ owned: { ...defaultHand(), peek: 1 } })
      useModifierStore.getState().grantOwned('peek', 5)
      expect(useModifierStore.getState().owned.peek).toBe(6)
    })
    test('ignores unknown ids silently', () => {
      const before = useModifierStore.getState().owned
      useModifierStore.getState().grantOwned('bogus')
      expect(useModifierStore.getState().owned).toEqual(before)
    })
  })
})