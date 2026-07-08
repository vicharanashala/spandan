import React, { useState } from 'react'

const RATINGS = [
  { val: 'easy',   label: 'Easy',   emoji: '😊', color: '#059669', bg: 'rgba(5,150,105,.2)',   border: 'rgba(5,150,105,.4)'  },
  { val: 'medium', label: 'Medium', emoji: '🤔', color: '#d97706', bg: 'rgba(217,119,6,.2)',   border: 'rgba(217,119,6,.4)'  },
  { val: 'hard',   label: 'Hard',   emoji: '😰', color: '#dc2626', bg: 'rgba(220,38,38,.2)',   border: 'rgba(220,38,38,.4)'  },
]

/**
 * DifficultyRater — slide-in after student submits an answer
 * Props:
 *   questionId: string
 *   onRate: (questionId, rating) => void
 *   onDismiss: () => void
 */
export default function DifficultyRater({ questionId, onRate, onDismiss }) {
  const [chosen, setChosen] = useState(null)

  if (!questionId) return null

  const handle = (val) => {
    if (chosen) return
    setChosen(val)
    onRate?.(questionId, val)
    setTimeout(() => onDismiss?.(), 1200)
  }

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '14px', padding: '14px 18px', marginTop: '12px',
      animation: 'slideDown .35s ease both',
    }}>
      <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.7px' }}>
        How difficult was this question?
      </p>
      <div style={{ display: 'flex', gap: '8px' }}>
        {RATINGS.map(({ val, label, emoji, color, bg, border }) => {
          const isChosen = chosen === val
          return (
            <button key={val} onClick={() => handle(val)} style={{
              flex: 1, padding: '10px 8px',
              background: isChosen ? bg : 'transparent',
              border: `1.5px solid ${isChosen ? border : 'var(--border-color)'}`,
              borderRadius: '10px', cursor: chosen ? 'default' : 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              transition: 'all .15s', transform: isChosen ? 'scale(1.05)' : 'scale(1)',
            }}>
              <span style={{ fontSize: '20px' }}>{emoji}</span>
              <span style={{ fontSize: '11px', fontWeight: '700', color: isChosen ? color : 'var(--text-secondary)' }}>{label}</span>
            </button>
          )
        })}
      </div>
      {chosen && (
        <p style={{ margin: '10px 0 0', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
          Thanks for your feedback!
        </p>
      )}
    </div>
  )
}
