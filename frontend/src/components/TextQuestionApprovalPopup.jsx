import React, { useState, useEffect, useRef } from 'react'
import QuestionEditor from './QuestionEditor'

function TextQuestionApprovalPopup({
  questions,
  onApprove,
  onReject,
  onClose,
  onNext,
  isLast
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [pendingQuestions, setPendingQuestions] = useState(questions || [])
  const [timeLeft, setTimeLeft] = useState(30)
  const [isTimerActive, setIsTimerActive] = useState(false)
  const [launchedQuestionIndex, setLaunchedQuestionIndex] = useState(-1)
  const [isEditing, setIsEditing] = useState(false)
  const timerRef = useRef(null)
  const defaultTimeToAnswer = 30

  useEffect(() => {
    setPendingQuestions(questions || [])
    setCurrentIndex(0)
  }, [questions])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  // Leave edit mode whenever we move to a different question.
  useEffect(() => { setIsEditing(false) }, [currentIndex])

  // Persist an edited question back into local state so Approve/Launch sends the edited version.
  const updateCurrent = (updated) =>
    setPendingQuestions(prev => prev.map((q, i) => (i === currentIndex ? updated : q)))

  const currentQuestion = pendingQuestions[currentIndex]

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
          
          // Auto-advance when timer hits 0
          if (questionIndex < pendingQuestions.length - 1) {
            setTimeout(() => moveToNext(), 300)
          } else {
            setTimeout(() => {
              if (onNext) onNext()
              else onClose()
            }, 300)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsTimerActive(false)
    setLaunchedQuestionIndex(-1)
  }

  const moveToNext = () => {
    if (currentIndex < pendingQuestions.length - 1) {
      setCurrentIndex(prev => prev + 1)
    }
  }

  const handleApprove = () => {
    const question = pendingQuestions[currentIndex]
    stopTimer()
    onApprove(question)
    
    if (currentIndex < pendingQuestions.length - 1) {
      setTimeout(() => moveToNext(), 300)
    } else {
      setTimeout(() => {
        if (onNext) onNext()
        else onClose()
      }, 300)
    }
  }

  const handleReject = () => {
    stopTimer()
    onReject(pendingQuestions[currentIndex])
    
    if (currentIndex < pendingQuestions.length - 1) {
      setTimeout(() => moveToNext(), 300)
    } else {
      setTimeout(() => {
        if (onNext) onNext()
        else onClose()
      }, 300)
    }
  }

  const handleNext = () => {
    stopTimer()
    if (currentIndex < pendingQuestions.length - 1) {
      moveToNext()
    } else {
      if (onNext) onNext()
      else onClose()
    }
  }

  const launchQuestion = () => {
    if (!currentQuestion) return
    startTimer(currentIndex)
    onApprove({ ...currentQuestion, autoLaunch: true })
  }

  if (!currentQuestion) {
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
          padding: '32px',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <p style={{ color: 'var(--text-primary)', margin: 0 }}>
            No questions to review.
          </p>
          <button
            onClick={onClose}
            style={{
              marginTop: '16px',
              padding: '10px 24px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const isLastQuestion = currentIndex === pendingQuestions.length - 1
  const isQuestionLaunched = launchedQuestionIndex === currentIndex
  const isTimerVisible = isTimerActive && isQuestionLaunched

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
        width: '90%',
        maxWidth: '560px',
        maxHeight: '85vh',
        overflow: 'auto',
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
        border: '1px solid var(--border-color)'
      }}>
        {/* Header with progress and timer */}
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
                Generated Questions Review
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                From pasted text • Review before sending to students
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Timer in header - right side */}
            {isTimerVisible && (
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
            {!isQuestionLaunched && (
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
            <span style={{
              padding: '6px 12px',
              background: 'rgba(59, 130, 246, 0.1)',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '600',
              color: '#3b82f6'
            }}>
              {currentIndex + 1} / {pendingQuestions.length}
            </span>
          </div>
        </div>

        {/* Question Card — editable when the teacher taps Edit, read-only otherwise */}
        {isEditing ? (
          <QuestionEditor question={currentQuestion} onChange={updateCurrent} />
        ) : (
        <div style={{
          background: 'var(--bg-primary)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '20px',
          border: '1px solid var(--border-color)'
        }}>
          {/* Type Badge and Points */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: '600',
              background: currentQuestion.type === 'MCQ' 
                ? 'rgba(59, 130, 246, 0.15)' 
                : currentQuestion.type === 'TF'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(139, 92, 246, 0.15)',
              color: currentQuestion.type === 'MCQ' 
                ? '#3b82f6' 
                : currentQuestion.type === 'TF'
                  ? '#10b981'
                  : '#8b5cf6'
            }}>
              {currentQuestion.type}
            </span>
            <span style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: '600',
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#f59e0b'
            }}>
              {currentQuestion.points || 100} pts
            </span>
            {currentQuestion.difficulty && (
              <span style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                background: 'rgba(107, 114, 128, 0.15)',
                color: '#6b7280',
                textTransform: 'capitalize'
              }}>
                {currentQuestion.difficulty}
              </span>
            )}
          </div>

          {/* Question Text */}
          <h3 style={{
            margin: '0 0 16px 0',
            fontSize: '16px',
            fontWeight: '500',
            color: 'var(--text-primary)',
            lineHeight: '1.5'
          }}>
            {currentQuestion.question}
          </h3>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {currentQuestion.options && currentQuestion.options.map((option, idx) => {
              const optionLetter = String.fromCharCode(65 + idx)
              return (
                <div 
                  key={idx}
                  style={{
                    padding: '12px 14px',
                    background: option.isCorrect 
                      ? 'rgba(16, 185, 129, 0.1)' 
                      : 'var(--bg-secondary)',
                    border: `2px solid ${option.isCorrect ? '#10b981' : 'var(--border-color)'}`,
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <span style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: option.isCorrect ? '#10b981' : 'var(--border-color)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: '700',
                    flexShrink: 0
                  }}>
                    {optionLetter}
                  </span>
                  <span style={{
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    flex: 1
                  }}>
                    {option.text}
                  </span>
                  {option.isCorrect && (
                    <span style={{
                      fontSize: '16px',
                      color: '#10b981'
                    }}>
                      ✓
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        )}

        {/* Action Buttons */}
        {isQuestionLaunched ? (
          // Timer is running - show only "Next" button (blue)
          <button
            onClick={handleNext}
            style={{
              width: '100%',
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
            {isLastQuestion ? '📋 Finish' : '⏭️ Next Question'}
          </button>
        ) : (
          // Timer not started - show Approve and Reject
          <div style={{ display: 'flex', gap: '12px' }}>
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
              onClick={launchQuestion}
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
              ▶ Launch to Class
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default TextQuestionApprovalPopup