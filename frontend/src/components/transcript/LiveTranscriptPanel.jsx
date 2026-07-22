/**
 * LiveTranscriptPanel.jsx
 * The full Live Transcript feature panel.
 *
 * Features:
 *  - Continuous speech-to-text with auto-scroll
 *  - Interim (real-time) text preview
 *  - Timestamps & speaker labels per segment
 *  - Listening/error/idle status indicator
 *  - Copy entire transcript (one click)
 *  - Download as .txt file
 *  - Manual scroll disables auto-scroll; re-enable button appears
 *  - Fully keyboard navigable & accessible (ARIA live regions)
 *  - Responsive: collapses nicely on mobile
 */

import React, { useEffect, useRef, useCallback, useState } from 'react'
import useTranscriptStore from '../../stores/transcriptStore'
import useTranscript from '../../services/useTranscript'
import TranscriptSegment from './TranscriptSegment'
import TranscriptStatus from './TranscriptStatus'

// ─── Keyframe injection ────────────────────────────────────────────────────
// Inject once globally; safe to call multiple times (idempotent via ID check)
function injectStyles() {
  if (document.getElementById('transcript-keyframes')) return
  const style = document.createElement('style')
  style.id = 'transcript-keyframes'
  style.textContent = `
    @keyframes listeningPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.4; transform: scale(0.7); }
    }
    @keyframes transcriptEntrance {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes waveBar {
      0%, 100% { height: 4px; }
      50%       { height: 14px; }
    }

    /* Focus ring for keyboard nav */
    .transcript-btn:focus-visible {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    /* Mobile responsive panel */
    @media (max-width: 768px) {
      .transcript-panel {
        position: fixed !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        width: 100% !important;
        max-height: 60vh !important;
        border-radius: 20px 20px 0 0 !important;
        z-index: 200 !important;
      }
    }
  `
  document.head.appendChild(style)
}

// ─── Sub-components ────────────────────────────────────────────────────────

