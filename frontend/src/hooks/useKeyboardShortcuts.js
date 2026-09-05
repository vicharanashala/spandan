import { useEffect } from 'react'

// Attach global keyboard shortcuts with a handler map: { keyName: callback }.
// Key events firing while the user is typing in an input/textarea/contenteditable are ignored
// unless `allowInFields` is true for that key (so Space-to-launch still works next to options,
// but typing letters in a text field never triggers shortcuts).
export default function useKeyboardShortcuts(handlers, { allowInFields = [] } = {}) {
  useEffect(() => {
    if (!handlers || typeof handlers !== 'object') return

    const onKeyDown = (e) => {
      const tag = e.target?.tagName
      const editing =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (e.target && e.target.isContentEditable)

      // Pressing Space in a focused button triggers a click; let those pass through.
      if (e.key === ' ' && tag === 'BUTTON') return

      if (editing && !allowInFields.includes(e.key)) return

      const handler = handlers[e.key]
      if (!handler) return
      // Only treat plain (unmodified) keypresses as shortcuts to avoid clobbering browser
      // shortcuts / text selection.
      if (e.ctrlKey || e.metaKey || e.altKey) return

      e.preventDefault()
      handler(e)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handlers, allowInFields])
}
