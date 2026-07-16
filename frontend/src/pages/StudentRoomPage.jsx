import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import Leaderboard from '../components/Leaderboard'
import { API_URL } from '../config.js'

function StudentRoomPage() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const { user, token, logout } = useAuthStore()
  const { socket, isConnected, joinRoom, leaveRoom } = useSocketStore()
  const { joinRoomByCode, setAuthToken } = useRoomStore()
  
  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [selectedOptions, setSelectedOptions] = useState([]) // Array for MSQ support
  const [submitted, setSubmitted] = useState(false)
  const [hasAnsweredPoll, setHasAnsweredPoll] = useState(false) // Track if student has answered at least one poll
  const [myRank, setMyRank] = useState(null) // this student's latest rank, returned by the submit POST
  const [timeLeft, setTimeLeft] = useState(0)
  const [results, setResults] = useState(null)
  // Past responses loaded from MongoDB - no sessionStorage needed
  const [pastResponses, setPastResponses] = useState([])
  const timerIntervalRef = useRef(null)

  // Confused button state
  const [isConfused, setIsConfused] = useState(false)
  const [confusedCount, setConfusedCount] = useState(0)

  // Instant feedback state
  const [feedback, setFeedback] = useState(null)

  // Emoji reactions state
  const [floatingReactions, setFloatingReactions] = useState([])
  const reactionIdRef = useRef(0)

  // Badge notification state
  const [newBadges, setNewBadges] = useState([])
  const [earnedBadges, setEarnedBadges] = useState([])

  useEffect(() => {
    if (!token || !socket) return
    setAuthToken(token)
    joinSession()
    return () => {
      if (room?.code) {
        leaveRoom(room.code, user._id)
      }
    }
  }, [token, socket])



  useEffect(() => {
    if (!socket) return

    const handleQuestionStarted = (data) => {
      setCurrentQuestion(data)
      setSelectedOptions([])
      setSubmitted(false)
      setFeedback(null)
      setIsConfused(false)
      setTimeLeft(data.timer || 30)
      
      if (data.question && data.question.timeToAnswer) {
        setTimeLeft(data.question.timeToAnswer)
      }
      
      // Clear any existing timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
            // Time expired - refresh from MongoDB only if room/user available
            if (room?._id && user?._id) {
              fetchPastResponses(room._id, user._id)
            }
            setCurrentQuestion(null)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    const handleQuestionEnded = (data) => {
      // Clear timer if running
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      
      // Only fetch if room and user are available
      if (room?._id && user?._id) {
        fetchPastResponses(room._id, user._id)
      }
      setResults(data?.results || null)
      setCurrentQuestion(null)
    }

    const handleNewQuestion = (question) => {
      // Handle manually created questions from teacher
      // Clear any existing timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      
      setCurrentQuestion(question)
      setSelectedOptions([])
      setSubmitted(false)
      setFeedback(null)
      setIsConfused(false)
      setTimeLeft(question.timeToAnswer || 30)
      
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
            // Time expired - refresh from MongoDB only if room/user available
            if (room?._id && user?._id) {
              fetchPastResponses(room._id, user._id)
            }
            setCurrentQuestion(null)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    // Self-heal after a socket reconnect: the store re-joins the room automatically, but a
    // question pushed WHILE we were briefly disconnected would have been missed. Re-pull the
    // room's questions so any missed one surfaces without the student manually refreshing.
    const handleReconnect = () => {
      if (room?._id && user?._id) {
        fetchPastResponses(room._id, user._id)
      }
    }

    socket.on('question:started', handleQuestionStarted)
    socket.on('question:ended', handleQuestionEnded)
    socket.on('new_question', handleNewQuestion)
    socket.on('connect', handleReconnect)
    socket.on('room:ended', () => {
      navigate(`/student/room/${room?._id}/results`)
    })

    // Confusion meter updates
    socket.on('confusion:updated', (data) => {
      setConfusedCount(data.confusedCount || 0)
    })

    // Live emoji reactions
    socket.on('reaction:new', (data) => {
      const id = ++reactionIdRef.current
      const reaction = { id, emoji: data.emoji, x: Math.random() * 80 + 10 }
      setFloatingReactions(prev => [...prev, reaction])
      setTimeout(() => {
        setFloatingReactions(prev => prev.filter(r => r.id !== id))
      }, 3000)
    })

    return () => {
      socket.off('question:started', handleQuestionStarted)
      socket.off('question:ended', handleQuestionEnded)
      socket.off('new_question', handleNewQuestion)
      socket.off('connect', handleReconnect)
      socket.off('room:ended')
      socket.off('confusion:updated')
      socket.off('reaction:new')
    }
  }, [socket, navigate, room?._id])

  const joinSession = async () => {
    setIsLoading(true)
    try {
      const roomData = await joinRoomByCode(roomCode)
      setRoom(roomData)
      if (user?._id && socket) {
        // Join via socket - room:joined confirms the student was added to RoomMember
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.off('room:joined', handleRoomJoined)
            // Still fetch even if timeout - RoomMember should already exist from HTTP join
            fetchPastResponses(roomData._id, user._id)
            resolve()
          }, 3000)

          const handleRoomJoined = (data) => {
            if (data.roomCode === roomData.code) {
              clearTimeout(timeout)
              socket.off('room:joined', handleRoomJoined)
              fetchPastResponses(roomData._id, user._id)
              fetchEarnedBadges()
              resolve()
            }
          }
          socket.on('room:joined', handleRoomJoined)
          joinRoom(roomData.code, user._id)
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }
  
  const fetchPastResponses = async (roomId, studentId) => {
    // Defensive: don't call if room or user not ready
    if (!roomId || !studentId) {
      console.warn('fetchPastResponses skipped: missing roomId or studentId', { roomId, studentId })
      return
    }
    try {
      console.log('[StudentRoom] Fetching past responses for room:', roomId, 'student:', studentId)
      const response = await fetch(`${API_URL}/responses/room/${roomId}/student/${studentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (!response.ok) {
        console.error('Failed to fetch responses:', response.status)
        return
      }
      const data = await response.json()
      if (data.success && data.questions) {
        setPastResponses(data.questions)
        // If student has already answered polls, disable leave button
        if (data.questions.some(q => q.answered)) {
          setHasAnsweredPoll(true)
        }
      }
    } catch (err) {
      console.error('Failed to fetch past responses:', err)
    }
  }

  const fetchEarnedBadges = async () => {
    if (!user?._id) return
    try {
      const res = await fetch(`${API_URL}/responses/badges/${user._id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success && data.badges) {
        setEarnedBadges(data.badges)
      }
    } catch (err) {
      console.error('Failed to fetch badges:', err)
    }
  }

  const handleSubmitAnswer = async () => {
    if (selectedOptions.length === 0 || submitted || !currentQuestion) return

    const questionId = currentQuestion._id || currentQuestion.question?._id
    const tta = currentQuestion.timeToAnswer || 30
    const responseTime = tta - timeLeft
    
    console.log('[StudentRoom] Submitting answer:', { 
      questionId, 
      roomId: room._id, 
      studentId: user._id, 
      selectedOptions,
      timeToAnswer: tta,
      timeLeft,
      responseTime
    })

    // Save to MongoDB - wait for it to complete before fetching past responses
    try {
      const saveResponse = await fetch(`${API_URL}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: room._id,
          questionId,
          studentId: user._id,
          selectedOptions,
          responseTime
        })
      })
      const saveData = await saveResponse.json()
      console.log('[StudentRoom] Response saved:', saveData)

      // Phase 1: the server now emits the throttled leaderboard/answer-count updates itself
      // (from this authenticated POST) — the client no longer emits points:update /
      // response:submit. The POST returns this student's current rank; surface it so the
      // leaderboard's "you" pill updates even when outside the broadcast top-N.
      if (saveData.success && saveData.rank != null) {
        setMyRank(saveData.rank)
      }

      // Instant feedback
      if (saveData.feedback) {
        setFeedback(saveData.feedback)
      }

      // Check for new badges from response header
      const badgeHeader = saveResponse.headers.get('X-New-Badges')
      if (badgeHeader) {
        try {
          const badges = JSON.parse(badgeHeader)
          if (badges.length > 0) {
            setNewBadges(badges)
            setTimeout(() => setNewBadges([]), 5000)
          }
        } catch {}
      }
    } catch (err) {
      console.error('Failed to save response:', err)
    }

    // Set submitted immediately and fetch past responses without delay
    setSubmitted(true)
    setHasAnsweredPoll(true) // Prevent accidental leave after answering
    if (room?._id && user?._id) {
      fetchPastResponses(room._id, user._id)
      fetchEarnedBadges()
    }
  }

  const leaveSession = () => {
    if (room?.code) {
      leaveRoom(room.code, user._id)
    }
    navigate('/student')
  }

  const toggleConfused = () => {
    if (!room?.code || !socket) return
    if (isConfused) {
      socket.emit('student:unconfused', { roomCode: room.code })
      setIsConfused(false)
    } else {
      socket.emit('student:confused', { roomCode: room.code })
      setIsConfused(true)
    }
  }

  const sendReaction = (emoji) => {
    if (!room?.code || !socket) return
    socket.emit('reaction:send', { roomCode: room.code, emoji })
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
      }}>
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
            <p style={{ color: 'var(--text-secondary)' }}>Joining classroom session...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
      }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', padding: '32px' }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            padding: '32px',
            border: '1px solid var(--border-color)',
            textAlign: 'center'
          }}>
            <h2 style={{ color: 'var(--text-primary)' }}>{error || 'Failed to join session'}</h2>
            <button
              onClick={() => navigate('/student')}
              style={{
                marginTop: '16px',
                padding: '12px 24px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      width: '100vw',
      maxWidth: '100vw',
      overflowX: 'hidden',
      position: 'relative'
    }}>
      {/* Floating Emoji Reactions */}
      {floatingReactions.map(r => (
        <div key={r.id} style={{
          position: 'fixed',
          bottom: '100px',
          left: `${r.x}%`,
          fontSize: '32px',
          animation: 'floatUp 3s ease-out forwards',
          pointerEvents: 'none',
          zIndex: 9999
        }}>
          {r.emoji}
        </div>
      ))}

      {/* Badge Notification Toast */}
      {newBadges.length > 0 && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {newBadges.map((badge, i) => (
            <div key={i} style={{
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              color: '#1f2937',
              padding: '12px 20px',
              borderRadius: '12px',
              boxShadow: '0 8px 30px rgba(245, 158, 11, 0.4)',
              animation: 'slideIn 0.5s ease-out',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontWeight: '600',
              fontSize: '14px'
            }}>
              <span style={{ fontSize: '24px' }}>🏆</span>
              <div>
                <div style={{ fontWeight: '700' }}>{badge.name}</div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>{badge.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Sidebar user={user} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px', minWidth: 0, maxWidth: 'calc(100vw - 240px)', overflowX: 'hidden' }}>
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: '24px 32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Room: {room.name}</h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>Code: {room.code}</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, padding: '32px', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
          {/* Connection Status */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            padding: '16px 24px',
            boxShadow: 'var(--card-shadow)',
            border: '1px solid var(--border-color)',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: isConnected ? '#10b981' : '#ef4444'
              }} />
              <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500' }}>
                {isConnected ? 'Connected' : 'Reconnecting...'}
              </span>
            </div>
            <button
              onClick={leaveSession}
              disabled={hasAnsweredPoll}
              title={hasAnsweredPoll ? 'You cannot leave after answering a question' : 'Leave the session'}
              style={{
                padding: '8px 16px',
                background: hasAnsweredPoll ? 'var(--border-color)' : '#ef4444',
                color: hasAnsweredPoll ? 'var(--text-secondary)' : 'white',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: hasAnsweredPoll ? 'not-allowed' : 'pointer',
                opacity: hasAnsweredPoll ? 0.6 : 1
              }}
            >
              Leave
            </button>
          </div>

          {/* Live Question */}
          {currentQuestion ? (
            <div style={{
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              borderRadius: '16px',
              padding: '32px',
              color: 'white',
              boxShadow: '0 10px 40px rgba(124, 58, 237, 0.3)'
            }}>
              {/* Timer */}
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{
                  width: '100px',
                  height: '100px',
                  borderRadius: '50%',
                  border: '4px solid rgba(255,255,255,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px'
                }}>
                  <span style={{ fontSize: '36px', fontWeight: '700' }}>{timeLeft}</span>
                </div>
                <p style={{ fontSize: '14px', opacity: 0.9 }}>seconds remaining</p>
              </div>

              {/* Question */}
              <h2 style={{ fontSize: '24px', fontWeight: '700', textAlign: 'center', marginBottom: '32px' }}>
                {currentQuestion.question}
              </h2>

              {/* Options */}
              <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
                {currentQuestion.options && currentQuestion.options.map((option, index) => {
                  const isMSQ = currentQuestion.type === 'MSQ'
                  const isSelected = isMSQ 
                    ? selectedOptions.includes(index)
                    : selectedOptions.length === 1 && selectedOptions[0] === index
                  const optionText = typeof option === 'string' ? option : option.text
                  const optionLabel = String.fromCharCode(65 + index)
                  
                  const handleOptionClick = () => {
                    if (submitted) return
                    if (isMSQ) {
                      // MSQ: Toggle selection
                      setSelectedOptions(prev => 
                        prev.includes(index) 
                          ? prev.filter(i => i !== index)
                          : [...prev, index]
                      )
                    } else {
                      // MCQ/TF: Single selection
                      setSelectedOptions([index])
                    }
                  }
                  
                  return (
                    <button
                      key={index}
                      onClick={handleOptionClick}
                      disabled={submitted}
                      style={{
                        padding: '20px 24px',
                        background: submitted 
                          ? 'rgba(255,255,255,0.1)'
                          : (isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'),
                        border: `2px solid ${isSelected ? '#ffd700' : 'rgba(255,255,255,0.2)'}`,
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
                      {isMSQ && (
                        <span style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          background: isSelected ? '#ffd700' : 'transparent',
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
                      <span style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: isSelected ? '#ffd700' : 'rgba(255,255,255,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '700',
                        color: isSelected ? '#1f2937' : 'white',
                        fontSize: '16px'
                      }}>
                        {optionLabel}
                      </span>
                      <span>{optionText}</span>
                    </button>
                  )
                })}
              </div>

              {/* Submit Button */}
              {submitted ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  {/* Instant Feedback */}
                  {feedback && (
                    <div style={{
                      padding: '20px',
                      background: feedback.isCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      borderRadius: '12px',
                      border: `2px solid ${feedback.isCorrect ? '#10b981' : '#ef4444'}`
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '24px' }}>{feedback.isCorrect ? '✅' : '❌'}</span>
                        <span style={{ fontSize: '18px', fontWeight: '700', color: feedback.isCorrect ? '#10b981' : '#ef4444' }}>
                          {feedback.isCorrect ? 'Correct!' : 'Incorrect'}
                        </span>
                      </div>
                      {feedback.correctOptions && feedback.correctOptions.length > 0 && (
                        <p style={{ margin: '4px 0', fontSize: '14px', color: 'rgba(255,255,255,0.9)' }}>
                          Correct answer: {feedback.correctOptions.map(i => String.fromCharCode(65 + i)).join(', ')}
                        </p>
                      )}
                      {feedback.explanation && (
                        <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.8)', fontStyle: 'italic' }}>
                          💡 {feedback.explanation}
                        </p>
                      )}
                    </div>
                  )}
                  {!feedback && (
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
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button
                    onClick={handleSubmitAnswer}
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
                  </button>
                </div>
              )}

              {/* Confused Button + Reaction Bar */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={toggleConfused}
                  style={{
                    padding: '10px 20px',
                    background: isConfused ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.1)',
                    border: `2px solid ${isConfused ? '#ef4444' : 'rgba(255,255,255,0.2)'}`,
                    borderRadius: '10px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  🤔 Confused {confusedCount > 0 && `(${confusedCount})`}
                </button>
                {['👍', '🔥', '💯', '❤️', '🎉'].map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => sendReaction(emoji)}
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '10px',
                      fontSize: '18px',
                      cursor: 'pointer',
                      transition: 'transform 0.15s'
                    }}
                    onMouseEnter={e => e.target.style.transform = 'scale(1.2)'}
                    onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Waiting State - Show Passed Questions */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Active question area placeholder */}
              <div style={{
                background: 'var(--bg-card)',
                borderRadius: '16px',
                padding: '48px',
                boxShadow: 'var(--card-shadow)',
                border: '1px solid var(--border-color)',
                textAlign: 'center'
              }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  background: '#eff6ff',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                  fontSize: '40px'
                }}>
                  ⏳
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
                  Waiting for Next Question
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '0' }}>
                  The teacher will start a poll soon. Stay tuned!
                </p>
              </div>

              {/* Past Questions (flex) + Leaderboard (flex) */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', width: '100%', boxSizing: 'border-box' }}>
                {/* Past Questions - flexible width */}
                <div style={{ flex: '1 1 calc(70% - 8px)', minWidth: '300px', maxWidth: '100%', background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
                    📋 Past Questions {pastResponses.length > 0 && `(${pastResponses.length})`}
                  </h3>
                {pastResponses.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                    No questions answered yet. Questions you answer will appear here.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {pastResponses.map((q, index) => (
                      <div key={`past-${index}`} style={{
                        padding: '20px',
                        background: 'var(--bg-primary)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)',
                        opacity: q.answered ? 1 : 0.8
                      }}>
                        {/* Header with status badges */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{
                              padding: '2px 10px',
                              background: q.answered ? '#d1fae5' : '#fee2e2',
                              color: q.answered ? '#059669' : '#dc2626',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {q.answered ? 'Answered' : 'Missed'}
                            </span>
                            <span style={{
                              padding: '2px 10px',
                              background: '#eff6ff',
                              color: '#3b82f6',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {q.type}
                            </span>
                            <span style={{
                              padding: '2px 10px',
                              background: '#fef3c7',
                              color: '#d97706',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {q.answered ? (q.pointsEarned || 0) : 0}/{q.maxPoints || 100} pts
                            </span>
                          </div>
                          {q.answered && q.isCorrect && (
                            <span style={{
                              padding: '4px 12px',
                              background: '#10b981',
                              color: 'white',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              ✓ Correct (+{q.pointsEarned || 0})
                            </span>
                          )}
                          {q.answered && !q.isCorrect && (
                            <span style={{
                              padding: '4px 12px',
                              background: '#ef4444',
                              color: 'white',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              ✗ Incorrect (+{q.pointsEarned || 0})
                            </span>
                          )}
                        </div>
                        
                        {/* Question text */}
                        <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 16px 0', lineHeight: '1.5' }}>
                          {q.question || 'Question'}
                        </p>
                        
                        {/* All options - always shown */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                          {(q.options || []).map((option, optIdx) => {
                            const isSelected = q.selectedOptions?.includes(optIdx)
                            const isCorrect = option.isCorrect
                            const letter = String.fromCharCode(65 + optIdx)
                            
                            let bgColor = 'var(--bg-secondary)'
                            let borderColor = 'var(--border-color)'
                            let textColor = 'var(--text-primary)'
                            let label = ''
                            
                            if (q.answered && isSelected && isCorrect) {
                              bgColor = '#d1fae5'
                              borderColor = '#059669'
                              label = ' (Your correct answer)'
                            } else if (q.answered && isSelected && !isCorrect) {
                              bgColor = '#fee2e2'
                              borderColor = '#dc2626'
                              label = ' (Your wrong answer)'
                            } else if (!q.answered && isCorrect) {
                              bgColor = '#d1fae5'
                              borderColor = '#059669'
                              label = ' (Correct answer)'
                            }
                            
                            return (
                              <div key={optIdx} style={{
                                padding: '12px 16px',
                                background: bgColor,
                                border: `2px solid ${borderColor}`,
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                              }}>
                                <span style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  background: isCorrect ? '#059669' : 'var(--border-color)',
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: '700',
                                  fontSize: '14px',
                                  flexShrink: 0
                                }}>
                                  {letter}
                                </span>
                                <span style={{ fontSize: '14px', color: textColor, fontWeight: isCorrect ? '600' : '400' }}>
                                  {option.text || option}
                                </span>
                                {label && (
                                  <span style={{ fontSize: '12px', color: textColor, fontWeight: '600', marginLeft: 'auto' }}>
                                    {label}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        
                        {/* Missed question notice */}
                        {!q.answered && (
                          <p style={{ fontSize: '13px', color: '#dc2626', margin: 0, fontStyle: 'italic' }}>
                            ⚠️ You did not answer this question
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                </div>
                {/* Leaderboard - flexible width */}
                <div style={{ flex: '1 1 calc(30% - 10px)', minWidth: '280px', maxWidth: '100%', background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
                    🏆 Leaderboard
                  </h3>
                  <Leaderboard roomId={room?._id} token={token} socket={socket} userId={user?._id} myRank={myRank} />
                </div>
              </div>

              {/* Earned Badges */}
              {earnedBadges.length > 0 && (
                <div style={{
                  background: 'var(--bg-card)',
                  borderRadius: '16px',
                  padding: '24px',
                  boxShadow: 'var(--card-shadow)',
                  border: '1px solid var(--border-color)',
                  marginTop: '24px'
                }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
                    🏅 My Badges ({earnedBadges.length})
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {earnedBadges.map((badge, i) => (
                      <div key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                        background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                        borderRadius: '10px',
                        border: '1px solid #f59e0b'
                      }}>
                        <span style={{ fontSize: '20px' }}>{badge.icon || '🏆'}</span>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#92400e' }}>{badge.name}</div>
                          <div style={{ fontSize: '10px', color: '#a16207' }}>{badge.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          50% { opacity: 1; transform: translateY(-200px) scale(1.3); }
          100% { opacity: 0; transform: translateY(-400px) scale(0.8); }
        }
        @keyframes slideIn {
          0% { opacity: 0; transform: translateX(100px); }
          100% { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

export default StudentRoomPage