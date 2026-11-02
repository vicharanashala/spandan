import React from 'react'
import { Timer } from 'lucide-react'
import { Ico } from './icons'

// Time left on the question that is live with students, shown whichever question the teacher is viewing.
// After the countdown ends it stays as "Time's up" until the next launch replaces it.
function LiveTimerChip({ liveIndex, timeLeft, isActive }) {
  if (liveIndex < 0) return null

  if (!isActive) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        borderRadius: '20px',
        whiteSpace: 'nowrap',
        background: 'rgba(107, 114, 128, 0.12)',
        border: '2px solid #6b7280'
      }}>
        <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '700' }}>
          <Ico as={Timer} /> Q{liveIndex + 1} · Time's up
        </span>
      </div>
    )
  }

  const urgent = timeLeft <= 5
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      borderRadius: '20px',
      whiteSpace: 'nowrap',
      background: urgent ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
      border: `2px solid ${urgent ? '#ef4444' : '#10b981'}`
    }}>
      <span style={{ fontSize: '12px', color: urgent ? '#ef4444' : '#10b981', fontWeight: '600' }}>
        Q{liveIndex + 1} live
      </span>
      <span style={{
        fontSize: '18px',
        color: urgent ? '#ef4444' : '#10b981',
        fontWeight: '700',
        animation: urgent ? 'pulse 0.5s infinite' : 'none'
      }}>
        <Ico as={Timer} /> {timeLeft}s
      </span>
      {urgent && (
        <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600' }}>
          LEFT!
        </span>
      )}
    </div>
  )
}

export default LiveTimerChip
