import React from 'react'
import TimerRing from './TimerRing'

// Renders a question EXACTLY as students see it in the live poll, so teachers can verify the
// look & feel before launching. Students never see which option is correct during a live poll,
// so no correct highlight is shown here either — it mirrors the real student experience.
function QuestionPreviewModal({ question, onClose }) {
  if (!question) return null

  const total = question.timeToAnswer || 30

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 4000,
      padding: '20px',
      boxSizing: 'border-box'
    }} onClick={onClose}>
      <div style={{
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        overflowY: 'auto',
        background: 'var(--bg-card)',
        borderRadius: '20px',
        padding: '20px',
        boxShadow: '0 25px 80px rgba(0,0,0,0.5)',
        border: '1px solid var(--border-color)'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
              👁️ Student Preview
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Exact view students see when you launch this poll
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--text-secondary)'
            }}
          >
            ✕
          </button>
        </div>

        {/* Student live-question view */}
        <div style={{
          background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
          borderRadius: '16px',
          padding: '24px',
          color: 'white',
          boxShadow: '0 10px 40px rgba(124, 58, 237, 0.3)'
        }}>
          {/* Timer (static in preview) */}
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <TimerRing timeLeft={total} total={total} size={96} />
            <p style={{ fontSize: '12px', opacity: 0.9, marginTop: '8px' }}>seconds remaining</p>
          </div>

          {/* Question */}
          <h4 style={{
            fontSize: '18px',
            fontWeight: '700',
            textAlign: 'center',
            margin: '0 0 20px',
            wordBreak: 'break-word',
            color: '#fff'
          }}>
            {question.question}
          </h4>

          {/* Options (not interactive — students select on tap) */}
          <div style={{ display: 'grid', gap: '10px' }}>
            {question.options && question.options.map((option, idx) => {
              const optionText = typeof option === 'string' ? option : option.text
              const label = String.fromCharCode(65 + idx)
              return (
                <div
                  key={idx}
                  style={{
                    minHeight: '44px',
                    boxSizing: 'border-box',
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.1)',
                    border: '2px solid rgba(255,255,255,0.2)',
                    borderRadius: '12px',
                    color: 'white',
                    fontSize: '15px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px'
                  }}
                >
                  <span style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '700',
                    fontSize: '14px',
                    flexShrink: 0
                  }}>
                    {label}
                  </span>
                  <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{optionText}</span>
                </div>
              )
            })}
          </div>

          {/* Submit button (static) */}
          <div style={{
            marginTop: '16px',
            padding: '13px',
            background: '#ffd700',
            color: '#1f2937',
            borderRadius: '12px',
            textAlign: 'center',
            fontWeight: '600',
            fontSize: '15px'
          }}>
            Submit Answer
          </div>
        </div>
      </div>
    </div>
  )
}

export default QuestionPreviewModal
