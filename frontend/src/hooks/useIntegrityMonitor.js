// useIntegrityMonitor — detects and logs academic integrity events during
// a live quiz session.
//
// Three detectors run concurrently when `enabled` is true:
//   1. Tab switch   — document visibilitychange (tab/window hidden)
//   2. Window blur  — window blur (Alt+Tab or app switch even within same tab)
//   3. Fullscreen   — requests fullscreen on user click, logs + re-requests on exit
//   4. Paste        — page-level paste event
//
// IMPORTANT: requestFullscreen() requires a user gesture (click/keypress).
// The hook therefore returns { needsFullscreen, enterFullscreen } so the
// parent can render a prompt overlay. When the student clicks it, enterFullscreen
// is called — that click IS the user gesture the browser requires.
//
// Each detected event:
//   a. POSTs to /api/integrity-events (fire-and-forget, never blocks UI)
//   b. Shows a brief warning toast to the student

import { useEffect, useRef, useCallback, useState } from 'react'
import { API_URL } from '../config.js'

// ── Toast helper ──────────────────────────────────────────────────────────────
function showWarningToast(message) {
  document.getElementById('integrity-toast')?.remove()

  const toast = document.createElement('div')
  toast.id = 'integrity-toast'
  toast.setAttribute('role', 'alert')
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 99999;
    background: #ef4444;
    color: white;
    padding: 12px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    max-width: 420px;
    text-align: center;
    animation: integritySlideDown 0.3s ease;
  `

  if (!document.getElementById('integrity-keyframes')) {
    const style = document.createElement('style')
    style.id = 'integrity-keyframes'
    style.textContent = `
      @keyframes integritySlideDown {
        from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0);     }
      }
    `
    document.head.appendChild(style)
  }

  toast.textContent = `\u26a0\ufe0f ${message}`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 4000)
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useIntegrityMonitor({ roomId, questionId, token, enabled }) {
  const questionIdRef = useRef(questionId)
  useEffect(() => { questionIdRef.current = questionId }, [questionId])

  // Whether the fullscreen prompt overlay should be shown to the student.
  const [needsFullscreen, setNeedsFullscreen] = useState(false)

  // ── POST helper ─────────────────────────────────────────────────────────────
  const logEvent = useCallback(async (eventType, metadata = {}) => {
    if (!roomId || !token) return
    try {
      await fetch(`${API_URL}/integrity-events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId,
          questionId: questionIdRef.current || null,
          eventType,
          metadata
        })
      })
    } catch {
      // Never crash the quiz on a network error.
    }
  }, [roomId, token])

  // ── enterFullscreen — MUST be called from a click handler ────────────────
  // Browser security requires requestFullscreen() to originate from a user
  // gesture. We expose this so the parent renders a button; clicking that
  // button is the required gesture.
  const enterFullscreen = useCallback(() => {
    const el = document.documentElement
    if (!el.requestFullscreen) {
      // API not supported (some mobile browsers) — just dismiss the prompt.
      setNeedsFullscreen(false)
      return
    }
    el.requestFullscreen()
      .then(() => setNeedsFullscreen(false))
      .catch(() => setNeedsFullscreen(false))
  }, [])

  // ── Effect: register / unregister all listeners ──────────────────────────
  useEffect(() => {
    if (!enabled || !roomId || !token) {
      setNeedsFullscreen(false)
      return
    }

    // Show the fullscreen prompt when a question goes live.
    // Actual entry happens when the student clicks the prompt button.
    if (!document.fullscreenElement) {
      setNeedsFullscreen(true)
    }

    // ── Handler: tab switch ──────────────────────────────────────────────
    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        logEvent('tab_switch', { visibilityState: 'hidden' })
        showWarningToast('You left the quiz tab \u2014 this has been recorded by your teacher.')
      }
    }

    // ── Handler: window blur (debounced 150ms) ───────────────────────────
    // blur fires before visibilitychange on the same action, so we wait
    // 150ms and only log window_blur if the tab is still visible.
    let blurDebounce = null
    function handleBlur() {
      blurDebounce = setTimeout(() => {
        if (document.visibilityState === 'visible') {
          logEvent('window_blur', {})
          showWarningToast('You left the quiz window \u2014 this has been recorded by your teacher.')
        }
      }, 150)
    }
    function handleFocus() { clearTimeout(blurDebounce) }

    // ── Handler: fullscreen exit ─────────────────────────────────────────
    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        logEvent('fullscreen_exit', {})
        showWarningToast('You exited fullscreen \u2014 this has been recorded. Please return to fullscreen.')
        setNeedsFullscreen(true)
      }
    }

    // ── Handler: paste ───────────────────────────────────────────────────
    function handlePaste(e) {
      const pastedLength = (e.clipboardData?.getData('text') || '').length
      logEvent('paste', { pastedLength })
      showWarningToast('Paste detected \u2014 this has been recorded by your teacher.')
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur',               handleBlur)
    window.addEventListener('focus',              handleFocus)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('paste',            handlePaste)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur',               handleBlur)
      window.removeEventListener('focus',              handleFocus)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('paste',            handlePaste)
      clearTimeout(blurDebounce)
      setNeedsFullscreen(false)
      // Exit fullscreen when question ends so the page doesn't stay fullscreen.
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [enabled, roomId, token, logEvent])

  return { needsFullscreen, enterFullscreen }
}
