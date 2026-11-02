import React from 'react'
import { Check } from 'lucide-react'
import { Ico } from './icons'

// One pill per generated question, for switching between them in an approval pop-up.
// Launched questions carry a tick; rejected ones are struck through.
function QuestionNavPills({ questions, currentIndex, status, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
      {questions.map((q, index) => {
        const isCurrent = index === currentIndex
        const st = status[index]
        return (
          <button
            key={q.id || index}
            onClick={() => onSelect(index)}
            style={{
              padding: '4px 12px',
              borderRadius: '20px',
              border: isCurrent
                ? '2px solid var(--accent)'
                : `1px solid ${st === 'launched' ? '#10b981' : 'var(--border-color)'}`,
              background: isCurrent ? '#dbeafe' : 'transparent',
              color: isCurrent ? 'var(--accent)' : st === 'launched' ? '#10b981' : 'var(--text-secondary)',
              textDecoration: st === 'rejected' ? 'line-through' : 'none',
              opacity: st === 'rejected' ? 0.6 : 1,
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            {st === 'launched' && <><Ico as={Check} />{' '}</>}Q{index + 1} ({q.type})
          </button>
        )
      })}
    </div>
  )
}

export default QuestionNavPills
