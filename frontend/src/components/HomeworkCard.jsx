import React from 'react'

function HomeworkCard({ homework }) {
  if (!homework) return null

  const difficultyColors = {
    easy: { bg: '#dcfce7', text: '#166534' },
    medium: { bg: '#fef9c3', text: '#854d0e' },
    hard: { bg: '#fee2e2', text: '#991b1b' }
  }

  const dc = difficultyColors[homework.difficulty] || difficultyColors.medium

  const dueDate = homework.dueDate ? new Date(homework.dueDate) : null
  const isOverdue = dueDate && dueDate < new Date()

  const completedItems = homework.items?.filter(i => i.completed)?.length || 0
  const totalItems = homework.items?.length || 0
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: '16px', padding: '20px',
      border: '1px solid var(--border-color)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
      transition: 'transform 0.2s, box-shadow 0.2s'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
            {homework.topic || 'Homework'}
          </h3>
          {homework.weakSubtopics?.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
              {homework.weakSubtopics.map((w, i) => (
                <span key={i} style={{
                  padding: '2px 8px', borderRadius: '4px', fontSize: '11px',
                  background: '#fee2e2', color: '#991b1b'
                }}>
                  {w}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span style={{
            padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
            background: dc.bg, color: dc.text
          }}>
            {homework.difficulty?.charAt(0).toUpperCase() + homework.difficulty?.slice(1) || 'Medium'}
          </span>
        </div>
      </div>

      {/* Due Date */}
      {dueDate && (
        <p style={{
          margin: '0 0 12px', fontSize: '12px',
          color: isOverdue ? '#dc2626' : 'var(--text-secondary)',
          fontWeight: isOverdue ? '600' : '400'
        }}>
          {isOverdue ? '⚠️ Overdue: ' : '📅 Due: '}{dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </p>
      )}

      {/* Progress Bar */}
      {homework.status === 'pending' && totalItems > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            <span>Progress</span>
            <span>{completedItems}/{totalItems}</span>
          </div>
          <div style={{
            width: '100%', height: '6px', background: 'var(--bg-secondary)',
            borderRadius: '3px', overflow: 'hidden'
          }}>
            <div style={{
              width: `${progress}%`, height: '100%',
              background: 'linear-gradient(90deg, #3b82f6, #2563eb)',
              borderRadius: '3px', transition: 'width 0.5s ease'
            }} />
          </div>
        </div>
      )}

      {/* Items Preview */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
        {(homework.items || []).slice(0, 3).map((item, idx) => (
          <div key={idx} style={{
            padding: '8px 10px', borderRadius: '8px',
            background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
            fontSize: '12px', color: 'var(--text-primary)'
          }}>
            <span style={{
              padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: '600',
              marginRight: '6px',
              background: item.type === 'MCQ' ? '#dbeafe' : item.type === 'SHORT_ANSWER' ? '#fef3c7' : '#ede9fe',
              color: item.type === 'MCQ' ? '#1e40af' : item.type === 'SHORT_ANSWER' ? '#92400e' : '#5b21b6'
            }}>
              {item.type?.replace(/_/g, ' ')}
            </span>
            {item.question?.substring(0, 80)}...
          </div>
        ))}
        {homework.items?.length > 3 && (
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>
            +{homework.items.length - 3} more items
          </p>
        )}
      </div>

      {/* Status Badge */}
      <div style={{ textAlign: 'center' }}>
        <span style={{
          padding: '6px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
          background: homework.status === 'submitted' ? '#d1fae5' : homework.status === 'reviewed' ? '#dbeafe' : '#f3f4f6',
          color: homework.status === 'submitted' ? '#059669' : homework.status === 'reviewed' ? '#2563eb' : 'var(--text-secondary)'
        }}>
          {homework.status === 'pending' ? '📝 Pending' : homework.status === 'submitted' ? '✅ Submitted' : '📋 Reviewed'}
        </span>
      </div>
    </div>
  )
}

export default HomeworkCard
