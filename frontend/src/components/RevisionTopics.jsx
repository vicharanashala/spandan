import React from 'react'
import { getTopRevisionTopics } from '../utils/revisionTopics'

function RevisionTopics({ questions, isSessionComplete }) {
  if (!isSessionComplete) return null

  const answeredQuestions = (questions || []).filter((question) => question?.answered)
  if (answeredQuestions.length === 0) return null

  const hasIncorrectAnswer = answeredQuestions.some((question) => question.isCorrect === false)
  const revisionTopics = getTopRevisionTopics(answeredQuestions)

  // Older sessions may contain only incorrect questions without topic metadata.
  if (hasIncorrectAnswer && revisionTopics.length === 0) return null

  return (
    <section
      aria-labelledby="revision-topics-heading"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        padding: '24px',
        marginBottom: '24px'
      }}
    >
      <h2 id="revision-topics-heading" style={{
        margin: '0 0 18px',
        fontSize: '18px',
        fontWeight: 700,
        letterSpacing: '-0.01em',
        color: 'var(--text-primary)'
      }}>
        {revisionTopics.length > 0 && revisionTopics.length < 3 ? 'Things to Revise' : '3 Things to Revise'}
      </h2>

      {revisionTopics.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
          Nothing to revise from this session 🎉
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {revisionTopics.map((item, index) => (
            <div key={item.topic} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '14px 16px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              minWidth: 0
            }}>
              <span aria-hidden="true" style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                background: 'var(--accent)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                flexShrink: 0
              }}>
                {index + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600, overflowWrap: 'anywhere' }}>
                  {item.topic}
                </div>
                <div style={{ marginTop: '3px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  {item.missedCount} {item.missedCount === 1 ? 'question' : 'questions'} missed
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default RevisionTopics
