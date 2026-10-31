import { useEffect, useRef } from 'react'
import { playTeacherReady } from '../lib/sounds'

export const TITLE_ALERT = '(!) Questions ready'

// Attention cues for the teacher when a GENERATED batch arrives (the auto-segment approval popup or the
// Paste & Generate review popup opening; Create Q is the teacher's own typing and passes open=false).
// Once per batch, on the closed→open transition:
//   1. a chime for the teacher (lib/sounds; per-device mute via the 🔔 button),
//   2. one 'questions:ready' to the room so every student hears "question time" at the same moment.
// While the popup stays open and this tab is not in front (hidden, or window unfocused), the tab title
// alternates with TITLE_ALERT every second; it is restored the moment the popup closes or the tab is back.
export default function useGeneratedBatchCues(open, socket, roomCode) {
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      playTeacherReady()
      if (socket && roomCode) socket.emit('questions:ready', { roomCode })
    }
    wasOpenRef.current = open
  }, [open, socket, roomCode])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const original = document.title
    let showingAlert = false
    const tick = () => {
      const away = document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus())
      if (away) {
        showingAlert = !showingAlert
        document.title = showingAlert ? TITLE_ALERT : original
      } else if (showingAlert) {
        showingAlert = false
        document.title = original
      }
    }
    const id = setInterval(tick, 1000)
    return () => { clearInterval(id); document.title = original }
  }, [open])
}
