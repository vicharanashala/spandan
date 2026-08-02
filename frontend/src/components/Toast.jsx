import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

/**
 * Toast — minimal in-app notification system.
 *
 * Usage:
 *   // In your app root (e.g. main.jsx or App.jsx):
 *   <ToastProvider>
 *     <App />
 *   </ToastProvider>
 *
 *   // In any component:
 *   const { showToast } = useToast()
 *   showToast({ type: 'error', message: 'Streak broken!' })
 *
 *   // Or the convenience helpers:
 *   showToast.success('Saved!')
 *   showToast.error('Failed')
 *   showToast.info('Heads up')
 *   showToast.warning('Careful')
 *
 * Toasts auto-dismiss after `duration` ms (default 4000) but can be
 * dismissed early via close button. Multiple toasts stack vertically.
 */

const ToastContext = createContext(null)

// Counter for unique ids (avoids setTimeout id collisions)
let toastIdCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timeoutsRef = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const handle = timeoutsRef.current.get(id)
    if (handle) {
      clearTimeout(handle)
      timeoutsRef.current.delete(id)
    }
  }, [])

  const showToast = useCallback((opts) => {
    // Accept both `showToast({ message, type })` and `showToast('message')`
    const config = typeof opts === 'string' ? { message: opts } : { ...opts }
    const id = ++toastIdCounter
    const toast = {
      id,
      type: config.type || 'info',
      message: config.message || '',
      // 0 = sticky (no auto-dismiss); else ms
      duration: config.duration ?? 4000,
    }
    setToasts((prev) => [...prev, toast])

    if (toast.duration > 0) {
      const handle = setTimeout(() => dismiss(id), toast.duration)
      timeoutsRef.current.set(id, handle)
    }

    return id
  }, [dismiss])

  // Convenience helpers attached to showToast
  showToast.success = (message, opts = {}) => showToast({ ...opts, type: 'success', message })
  showToast.error   = (message, opts = {}) => showToast({ ...opts, type: 'error',   message })
  showToast.info    = (message, opts = {}) => showToast({ ...opts, type: 'info',    message })
  showToast.warning = (message, opts = {}) => showToast({ ...opts, type: 'warning', message })
   showToast.multiplier = (message, opts = {}) => showToast({ ...opts, type: 'multiplier', message })

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Defensive: don't crash if a component uses useToast outside a provider
    console.warn('useToast() called outside <ToastProvider>. No-op.')
    return { showToast: () => null, dismiss: () => null }
  }
  return ctx
}

function ToastContainer({ toasts, dismiss }) {
  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        pointerEvents: 'none',
        maxWidth: '360px',
      }}
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  )
}

function Toast({ toast, onClose }) {
  const palette = PALETTES[toast.type] || PALETTES.info
  return (
    <div
      role="status"
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '14px 16px',
        borderRadius: '12px',
        background: palette.bg,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        animation: 'toastSlideIn 0.25s ease-out',
        minWidth: '260px',
      }}
    >
      <span style={{ fontSize: '20px', lineHeight: 1, flexShrink: 0 }}>{palette.icon}</span>
      <div style={{ flex: 1, fontSize: '14px', fontWeight: 500, lineHeight: 1.4 }}>
        {toast.message}
      </div>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          color: palette.text,
          opacity: 0.5,
          cursor: 'pointer',
          fontSize: '18px',
          lineHeight: 1,
          padding: '0 2px',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5' }}
      >
        ✕
      </button>
    </div>
  )
}

const PALETTES = {
  success: {
    bg: 'rgba(16, 185, 129, 0.12)',
    border: '#10b981',
    text: '#065f46',
    icon: '✅',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.12)',
    border: '#ef4444',
    text: '#991b1b',
    icon: '❌',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.12)',
    border: '#f59e0b',
    text: '#92400e',
    icon: '⚠️',
  },
  info: {
    bg: 'rgba(59, 130, 246, 0.12)',
    border: '#3b82f6',
    text: '#1e40af',
    icon: 'ℹ️',
  },
  streak_broken: {
    bg: 'rgba(239, 68, 68, 0.12)',
    border: '#ef4444',
    text: '#991b1b',
    icon: '💔',
  },
  streak_start: {
    bg: 'rgba(245, 158, 11, 0.12)',
    border: '#f59e0b',
    text: '#92400e',
    icon: '🔥',
  },
  freeze_used: {
    // Cool icy blue — a shield that absorbed the blow
    bg: 'rgba(56, 189, 248, 0.12)',
    border: '#0ea5e9',
    text: '#0c4a6e',
    icon: '🛡️',
  },
  multiplier: {
    // Electric gold/yellow — points are being multiplied!
    bg: 'rgba(250, 204, 21, 0.18)',
    border: '#eab308',
    text: '#713f12',
    icon: '⚡',
  },
}

export default Toast
