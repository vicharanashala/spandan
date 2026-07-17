import React, { useState, useEffect, useRef } from 'react'
import QuestionEditor from './QuestionEditor'

function QuestionApprovalPopup({ questions, onApprove, onReject, onClose, onComplete }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [pendingQuestions, setPendingQuestions] = useState(questions || [])
  const [timeToAnswer, setTimeToAnswer] = useState(30)
  const [timeLeft, setTimeLeft] = useState(30)
  const [isTimerActive, setIsTimerActive] = useState(false)
  const [launchedQuestionIndex, setLaunchedQuestionIndex] = useState(-1) // which question is currently launched
  const [isEditing, setIsEditing] = useState(false)
  const timerRef = useRef(null)
  const defaultTimeToAnswer = 30

  useEffect(() => {
    setPendingQuestions(questions || [])
    setCurrentIndex(0)
  }, [questions])

  // Leave edit mode whenever we move to a different question.
  useEffect(() => { setIsEditing(false) }, [currentIndex])

  // Persist an edited question back into local state so Approve & Launch sends the edited version.
  const updateCurrent = (updated) =>
    setPendingQuestions(prev => prev.map((q, i) => (i === currentIndex ? updated : q)))

  // Start the countdown timer for a launched question
  const startTimer = (questionIndex) => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    
    const tta = pendingQuestions[questionIndex]?.timeToAnswer || defaultTimeToAnswer
    setTimeLeft(tta)
    setIsTimerActive(true)
    setLaunchedQuestionIndex(questionIndex)
    
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          timerRef.current = null
          setIsTimerActive(false)
          // Auto-advance to next question when timer hits 0
          if (questionIndex < pendingQuestions.length - 1) {
            setTimeout(() => moveToNext(), 300)
          } else {
            // Last question - call onComplete
            setTimeout(() => {
              if (onComplete) onComplete()
              else onClose()
            }, 300)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  // Stop the current timer
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsTimerActive(false)
    setLaunchedQuestionIndex(-1)
  }

  const handleApprove = () => {
    const current = pendingQuestions[currentIndex]
    onApprove(current)
    // Start timer when question is launched
    startTimer(currentIndex)
  }

  const handleReject = () => {
    stopTimer() // Stop timer when rejecting
    const current = pendingQuestions[currentIndex]
    onReject(current)
    moveToNext()
  }

  const moveToNext = () => {
    stopTimer() // Stop timer when moving to next
    if (currentIndex < pendingQuestions.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      // All questions processed - call onComplete instead of just onClose
      if (onComplete) {
        onComplete()
      } else {
        onClose()
      }
    }
  }

  // Skip to a question (from navigation pills) - stops current timer
  const skipToQuestion = (index) => {
    stopTimer()
    setCurrentIndex(index)
  }

  if (pendingQuestions.length === 0) {
    return null
  }

  const currentQuestion = pendingQuestions[currentIndex]

  const getTypeLabel = (type) => {
    switch (type) {
      case 'MCQ': return 'Multiple Choice (Single Answer)'
      case 'TF': return 'True / False'
      case 'MSQ': return 'Multiple Select'
      default: return type
    }
  }

  const getTypeColor = (type) => {
    switch (type) {
      case 'MCQ': return '#3b82f6'
      case 'TF': return '#10b981'
      case 'MSQ': return '#8b5cf6'
      default: return '#6b7280'
    }
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
        width: '600px',
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
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)' }}>
                📝 Question Approval
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Question {currentIndex + 1} of {pendingQuestions.length}
              </p>
            </div>
            {isTimerActive && launchedQuestionIndex === currentIndex && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '20px',
                background: timeLeft <= 5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                border: `2px solid ${timeLeft <= 5 ? '#ef4444' : '#10b981'}`
              }}>
                <span style={{ 
                  fontSize: '18px', 
                  color: timeLeft <= 5 ? '#ef4444' : '#10b981', 
                  fontWeight: '700',
                  animation: timeLeft <= 5 ? 'pulse 0.5s infinite' : 'none'
                }}>
                  ⏱️ {timeLeft}s
                </span>
                {timeLeft <= 5 && (
                  <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600' }}>
                    LEFT!
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!(isTimerActive && launchedQuestionIndex === currentIndex) && (
              <button
                onClick={() => setIsEditing(e => !e)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  border: `1px solid ${isEditing ? '#10b981' : 'var(--border-color)'}`,
                  background: isEditing ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                  color: isEditing ? '#10b981' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {isEditing ? '✓ Done' : '✏️ Edit'}
              </button>
            )}
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
        </div>

        {/* Question Navigation Pills */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {pendingQuestions.map((q, index) => (
            <button
              key={q.id || index}
              onClick={() => skipToQuestion(index)}
              style={{
                padding: '4px 12px',
                borderRadius: '20px',
                border: index === currentIndex 
                  ? '2px solid #3b82f6' 
                  : '1px solid var(--border-color)',
                background: index === currentIndex ? '#dbeafe' : 'transparent',
                color: index === currentIndex ? '#1e40af' : 'var(--text-secondary)',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Q{index + 1} ({q.type})
            </button>
          ))}
        </div>

        {/* Current Question Card — editable when the teacher taps Edit, read-only otherwise */}
        {isEditing ? (
          <QuestionEditor question={currentQuestion} onChange={updateCurrent} />
        ) : (
        <div style={{
          background: 'var(--bg-primary)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '20px',
          border: '1px solid var(--border-color)'
        }}>
          {/* Question Type Badge */}
          <div style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '20px',
            background: getTypeColor(currentQuestion.type) + '20',
            color: getTypeColor(currentQuestion.type),
            fontSize: '12px',
            fontWeight: '600',
            marginBottom: '12px'
          }}>
            {getTypeLabel(currentQuestion.type)}
          </div>

          {/* Question Text */}
          <h3 style={{ 
            margin: '0 0 20px', 
            fontSize: '18px', 
            fontWeight: '500', 
            color: 'var(--text-primary)',
            lineHeight: '1.5'
          }}>
            {currentQuestion.question}
          </h3>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {currentQuestion.options?.map((option, optIndex) => (
              <div
                key={optIndex}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: option.isCorrect ? '#d1fae5' : 'var(--bg-card)',
                  border: option.isCorrect ? '2px solid #10b981' : '1px solid var(--border-color)',
                  color: 'var(--text-primary)'
                }}
              >
                <span style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: option.isCorrect ? '#10b981' : 'var(--nav-hover)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  {String.fromCharCode(65 + optIndex)}
                </span>
                <span style={{ flex: 1, fontSize: '14px' }}>{option.text}</span>
                {option.isCorrect && (
                  <span style={{ 
                    padding: '2px 8px', 
                    borderRadius: '4px', 
                    background: '#10b981', 
                    color: 'white', 
                    fontSize: '10px', 
                    fontWeight: '600'
                  }}>
                    CORRECT
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Explanation */}
          {currentQuestion.explanation && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              borderRadius: '8px',
              background: '#fef3c7',
              border: '1px solid #fcd34d',
              fontSize: '13px',
              color: '#92400e'
            }}>
              <strong>Explanation:</strong> {currentQuestion.explanation}
            </div>
          )}
        </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {isTimerActive && launchedQuestionIndex === currentIndex ? (
            currentIndex < pendingQuestions.length - 1 ? (
              <button
                onClick={moveToNext}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #3b82f6, #1e40af)',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                Next Question →
              </button>
            ) : (
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '12px',
                  border: '2px solid #6b7280',
                  background: 'transparent',
                  color: '#6b7280',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                ✕ Close
              </button>
            )
          ) : (
            <>
              <button
                onClick={handleReject}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '12px',
                  border: '2px solid #ef4444',
                  background: 'transparent',
                  color: '#ef4444',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                ✕ Reject
              </button>
              <button
                onClick={handleApprove}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                ✓ Approve & Launch
              </button>
            </>
          )}
        </div>

        {/* Progress Bar */}
        <div style={{
          marginTop: '16px',
          height: '4px',
          background: 'var(--border-color)',
          borderRadius: '2px',
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            width: `${((currentIndex + 1) / pendingQuestions.length) * 100}%`,
            background: 'linear-gradient(90deg, #3b82f6, #10b981)',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>
    </div>
  )
}

export default QuestionApprovalPopup