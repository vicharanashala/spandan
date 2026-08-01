import React from 'react'

function OptionDistribution({ question, distribution, totalParticipants = 0, isActive = false, isMobile = false }) {
  if (!question || !distribution) return null

  const totalResponses = Number(distribution.totalResponses) || 0
  const options = Array.isArray(distribution.options) ? distribution.options : []
  const correctOptions = new Set(
    !isActive
      ? (question.options || []).map((option, index) => option.isCorrect ? index : null).filter((index) => index !== null)
      : []
  )

  return (
    <section style={{
      marginBottom: '18px',
      padding: isMobile ? '14px' : '18px',
      background: 'var(--bg-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px'
    }} aria-label="Live option-wise response distribution">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '15px' }}>Response distribution</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '3px' }}>
            {isActive ? 'Live poll' : 'Poll results'}
          </div>
        </div>
        <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '700', whiteSpace: 'nowrap' }}>
          Responses: {totalResponses} / {Number(totalParticipants) || 0}
        </div>
      </div>

      {options.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No options available.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {options.map((option) => {
            const optionIndex = Number(option.optionIndex)
            const percentage = Math.max(0, Math.min(100, Number(option.percentage) || 0))
            const count = Number(option.count) || 0
            const optionText = question.options?.[optionIndex]?.text
            const isCorrect = correctOptions.has(optionIndex)
            const accent = isCorrect ? '#059669' : '#3b82f6'
            return (
              <div key={optionIndex} style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', color: 'var(--text-primary)', fontSize: '13px' }}>
                  <span style={{ width: '24px', flexShrink: 0, fontWeight: '700' }}>{String.fromCharCode(65 + optionIndex)}</span>
                  {optionText && <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap' }}>{optionText}</span>}
                  <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {percentage}% · {count}
                  </span>
                  {isCorrect && <span aria-label="Correct option" title="Correct option" style={{ color: '#059669', fontWeight: '800' }}>✓</span>}
                </div>
                <div style={{ height: '9px', background: 'var(--border-color)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: `${percentage}%`, height: '100%', minWidth: percentage > 0 ? '4px' : 0, background: accent, borderRadius: '999px', transition: 'width 250ms ease' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default OptionDistribution
