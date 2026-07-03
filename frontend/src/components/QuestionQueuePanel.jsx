import React, { useEffect, useState } from 'react'
import * as questionQueueService from '../services/questionQueueService'

// Shows the AI-generated question queue (ranked by score) so the teacher can
// pick which to launch next or dismiss. Pure UI — actual socket emit to
// launch a question is handled by the parent via onLaunch.
function QuestionQueuePanel({ onLaunch }) {
  const [state, setState] = useState(questionQueueService.getState())

  useEffect(() => {
    return questionQueueService.subscribe(setState)
  }, [])

  const { queue } = state

  if (queue.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '24px',
        color: 'var(--text-secondary)',
        fontSize: '13px',
        border: '1px dashed var(--border-color)',
        borderRadius: '12px'
      }}>
        No questions queued. They'll show up here after auto-generation.
      </div>
    )
  }

  const handleLaunch = (question) => {
    questionQueueService.dismiss(question._id || question.id)
    if (onLaunch) onLaunch(question)
  }

  const handleDismiss = (question) => {
    questionQueueService.dismiss(question._id || question.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {queue.map((q) => {
        const id = q._id || q.id
        const confidence = typeof q.confidence === 'number' ? q.confidence : (q.score ?? 0)
        return (
          <div
            key={id}
            className="card-hover"
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '14px',
              background: 'var(--bg-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', lineHeight: '1.5' }}>
                {q.question}
              </span>
              <span style={{
                flexShrink: 0,
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '700',
                background: confidence >= 75 ? '#d1fae5' : '#fef3c7',
                color: confidence >= 75 ? '#059669' : '#92400e',
                whiteSpace: 'nowrap'
              }}>
                ⭐ {confidence}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '10px',
                fontWeight: '600',
                padding: '2px 8px',
                borderRadius: '10px',
                background: q.type === 'MCQ' ? '#dbeafe' : '#ede9fe',
                color: q.type === 'MCQ' ? '#1e40af' : '#6d28d9'
              }}>
                {q.type === 'MCQ' ? 'MCQ' : 'T/F'}
              </span>
              <span style={{
                fontSize: '10px',
                fontWeight: '600',
                padding: '2px 8px',
                borderRadius: '10px',
                background: q.difficulty === 'hard' ? '#fee2e2' : '#e0f2fe',
                color: q.difficulty === 'hard' ? '#b91c1c' : '#0369a1',
                textTransform: 'capitalize'
              }}>
                {q.difficulty || 'medium'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleLaunch(q)}
                className="btn-hover"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: '#3b82f6',
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
                onClick={() => handleDismiss(q)}
                className="btn-hover"
                style={{
                  padding: '8px 12px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                ✕ Dismiss
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default QuestionQueuePanel