import React, { useEffect, useRef, useState, useCallback } from 'react'

/**
 * FullscreenLock
 * --------------
 * Forces the browser into real OS-level fullscreen when a poll is active
 * (exactly like TCS iON / Mettl OA portals).
 *
 * Props:
 *   active        {Boolean}  – true when a question is live
 *   onViolation   {Function} – called with (count, reason) on each infraction
 *   maxViolations {Number}   – auto-submit threshold (default 3, 0 = disabled)
 *   onForceSubmit {Function} – called when maxViolations is crossed
 *   children      {Node}     – the question UI rendered inside the lock
 */
export default function FullscreenLock({
  active = false,
  onViolation,
  maxViolations = 3,
  onForceSubmit,
  children,
}) {
  const [fsReady, setFsReady]           = useState(false)   // user clicked "Enter Fullscreen"
  const [violations, setViolations]     = useState(0)
  const [warningMsg, setWarningMsg]     = useState('')
  const [showWarning, setShowWarning]   = useState(false)
  const [showEntry, setShowEntry]       = useState(false)    // show entry gate
  const violationCountRef               = useRef(0)
  const warningTimerRef                 = useRef(null)

  // ── Helpers ──────────────────────────────────────────────────────────────

  const isFullscreen = () =>
    !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement
    )

  const enterFullscreen = useCallback(() => {
    const el = document.documentElement
    const req =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.mozRequestFullScreen
    if (req) req.call(el).catch(() => {})
  }, [])

  const exitFullscreen = useCallback(() => {
    const exit =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.mozCancelFullScreen
    if (exit && isFullscreen()) exit.call(document).catch(() => {})
  }, [])

  const flashWarning = useCallback((msg) => {
    setWarningMsg(msg)
    setShowWarning(true)
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    warningTimerRef.current = setTimeout(() => setShowWarning(false), 3500)
  }, [])

  const recordViolation = useCallback((reason) => {
    violationCountRef.current += 1
    const count = violationCountRef.current
    setViolations(count)
    if (onViolation) onViolation(count, reason)
    if (maxViolations > 0 && count >= maxViolations) {
      flashWarning(`🚨 ${maxViolations} violations reached — auto submitting!`)
      setTimeout(() => { if (onForceSubmit) onForceSubmit() }, 1500)
    } else {
      flashWarning(`⚠️ ${reason} — Violation ${count}${maxViolations > 0 ? `/${maxViolations}` : ''}`)
    }
  }, [onViolation, maxViolations, onForceSubmit, flashWarning])

  // ── Mount/Unmount the lock ────────────────────────────────────────────────

  useEffect(() => {
    if (active) {
      // Show entry gate — requestFullscreen needs a user gesture
      setShowEntry(true)
      setFsReady(false)
      violationCountRef.current = 0
      setViolations(0)
    } else {
      // Question ended / submitted — release everything
      setShowEntry(false)
      setFsReady(false)
      exitFullscreen()
    }
  }, [active, exitFullscreen])

  // ── Fullscreen escape detection ───────────────────────────────────────────

  useEffect(() => {
    if (!fsReady) return

    const handleFsChange = () => {
      if (active && !isFullscreen()) {
        // Student pressed ESC — force back in
        enterFullscreen()
        recordViolation('Fullscreen exited')
      }
    }

    document.addEventListener('fullscreenchange', handleFsChange)
    document.addEventListener('webkitfullscreenchange', handleFsChange)
    document.addEventListener('mozfullscreenchange', handleFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange)
      document.removeEventListener('webkitfullscreenchange', handleFsChange)
      document.removeEventListener('mozfullscreenchange', handleFsChange)
    }
  }, [fsReady, active, enterFullscreen, recordViolation])

  // ── Tab / window switch detection ─────────────────────────────────────────

  useEffect(() => {
    if (!fsReady) return

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        recordViolation('Tab switched')
      }
    }

    const handleBlur = () => {
      // Only fire if we are still in active poll and fullscreen
      if (active && isFullscreen()) {
        recordViolation('Window focus lost')
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
    }
  }, [fsReady, active, recordViolation])

  // ── Context-menu & keyboard shortcut block ────────────────────────────────

  useEffect(() => {
    if (!fsReady) return

    const block = (e) => e.preventDefault()
    const blockShortcuts = (e) => {
      // Block common escape shortcuts
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
        (e.ctrlKey && e.key.toLowerCase() === 'u')
      ) {
        e.preventDefault()
      }
    }

    document.addEventListener('contextmenu', block)
    document.addEventListener('keydown', blockShortcuts)
    return () => {
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('keydown', blockShortcuts)
    }
  }, [fsReady])

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      exitFullscreen()
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    }
  }, [exitFullscreen])

  // ── Render ────────────────────────────────────────────────────────────────

  // Not active — render nothing (pass-through)
  if (!active) return children

  // Entry gate — user must click to trigger fullscreen (browser security)
  if (showEntry && !fsReady) {
    return (
      <div style={entryGateStyle}>
        <div style={entryCardStyle}>
          {/* Animated lock icon */}
          <div style={lockIconWrapStyle}>
            <span style={{ fontSize: '52px' }}>🔒</span>
          </div>
          <h2 style={entryTitleStyle}>Poll Starting Now</h2>
          <p style={entrySubStyle}>
            This question requires <strong>Secure Fullscreen Mode</strong>.<br />
            You will not be able to switch tabs or minimize until you submit.
          </p>

          <div style={ruleListStyle}>
            {[
              '📵 No tab switching allowed',
              '🖥️ Fullscreen must stay active',
              '⏱️ Timer runs continuously',
              '⚠️ Violations are recorded',
            ].map((r) => (
              <div key={r} style={ruleItemStyle}>{r}</div>
            ))}
          </div>

          <button
            style={enterBtnStyle}
            onClick={() => {
              enterFullscreen()
              setFsReady(true)
              setShowEntry(false)
            }}
          >
            🔒 Enter Fullscreen &amp; Start Poll
          </button>
        </div>
      </div>
    )
  }

  // Fullscreen active — render question with HUD overlay
  return (
    <div style={lockWrapStyle}>
      {/* Top HUD bar */}
      <div style={hudBarStyle}>
        <span style={hudTextStyle}>🔒 Secure Poll Mode</span>
        <span style={hudTextStyle}>
          {violations > 0 ? (
            <span style={{ color: '#fbbf24' }}>
              ⚠️ Violations: {violations}{maxViolations > 0 ? `/${maxViolations}` : ''}
            </span>
          ) : (
            <span style={{ color: '#34d399' }}>✅ No violations</span>
          )}
        </span>
        <span style={hudTextStyle}>Submit to unlock</span>
      </div>

      {/* Violation warning toast */}
      {showWarning && (
        <div style={toastStyle}>
          {warningMsg}
        </div>
      )}

      {/* The actual question UI */}
      <div style={questionWrapStyle}>
        {children}
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const entryGateStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 99999,
  background: 'rgba(0,0,0,0.92)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
}

