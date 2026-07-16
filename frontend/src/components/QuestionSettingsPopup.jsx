import React, { useState } from 'react'

/**
 * QuestionSettingsPopup — shown before inserting questions from bank.
 * Lets teacher set time and points before adding to room.
 */
export default function QuestionSettingsPopup({ questionCount, onConfirm, onClose }) {
  const [time, setTime] = useState(30)
  const [points, setPoints] = useState(100)

  const handleConfirm = () => {
    onConfirm({ timeToAnswer: time, points })
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-card)', borderRadius: '16px', padding: '24px',
        width: '90%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
            ⚙️ Question Settings
          </h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)'
          }}>✕</button>
        </div>

        <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Configure settings for {questionCount > 1 ? `${questionCount} questions` : 'this question'} before inserting:
        </p>

        {/* Time input */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
            ⏱ TIME TO ANSWER (seconds)
          </label>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {[10, 15, 30, 45, 60].map(t => (
              <button
                key={t}
                onClick={() => setTime(t)}
                style={{
                  padding: '8px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                  border: time === t ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                  background: time === t ? '#3b82f6' : 'var(--bg-secondary)',
                  color: time === t ? 'white' : 'var(--text-secondary)',
                  cursor: 'pointer', flex: 1
                }}
              >
                {t}s
              </button>
            ))}
          </div>
          <input
            type="number"
            value={time}
            onChange={(e) => setTime(Math.max(5, Math.min(300, parseInt(e.target.value) || 5)))}
            onKeyDown={handleKeyDown}
            min={5}
            max={300}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px', marginTop: '8px',
              border: '1px solid var(--border-color)', fontSize: '13px',
              background: 'var(--bg-secondary)', color: 'var(--text-primary)', boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Points input */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>
            🏆 POINTS
          </label>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {[50, 100, 150, 200, 500].map(p => (
              <button
                key={p}
                onClick={() => setPoints(p)}
                style={{
                  padding: '8px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                  border: points === p ? '2px solid #f59e0b' : '1px solid var(--border-color)',
                  background: points === p ? '#f59e0b' : 'var(--bg-secondary)',
                  color: points === p ? 'white' : 'var(--text-secondary)',
                  cursor: 'pointer', flex: 1
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(Math.max(10, Math.min(1000, parseInt(e.target.value) || 10)))}
            onKeyDown={handleKeyDown}
            min={10}
            max={1000}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '8px', marginTop: '8px',
              border: '1px solid var(--border-color)', fontSize: '13px',
              background: 'var(--bg-secondary)', color: 'var(--text-primary)', boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          style={{
            width: '100%', padding: '12px', borderRadius: '10px',
            background: '#3b82f6', color: 'white', border: 'none',
            fontSize: '14px', fontWeight: '600', cursor: 'pointer'
          }}
        >
          Insert {questionCount > 1 ? `${questionCount} Questions` : 'Question'} ({time}s · {points}pts)
        </button>
      </div>
    </div>
  )
}
