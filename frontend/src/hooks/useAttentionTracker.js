import { useCallback, useEffect, useRef, useState } from 'react'

// Attention tracking, client side.
//
// A student counts as PRESENT only while the Spandan window is visible AND focused:
//   document.hidden === false && document.hasFocus() === true
// Anything else — another tab, the dashboard in a second tab, another app, a minimised browser,
// or focus moved to a different monitor — starts a short grace timer. If the student is still away
// when it fires, the server closes their presence interval, the time draws from the SAME cumulative
// absence budget as a reload/leave, and poll answers are refused until they return.
//
// Focus tracking is EVENT-DRIVEN: blur / visibilitychange set the local attentive flag immediately.
// We deliberately do NOT re-read document.hasFocus() from the blur handler — some browsers still
// report the old focused element while dispatching blur, which made an app switch look "focused"
// and silently leave the student marked present. A heartbeat re-syncs the flag as a safety net for
// missed events (throttled tab, event lost during navigation).
//
// This is detection + penalty, not a hard lock: a web page cannot prevent the user from switching
// windows. Returning reopens presence; the client waits for the server's `attention:ack` before
// unblocking Submit so the first answer cannot race the reopen.
//
// Multi-tab: every tab reports its own state. The server aggregates them, so one focused tab is
// enough to keep the student present; only when every tab is away does presence close.

export const DEFAULT_ATTENTION_GRACE_SECONDS = 7
const HEARTBEAT_MS = 10000
// While returning, re-announce `active` until the server acks (covers a dropped ack / reconnect).
const ACK_RETRY_MS = 2500

const attentionDebugEnabled = () => {
  try {
    if (typeof window !== 'undefined' && window.__SPANDAN_ATTENTION_DEBUG__) return true
    if (typeof localStorage !== 'undefined' &&
      localStorage.getItem('spandan.attention.debug') === '1') return true
  } catch { /* ignore */ }
  return false
}

const debugAttention = (...args) => {
  if (!attentionDebugEnabled()) return
  try { console.log('[attention]', ...args) } catch { /* ignore */ }
}

const awayReasonFor = () => {
  try {
    if (typeof document !== 'undefined' && document.hidden) return 'tab-hidden'
  } catch { /* ignore */ }
  return 'window-blur'
}

const windowIsAttentive = () => {
  try {
    if (typeof document === 'undefined') return true
    if (document.hidden) return false
    if (typeof document.hasFocus === 'function') return document.hasFocus()
    return true
  } catch {
    return true
  }
}

/**
 * @param {object}  options
 * @param {object}  options.socket         Socket.IO client (may be null while connecting).
 * @param {string}  options.roomCode       Room code the student is subscribed to.
 * @param {boolean} options.enabled        Room setting `settings.attention.enabled` (default true).
 * @param {number}  options.graceSeconds   How long the window may be unfocused before it counts.
 * @returns {{
 *   state: 'active'|'away'|'returning'|'disabled',
 *   away: boolean,
 *   returning: boolean,
 *   blocked: boolean,
 *   reason: string|null,
 *   awaySince: number|null,
 *   graceSeconds: number
 * }}
 */
