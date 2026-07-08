import React, { useEffect, useState } from 'react'

const TYPE_STYLES = {
  info:    { bg: 'linear-gradient(135deg,#1e3a5f,#1d4ed8)', border: '#3b82f6', icon: '📢', color: '#93c5fd' },
  warning: { bg: 'linear-gradient(135deg,#78350f,#92400e)', border: '#f59e0b', icon: '⚠️', color: '#fcd34d' },
  success: { bg: 'linear-gradient(135deg,#064e3b,#065f46)', border: '#10b981', icon: '✅', color: '#6ee7b7' },
}

/**
 * AnnouncementBanner
 * Receives { message, type } and auto-dismisses after `autoDismissMs`.
 * Usage: <AnnouncementBanner message="..." type="info" onDismiss={() => {}} />
 */
export default function AnnouncementBanner({ message, type = 'info', onDismiss, autoDismissMs = 8000 }) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const s = TYPE_STYLES[type] || TYPE_STYLES.info

  useEffect(() => {
    if (!message) return
    setVisible(true)
    setLeaving(false)

    const tid = setTimeout(() => dismiss(), autoDismissMs)
    return () => clearTimeout(tid)
  }, [message])

  const dismiss = () => {
    setLeaving(true)
    setTimeout(() => {
      setVisible(false)
      onDismiss?.()
    }, 400)
  }

  if (!visible || !message) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '14px',
      background: s.bg,
      border: `1.5px solid ${s.border}`,
      borderRadius: '14px',
      padding: '16px 20px',
      marginBottom: '16px',
      boxShadow: `0 8px 32px ${s.border}40`,
      animation: leaving ? 'announcOut .4s ease forwards' : 'announcIn .4s cubic-bezier(.34,1.56,.64,1) forwards',
    }}>
      <style>{`
        @keyframes announcIn  { from{opacity:0;transform:translateY(-16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes announcOut { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(-12px)} }
      `}</style>
      <span style={{ fontSize: '22px', flexShrink: 0, marginTop: '1px' }}>{s.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '11px', fontWeight: '800', color: s.color, letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '4px' }}>
          Announcement from Teacher
        </div>
        <p style={{ margin: 0, color: 'white', fontWeight: '600', fontSize: '14px', lineHeight: '1.5' }}>{message}</p>
      </div>
      <button
        onClick={dismiss}
        style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', padding: '4px 10px', fontSize: '13px', flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  )
}
