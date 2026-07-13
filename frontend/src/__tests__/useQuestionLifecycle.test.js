import { renderHook, act } from '@testing-library/react'
import useModifierStore, {
  _resetModifierStoreForTests
} from '../stores/modifierStore.js'
import useQuestionLifecycle, {
  getQuestionId,
  didQuestionChange,
  nextPrevId
} from '../hooks/useQuestionLifecycle.js'

describe('useQuestionLifecycle — pure helpers', () => {
  describe('getQuestionId', () => {
    test('reads _id when present', () => {
      expect(getQuestionId({ _id: 'q1' })).toBe('q1')
    })
    test('falls back to id when _id missing', () => {
      expect(getQuestionId({ id: 'q2' })).toBe('q2')
    })
    test('returns empty string for null/undefined/non-object', () => {
      expect(getQuestionId(null)).toBe('')
      expect(getQuestionId(undefined)).toBe('')
      expect(getQuestionId(0)).toBe('')
      expect(getQuestionId('string')).toBe('')
    })
    test('returns empty string when both ids missing', () => {
      expect(getQuestionId({ type: 'MCQ' })).toBe('')
    })
  })

  describe('didQuestionChange', () => {
    test('true when ids differ', () => {
      expect(didQuestionChange('q1', 'q2')).toBe(true)
    })
    test('false when ids match', () => {
      expect(didQuestionChange('q1', 'q1')).toBe(false)
    })
    test('false when both empty', () => {
      expect(didQuestionChange('', '')).toBe(false)
    })
    test('true when transitioning from null question to one', () => {
      expect(didQuestionChange('', 'q1')).toBe(true)
    })
    test('true when transitioning from question to null', () => {
      expect(didQuestionChange('q1', '')).toBe(true)
    })
    test('coerces non-string inputs to empty', () => {
      expect(didQuestionChange(null, 'q1')).toBe(true)
      expect(didQuestionChange('q1', undefined)).toBe(true)
      expect(didQuestionChange(undefined, null)).toBe(false)
    })
  })

  describe('nextPrevId', () => {
    test('keeps currentPrev when id unchanged', () => {
      expect(nextPrevId('q0', 'q1', 'q1')).toBe('q0')
    })
    test('returns lastId when id changed', () => {
      expect(nextPrevId('q0', 'q1', 'q2')).toBe('q1')
    })
    test('handles empty initial state', () => {
      expect(nextPrevId('', '', 'q1')).toBe('')
    })
  })
})