const entryCardStyle = {
  background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
  borderRadius: '20px',
  padding: '48px 40px',
  maxWidth: '480px',
  width: '90%',
  textAlign: 'center',
  border: '2px solid rgba(139,92,246,0.5)',
  boxShadow: '0 0 60px rgba(139,92,246,0.3)',
}

const lockIconWrapStyle = {
  marginBottom: '20px',
  animation: 'pulse 2s infinite',
}

const entryTitleStyle = {
  fontSize: '28px',
  fontWeight: '800',
  color: 'white',
  margin: '0 0 12px',
  letterSpacing: '-0.5px',
}

const entrySubStyle = {
  fontSize: '15px',
  color: 'rgba(255,255,255,0.75)',
  lineHeight: '1.6',
  margin: '0 0 28px',
}

const ruleListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  marginBottom: '32px',
  textAlign: 'left',
}

const ruleItemStyle = {
  background: 'rgba(255,255,255,0.07)',
  borderRadius: '10px',
  padding: '10px 16px',
  fontSize: '14px',
  color: 'rgba(255,255,255,0.85)',
  border: '1px solid rgba(255,255,255,0.1)',
}

const enterBtnStyle = {
  width: '100%',
  padding: '16px',
  background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
  color: 'white',
  border: 'none',
  borderRadius: '12px',
  fontSize: '16px',
  fontWeight: '700',
  cursor: 'pointer',
  letterSpacing: '0.3px',
  boxShadow: '0 4px 20px rgba(139,92,246,0.4)',
  transition: 'transform 0.1s',
}

const lockWrapStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 99998,
  background: 'var(--bg-primary, #0f172a)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
}

const hudBarStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 24px',
  background: 'rgba(0,0,0,0.6)',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
  backdropFilter: 'blur(8px)',
  flexShrink: 0,
}

const hudTextStyle = {
  fontSize: '13px',
  fontWeight: '600',
  color: 'rgba(255,255,255,0.8)',
  letterSpacing: '0.2px',
}

const toastStyle = {
  position: 'absolute',
  top: '60px',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(239,68,68,0.95)',
  color: 'white',
  padding: '12px 28px',
  borderRadius: '12px',
  fontSize: '15px',
  fontWeight: '700',
  zIndex: 100000,
  boxShadow: '0 4px 24px rgba(239,68,68,0.5)',
  whiteSpace: 'nowrap',
  animation: 'slideDown 0.3s ease',
}

const questionWrapStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '32px',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
}
