import React, { useState, useEffect } from 'react'

// "Compare & choose" step: shown BEFORE the normal QuestionApprovalPopup when the teacher picked
// Compare mode. For each question slot, both providers' independently-generated version are shown
// side by side; the teacher picks one (or rejects the pair, dropping that slot entirely). The
// winners are handed to onComplete as a flat questions array, which the caller then feeds into the
// existing QuestionApprovalPopup exactly as if a single provider had generated them — this popup
// only decides WHICH question goes to the next step, it never launches/approves anything itself.
const PROVIDER_LABELS = {
  minimax: { name: 'MiniMax', icon: '🌀' },
  openai: { name: 'OpenAI', icon: '🤖' },
  anthropic: { name: 'Anthropic', icon: '🔶' },
  google: { name: 'Google', icon: '✨' }
}

function providerLabel(id) {
  return PROVIDER_LABELS[id] || { name: id, icon: '🧠' }
}

function getTypeColor(type) {
  switch (type) {
    case 'MCQ': return '#3b82f6'
    case 'TF': return '#10b981'
    case 'MSQ': return '#8b5cf6'
    default: return '#6b7280'
  }
}

function QuestionPreviewCard({ option, selected, onSelect }) {
  const { provider, question } = option
  const label = providerLabel(provider)
  return (
    <div
      onClick={onSelect}
      style={{
        flex: 1,
        minWidth: 0,
        border: `2px solid ${selected ? '#10b981' : 'var(--border-color)'}`,
        background: selected ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-primary)',
        borderRadius: '14px',
        padding: '16px',
        cursor: 'pointer',
        transition: 'all 0.15s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
          {label.icon} {label.name}
        </span>
        {selected && (
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#10b981' }}>✓ SELECTED</span>
        )}
      </div>
      <p style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', lineHeight: 1.4 }}>
        {question.question}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {(question.options || []).map((opt, i) => (
          <div
            key={i}
            style={{
              padding: '7px 10px',
              borderRadius: '8px',
              fontSize: '12px',
              background: opt.isCorrect ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-secondary)',
              color: opt.isCorrect ? '#059669' : 'var(--text-secondary)',
              fontWeight: opt.isCorrect ? '600' : '400',
              border: opt.isCorrect ? '1px solid rgba(16,185,129,0.35)' : '1px solid transparent'
            }}
          >
            {opt.isCorrect && '✓ '}{opt.text}
          </div>
        ))}
      </div>
      {question.explanation && (
        <p style={{ margin: '10px 0 0', fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          {question.explanation}
        </p>
      )}
    </div>
  )
}

function DualQuestionComparePopup({ pairs, providerA, providerB, onComplete, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  // choices[i] = 0 | 1 (which option index of the pair is picked) | 'reject' | undefined (undecided)
  const [choices, setChoices] = useState({})

  useEffect(() => {
    setCurrentIndex(0)
    setChoices({})
  }, [pairs])

  if (!pairs || pairs.length === 0) return null

  const currentPair = pairs[currentIndex]
  const currentChoice = choices[currentIndex]
  const isLast = currentIndex === pairs.length - 1
  const decidedCount = Object.keys(choices).length

  const choose = (optionIdx) => setChoices(prev => ({ ...prev, [currentIndex]: optionIdx }))
  const rejectPair = () => setChoices(prev => ({ ...prev, [currentIndex]: 'reject' }))

  const goNext = () => {
    if (isLast) return finish()
    setCurrentIndex(i => i + 1)
  }
  const goBack = () => setCurrentIndex(i => Math.max(0, i - 1))

  const finish = (finalChoices = choices) => {
    const winners = pairs
      .map((pair, i) => {
        const choice = finalChoices[i]
        if (choice === 'reject' || choice === undefined) return null
        return pair.options[choice].question
      })
      .filter(Boolean)
    onComplete(winners)
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '20px',
        padding: '24px',
        width: '780px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
        border: '1px solid var(--border-color)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)' }}>
              🆚 Compare &amp; Choose
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Question {currentIndex + 1} of {pairs.length} · {providerLabel(providerA).name} vs {providerLabel(providerB).name} · {decidedCount}/{pairs.length} decided
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            ✕
          </button>
        </div>

        {/* Nav pills */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
          {pairs.map((p, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              style={{
                width: '30px', height: '30px', borderRadius: '50%',
                border: `2px solid ${i === currentIndex ? '#3b82f6' : (choices[i] !== undefined ? '#10b981' : 'var(--border-color)')}`,
                background: i === currentIndex ? 'rgba(59,130,246,0.12)' : (choices[i] !== undefined ? 'rgba(16,185,129,0.1)' : 'transparent'),
                color: 'var(--text-primary)',
                fontSize: '12px', fontWeight: '700', cursor: 'pointer'
              }}
            >
              {choices[i] !== undefined ? '✓' : i + 1}
            </button>
          ))}
        </div>

        {/* Type badge */}
        <div style={{ marginBottom: '12px' }}>
          <span style={{
            display: 'inline-block', padding: '4px 10px', borderRadius: '20px',
            fontSize: '11px', fontWeight: '700', color: '#fff',
            background: getTypeColor(currentPair.type)
          }}>
            {currentPair.type}
          </span>
        </div>

        {/* Side-by-side comparison */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {currentPair.options.map((opt, i) => (
            <QuestionPreviewCard
              key={i}
              option={opt}
              selected={currentChoice === i}
              onSelect={() => choose(i)}
            />
          ))}
        </div>

        {/* Reject pair */}
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={rejectPair}
            style={{
              padding: '8px 14px', borderRadius: '10px',
              border: `1.5px solid ${currentChoice === 'reject' ? '#ef4444' : 'var(--border-color)'}`,
              background: currentChoice === 'reject' ? 'rgba(239,68,68,0.1)' : 'transparent',
              color: currentChoice === 'reject' ? '#ef4444' : 'var(--text-secondary)',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer'
            }}
          >
            ✕ Skip this question (use neither)
          </button>
        </div>

        {/* Footer nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={goBack}
            disabled={currentIndex === 0}
            style={{
              padding: '10px 18px', borderRadius: '10px', border: '1px solid var(--border-color)',
              background: 'transparent', color: 'var(--text-primary)',
              fontSize: '14px', fontWeight: '600',
              cursor: currentIndex === 0 ? 'default' : 'pointer',
              opacity: currentIndex === 0 ? 0.4 : 1
            }}
          >
            ← Back
          </button>
          <button
            onClick={goNext}
            style={{
              flex: 1, padding: '12px 18px', borderRadius: '10px', border: 'none',
              background: isLast ? '#10b981' : '#3b82f6', color: '#fff',
              fontSize: '14px', fontWeight: '700', cursor: 'pointer'
            }}
          >
            {isLast ? `✓ Finish — review ${decidedCount} question${decidedCount === 1 ? '' : 's'}` : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DualQuestionComparePopup
