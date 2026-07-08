import React, { useMemo } from 'react'

/**
 * LiveAnalyticsBar — shows real-time answer distribution for teacher
 * @param {object} question — the active question object (with .options[].isCorrect)
 * @param {number[]} counts — array indexed by option index, value = response count
 * @param {number} totalStudents — number of students in room
 * @param {boolean} revealed — whether teacher has revealed answers
 */
export default function LiveAnalyticsBar({ question, counts = [], totalStudents = 0, revealed = false }) {
  if (!question?.options) return null

  const total = counts.reduce((s, c) => s + (c || 0), 0)

  const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']
  const BAR_COLORS = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#db2777']

  return (
    <div style={{ marginTop: '16px' }}>
      {/* Response tally */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.8px' }}>
          📊 Live Responses
        </span>
        <span style={{
          fontSize: '12px', fontWeight: '700',
          color: total === totalStudents && totalStudents > 0 ? '#059669' : 'var(--text-secondary)',
        }}>
          {total} / {totalStudents} answered
        </span>
      </div>

      {question.options.map((opt, idx) => {
        const count = counts[idx] || 0
        const pct   = total > 0 ? Math.round((count / total) * 100) : 0
        const isCorrect = opt.isCorrect
        const barColor  = revealed
          ? (isCorrect ? '#059669' : '#dc2626')
          : BAR_COLORS[idx % BAR_COLORS.length]

        return (
          <div key={idx} style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '22px', height: '22px',
                  background: revealed ? (isCorrect ? '#d1fae5' : '#fee2e2') : 'var(--bg-hover)',
                  color: revealed ? (isCorrect ? '#059669' : '#dc2626') : 'var(--text-secondary)',
                  borderRadius: '6px', fontSize: '11px', fontWeight: '800',
                }}>
                  {OPTION_LABELS[idx]}
                </span>
                <span style={{
                  fontSize: '12px', color: 'var(--text-primary)', fontWeight: '500',
                  maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {opt.text}
                </span>
                {revealed && isCorrect && (
                  <span style={{ fontSize: '10px', color: '#059669', fontWeight: '700' }}>✓ Correct</span>
                )}
              </div>
              <span style={{ fontSize: '12px', fontWeight: '700', color: barColor, minWidth: '48px', textAlign: 'right' }}>
                {count} ({pct}%)
              </span>
            </div>
            {/* Progress bar */}
            <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: barColor,
                borderRadius: '4px',
                transition: 'width 0.5s cubic-bezier(.4,0,.2,1)',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
