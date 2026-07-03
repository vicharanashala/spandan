import React, { useEffect, useState } from 'react'
import * as questionQueueService from '../services/questionQueueService'

// Lightweight toast that pops up whenever new AI-generated questions land in
// the queue. Teacher can launch the top one immediately or dismiss to review
// later in QuestionQueuePanel. Auto-hides once the queue empties.
function PollReadyPopup({ onLaunch }) {
  const [state, setState] = useState(questionQueueService.getState())
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    return questionQueueService.subscribe((next) => {
      setState(next)
      if (next.queue.length > 0) setVisible(true)
    })
  }, [])

  if (!visible || state.queue.length === 0) return null

  const top = state.queue[0]
  const remaining = state.queue.length - 1

  const handleLaunchNext = () => {
    const launched = questionQueueService.launchNext()
    if (launched && onLaunch) onLaunch(launched)
    if (questionQueueService.getState().queue.length === 0) setVisible(false)
  }

  const handleDismissAll = () => {
    setVisible(false)
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 2500,
      width: '320px',
      background: 'var(--bg-card)',
      borderRadius: '16px',
      padding: '18px',
      boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
      border: '1px solid var(--border-color)',
      animation: 'pollPopIn 0.25s ease'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '18px' }}>🔔</span>
        <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
          Questions Ready
        </span>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
        Top pick selected{remaining > 0 ? `, ${remaining} more in queue` : ''}.
      </p>

      <div style={{
        padding: '10px 12px',
        borderRadius: '10px',
        background: 'var(--bg-primary)',
        fontSize: '13px',
        color: 'var(--text-primary)',
        marginBottom: '12px',
        lineHeight: '1.5'
      }}>
        {top.question}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleLaunchNext}
          className="btn-hover"
          style={{
            flex: 1,
            padding: '9px 12px',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          🚀 Launch Next
        </button>
        <button
          onClick={handleDismissAll}
          className="btn-hover"
          style={{
            padding: '9px 12px',
            background: 'transparent',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          Dismiss
        </button>
      </div>

      <style>{`
        @keyframes pollPopIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default PollReadyPopup