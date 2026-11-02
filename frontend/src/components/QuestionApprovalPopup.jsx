import React, { useState, useEffect } from 'react'
import QuestionEditor from './QuestionEditor'
import { FileText, Check, Pencil, X } from 'lucide-react'
import { Ico } from './icons'
import useLiveQuestionTimer from '../hooks/useLiveQuestionTimer'
import LiveTimerChip from './LiveTimerChip'
import QuestionNavPills from './QuestionNavPills'

function QuestionApprovalPopup({ questions, onApprove, onReject, onClose, onComplete }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [pendingQuestions, setPendingQuestions] = useState(questions || [])
  const [status, setStatus] = useState({}) // index -> 'launched' | 'rejected'
  const [isEditing, setIsEditing] = useState(false)
  const defaultTimeToAnswer = 30

  useEffect(() => {
    setPendingQuestions(questions || [])
    setCurrentIndex(0)
    setStatus({})
  }, [questions])

  // Leave edit mode whenever we move to a different question.
  useEffect(() => { setIsEditing(false) }, [currentIndex])

  // Persist an edited question back into local state so Approve & Launch sends the edited version.
  const updateCurrent = (updated) =>
    setPendingQuestions(prev => prev.map((q, i) => (i === currentIndex ? updated : q)))

  // All questions reviewed - call onComplete instead of just onClose
  const finish = () => {
    if (onComplete) onComplete()
    else onClose()
  }

  // The next question still waiting for a decision after `from` (wrapping round), or -1 if none.
  const nextUnhandled = (from, st) => {
    for (let step = 1; step <= pendingQuestions.length; step++) {
      const i = (from + step) % pendingQuestions.length
      if (!st[i]) return i
    }
    return -1
  }

  // When the live question's time runs out: close if nothing is left to review; otherwise move on
  // only if the teacher is looking at that question, so a question they are reading is not snatched away.
  const timer = useLiveQuestionTimer((index) => {
    const next = nextUnhandled(index, status)
    if (next === -1) setTimeout(finish, 300)
    else if (currentIndex === index) setTimeout(() => setCurrentIndex(next), 300)
  })

  const handleApprove = () => {
    if (status[currentIndex]) return // already launched or rejected - never launch twice
    const current = pendingQuestions[currentIndex]
    onApprove(current)
    setStatus(prev => ({ ...prev, [currentIndex]: 'launched' }))
    // Start (or replace) the timer when the question is launched
    timer.start(currentIndex, current?.timeToAnswer || defaultTimeToAnswer)
  }

  const handleReject = () => {
    if (status[currentIndex]) return
    onReject(pendingQuestions[currentIndex])
    const st = { ...status, [currentIndex]: 'rejected' }
    setStatus(st)
    const next = nextUnhandled(currentIndex, st)
    if (next !== -1) setCurrentIndex(next)
    else if (!timer.isActive) finish() // a live question's timer still running closes the pop-up when it ends
  }

  const moveToNext = () => {
    const next = nextUnhandled(currentIndex, status)
    if (next !== -1) setCurrentIndex(next)
  }

  if (pendingQuestions.length === 0) {
    return null
  }

  const currentQuestion = pendingQuestions[currentIndex]
  const currentStatus = status[currentIndex]
  const hasNext = nextUnhandled(currentIndex, status) !== -1

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
      case 'MCQ': return 'var(--accent)'
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
        width: '680px',
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
                <Ico as={FileText} style={{ color: 'var(--accent)' }} /> Question Approval
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Question {currentIndex + 1} of {pendingQuestions.length}
                {currentStatus === 'launched' && <span style={{ color: '#10b981', fontWeight: '600' }}> · Launched</span>}
                {currentStatus === 'rejected' && <span style={{ color: '#ef4444', fontWeight: '600' }}> · Rejected</span>}
              </p>
            </div>
            <LiveTimerChip liveIndex={timer.liveIndex} timeLeft={timer.timeLeft} isActive={timer.isActive} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!currentStatus && (
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
                {isEditing ? <><Ico as={Check} /> Done</> : <><Ico as={Pencil} /> Edit</>}
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
              aria-label="Close"
            >
              <Ico as={X} />
            </button>
          </div>
        </div>

        {/* Question Navigation Pills */}
        <QuestionNavPills
          questions={pendingQuestions}
          currentIndex={currentIndex}
          status={status}
          onSelect={setCurrentIndex}
        />

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
            background: `color-mix(in srgb, ${getTypeColor(currentQuestion.type)} 13%, transparent)`,
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
          {currentStatus ? (
            hasNext ? (
              <button
                onClick={moveToNext}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'var(--accent-gradient)',
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
                <Ico as={X} /> Close
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
                <Ico as={X} /> Reject
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
                <Ico as={Check} /> Approve & Launch
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
            background: 'linear-gradient(90deg, var(--accent), #10b981)',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>
    </div>
  )
}

export default QuestionApprovalPopup