/** Animated sound-wave bars shown when listening */
function SoundWave() {
  return (
    <div
      aria-hidden="true"
      style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '18px' }}
    >
      {[0, 0.15, 0.3, 0.15, 0].map((delay, i) => (
        <div
          key={i}
          style={{
            width: '3px',
            height: '4px',
            background: '#ef4444',
            borderRadius: '2px',
            animation: `waveBar 0.8s ease-in-out ${delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

/** Icon-only button with Tooltip text */
function IconButton({ label, title, onClick, disabled, children, style = {} }) {
  return (
    <button
      className="transcript-btn"
      aria-label={label}
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px',
        padding: '7px 12px',
        fontSize: '13px',
        fontWeight: '500',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        background: 'var(--bg-secondary)',
        color: disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// ─── Main panel ────────────────────────────────────────────────────────────

/**
 * @param {{
 *   roomId?: string,
 *   lang?: string,
 *   defaultOpen?: boolean,
 *   style?: React.CSSProperties
 * }} props
 */
function LiveTranscriptPanel({ roomId, lang = 'en-US', defaultOpen = false, style = {} }) {
  injectStyles()

  const {
    segments,
    interimText,
    status,
    errorType,
    errorMessage,
    autoScroll,
    isPanelOpen,
    clearError,
    clearTranscript,
    setAutoScroll,
    openPanel,
    closePanel,
    getFullText,
  } = useTranscriptStore()

  const { start, stop, toggle, isSupported, isListening, provider } = useTranscript({ lang, roomId })

  const scrollContainerRef = useRef(null)
  const bottomAnchorRef = useRef(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const [wordCount, setWordCount] = useState(0)

  // Open panel by default if requested
  useEffect(() => {
    if (defaultOpen) openPanel()
  }, [defaultOpen, openPanel])

  // Word count tally
  useEffect(() => {
    const total = segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0)
    setWordCount(total)
  }, [segments])

  // ── Auto-scroll logic ──────────────────────────────────────────────────
  useEffect(() => {
    if (autoScroll && bottomAnchorRef.current) {
      bottomAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [segments, interimText, autoScroll])

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (!atBottom && autoScroll) setAutoScroll(false)
  }, [autoScroll, setAutoScroll])

  const scrollToBottom = useCallback(() => {
    setAutoScroll(true)
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [setAutoScroll])

  // ── Copy transcript ────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    const text = getFullText()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }, [getFullText])

  // ── Download transcript ────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    const text = getFullText()
    if (!text) return
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcript-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [getFullText])

  // ── Keyboard: Escape closes panel ─────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && isPanelOpen) closePanel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isPanelOpen, closePanel])

  const hasContent = segments.length > 0 || interimText

  // ── Render: collapsed toggle button ───────────────────────────────────
  if (!isPanelOpen) {
    return (
      <button
        id="live-transcript-toggle"
        className="transcript-btn"
        aria-label="Open Live Transcript Panel"
        title="Live Transcript"
        onClick={openPanel}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 18px',
          background: isListening
            ? 'linear-gradient(135deg, #dc2626, #ef4444)'
            : 'linear-gradient(135deg, #1e40af, #3b82f6)',
          color: 'white',
          border: 'none',
          borderRadius: '12px',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          boxShadow: isListening
            ? '0 4px 15px rgba(220,38,38,0.4)'
            : '0 4px 15px rgba(30,64,175,0.3)',
          transition: 'all 0.2s ease',
          ...style,
        }}
      >
        {isListening ? <SoundWave /> : <span aria-hidden="true">🎙️</span>}
        Live Transcript
        {isListening && (
          <span
            style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '2px 6px',
              borderRadius: '10px',
              fontSize: '11px',
            }}
          >
            LIVE
          </span>
        )}
        {segments.length > 0 && !isListening && (
          <span
            style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '11px',
            }}
          >
            {segments.length}
          </span>
        )}
      </button>
    )
  }

  // ── Render: full panel ─────────────────────────────────────────────────
  return (
    <div
      className="transcript-panel"
      role="region"
      aria-label="Live Transcript"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        height: '100%',
        minHeight: '400px',
        ...style,
      }}
    >
      {/* ── Panel header ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-color)',
          background: isListening
            ? 'linear-gradient(135deg, rgba(220,38,38,0.06), rgba(239,68,68,0.04))'
            : 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span aria-hidden="true" style={{ fontSize: '18px' }}>🎙️</span>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: '700',
                color: 'var(--text-primary)',
                lineHeight: 1,
              }}
            >
              Live Transcript
            </h2>
            <p
              style={{
                margin: '3px 0 0',
                fontSize: '11px',
                color: 'var(--text-secondary)',
              }}
            >
              {isListening ? (
                <span style={{ color: '#ef4444', fontWeight: 600 }}>● Listening…</span>
              ) : wordCount > 0 ? (
                `${wordCount} words · ${segments.length} segment${segments.length !== 1 ? 's' : ''}`
              ) : (
                `Provider: ${provider === 'native' ? 'Browser' : 'Server Whisper'}`
              )}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Mic toggle button */}
          {isSupported && (
            <button
              id="transcript-mic-toggle"
              className="transcript-btn"
              aria-label={isListening ? 'Stop transcription' : 'Start transcription'}
              aria-pressed={isListening}
              onClick={toggle}
              title={isListening ? 'Stop' : 'Start listening'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                background: isListening
                  ? 'linear-gradient(135deg, #dc2626, #ef4444)'
                  : 'linear-gradient(135deg, #1e40af, #3b82f6)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: isListening ? '0 2px 8px rgba(220,38,38,0.4)' : '0 2px 8px rgba(30,64,175,0.3)',
                transition: 'all 0.2s ease',
              }}
            >
              {isListening ? (
                <>
                  <SoundWave />
                  Stop
                </>
              ) : (
                <>
                  <span aria-hidden="true">🎙️</span>
                  Start
                </>
              )}
            </button>
          )}

          {/* Collapse */}
          <IconButton
            label="Collapse transcript panel"
            title="Collapse"
            onClick={closePanel}
          >
            ▾
          </IconButton>
        </div>
      </div>

      {/* ── Status / error banner ──────────────────────────────────────── */}
      {(status === 'error' || status === 'requesting') && (
        <div style={{ padding: '8px 16px', flexShrink: 0 }}>
          <TranscriptStatus
            status={status}
            errorType={errorType}
            errorMessage={errorMessage}
            onRetry={start}
            onClearError={clearError}
          />
        </div>
      )}

      {/* ── Listening pill ─────────────────────────────────────────────── */}
      {isListening && (
        <div style={{ padding: '6px 16px 0', flexShrink: 0 }}>
          <TranscriptStatus status="listening" />
        </div>
      )}

      {/* ── Scrollable transcript body ─────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label="Transcript output"
        tabIndex={0}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          minHeight: 0,
        }}
      >
        {/* Empty state */}
        {!hasContent && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: 'var(--text-secondary)',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                margin: '0 auto 16px',
              }}
              aria-hidden="true"
            >
              🎙️
            </div>
            <p
              style={{
                fontSize: '15px',
                fontWeight: '600',
                color: 'var(--text-primary)',
                margin: '0 0 6px',
              }}
            >
              {isSupported ? 'Press Start to begin transcription' : 'Speech recognition not available'}
            </p>
            <p style={{ fontSize: '13px', margin: 0 }}>
              {isSupported
                ? 'Your speech will appear here in real time.'
                : 'Your browser does not support the Web Speech API. A server fallback will be used.'}
            </p>
          </div>
        )}

        {/* Segment list */}
        {segments.length > 0 && (
          <div role="list" aria-label="Transcript segments">
            {segments.map((seg, i) => (
              <TranscriptSegment
                key={seg.id}
                segment={seg}
                prevSpeaker={i > 0 ? segments[i - 1].speaker : undefined}
              />
            ))}
          </div>
        )}

        {/* Interim (live preview) text */}
        {interimText && (
          <div
            aria-live="polite"
            aria-label="Currently speaking"
            style={{
              marginLeft: '32px',
              padding: '10px 14px',
              background: 'rgba(59,130,246,0.06)',
              border: '1px dashed rgba(59,130,246,0.3)',
              borderRadius: '14px',
              fontSize: '14px',
              lineHeight: '1.6',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
              animation: 'transcriptEntrance 0.2s ease',
            }}
          >
            {interimText}
            <span aria-hidden="true" style={{ marginLeft: '4px' }}>▌</span>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomAnchorRef} style={{ height: '1px' }} />
      </div>

      {/* ── Scroll-to-bottom nudge ─────────────────────────────────────── */}
      {!autoScroll && (
        <div style={{ padding: '4px 16px', flexShrink: 0 }}>
          <button
            className="transcript-btn"
            aria-label="Scroll to latest transcript"
            onClick={scrollToBottom}
            style={{
              width: '100%',
              padding: '6px',
              fontSize: '12px',
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '500',
            }}
          >
            ↓ Scroll to latest
          </button>
        </div>
      )}

      {/* ── Footer action toolbar ──────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '10px 16px',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {/* Copy */}
          <IconButton
            label="Copy full transcript to clipboard"
            title="Copy transcript"
            onClick={handleCopy}
            disabled={!hasContent}
            style={
              copySuccess
                ? {
                    background: '#d1fae5',
                    color: '#065f46',
                    borderColor: '#6ee7b7',
                  }
                : {}
            }
          >
            {copySuccess ? '✓ Copied!' : '📋 Copy'}
          </IconButton>

          {/* Download */}
          <IconButton
            label="Download transcript as text file"
            title="Download .txt"
            onClick={handleDownload}
            disabled={!hasContent}
          >
            ⬇️ Download
          </IconButton>
        </div>

        {/* Clear */}
        <IconButton
          label="Clear all transcript content"
          title="Clear transcript"
          onClick={clearTranscript}
          disabled={!hasContent}
          style={{
            color: hasContent ? '#dc2626' : undefined,
            borderColor: hasContent ? '#fecaca' : undefined,
          }}
        >
          🗑 Clear
        </IconButton>
      </div>
    </div>
  )
}

export default LiveTranscriptPanel
