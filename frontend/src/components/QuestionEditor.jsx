import React from 'react'

// Inline editor for a single generated question. Used inside both review popups (Paste & Generate
// and the automatic pipeline) so a teacher can fix the question text, the option texts, and — most
// importantly — which option(s) are correct before launching it to the class. `onChange` receives
// the full updated question object; the parent keeps it in its own pendingQuestions state.
function QuestionEditor({ question, onChange }) {
  const type = question.type || 'MCQ'
  const options = question.options || []
  const isMSQ = type === 'MSQ'
  const isTF = type === 'TF'

  const patch = (updates) => onChange({ ...question, ...updates })

  const setQuestionText = (v) => patch({ question: v })

  const setOptionText = (idx, v) =>
    patch({ options: options.map((o, i) => (i === idx ? { ...o, text: v } : o)) })

  // MCQ/TF: exactly one correct (selecting one clears the rest). MSQ: toggle each independently.
  const toggleCorrect = (idx) =>
    patch({
      options: options.map((o, i) =>
        isMSQ ? (i === idx ? { ...o, isCorrect: !o.isCorrect } : o)
              : { ...o, isCorrect: i === idx })
    })

  const addOption = () => patch({ options: [...options, { text: '', isCorrect: false }] })

  const removeOption = (idx) => {
    if (options.length <= 2) return
    patch({ options: options.filter((_, i) => i !== idx) })
  }

  const inputStyle = {
    flex: 1,
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: '14px'
  }

  return (
    <div style={{
      background: 'var(--bg-primary)',
      borderRadius: '16px',
      padding: '20px',
      marginBottom: '20px',
      border: '1px solid var(--border-color)'
    }}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
        Question
      </label>
      <textarea
        value={question.question || ''}
        onChange={(e) => setQuestionText(e.target.value)}
        rows={2}
        style={{ ...inputStyle, width: '100%', marginTop: '6px', marginBottom: '16px', resize: 'vertical', boxSizing: 'border-box' }}
      />

      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
        Options — {isMSQ ? 'tap the boxes to mark all correct answers' : 'tap a circle to mark the correct answer'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {options.map((option, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => toggleCorrect(idx)}
              title={option.isCorrect ? 'Correct answer' : 'Mark as correct'}
              style={{
                width: '30px',
                height: '30px',
                flexShrink: 0,
                cursor: 'pointer',
                borderRadius: isMSQ ? '8px' : '50%',
                border: `2px solid ${option.isCorrect ? '#10b981' : 'var(--border-color)'}`,
                background: option.isCorrect ? '#10b981' : 'transparent',
                color: option.isCorrect ? 'white' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 700
              }}
            >
              {option.isCorrect ? '✓' : String.fromCharCode(65 + idx)}
            </button>

            {isTF ? (
              <span style={{ ...inputStyle, display: 'flex', alignItems: 'center' }}>{option.text}</span>
            ) : (
              <input
                type="text"
                value={option.text || ''}
                onChange={(e) => setOptionText(idx, e.target.value)}
                placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                style={inputStyle}
              />
            )}

            {!isTF && options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(idx)}
                title="Remove option"
                style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '20px', cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {!isTF && options.length < 6 && (
        <button
          type="button"
          onClick={addOption}
          style={{ marginTop: '10px', padding: '6px 12px', borderRadius: '8px', border: '1px dashed var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}
        >
          + Add option
        </button>
      )}
    </div>
  )
}

export default QuestionEditor
