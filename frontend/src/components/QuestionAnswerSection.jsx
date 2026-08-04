// frontend/src/components/QuestionAnswerSection.jsx
import React, { useEffect, useRef } from 'react'
import { playQuestionSound, playSubmitSound } from '../services/soundService'

const QuestionAnswerSection = ({ 
  question, 
  timeLeft, 
  selectedOptions, 
  submitted, 
  soundEnabled, 
  anonymousMode,
  onSelectOption, 
  onSubmitAnswer,
  onKeyboardShortcut
}) => {
  const timerIntervalRef = useRef(null)
  const lastKeyHandled = useRef(null)
  
  // Setup keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (submitted) return
      
      // Handle 1-4 keys for option selection (MSQ allows multiple selections)
      if (event.key >= '1' && event.key <= '4' && !lastKeyHandled.current) {
        event.preventDefault()
        const index = parseInt(event.key) - 1
        if (index < (question?.options?.length || 4)) {
          onSelectOption(index)
          lastKeyHandled.current = event.key
          setTimeout(() => lastKeyHandled.current = null, 100)
        }
      }
      // Space bar for option toggle (MSQ)
      else if (event.key === ' ' && !event.target.tagName === 'INPUT') {
        event.preventDefault()
        onKeyboardShortcut('toggle-option')
        lastKeyHandled.current = 'space'
        setTimeout(() => lastKeyHandled.current = null, 100)
      }
      // Enter key for submit
      else if (event.key === 'Enter') {
        event.preventDefault()
        onSubmitAnswer()
      }
      // 'r' key for next question (if used in keyboard shortcuts)
      else if (event.key === 'r') {
        event.preventDefault()
        onKeyboardShortcut('next-question')
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [submitted, onSelectOption, onSubmitAnswer, onKeyboardShortcut, question])
  
  // Setup timer for visual feedback
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
    }
    
    if (timeLeft > 0 && soundEnabled && question) {
      timerIntervalRef.current = setInterval(() => {
        // Timer is managed by parent component
      }, 1000)
    }
    
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }, [timeLeft, soundEnabled, question])
  
  const handleOptionClick = (index) => {
    onSelectOption(index)
  }
  
  const getOptionColor = (optionIndex) => {
    if (submitted) {
      const isSelected = selectedOptions.includes(optionIndex)
      const isCorrect = question?.options?.[optionIndex]?.isCorrect
      
      if (isSelected && isCorrect) return '#d1fae5'
      if (isSelected && !isCorrect) return '#fee2e2'
      if (!isSelected && isCorrect) return '#d1fae5'
    }
    return 'var(--bg-secondary)'
  }
  
  const getOptionBorderColor = (optionIndex) => {
    if (submitted) {
      const isSelected = selectedOptions.includes(optionIndex)
      const isCorrect = question?.options?.[optionIndex]?.isCorrect
      
      if (isSelected && isCorrect) return '#10b981'
      if (isSelected && !isCorrect) return '#dc2626'
      if (!isSelected && isCorrect) return '#10b981'
    }
    return 'var(--border-color)'
  }
  
  return (
    <div style={{ marginBottom: '32px' }}>
      {/* Keyboard shortcuts hint */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '16px',
        fontSize: '12px',
        opacity: 0.8
      }}>
        <span style={{ marginRight: '16px' }}>⌨️ Keys: <kbd style={{background:'rgba(255,255,255,0.2)',padding:'2px 6px',borderRadius:'4px',marginRight:'4px'}}>1-4</kbd> Select</span>
        <span style={{ marginRight: '16px' }}><kbd style={{background:'rgba(255,255,255,0.2)',padding:'2px 6px',borderRadius:'4px',marginRight:'4px'}}>Space</kbd> Toggle</span>
        <span><kbd style={{background:'rgba(255,255,255,0.2)',padding:'2px 6px',borderRadius:'4px',marginRight:'4px'}}>Enter</kbd> Submit</span>
      </div>

      {/* Question container with gradient background */}
      <div style={{
        background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
        borderRadius: '16px',
        padding: '32px',
        color: 'white',
        boxShadow: '0 10px 40px rgba(124, 58, 237, 0.3)'
      }}>
        {/* Timer display */}
        <TimerWidget timeLeft={timeLeft} isActive={!!question} />

        {/* Question text */}
        <h2 style={{ fontSize: '24px', fontWeight: '700', textAlign: 'center', marginBottom: '32px' }}>
          {question?.question || 'Loading question...'}
        </h2>

        {/* Options */}
        <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
          {(question?.options || []).map((option, index) => {
            const optionText = typeof option === 'string' ? option : option.text
            const isSelected = selectedOptions.includes(index)
            
            return (
              <button
                key={index}
                onClick={() => handleOptionClick(index)}
                disabled={submitted}
                style={{
                  padding: '20px 24px',
                  background: getOptionColor(index),
                  border: `2px solid ${getOptionBorderColor(index)}`,
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '18px',
                  textAlign: 'left',
                  cursor: submitted ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}
              >
                {/* MSQ toggle indicator */}
                {question?.type === 'MSQ' && (
                  <span style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: isSelected ? '#ffd700' : 'rgba(255,255,255,0.2)',
                    border: `2px solid ${isSelected ? '#ffd700' : 'rgba(255,255,255,0.4)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isSelected ? '#1f2937' : 'white',
                    fontSize: '14px'
                  }}>
                    {isSelected ? '✓' : ''}
                  </span>
                )}
                
                {/* Option letter */}
                <span style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: isSelected ? '#ffd700' : 'rgba(255,255,255,0.2)',
                  display: 'flex',
',                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700',
                  color: isSelected ? '#1f2937' : 'white',
                  fontSize: '16px'
                }}>
                  {String.fromCharCode(65 + index)}
                </span>
                
                <span>{optionText}</span>
              </button>
            )
          })}
        </div>

        {/* Submit Button */}
        {submitted ? (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '12px'
          }}>
            <p style={{ fontSize: '18px', fontWeight: '600' }}>✓ Answer Submitted</p>
            <p style={{ fontSize: '14px', opacity: 0.9, marginTop: '8px' }}>
              Waiting for next question...
            </p>
          </div>
        ) : (
          <button
            onClick={onSubmitAnswer}
            disabled={selectedOptions.length === 0}
            style={{
              width: '100%',
              padding: '16px',
              background: selectedOptions.length > 0 ? '#ffd700' : 'rgba(255,255,255,0.2)',
              color: selectedOptions.length > 0 ? '#1f2937' : 'rgba(255,255,255,0.5)',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: selectedOptions.length > 0 ? 'pointer' : 'not-allowed'
            }}
          >
            Submit Answer
          </button>\n        )}
      </div>
    </div>
  )
}

export default QuestionAnswerSection