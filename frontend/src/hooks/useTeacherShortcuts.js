import { useEffect, useCallback } from 'react'

export const TEACHER_SHORTCUTS = {
  TOGGLE_RECORDING: 'r',
  GENERATE_QUESTIONS: 'g',
  CREATE_QUESTION: 'c',
  END_ROOM: 'e',
  TOGGLE_SOUND: 'm',
  OPEN_SETTINGS: 's',
  PASTE_GENERATE: 't',
}

export function useTeacherShortcuts(actions, enabled = true) {
  const handleKeyDown = useCallback((event) => {
    if (!enabled) return

    const { key, target, ctrlKey, metaKey } = event
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      return
    }

    switch (key.toLowerCase()) {
      case TEACHER_SHORTCUTS.TOGGLE_RECORDING:
        if (!ctrlKey && !metaKey) {
          event.preventDefault()
          actions.onToggleRecording?.()
        }
        break
      case TEACHER_SHORTCUTS.GENERATE_QUESTIONS:
        if (!ctrlKey && !metaKey) {
          event.preventDefault()
          actions.onGenerateQuestions?.()
        }
        break
      case TEACHER_SHORTCUTS.CREATE_QUESTION:
        if (!ctrlKey && !metaKey) {
          event.preventDefault()
          actions.onCreateQuestion?.()
        }
        break
      case TEACHER_SHORTCUTS.END_ROOM:
        if (!ctrlKey && !metaKey) {
          event.preventDefault()
          actions.onEndRoom?.()
        }
        break
      case TEACHER_SHORTCUTS.TOGGLE_SOUND:
        event.preventDefault()
        actions.onToggleSound?.()
        break
      case TEACHER_SHORTCUTS.OPEN_SETTINGS:
        if (!ctrlKey && !metaKey) {
          event.preventDefault()
          actions.onOpenSettings?.()
        }
        break
      case TEACHER_SHORTCUTS.PASTE_GENERATE:
        if (!ctrlKey && !metaKey) {
          event.preventDefault()
          actions.onPasteGenerate?.()
        }
        break
      case 'Escape':
        event.preventDefault()
        actions.onClose?.()
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

export default useTeacherShortcuts