describe('useQuestionLifecycle — hook integration', () => {
  beforeEach(() => {
    _resetModifierStoreForTests()
  })

  test('initial mount with a question seeds modifier store and bumps transition', () => {
    const { result } = renderHook(
      ({ q }) => useQuestionLifecycle(q),
      { initialProps: { q: { _id: 'q1', type: 'MCQ' } } }
    )
    expect(result.current.questionId).toBe('q1')
    expect(result.current.prevQuestionId).toBe('')
    expect(result.current.transitionCount).toBe(1)
    expect(useModifierStore.getState().questionId).toBe('q1')
  })

  test('changing question id triggers reset and increments transition count', () => {
    const { result, rerender } = renderHook(
      ({ q }) => useQuestionLifecycle(q),
      { initialProps: { q: { _id: 'q1' } } }
    )
    expect(result.current.transitionCount).toBe(1)

    rerender({ q: { _id: 'q2' } })
    expect(result.current.questionId).toBe('q2')
    expect(result.current.prevQuestionId).toBe('q1')
    expect(result.current.transitionCount).toBe(2)
    expect(useModifierStore.getState().questionId).toBe('q2')
  })

  test('re-rendering with same question id does NOT trigger a transition', () => {
    const { result, rerender } = renderHook(
      ({ q }) => useQuestionLifecycle(q),
      { initialProps: { q: { _id: 'q1' } } }
    )
    const initialCount = result.current.transitionCount

    // New object identity but same id — should not be a transition.
    rerender({ q: { _id: 'q1', extra: 'noise' } })
    expect(result.current.transitionCount).toBe(initialCount)
  })

  test('resetForQuestion clears transient flags set by previous question', () => {
    const { rerender } = renderHook(
      ({ q }) => useQuestionLifecycle(q),
      { initialProps: { q: { _id: 'q1' } } }
    )
    // Set some transient state on the store directly.
    useModifierStore.getState().setTimeFrozen(true, Date.now())
    useModifierStore.getState().setPeekActive(true)
    useModifierStore.getState().setFiftyFiftyMask([0, 1])
    useModifierStore.getState().setClearActiveRemoved([2, 3])
    useModifierStore.getState().openDeck()

    rerender({ q: { _id: 'q2' } })

    const s = useModifierStore.getState()
    expect(s.questionId).toBe('q2')
    expect(s.timeFrozen).toBe(false)
    expect(s.peekActive).toBe(false)
    expect(s.fiftyFiftyOptionMask).toBeNull()
    expect(s.clearActiveRemoved).toBeNull()
    expect(s.deckOpen).toBe(false)
  })

  test('resetForQuestion restores modifier charges on question change', () => {
    const { rerender } = renderHook(
      ({ q }) => useQuestionLifecycle(q),
      { initialProps: { q: { _id: 'q1' } } }
    )
    // Burn the peek charge.
    const r = useModifierStore.getState().consume('peek')
    expect(r.ok).toBe(true)
    expect(useModifierStore.getState().hand.peek).toBe(0)

    rerender({ q: { _id: 'q2' } })
    expect(useModifierStore.getState().hand.peek).toBe(1)
  })

  test('onReset callback fires with prevId, newId, question', () => {
    const onReset = jest.fn()
    const { rerender } = renderHook(
      ({ q }) => useQuestionLifecycle(q, { onReset }),
      { initialProps: { q: { _id: 'q1' } } }
    )
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onReset).toHaveBeenLastCalledWith('', 'q1', { _id: 'q1' })

    rerender({ q: { _id: 'q2' } })
    expect(onReset).toHaveBeenCalledTimes(2)
    expect(onReset).toHaveBeenLastCalledWith('q1', 'q2', { _id: 'q2' })
  })

  test('enabled=false suppresses all resets including the initial one', () => {
    const { result } = renderHook(
      ({ q }) => useQuestionLifecycle(q, { enabled: false }),
      { initialProps: { q: { _id: 'q1' } } }
    )
    expect(result.current.transitionCount).toBe(0)
    expect(useModifierStore.getState().questionId).toBe('')
  })

  test('resetOnMount=false suppresses the initial transition but keeps later ones', () => {
    const { result, rerender } = renderHook(
      ({ q }) => useQuestionLifecycle(q, { resetOnMount: false }),
      { initialProps: { q: { _id: 'q1' } } }
    )
    expect(result.current.transitionCount).toBe(0)
    expect(useModifierStore.getState().questionId).toBe('')

    rerender({ q: { _id: 'q2' } })
    expect(result.current.transitionCount).toBe(1)
    expect(useModifierStore.getState().questionId).toBe('q2')
  })

  test('resetNow() forces a reset without waiting for a transition', () => {
    const { result, rerender } = renderHook(
      ({ q }) => useQuestionLifecycle(q),
      { initialProps: { q: { _id: 'q1' } } }
    )
    const before = result.current.transitionCount

    // Mutate store to a dirty state, then force-reset.
    useModifierStore.getState().setPeekActive(true)
    useModifierStore.getState().openDeck()
    expect(useModifierStore.getState().peekActive).toBe(true)
    expect(useModifierStore.getState().deckOpen).toBe(true)

    act(() => {
      result.current.resetNow()
    })

    const s = useModifierStore.getState()
    expect(s.peekActive).toBe(false)
    expect(s.deckOpen).toBe(false)
    expect(result.current.transitionCount).toBe(before + 1)

    // Re-render with same id; should NOT trigger another transition
    // because the id didn't change.
    rerender({ q: { _id: 'q1' } })
    expect(result.current.transitionCount).toBe(before + 1)
  })

  test('transitioning to null question still resets store', () => {
    const { rerender } = renderHook(
      ({ q }) => useQuestionLifecycle(q),
      { initialProps: { q: { _id: 'q1' } } }
    )
    rerender({ q: null })
    expect(useModifierStore.getState().questionId).toBe('')
    expect(useModifierStore.getState().hand.peek).toBe(1)
  })

  test('hook does not throw when modifier store reset fails', () => {
    const { result } = renderHook(
      ({ q }) => useQuestionLifecycle(q),
      { initialProps: { q: { _id: 'q1' } } }
    )
    // Force a thrown error from the store; rerender must not throw.
    const orig = useModifierStore.getState().resetForQuestion
    useModifierStore.setState({
      resetForQuestion: () => {
        throw new Error('boom')
      }
    })
    // Silence the expected console.error from the hook.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => {
        result.current.resetNow()
      }).not.toThrow()
    } finally {
      useModifierStore.setState({ resetForQuestion: orig })
      errSpy.mockRestore()
    }
  })
})