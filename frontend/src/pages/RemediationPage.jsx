import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import { API_URL } from '../config.js'

// Decode HTML entities from LLM output
const decodeHtml = (text) => {
  if (!text) return ''
  const doc = new DOMParser().parseFromString(text, 'text/html')
  return doc.documentElement.textContent
}

function RemediationPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const maxQuestions = parseInt(searchParams.get('max') ?? '2')
  const { user, token } = useAuthStore()

  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState(null)
  const [result, setResult] = useState(null) // { isCorrect, correctOption, explanation, points }
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [failedCount, setFailedCount] = useState(0)
  const [timeLeft, setTimeLeft] = useState(30)
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)

  useEffect(() => {
    fetchRemediationQuestions()
  }, [roomId])

  useEffect(() => {
    if (questions.length > 0 && !result) {
      startTimer()
    }
    return () => clearInterval(timerRef.current)
  }, [currentIndex, questions, result])

  const startTimer = () => {
    clearInterval(timerRef.current)
    const tta = questions[currentIndex]?.timeToAnswer || 30
    setTimeLeft(tta)
    startTimeRef.current = Date.now()
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          // Auto-submit with no selection if timer runs out
          if (!result) handleSubmit(null, true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const fetchRemediationQuestions = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_URL}/remediation/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ roomId, maxQuestions })
      })
      const data = await res.json()
      if (!res.ok) {
        // A non-2xx (403 not a member, 404 room not found, 500, etc.) still parses as valid JSON
        // here, so without this check it silently fell into the "no remediation" branch below and
        // redirected to results with zero indication anything went wrong — looked exactly like a
        // random glitch instead of a real, diagnosable server error.
        console.error('[remediation] /generate failed:', res.status, data?.error || data)
        setError(data?.error || `Failed to load remediation questions (${res.status})`)
        return
      }
      if (data.success && data.questions.length > 0) {
        setQuestions(data.questions)
        setFailedCount(data.failedCount || 0)
      } else {
        // No remediation needed — go straight to results
        navigate(`/student/room/${roomId}/results`)
      }
    } catch (err) {
      setError('Failed to load remediation questions')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (optionIdx, timedOut = false) => {
    if (isSubmitting || result) return
    clearInterval(timerRef.current)
    setIsSubmitting(true)

    const question = questions[currentIndex]
    const responseTime = Math.round((Date.now() - startTimeRef.current) / 1000)
    const selectedIdx = timedOut ? 0 : optionIdx

    try {
      const res = await fetch(`${API_URL}/remediation/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId,
          questionId: question._id,
          selectedOptions: [selectedIdx],
          responseTime
        })
      })
      const data = await res.json()
      setSelectedOption(selectedIdx)
      setResult(data)
    } catch (err) {
      console.error('Failed to submit remediation answer:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1)
      setSelectedOption(null)
      setResult(null)
    } else {
      navigate(`/student/room/${roomId}/results`)
    }
  }

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{
          width: '48px', height: '48px',
          border: '4px solid var(--border-color)',
          borderTopColor: '#f59e0b',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
          Preparing your personalised questions...
        </p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#ef4444' }}>{error}</p>
          <button onClick={() => navigate(`/student/room/${roomId}/results`)} style={{
            marginTop: '16px', padding: '10px 24px', background: '#3b82f6',
            color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer'
          }}>
            Go to Results
          </button>
        </div>
      </div>
    )
  }

  const question = questions[currentIndex]
  const isLast = currentIndex === questions.length - 1
  const tta = question?.timeToAnswer || 30
  const timerPct = (timeLeft / tta) * 100
  const timerColor = timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#f59e0b' : '#10b981'

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'system-ui, sans-serif'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 16px',
          background: 'rgba(245, 158, 11, 0.2)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          borderRadius: '20px',
          marginBottom: '12px'
        }}>
          <span style={{ fontSize: '16px' }}>🔁</span>
          <span style={{ color: '#fbbf24', fontSize: '13px', fontWeight: '600' }}>
            Let's revisit this — {currentIndex + 1} of {questions.length}
          </span>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', margin: 0 }}>
          Answer to continue to your results
        </p>
        {failedCount > 0 && (
          <p style={{ color: 'rgba(251, 191, 36, 0.8)', fontSize: '12px', margin: '6px 0 0 0' }}>
            {failedCount === 1
              ? "We couldn't prepare one of your follow-up questions — you'll see fewer than expected."
              : `We couldn't prepare ${failedCount} of your follow-up questions — you'll see fewer than expected.`}
          </p>
        )}
      </div>

      {/* Timer */}
      {!result && (
        <div style={{ width: '100%', maxWidth: '560px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>Time remaining</span>
            <span style={{ color: timerColor, fontWeight: '700', fontSize: '16px' }}>{timeLeft}s</span>
          </div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>
            <div style={{
              height: '100%',
              width: `${timerPct}%`,
              background: timerColor,
              borderRadius: '4px',
              transition: 'width 1s linear, background 0.3s'
            }} />
          </div>
        </div>
      )}

      {/* Question Card */}
      <div style={{
        width: '100%',
        maxWidth: '560px',
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(10px)',
        borderRadius: '20px',
        padding: '28px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '10px'
        }}>
          <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            borderRadius: '12px',
            color: '#a5b4fc',
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '0.02em',
            textTransform: 'uppercase'
          }}>
            Follow-up question
          </span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
            worth {question?.points ?? 50} pts
          </span>
        </div>

        <p style={{
          color: 'white',
          fontSize: '18px',
          fontWeight: '600',
          lineHeight: '1.5',
          marginBottom: '24px',
          margin: '0 0 24px 0'
        }}>
          {decodeHtml(question?.question)}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {question?.options?.map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx)
            const isSelected = selectedOption === idx
            const isCorrectOpt = result && result.correctOption === idx
            const isWrongSelected = result && isSelected && !result.isCorrect

            let bg = 'rgba(255,255,255,0.05)'
            let border = '1px solid rgba(255,255,255,0.1)'
            let color = 'rgba(255,255,255,0.9)'

            if (result) {
              if (isCorrectOpt) {
                bg = 'rgba(16, 185, 129, 0.2)'
                border = '2px solid #10b981'
                color = '#6ee7b7'
              } else if (isWrongSelected) {
                bg = 'rgba(239, 68, 68, 0.2)'
                border = '2px solid #ef4444'
                color = '#fca5a5'
              }
            } else if (isSelected) {
              bg = 'rgba(99, 102, 241, 0.3)'
              border = '2px solid #6366f1'
            }

            return (
              <button
                key={idx}
                onClick={() => !result && !isSubmitting && setSelectedOption(idx)}
                disabled={!!result || isSubmitting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  background: bg,
                  border,
                  borderRadius: '12px',
                  color,
                  fontSize: '15px',
                  textAlign: 'left',
                  cursor: result ? 'default' : 'pointer',
                  transition: 'all 0.15s',
                  width: '100%'
                }}
              >
                <span style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: isCorrectOpt ? '#10b981' : isWrongSelected ? '#ef4444' : 'rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: '700',
                  flexShrink: 0,
                  color: 'white'
                }}>
                  {result && isCorrectOpt ? '✓' : result && isWrongSelected ? '✗' : letter}
                </span>
                {decodeHtml(opt.text)}
              </button>
            )
          })}
        </div>

        {/* Submit / Result */}
        {!result ? (
          <button
            onClick={() => selectedOption !== null && handleSubmit(selectedOption)}
            disabled={selectedOption === null || isSubmitting}
            style={{
              marginTop: '20px',
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: selectedOption !== null ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'rgba(255,255,255,0.1)',
              color: selectedOption !== null ? 'white' : 'rgba(255,255,255,0.3)',
              fontSize: '15px',
              fontWeight: '600',
              cursor: selectedOption !== null ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s'
            }}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Answer'}
          </button>
        ) : (
          <div style={{ marginTop: '20px' }}>
            {/* Result feedback */}
            <div style={{
              padding: '14px 16px',
              borderRadius: '12px',
              background: result.isCorrect ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${result.isCorrect ? '#10b981' : '#ef4444'}`,
              marginBottom: '12px'
            }}>
              <p style={{ margin: 0, color: result.isCorrect ? '#6ee7b7' : '#fca5a5', fontWeight: '600', marginBottom: '4px' }}>
                {result.isCorrect ? '✓ Correct!' : '✗ Not quite'}
                {result.points > 0 && <span style={{ marginLeft: '8px', fontSize: '13px' }}>+{result.points} pts</span>}
              </p>
              {result.explanation && (
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: '13px', lineHeight: '1.5' }}>
                  {decodeHtml(result.explanation)}
                </p>
              )}
            </div>

            <button
              onClick={handleNext}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: 'white',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              {isLast ? '📊 See Results' : '→ Next Question'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default RemediationPage