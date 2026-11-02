import React, { useState, useEffect } from 'react'
import QuestionEditor from './QuestionEditor'
import { FileText, Check, Pencil, X, ClipboardCheck, SkipForward, Play } from 'lucide-react'
import { Ico } from './icons'
import useLiveQuestionTimer from '../hooks/useLiveQuestionTimer'
import LiveTimerChip from './LiveTimerChip'
import QuestionNavPills from './QuestionNavPills'

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

  // Persist an edited question back into local state so Approve/Launch sends the edited version.
  const updateCurrent = (updated) =>
    setPendingQuestions(prev => prev.map((q, i) => (i === currentIndex ? updated : q)))

  const currentQuestion = pendingQuestions[currentIndex]

  const finish = () => {
    if (onNext) onNext()
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

  const handleReject = () => {
    if (status[currentIndex]) return
    onReject(pendingQuestions[currentIndex])
    const st = { ...status, [currentIndex]: 'rejected' }
    setStatus(st)
    const next = nextUnhandled(currentIndex, st)
    if (next !== -1) setTimeout(() => setCurrentIndex(next), 300)
    else if (!timer.isActive) setTimeout(finish, 300) // a live question's timer still running closes the pop-up when it ends
  }

  const handleNext = () => {
    const next = nextUnhandled(currentIndex, status)
    if (next !== -1) setCurrentIndex(next)
    else finish()
  }

  const launchQuestion = () => {
    if (!currentQuestion || status[currentIndex]) return // never launch the same question twice
    setStatus(prev => ({ ...prev, [currentIndex]: 'launched' }))
    // Start (or replace) the timer when the question is launched
    timer.start(currentIndex, currentQuestion.timeToAnswer || defaultTimeToAnswer)
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
              background: 'var(--accent-solid)',
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

  const currentStatus = status[currentIndex]
  const hasNext = nextUnhandled(currentIndex, status) !== -1

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
        maxWidth: '640px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <span style={{ fontSize: '24px', display: 'inline-flex', color: 'var(--accent)' }}><FileText size={24} aria-hidden="true" /></span>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
                Generated Questions Review
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                From pasted text • Review before sending to students
                {currentStatus === 'launched' && <span style={{ color: '#10b981', fontWeight: '600' }}> · Launched</span>}
                {currentStatus === 'rejected' && <span style={{ color: '#ef4444', fontWeight: '600' }}> · Rejected</span>}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            {/* Timer in header - right side */}
            <LiveTimerChip liveIndex={timer.liveIndex} timeLeft={timer.timeLeft} isActive={timer.isActive} />
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
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {isEditing ? <><Ico as={Check} /> Done</> : <><Ico as={Pencil} /> Edit</>}
              </button>
            )}
            <span style={{
              padding: '6px 12px',
              background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '600',
              color: 'var(--accent)',
              whiteSpace: 'nowrap'
            }}>
              {currentIndex + 1} / {pendingQuestions.length}
            </span>
          </div>
        </div>

        {/* Question Navigation Pills */}
        <QuestionNavPills
          questions={pendingQuestions}
          currentIndex={currentIndex}
          status={status}
          onSelect={setCurrentIndex}
        />

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
                ? 'color-mix(in srgb, var(--accent) 15%, transparent)' 
                : currentQuestion.type === 'TF'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(139, 92, 246, 0.15)',
              color: currentQuestion.type === 'MCQ' 
                ? 'var(--accent)' 
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
                      <Ico as={Check} aria-label="Correct" />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        )}

        {/* Action Buttons */}
        {currentStatus ? (
          // Already launched or rejected - show only "Next" button (blue)
          <button
            onClick={handleNext}
            style={{
              width: '100%',
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
            {hasNext ? <><Ico as={SkipForward} /> Next Question</> : <><Ico as={ClipboardCheck} /> Finish</>}
          </button>
        ) : (
          // Not decided yet - show Approve and Reject
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
              <Ico as={X} /> Reject
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
              <Ico as={Play} /> Launch to Class
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default TextQuestionApprovalPopup