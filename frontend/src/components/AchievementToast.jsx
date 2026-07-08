import React, { useEffect, useState } from 'react'

const BADGE_DEFS = {
  streak3:      { icon: '🔥', title: 'On Fire!',       subtitle: '3 correct in a row!',    color: '#f97316', bg: '#fff7ed' },
  streak5:      { icon: '🌟', title: 'Unstoppable!',   subtitle: '5 correct in a row!',    color: '#f59e0b', bg: '#fefce8' },
  fastest:      { icon: '⚡', title: 'Lightning Fast!', subtitle: 'Fastest answer!',        color: '#6366f1', bg: '#eef2ff' },
  perfect:      { icon: '🎯', title: 'Perfect Score!', subtitle: 'Full marks on a question!', color: '#10b981', bg: '#f0fdf4' },
  firstBlood:   { icon: '🥇', title: 'First!',         subtitle: 'First to answer!',       color: '#eab308', bg: '#fefce8' },
  comeback:     { icon: '💪', title: 'Comeback!',      subtitle: 'Correct after a miss!',  color: '#8b5cf6', bg: '#f5f3ff' },
}

/**
 * AchievementToast
 * @param {string[]} badges — array of badge keys to show (from BADGE_DEFS)
 * @param {function} onDone — called when all toasts finish
 */
export default function AchievementToast({ badges = [], onDone }) {
  const [visible, setVisible] = useState([])
  const [dismissed, setDismissed] = useState([])

  useEffect(() => {
    if (!badges.length) return
    setVisible(badges)
    setDismissed([])

    // Auto-dismiss each badge after staggered delays
    badges.forEach((badge, i) => {
      setTimeout(() => {
        setDismissed(prev => [...prev, badge])
      }, 2400 + i * 600)
    })

    const total = 2400 + badges.length * 600
    const tid = setTimeout(() => {
      setVisible([])
      onDone?.()
    }, total)

    return () => clearTimeout(tid)
  }, [badges.join(',')])

  if (!visible.length) return null

  return (
    <div style={{
      position: 'fixed', top: '80px', right: '24px',
      display: 'flex', flexDirection: 'column', gap: '10px',
      zIndex: 9000, pointerEvents: 'none',
    }}>
      {visible.map((key, i) => {
        const def = BADGE_DEFS[key]
        if (!def) return null
        const leaving = dismissed.includes(key)
        return (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            background: def.bg,
            border: `2px solid ${def.color}`,
            borderRadius: '14px',
            padding: '12px 18px',
            boxShadow: `0 8px 32px ${def.color}40`,
            animation: leaving
              ? 'toastOut .4s ease forwards'
              : 'toastIn .4s cubic-bezier(.34,1.56,.64,1) forwards',
            minWidth: '220px',
          }}>
            <style>{`
              @keyframes toastIn  { from{opacity:0;transform:translateX(60px)} to{opacity:1;transform:translateX(0)} }
              @keyframes toastOut { from{opacity:1;transform:translateX(0)}  to{opacity:0;transform:translateX(60px)} }
            `}</style>
            <span style={{ fontSize: '28px', lineHeight: 1 }}>{def.icon}</span>
            <div>
              <div style={{ fontWeight: '800', fontSize: '13px', color: def.color }}>{def.title}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '500' }}>{def.subtitle}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export { BADGE_DEFS }
