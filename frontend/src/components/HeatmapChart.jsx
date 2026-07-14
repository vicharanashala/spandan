import React from 'react'

function HeatmapChart({ topics = [], title = 'Heatmap', maxScore = 100 }) {
  if (!topics || topics.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: '14px' }}>
        No misconception data available yet. Complete a poll to generate analysis.
      </div>
    )
  }

  const getColor = (score) => {
    if (score <= 20) return 'linear-gradient(90deg, #22c55e, #16a34a)'
    if (score <= 40) return 'linear-gradient(90deg, #eab308, #ca8a04)'
    if (score <= 60) return 'linear-gradient(90deg, #f97316, #ea580c)'
    return 'linear-gradient(90deg, #ef4444, #dc2626)'
  }

  const getLabel = (score) => {
    if (score <= 20) return 'Low Confusion'
    if (score <= 40) return 'Moderate'
    if (score <= 60) return 'High'
    return 'Critical'
  }

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: '16px', padding: '20px',
      border: '1px solid var(--border-color)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
          {title}
        </h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Low</span>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f97316' }} />
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Med</span>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>High</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {topics.map((topic, idx) => (
          <div key={idx}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                {topic.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px',
                  background: topic.confusionScore <= 20 ? '#dcfce7' : topic.confusionScore <= 40 ? '#fef9c3' : topic.confusionScore <= 60 ? '#ffedd5' : '#fee2e2',
                  color: topic.confusionScore <= 20 ? '#166534' : topic.confusionScore <= 40 ? '#854d0e' : topic.confusionScore <= 60 ? '#9a3412' : '#991b1b'
                }}>
                  {getLabel(topic.confusionScore)}
                </span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', minWidth: '40px', textAlign: 'right' }}>
                  {topic.confusionScore}%
                </span>
              </div>
            </div>

            <div style={{
              width: '100%', height: '20px', background: 'var(--bg-secondary)',
              borderRadius: '10px', overflow: 'hidden', position: 'relative'
            }}>
              <div style={{
                height: '100%',
                background: getColor(topic.confusionScore),
                borderRadius: '10px',
                width: `${Math.min(topic.confusionScore, 100)}%`,
                transition: 'width 0.8s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                paddingRight: topic.confusionScore > 20 ? '8px' : '0',
                minWidth: topic.confusionScore > 0 ? '20px' : '0'
              }}>
                {topic.studentsAffected > 0 && (
                  <span style={{
                    fontSize: '10px', color: 'white', fontWeight: '600',
                    whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                  }}>
                    {topic.studentsAffected} student{topic.studentsAffected !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {topic.recommendation && (
              <p style={{
                margin: '4px 0 0', fontSize: '11px', color: 'var(--text-secondary)',
                fontStyle: 'italic', paddingLeft: '4px'
              }}>
                💡 {topic.recommendation}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default HeatmapChart