export default function useAttentionTracker({
  socket = null,
  roomCode = null,
  enabled = true,
  graceSeconds = DEFAULT_ATTENTION_GRACE_SECONDS
} = {}) {
  const grace = Math.max(0, Math.min(300, Math.floor(Number(graceSeconds) || 0)))
  const [state, setState] = useState('active') // active | away | returning | disabled
  const [reason, setReason] = useState(null)
  const [awaySince, setAwaySince] = useState(null)

  const stateRef = useRef('active')
  const reasonRef = useRef(null)
  const awaySinceRef = useRef(null)
  const announceRef = useRef(null)

  // Keep refs in sync with state so event/timer callbacks never read a stale phase.
  const apply = useCallback((next, meta = {}) => {
    stateRef.current = next
    setState(next)
    if (next === 'away' || next === 'returning') {
      if (meta.reason !== undefined) {
        reasonRef.current = meta.reason
        setReason(meta.reason)
      }
      if (meta.since !== undefined) {
        awaySinceRef.current = meta.since
        setAwaySince(meta.since)
      }
    } else {
      reasonRef.current = null
      awaySinceRef.current = null
      setReason(null)
      setAwaySince(null)
    }
  }, [])

  // Re-announce the current state after a reconnect or a (re)join: the server keeps attention in
  // memory per socket, so a fresh socket/room starts untracked (and would be treated as a legacy,
  // present client until it reports). `room:joined` also covers the first join, where the mount-time
  // announce can race the server's room subscription.
  useEffect(() => {
    if (!socket) return undefined
    const onConnect = () => { announceRef.current?.() }
    const onRoomJoined = (data) => {
      if (!data?.roomCode || !roomCode || data.roomCode === roomCode) announceRef.current?.()
    }
    socket.on('connect', onConnect)
    socket.on('room:joined', onRoomJoined)
    return () => {
      socket.off('connect', onConnect)
      socket.off('room:joined', onRoomJoined)
    }
  }, [socket, roomCode])

  // Server acknowledgement. `active` releases a `returning` block; a disabled room never blocks.
  useEffect(() => {
    if (!socket) return undefined
    const onAck = (data) => {
      if (!data) return
      if (data.roomCode && roomCode && data.roomCode !== roomCode) return
      if (data.disabled) {
        apply('disabled')
        return
      }
      if (data.state === 'active') apply('active')
      // An `away` ack confirms the close; the local phase is already 'away'. If the server reports
      // away while this tab still believes it is active (a stale/frozen entry expired server-side),
      // re-announce so the two sides converge instead of the tab staying blocked from reopening.
      else if (data.state === 'away' && stateRef.current === 'active') {
        announceRef.current?.()
      }
    }
    socket.on('attention:ack', onAck)
    return () => socket.off('attention:ack', onAck)
  }, [socket, roomCode, apply])

  // Core visibility/focus state machine.
  useEffect(() => {
    if (!enabled) {
      apply('disabled')
      announceRef.current = null
      return undefined
    }
    if (!socket || !roomCode || typeof document === 'undefined' || typeof window === 'undefined') {
      apply('disabled')
      announceRef.current = null
      return undefined
    }

    let disposed = false
    let attentive = windowIsAttentive()
    let graceTimer = null
    let heartbeatTimer = null
    let retryTimer = null

    const emit = (payload) => {
      if (disposed || !socket.connected) return
      socket.emit('attention:update', { roomCode, ...payload })
    }

    const clearGrace = () => {
      if (graceTimer) { clearTimeout(graceTimer); graceTimer = null }
    }
    const clearRetry = () => {
      if (retryTimer) { clearInterval(retryTimer); retryTimer = null }
    }

    const sendActive = () => emit({ state: 'active', reason: null, since: null })

    // Publish `active`; if we were away, hold the block until the server confirms presence reopened.
    const goActive = () => {
      clearGrace()
      const wasAway = stateRef.current === 'away' || stateRef.current === 'returning'
      if (!wasAway) {
        apply('active')
        sendActive()
        return
      }
      apply('returning', { since: awaySinceRef.current })
      sendActive()
      clearRetry()
      retryTimer = setInterval(() => {
        if (disposed || stateRef.current !== 'returning') { clearRetry(); return }
        sendActive()
      }, ACK_RETRY_MS)
    }

    // Publish `away`. `since` is when the window was first left so the gap is backdated to the real
    // departure (the grace period only filters out brief focus losses).
    const goAway = (since, why) => {
      clearGrace()
      if (stateRef.current === 'away' || stateRef.current === 'disabled') return
      debugAttention('away', { why, since })
      apply('away', { reason: why, since })
      emit({ state: 'away', reason: why, since })
    }

    // `attentive` is the event-driven truth. The grace timer trusts it rather than re-reading
    // document.hasFocus(), which can still report the old focus during a blur transition.
    const evaluate = () => {
      if (disposed) return
      if (!attentive) {
        if (stateRef.current === 'active' && !graceTimer) {
          const since = Date.now()
          debugAttention('grace started', { since })
          graceTimer = setTimeout(() => {
            graceTimer = null
            if (disposed || attentive) return
            goAway(since, awayReasonFor())
          }, grace * 1000)
        }
        return
      }
      goActive()
    }

    const setAttentive = (next) => {
      if (disposed) return
      if (attentive !== next) {
        attentive = next
        debugAttention('attentive ->', next)
      }
      evaluate()
    }

    announceRef.current = () => {
      if (disposed) return
      if (!windowIsAttentive()) {
        attentive = false
        // After a reconnect while away, re-send the close (without re-opening a grace window).
        if (stateRef.current === 'away' || stateRef.current === 'returning') {
          emit({
            state: 'away',
            reason: reasonRef.current || awayReasonFor(),
            since: awaySinceRef.current || Date.now()
          })
          return
        }
        evaluate()
        return
      }
      attentive = true
      goActive()
    }

    const onVisibility = () => {
      try { setAttentive(!document.hidden) } catch { /* ignore */ }
    }
    // A focus event means this window is now visible and focused. A blur event means it is not;
    // never ask hasFocus() here (see the header comment).
    const onFocus = () => setAttentive(true)
    const onBlur = () => setAttentive(false)
    const onPageShow = () => setAttentive(windowIsAttentive())
    // The page is being unloaded / navigated away. Close presence immediately rather than waiting
    // for the socket disconnect: a page kept alive in the back/forward cache would otherwise stay
    // "present" while its heartbeats are frozen.
    const onPageHide = () => {
      attentive = false
      if (disposed) return
      if (stateRef.current === 'away' || stateRef.current === 'disabled') return
      goAway(Date.now(), awayReasonFor())
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('pagehide', onPageHide)

    heartbeatTimer = setInterval(() => {
      if (disposed) return
      // Safety net: re-sync with the browser even if no event reached us. If the local flag drifted,
      // evaluate the new state (which starts/clears the grace timer); otherwise keep the server
      // socket warm with a cheap in-memory ping.
      const real = windowIsAttentive()
      if (real !== attentive) {
        attentive = real
        debugAttention('heartbeat re-sync ->', real)
        evaluate()
      } else if (!attentive) {
        evaluate()
      }
      if (attentive && stateRef.current === 'active' && socket.connected) {
        socket.emit('attention:ping', { roomCode })
      }
    }, HEARTBEAT_MS)

    // Register with the server immediately. If the window starts hidden/unfocused, the grace timer
    // runs instead of opening a phantom "active" state.
    if (attentive) {
      apply('active')
      sendActive()
    } else {
      evaluate()
    }

    return () => {
      disposed = true
      clearGrace()
      clearRetry()
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      if (announceRef.current) announceRef.current = null
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [socket, roomCode, enabled, grace, apply])

  const blocked = enabled && (state === 'away' || state === 'returning')

  return {
    state,
    away: state === 'away' || state === 'returning',
    returning: state === 'returning',
    blocked,
    reason,
    awaySince,
    graceSeconds: grace
  }
}
