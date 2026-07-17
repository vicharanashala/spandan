import React, { useState } from 'react'

function TextToQuestionsPopup({ isOpen, onClose, onGenerate, roomSettings, isGenerating = false }) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState('MIXED') // 'TF' or 'MIXED'

  if (!isOpen) return null

  const handleGenerate = async () => {
    if (!text.trim() || text.trim().length < 50) {
      window.alert('Please enter at least 50 characters of text to generate questions from.')
      return
    }

    // Just call onGenerate - parent handles loading state via isGenerating prop
    await onGenerate(text.trim(), mode)
  }

  const getTypeMixDisplay = () => {
    if (mode === 'TF') {
      return (
        <span style={{ color: '#10b981', fontWeight: '600' }}>
          TF: 100%
        </span>
      )
    }
    const mix = roomSettings.questionTypeMix || { MCQ: 0, TF: 100, MSQ: 0 }
    return (
      <>
        <span style={{ color: '#3b82f6', fontWeight: '600' }}>MCQ: {mix.MCQ}%</span>
        <span style={{ color: '#6b7280' }}> | </span>
        <span style={{ color: '#10b981', fontWeight: '600' }}>TF: {mix.TF}%</span>
        <span style={{ color: '#6b7280' }}> | </span>
        <span style={{ color: '#8b5cf6', fontWeight: '600' }}>MSQ: {mix.MSQ}%</span>
      </>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '20px',
        padding: '24px',
        width: '560px',
        maxHeight: '85vh',
        overflow: 'auto',
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
        border: '1px solid var(--border-color)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>📝</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
                Generate Questions from Text
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Paste content and let AI generate questions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--text-secondary)'
            }}
          >
            ✕
          </button>
        </div>

        {/* Text Input */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            fontSize: '13px',
            fontWeight: '500',
            color: 'var(--text-primary)',
            display: 'block',
            marginBottom: '8px'
          }}>
            Paste your content below:
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste lecture notes, textbook content, article text, or any educational content here... (minimum 50 characters)"
            rows={8}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: '1.5'
            }}
          />
          <p style={{
            margin: '6px 0 0',
            fontSize: '11px',
            color: text.length < 50 ? '#ef4444' : '#10b981'
          }}>
            {text.length} characters {text.length < 50 ? '(minimum 50 required)' : '✓'}
          </p>
        </div>

        {/* Question Mode Toggle */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            fontSize: '13px',
            fontWeight: '500',
            color: 'var(--text-primary)',
            display: 'block',
            marginBottom: '8px'
          }}>
            Question Mode:
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setMode('TF')}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: '10px',
                border: mode === 'TF' ? '2px solid #10b981' : '2px solid var(--border-color)',
                background: mode === 'TF' ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                color: mode === 'TF' ? '#10b981' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              ✓ True/False Only
            </button>
            <button
              onClick={() => setMode('MIXED')}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: '10px',
                border: mode === 'MIXED' ? '2px solid #3b82f6' : '2px solid var(--border-color)',
                background: mode === 'MIXED' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                color: mode === 'MIXED' ? '#3b82f6' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              📋 Mixed (MCQ + TF + MSQ)
            </button>
          </div>
        </div>

        {/* Room Settings Display */}
        <div style={{
          background: 'var(--bg-primary)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '20px',
          border: '1px solid var(--border-color)'
        }}>
          <p style={{
            margin: '0 0 12px 0',
            fontSize: '11px',
            fontWeight: '600',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Room Settings (applied)
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>⏱️</span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>TTA:</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                {roomSettings.timeToAnswer || 30}s
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>📊</span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Points:</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                {roomSettings.points || 100}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>🎯</span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Difficulty:</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                {roomSettings.difficulty || 'medium'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>📋</span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Count:</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                {roomSettings.questionsPerSegment || 2} questions
              </span>
            </div>
          </div>
          <div style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Distribution:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              {getTypeMixDisplay()}
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || text.trim().length < 50}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            border: 'none',
            background: text.trim().length >= 50 && !isGenerating
              ? 'linear-gradient(135deg, #3b82f6, #1e40af)'
              : 'var(--border-color)',
            color: text.trim().length >= 50 && !isGenerating ? 'white' : 'var(--text-secondary)',
            fontSize: '14px',
            fontWeight: '600',
            cursor: text.trim().length >= 50 && !isGenerating ? 'pointer' : 'not-allowed',
            opacity: isGenerating ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease'
          }}
        >
          {isGenerating ? (
            <>
              <span>⏳</span>
              <span>Generating Questions...</span>
            </>
          ) : (
            <>
              <span>✨</span>
              <span>Generate Questions</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default TextToQuestionsPopup