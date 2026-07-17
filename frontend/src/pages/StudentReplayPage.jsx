import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import { API_URL } from '../config.js'

function StudentReplayPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()

  // Replay states
  const [roomName, setRoomName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [segments, setSegments] = useState([])
  const [attempt, setAttempt] = useState(null)
  
  // Current position in replay
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1) // -1 means viewing topic summary
  
  // Active question states
  const [selectedOptions, setSelectedOptions] = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [feedback, setFeedback] = useState(null) // holds result of submission
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Loading/Error states
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const timerIntervalRef = useRef(null)

  useEffect(() => {
    if (token && roomId) {
      initReplay()
    }
  }, [token, roomId])

  // Timer loop for active poll
  useEffect(() => {
    if (timeLeft > 0 && !submitted && currentQuestionIndex >= 0) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
            // Auto submit
            autoSubmitAnswer()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [timeLeft, submitted, currentQuestionIndex])

  const initReplay = async () => {
    setIsLoading(true)
    setError('')
    try {
      // 1. Fetch attempt status
      const attemptRes = await fetch(`${API_URL}/benchmark/attempt/${roomId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const attemptData = await attemptRes.json()
      
      if (attemptRes.ok && attemptData.hasAttempt) {
        setAttempt(attemptData.attempt)
        if (attemptData.attempt.isCompleted) {
          setIsLoading(false)
          return
        }
      }

      // 2. Fetch session segments
      const sessionRes = await fetch(`${API_URL}/benchmark/session/${roomId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const sessionData = await sessionRes.json()

      if (!sessionRes.ok) {
        throw new Error(sessionData.error || 'Failed to load session summary')
      }

      setRoomName(sessionData.roomName)
      setRoomCode(sessionData.roomCode)
      setSegments(sessionData.segments || [])

      // Determine where to resume or start
      const respondedIds = (attemptData.hasAttempt && attemptData.attempt.responses)
        ? new Set(attemptData.attempt.responses.map(r => r.questionId.toString()))
        : new Set()
      
      let foundResume = false
      // Loop through segments and find the first unanswered question
      for (let sIdx = 0; sIdx < sessionData.segments.length; sIdx++) {
        const seg = sessionData.segments[sIdx]
        const firstUnansweredQIdx = seg.polls.findIndex(q => !respondedIds.has(q._id.toString()))
        
        if (firstUnansweredQIdx !== -1) {
          setCurrentSegmentIndex(sIdx)
          
          // Check if timer is active for this question
          const timerState = attemptData.attempt?.timerState
          if (timerState && timerState.questionId && timerState.startTime) {
            const activeQ = seg.polls[firstUnansweredQIdx]
            if (activeQ._id.toString() === timerState.questionId.toString()) {
              const elapsed = (Date.now() - new Date(timerState.startTime).getTime()) / 1000
              const tta = activeQ.timeToAnswer || 30
              if (elapsed < tta) {
                setCurrentQuestionIndex(firstUnansweredQIdx)
                setTimeLeft(Math.max(1, Math.round(tta - elapsed)))
                foundResume = true
                break
              }
            }
          }
          
          // Otherwise, start the first unanswered question of this segment
          setCurrentQuestionIndex(firstUnansweredQIdx)
          startQuestion(firstUnansweredQIdx, seg)
          foundResume = true
          break
        }
      }

      if (!foundResume) {
        // All questions answered, but not marked complete
        completeAttempt()
      }

    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to initialize session replay.')
    } finally {
      setIsLoading(false)
    }
  }

  // Starts the quiz for the current topic segment
  const startSegmentQuiz = () => {
    setCurrentQuestionIndex(0)
    startQuestion(0)
  }

  const startQuestion = async (qIdx, segmentObj = null) => {
    const activeSegment = segmentObj || segments[currentSegmentIndex]
    const question = activeSegment?.polls?.[qIdx]
    if (!question) return

    setSelectedOptions([])
    setSubmitted(false)
    setFeedback(null)
    setTimeLeft(question.timeToAnswer || 30)

    try {
      const res = await fetch(`${API_URL}/benchmark/attempt/${roomId}/start-poll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ questionId: question._id })
      })
      const data = await res.json()
      if (res.ok && data.startTime) {
        // Adjust for network latency
        const elapsed = (Date.now() - new Date(data.startTime).getTime()) / 1000
        setTimeLeft(Math.max(1, Math.round((question.timeToAnswer || 30) - elapsed)))
      }
    } catch (err) {
      console.error('Error starting question timer:', err)
    }
  }

  const handleOptionClick = (idx, isMSQ) => {
    if (submitted) return
    if (isMSQ) {
      setSelectedOptions(prev => 
        prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
      )
    } else {
      setSelectedOptions([idx])
    }
  }

  const submitAnswer = async () => {
    if (submitted || isSubmitting || currentQuestionIndex < 0) return
    setIsSubmitting(true)

    const question = segments[currentSegmentIndex].polls[currentQuestionIndex]
    try {
      const res = await fetch(`${API_URL}/benchmark/attempt/${roomId}/submit-poll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          questionId: question._id,
          selectedOptions
        })
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback(data)
        setSubmitted(true)
      } else {
        setError(data.error || 'Failed to submit response')
      }
    } catch (err) {
      console.error('Failed to submit response:', err)
      setError('Connection error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const autoSubmitAnswer = async () => {
    if (submitted || isSubmitting) return
    setIsSubmitting(true)
    const question = segments[currentSegmentIndex].polls[currentQuestionIndex]
    try {
      const res = await fetch(`${API_URL}/benchmark/attempt/${roomId}/submit-poll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          questionId: question._id,
          selectedOptions: [] // Timeout
        })
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback(data)
        setSubmitted(true)
      }
    } catch (err) {
      console.error('Failed to auto-submit response:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const nextStep = () => {
    const currentSegment = segments[currentSegmentIndex]
    const nextQIdx = currentQuestionIndex + 1

    if (nextQIdx < currentSegment.polls.length) {
      setCurrentQuestionIndex(nextQIdx)
      startQuestion(nextQIdx)
    } else {
      // End of this segment's polls
      const nextSegIdx = currentSegmentIndex + 1
      if (nextSegIdx < segments.length) {
        // Find next segment with polls
        let foundNextSeg = false
        for (let sIdx = nextSegIdx; sIdx < segments.length; sIdx++) {
          const nextSeg = segments[sIdx]
          if (nextSeg.polls && nextSeg.polls.length > 0) {
            setCurrentSegmentIndex(sIdx)
            setCurrentQuestionIndex(0)
            setSubmitted(false)
            setFeedback(null)
            startQuestion(0, nextSeg)
            foundNextSeg = true
            break
          }
        }
        
        if (!foundNextSeg) {
          completeAttempt()
        }
      } else {
        // Complete the benchmark
        completeAttempt()
      }
    }
  }

  const completeAttempt = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_URL}/benchmark/attempt/${roomId}/complete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        // Fetch the fully completed attempt data with rank details
        const attemptRes = await fetch(`${API_URL}/benchmark/attempt/${roomId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const attemptData = await attemptRes.json()
        if (attemptRes.ok && attemptData.hasAttempt) {
          setAttempt(attemptData.attempt)
        } else {
          throw new Error('Failed to fetch completed attempt details')
        }
      } else {
        throw new Error(data.error || 'Failed to complete benchmark')
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to finalize benchmark results.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", sans-serif' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid var(--border-color)',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            <p style={{ color: 'var(--text-secondary)' }}>Loading session replay...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error && !attempt) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", sans-serif' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', padding: '32px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '32px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
            <h2 style={{ color: 'var(--text-primary)' }}>Error</h2>
            <p style={{ color: '#ef4444', marginTop: '8px' }}>{error}</p>
            <button onClick={() => navigate('/student')} style={{ marginTop: '16px', padding: '12px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- ATTEMPT COMPLETED: RESULTS VIEW ---
  if (attempt && attempt.isCompleted) {
    const outperformedPercent = Math.round(attempt.percentile || 0)
    
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", sans-serif' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', display: 'flex', flexDirection: 'column' }}>
          
          <header style={{ background: 'var(--header-bg)', color: 'white', padding: '24px 32px' }}>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Replay Results</h1>
            <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>Benchmark completed successfully</p>
          </header>

          <div style={{ flex: 1, padding: '32px' }}>
            <button onClick={() => navigate('/student')} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', marginBottom: '20px' }}>
              ← Exit Replay
            </button>

            {/* Simulated Rank Dashboard banner */}
            <div style={{
              background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
              borderRadius: '16px',
              padding: '32px',
              color: 'white',
              boxShadow: '0 10px 30px rgba(59,130,246,0.2)',
              marginBottom: '32px',
              textAlign: 'center'
            }}>
              <span style={{
                background: 'rgba(255, 255, 255, 0.2)',
                padding: '6px 12px',
                borderRadius: '50px',
                fontSize: '12px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                Benchmark Rank (Unofficial)
              </span>
              <h2 style={{ fontSize: '48px', fontWeight: '800', margin: '16px 0 8px 0' }}>
                #{attempt.simulatedRank}
              </h2>
              <p style={{ fontSize: '16px', opacity: 0.95 }}>
                You outperformed <strong>{outperformedPercent}%</strong> of the {attempt.totalLiveParticipants || 0} live participants!
              </p>
            </div>

            {/* Metrics cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎯</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  {Math.round(attempt.accuracy)}%
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Accuracy Score (Primary)</div>
              </div>
              <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚡</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  {attempt.averageResponseTime ? attempt.averageResponseTime.toFixed(1) : '0.0'}s
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Avg Speed / Response Time (Secondary)</div>
              </div>
            </div>

            {/* Responses Review */}
            <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600' }}>
                Question Breakdown
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {attempt.responses?.map((resp, rIdx) => {
                  const isCorrect = resp.isCorrect
                  return (
                    <div key={rIdx} style={{
                      padding: '16px',
                      background: 'var(--bg-primary)',
                      borderRadius: '12px',
                      border: `1px solid ${isCorrect ? '#10b981' : '#ef4444'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          padding: '2px 8px',
                          background: isCorrect ? '#d1fae5' : '#fee2e2',
                          color: isCorrect ? '#059669' : '#dc2626',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          {isCorrect ? 'Correct' : 'Incorrect'}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          Speed: {resp.responseTime?.toFixed(1) || '0.0'}s • Points: {resp.points || 0}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontWeight: '600', color: 'var(--text-primary)' }}>
                        Question {rIdx + 1}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        </div>
      </div>
    )
  }

  // --- REPLAY PLAYBACK: TIMED POLL VIEW ---
  const currentSegment = segments[currentSegmentIndex]
  const currentQuestion = currentSegment?.polls?.[currentQuestionIndex]
  const isMSQ = currentQuestion?.type === 'MSQ'

  if (!currentQuestion) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", sans-serif' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No questions available.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", sans-serif' }}>
      <Sidebar user={user} />
      <div style={{ flex: 1, marginLeft: '240px', display: 'flex', flexDirection: 'column' }}>
        
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '24px 32px' }}>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Room Replay: {roomName}</h1>
          <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
            Topic {currentSegmentIndex + 1} • Question {currentQuestionIndex + 1} of {currentSegment.polls.length}
          </p>
        </header>

        <div style={{ flex: 1, padding: '32px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{
            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            borderRadius: '16px',
            padding: '32px',
            color: 'white',
            boxShadow: '0 10px 40px rgba(124, 58, 237, 0.3)',
            maxWidth: '650px',
            width: '100%'
          }}>
            
            {/* Timer */}
            {!submitted && (
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  border: '3px solid rgba(255,255,255,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px'
                }}>
                  <span style={{ fontSize: '28px', fontWeight: '700' }}>{timeLeft}</span>
                </div>
                <p style={{ fontSize: '13px', opacity: 0.9 }}>seconds remaining</p>
              </div>
            )}

            {/* Question Text */}
            <h2 style={{ fontSize: '20px', fontWeight: '700', textAlign: 'center', marginBottom: '28px', lineHeight: '1.4' }}>
              {currentQuestion.question}
            </h2>

            {/* Options */}
            <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
              {currentQuestion.options.map((option, index) => {
                const isSelected = selectedOptions.includes(index)
                const letter = String.fromCharCode(65 + index)
                
                // Styling based on state (submitted vs active)
                let btnBg = 'rgba(255, 255, 255, 0.1)'
                let btnBorder = '2px solid rgba(255, 255, 255, 0.2)'
                
                if (submitted) {
                  const isCorrectAnswer = feedback?.correctOptions?.includes(index)
                  if (isCorrectAnswer) {
                    btnBg = 'rgba(16, 185, 129, 0.2)'
                    btnBorder = '2px solid #10b981'
                  } else if (isSelected) {
                    btnBg = 'rgba(239, 68, 68, 0.2)'
                    btnBorder = '2px solid #ef4444'
                  }
                } else if (isSelected) {
                  btnBg = 'rgba(255, 255, 255, 0.3)'
                  btnBorder = '2px solid #ffd700'
                }

                return (
                  <button
                    key={index}
                    onClick={() => handleOptionClick(index, isMSQ)}
                    disabled={submitted}
                    style={{
                      padding: '16px 20px',
                      background: btnBg,
                      border: btnBorder,
                      borderRadius: '12px',
                      color: 'white',
                      fontSize: '16px',
                      textAlign: 'left',
                      cursor: submitted ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    <span style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '50%',
                      background: isSelected ? '#ffd700' : 'rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '700',
                      color: isSelected ? '#1f2937' : 'white',
                      fontSize: '14px'
                    }}>
                      {letter}
                    </span>
                    <span>{option.text}</span>
                  </button>
                )
              })}
            </div>

            {/* Footer buttons (Submit or Proceed) */}
            {submitted ? (
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'center'
              }}>
                <p style={{ fontSize: '16px', fontWeight: '600' }}>
                  {feedback?.isCorrect ? '✓ Correct Answer!' : '✗ Incorrect Answer'}
                </p>
                {feedback?.explanation && (
                  <p style={{ fontSize: '13px', opacity: 0.9, marginTop: '8px', fontStyle: 'italic' }}>
                    {feedback.explanation}
                  </p>
                )}
                <button
                  onClick={nextStep}
                  style={{
                    marginTop: '16px',
                    width: '100%',
                    padding: '12px',
                    background: '#ffd700',
                    color: '#1f2937',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Continue →
                </button>
              </div>
            ) : (
              <button
                onClick={submitAnswer}
                disabled={selectedOptions.length === 0 || isSubmitting}
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
                {isSubmitting ? 'Submitting...' : 'Submit Answer'}
              </button>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

export default StudentReplayPage
