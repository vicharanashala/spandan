import React, { useState } from 'react'

/**
 * InstantPoll — shown to students when teacher sends an opinion poll
 * Props:
 *   poll: { pollId, question, type }  — type: 'thumbs' | 'rating'
 *   onVote: (pollId, value) => void
 */
export default function InstantPoll({ poll, onVote }) {
  const [voted, setVoted] = useState(null)

  if (!poll) return null

  const handleVote = (val) => {
    if (voted !== null) return
    setVoted(val)
    onVote(poll.pollId, val)
  }

  const RATINGS = [
    { val: 1, label: 'Strongly Disagree', emoji: '😞' },
    { val: 2, label: 'Disagree',          emoji: '😕' },
    { val: 3, label: 'Neutral',           emoji: '😐' },
    { val: 4, label: 'Agree',             emoji: '🙂' },
    { val: 5, label: 'Strongly Agree',    emoji: '😄' },
  ]

  return (
    <div style={{
      background: 'linear-gradient(135deg,#1e1b4b,#312e81)',
      border: '1.5px solid rgba(167,139,250,.4)',
      borderRadius: '16px', padding: '20px 24px', marginBottom: '16px',
      boxShadow: '0 8px 32px rgba(124,58,237,.25)',
      animation: 'popIn .4s cubic-bezier(.34,1.56,.64,1) both',
    }}>
      <div style={{ marginBottom: '14px' }}>
        <span style={{ fontSize: '10px', fontWeight: '800', color: '#a78bfa', letterSpacing: '.8px', textTransform: 'uppercase' }}>
          Quick Poll from Teacher
        </span>
        <p style={{ margin: '6px 0 0', color: 'white', fontWeight: '700', fontSize: '15px', lineHeight: '1.4' }}>
          {poll.question}
        </p>
      </div>

      {voted !== null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6ee7b7', fontWeight: '700', fontSize: '14px' }}>
          <span style={{ fontSize: '22px' }}>✅</span>
          Response recorded! Thank you.
        </div>
      ) : poll.type === 'thumbs' ? (
        <div style={{ display: 'flex', gap: '12px' }}>
          {[{ val: 'up', emoji: '👍', label: 'Yes' }, { val: 'down', emoji: '👎', label: 'No' }].map(({ val, emoji, label }) => (
            <button key={val} onClick={() => handleVote(val)} style={{
              flex: 1, padding: '12px', background: 'rgba(255,255,255,.1)', border: '1.5px solid rgba(255,255,255,.2)',
              borderRadius: '12px', cursor: 'pointer', color: 'white', fontWeight: '700', fontSize: '22px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all .15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.1)'}
            >
              {emoji}
              <span style={{ fontSize: '11px', fontWeight: '600', opacity: .8 }}>{label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          {RATINGS.map(({ val, label, emoji }) => (
            <button key={val} onClick={() => handleVote(val)} title={label} style={{
              flex: 1, padding: '10px 4px', background: 'rgba(255,255,255,.1)', border: '1.5px solid rgba(255,255,255,.2)',
              borderRadius: '10px', cursor: 'pointer', color: 'white', fontWeight: '700', fontSize: '20px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', transition: 'all .15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.1)'}
            >
              {emoji}
              <span style={{ fontSize: '10px', opacity: .7 }}>{val}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
