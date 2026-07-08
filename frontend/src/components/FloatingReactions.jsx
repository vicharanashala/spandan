import React, { useState, useEffect, useRef } from 'react'

const EMOJIS = ['👍', '❤️', '😂', '😮', '🎉', '🤔']

let idCounter = 0

/**
 * FloatingReactions
 * Teacher-side: shows incoming emoji reactions from students floating up.
 * Student-side: shows own reactions flying up after clicking.
 *
 * Props:
 *   reactions: Array<{id, emoji, userName}> — incoming reactions to display
 *   onClear: (id) => void — called after animation ends
 *   showBar: boolean — whether to show the emoji picker bar
 *   onReact: (emoji) => void — called when student clicks an emoji
 *   rateLimitMs: number — min ms between sends (default 2000)
 */
export default function FloatingReactions({ reactions = [], onClear, showBar = false, onReact, rateLimitMs = 2000 }) {
  const [floaters, setFloaters] = useState([])
  const lastSentRef = useRef(0)
  const [cooldown, setCooldown] = useState(false)

  // Add incoming reactions as floaters
  useEffect(() => {
    reactions.forEach(r => {
      if (floaters.find(f => f.id === r.id)) return
      const x = 10 + Math.random() * 80 // % from left
      setFloaters(prev => [...prev, { id: r.id, emoji: r.emoji, x, born: Date.now() }])
      // Remove after animation (2.8s)
      setTimeout(() => {
        setFloaters(prev => prev.filter(f => f.id !== r.id))
        onClear?.(r.id)
      }, 2800)
    })
  }, [reactions])

  const sendReaction = (emoji) => {
    const now = Date.now()
    if (now - lastSentRef.current < rateLimitMs) return
    lastSentRef.current = now
    setCooldown(true)
    setTimeout(() => setCooldown(false), rateLimitMs)
    onReact?.(emoji)
    // Local floater
    const id = `local_${++idCounter}`
    const x = 10 + Math.random() * 80
    setFloaters(prev => [...prev, { id, emoji, x, born: Date.now() }])
    setTimeout(() => setFloaters(prev => prev.filter(f => f.id !== id)), 2800)
  }

  return (
    <>
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1);   opacity: 1; }
          70%  { transform: translateY(-140px) scale(1.3); opacity: .9; }
          100% { transform: translateY(-200px) scale(.8); opacity: 0; }
        }
        .reaction-floater {
          position: fixed;
          bottom: ${showBar ? '80px' : '24px'};
          font-size: 28px;
          pointer-events: none;
          z-index: 9999;
          animation: floatUp 2.8s ease-out forwards;
          filter: drop-shadow(0 4px 8px rgba(0,0,0,.25));
          user-select: none;
        }
      `}</style>

      {/* Floating emojis */}
      {floaters.map(f => (
        <span key={f.id} className="reaction-floater" style={{ left: `${f.x}%` }}>
          {f.emoji}
        </span>
      ))}

      {/* Emoji picker bar (student only) */}
      {showBar && (
        <div style={{
          position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: '8px', alignItems: 'center',
          background: 'rgba(15,12,50,.85)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(167,139,250,.3)', borderRadius: '40px',
          padding: '8px 18px', boxShadow: '0 8px 32px rgba(0,0,0,.4)',
          zIndex: 1000,
        }}>
          <span style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,.4)', letterSpacing: '.5px', textTransform: 'uppercase', marginRight: '4px' }}>React</span>
          {EMOJIS.map(emoji => (
            <button key={emoji} onClick={() => sendReaction(emoji)}
              disabled={cooldown}
              style={{
                fontSize: '22px', background: 'none', border: 'none', cursor: cooldown ? 'default' : 'pointer',
                padding: '4px', borderRadius: '50%', opacity: cooldown ? .4 : 1,
                transition: 'transform .15s, opacity .15s',
                lineHeight: 1,
              }}
              onMouseEnter={e => !cooldown && (e.currentTarget.style.transform = 'scale(1.3)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
