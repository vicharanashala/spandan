import { useEffect, useCallback } from 'react'

export const KEYBOARD_SHORTCUTS = {
  SUBMIT_ANSWER: 'Enter',
  SELECT_OPTION_1: '1',
  SELECT_OPTION_2: '2',
  SELECT_OPTION_3: '3',
  SELECT_OPTION_4: '4',
  TOGGLE_OPTION: 'Space',
  NEXT_QUESTION: 'n',
  PREVIOUS_QUESTION: 'p',
  TOGGLE_LEADERBOARD: 'l',
  TOGGLE_SOUND: 'm',
}

export function useKeyboardShortcuts(actions, enabled = true) {
  const handleKeyDown = useCallback((event) => {
    if (!enabled) return
    
    const { key, target } = event
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      return
    }
    
    switch (key) {
      case KEYBOARD_SHORTCUTS.SUBMIT_ANSWER:
        event.preventDefault()
        actions.onSubmit?.()
        break
      case KEYBOARD_SHORTCUTS.SELECT_OPTION_1:
        event.preventDefault()
        actions.onSelectOption?.(0)
        break
      case KEYBOARD_SHORTCUTS.SELECT_OPTION_2:
        event.preventDefault()
        actions.onSelectOption?.(1)
        break
      case KEYBOARD_SHORTCUTS.SELECT_OPTION_3:
        event.preventDefault()
        actions.onSelectOption?.(2)
        break
      case KEYBOARD_SHORTCUTS.SELECT_OPTION_4:
        event.preventDefault()
        actions.onSelectOption?.(3)
        break
      case KEYBOARD_SHORTCUTS.TOGGLE_OPTION:
        event.preventDefault()
        actions.onToggle?.()
        break
      case KEYBOARD_SHORTCUTS.NEXT_QUESTION:
        event.preventDefault()
        actions.onNext?.()
        break
      case KEYBOARD_SHORTCUTS.PREVIOUS_QUESTION:
        event.preventDefault()
        actions.onPrev?.()
        break
      case KEYBOARD_SHORTCUTS.TOGGLE_LEADERBOARD:
        event.preventDefault()
        actions.onToggleLeaderboard?.()
        break
      case KEYBOARD_SHORTCUTS.TOGGLE_SOUND:
        event.preventDefault()
        actions.onToggleSound?.()
        break
      default:
        break
    }
  }, [actions, enabled])

  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, enabled])
}

export default useKeyboardShortcuts