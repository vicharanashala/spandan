/**
 * TranscriptSegment.jsx
 * A single transcript entry — timestamp, speaker label, and text.
 * Renders cleanly light or dark, and is fully accessible.
 */

import React, { memo } from 'react'

// Avatar colour palette (one per speaker index, cycling)
const SPEAKER_COLORS = [
  { bg: '#dbeafe', text: '#1d4ed8', dot: '#2563eb' }, // Blue
  { bg: '#d1fae5', text: '#065f46', dot: '#10b981' }, // Green
  { bg: '#fce7f3', text: '#9d174d', dot: '#ec4899' }, // Pink
  { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' }, // Amber
  { bg: '#ede9fe', text: '#5b21b6', dot: '#7c3aed' }, // Violet
  { bg: '#e0f2fe', text: '#075985', dot: '#0ea5e9' }, // Sky
]

/**
 * Extract the numeric index from a "Speaker N" label for colour cycling.
 * Falls back to 0 if unparseable.
 */
function speakerIndex(label = '') {
  const match = label.match(/\d+/)
  return match ? (parseInt(match[0], 10) - 1) % SPEAKER_COLORS.length : 0
}

function formatTime(isoString) {
  try {
    return new Date(isoString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return ''
  }
}

/**
 * @param {{ segment: import('../stores/transcriptStore').TranscriptSegment, prevSpeaker?: string }} props
 */
function TranscriptSegment({ segment, prevSpeaker }) {
  const { text, timestamp, speaker, id } = segment
  const idx = speakerIndex(speaker)
  const colours = SPEAKER_COLORS[idx]
  const isNewSpeaker = speaker !== prevSpeaker

  return (
    <div
      id={id}
      role="listitem"
      aria-label={`${speaker} at ${formatTime(timestamp)}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        animation: 'transcriptEntrance 0.3s ease-out',
        marginBottom: '16px',
      }}
    >
      {/* Speaker label — only show when speaker changes (or first segment) */}
      {isNewSpeaker && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: prevSpeaker ? '8px' : '0',
          }}
        >
          {/* Speaker avatar dot */}
          <div
            aria-hidden="true"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: colours.bg,
              border: `2px solid ${colours.dot}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              fontWeight: '700',
              color: colours.text,
              flexShrink: 0,
            }}
          >
            {speaker.charAt(speaker.length - 1)}
          </div>
          <span
            style={{
              fontSize: '12px',
              fontWeight: '600',
              color: colours.text,
              letterSpacing: '0.02em',
            }}
          >
            {speaker}
          </span>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              marginLeft: 'auto',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatTime(timestamp)}
          </span>
        </div>
      )}

      {/* The transcript bubble */}
      <div
        style={{
          background: isNewSpeaker ? colours.bg : 'var(--bg-primary)',
          border: `1px solid ${isNewSpeaker ? colours.dot + '40' : 'var(--border-color)'}`,
          borderRadius: isNewSpeaker ? '4px 14px 14px 14px' : '14px',
          padding: '10px 14px',
          fontSize: '14px',
          lineHeight: '1.6',
          color: 'var(--text-primary)',
          wordBreak: 'break-word',
          marginLeft: '32px',
        }}
      >
        {text}
        {/* Show timestamp inline if speaker not shown above */}
        {!isNewSpeaker && (
          <span
            style={{
              display: 'block',
              fontSize: '10px',
              color: 'var(--text-secondary)',
              marginTop: '4px',
              textAlign: 'right',
            }}
          >
            {formatTime(timestamp)}
          </span>
        )}
      </div>
    </div>
  )
}

export default memo(TranscriptSegment)
