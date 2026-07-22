/**
 * TranscriptStatus.jsx
 * Displays the current listening status and all error states with user-friendly
 * messages and recovery actions.
 */

import React from 'react'

/** Animated listening pulse — CSS animation via inline keyframes injected once */
function ListeningDot() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#ef4444',
        marginRight: '6px',
        animation: 'listeningPulse 1.2s ease-in-out infinite',
        verticalAlign: 'middle',
      }}
    />
  )
}

/** Spinning dots indicator */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '14px',
        height: '14px',
        border: '2px solid #3b82f640',
        borderTopColor: '#3b82f6',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        marginRight: '6px',
        verticalAlign: 'middle',
      }}
    />
  )
}

const ERROR_INFO = {
  permission_denied: {
    icon: '🔒',
    title: 'Microphone Access Denied',
    color: '#dc2626',
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  mic_unavailable: {
    icon: '🎙️',
    title: 'Microphone Unavailable',
    color: '#d97706',
    bgColor: '#fffbeb',
    borderColor: '#fcd34d',
  },
  network: {
    icon: '🌐',
    title: 'Network Error',
    color: '#dc2626',
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  not_supported: {
    icon: '🚫',
    title: 'Feature Not Supported',
    color: '#6b7280',
    bgColor: '#f9fafb',
    borderColor: '#e5e7eb',
  },
  unknown: {
    icon: '⚠️',
    title: 'Something Went Wrong',
    color: '#dc2626',
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
  },
}

/**
 * @param {{
 *   status: import('../stores/transcriptStore').TranscriptStatus,
 *   errorType: string|null,
 *   errorMessage: string|null,
 *   onRetry?: () => void,
 *   onClearError?: () => void,
 * }} props
 */
function TranscriptStatus({ status, errorType, errorMessage, onRetry, onClearError }) {
  if (status === 'listening') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Listening for speech"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '6px 12px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: '600',
          color: '#dc2626',
          width: 'fit-content',
        }}
      >
        <ListeningDot />
        Listening…
      </div>
    )
  }

  if (status === 'requesting') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Requesting microphone access"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '6px 12px',
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: '600',
          color: '#2563eb',
          width: 'fit-content',
        }}
      >
        <Spinner />
        Requesting access…
      </div>
    )
  }

  if (status === 'error' && errorType) {
    const info = ERROR_INFO[errorType] || ERROR_INFO.unknown
    return (
      <div
        role="alert"
        style={{
          padding: '12px 16px',
          background: info.bgColor,
          border: `1px solid ${info.borderColor}`,
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: '18px', lineHeight: 1 }}>
          {info.icon}
        </span>
        <div style={{ flex: 1 }}>
          <p
            style={{
              margin: '0 0 4px',
              fontSize: '13px',
              fontWeight: '700',
              color: info.color,
            }}
          >
            {info.title}
          </p>
          {errorMessage && (
            <p style={{ margin: 0, fontSize: '12px', color: '#374151' }}>
              {errorMessage}
            </p>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            {onRetry && (
              <button
                onClick={onRetry}
                style={{
                  padding: '5px 12px',
                  background: info.color,
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
            )}
            {onClearError && (
              <button
                onClick={onClearError}
                style={{
                  padding: '5px 12px',
                  background: 'transparent',
                  color: '#6b7280',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // idle / paused — show nothing (or a tiny "ready" hint)
  return null
}

export default TranscriptStatus
