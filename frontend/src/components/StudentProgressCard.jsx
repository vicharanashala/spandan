import React from 'react'

function StudentProgressCard({ student, roomId }) {
  if (!student) return null

  const accuracy = student.accuracy || 0
  const responseTime = student.averageResponseTime || 0
  const totalAnswered = student.totalAnswered || 0
  const weakTopics = student.weakTopics || []

  const accuracyColor = accuracy >= 80 ? '#22c55e' : accuracy >= 60 ? '#eab308' : '#ef4444'
  const accuracyBg = accuracy >= 80 ? '#dcfce7' : accuracy >= 60 ? '#fef9c3' : '#fee2e2'

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: '16px', padding: '20px',
      border: '1px solid var(--border-color)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
      transition: 'transform 0.2s, box-shadow 0.2s'
    }}>
      {/* Student Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: '700', fontSize: '16px'
          }}>
            {student.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              {student.name || 'Unknown Student'}
            </h4>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {totalAnswered} question{totalAnswered !== 1 ? 's' : ''} answered
            </p>
          </div>
        </div>
        <div style={{
          padding: '8px 12px', borderRadius: '8px', textAlign: 'center',
          background: accuracyBg
        }}>
          <div style={{ fontSize: '20px', fontWeight: '700', color: accuracyColor }}>
            {accuracy}%
          </div>
          <div style={{ fontSize: '10px', color: accuracyColor, fontWeight: '600' }}>
            ACCURACY
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px'
      }}>
        <div style={{
          padding: '8px', borderRadius: '8px', textAlign: 'center',
          background: 'var(--bg-primary)', border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
            {totalAnswered}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Answered</div>
        </div>
        <div style={{
          padding: '8px', borderRadius: '8px', textAlign: 'center',
          background: 'var(--bg-primary)', border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
            {responseTime.toFixed(1)}s
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Avg. Time</div>
        </div>
        <div style={{
          padding: '8px', borderRadius: '8px', textAlign: 'center',
          background: 'var(--bg-primary)', border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: weakTopics.length > 0 ? '#ef4444' : '#22c55e' }}>
            {weakTopics.length || 0}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Weak Areas</div>
        </div>
      </div>

      {/* Weak Topics */}
      {weakTopics.length > 0 && (
        <div>
          <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', margin: '0 0 6px' }}>
            ⚠️ Needs Improvement
          </p>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {weakTopics.map((topic, idx) => (
              <span key={idx} style={{
                padding: '3px 8px', borderRadius: '4px', fontSize: '11px',
                background: '#fee2e2', color: '#991b1b', fontWeight: '500'
              }}>
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default StudentProgressCard
