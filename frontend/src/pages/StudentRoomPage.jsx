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
import { playNotificationSound } from '../utils/sounds'

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
  const [submitResult, setSubmitResult] = useState(null) // {isCorrect, points, responseTime, questionId}
  const [showFeedback, setShowFeedback] = useState(false) // Only reveal after question ends
  const timerIntervalRef = useRef(null)
  const submittedRef = useRef(false) // Block double-submits immediately
  const roomRef = useRef(null)

  // Keep roomRef in sync with room state
  useEffect(() => {
    roomRef.current = room
  }, [room])

  // Auto-dismiss result banner after 3 seconds
  useEffect(() => {
    if (showFeedback && submitResult) {
      const timer = setTimeout(() => {
        setSubmitResult(null)
        setShowFeedback(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [showFeedback, submitResult])

  useEffect(() => {
    if (!token || !socket) return
    setAuthToken(token)
    joinSession()
    return () => {
      // Clear any running timer on unmount
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      const currentRoom = roomRef.current
      if (currentRoom?.code) {
        leaveRoom(currentRoom.code, user._id)
      }
    }
  }, [token, socket])



  useEffect(() => {
    if (!socket) return

    const handleQuestionStarted = (data) => {
      setCurrentQuestion(data)
      setSelectedOptions([])
      setSubmitted(false)
      submittedRef.current = false
      setSubmitResult(null)
      setShowFeedback(false)
      setTimeLeft(data.timer || 30)
      const r = roomRef.current
      const soundId = r?.settings?.notificationSound || 'beep'
      const customUrl = r?.settings?.customSoundUrl
      if (soundId === 'custom' && customUrl) {
        try { new Audio(customUrl).play().catch(() => {}) } catch {}
      } else {
        playNotificationSound(soundId)
      }
      
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
            setShowFeedback(true)
            const r = roomRef.current
            if (r?._id && user?._id) {
              fetchPastResponses(r._id, user._id)
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
      
      // Reveal the answer feedback now that question is over
      setShowFeedback(true)
      
      const r = roomRef.current
      if (r?._id && user?._id) {
        fetchPastResponses(r._id, user._id)
      }
      setResults(data?.results || null)
      setCurrentQuestion(null)
    }

    const handleNewQuestion = (question) => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      
      setCurrentQuestion(question)
      setSelectedOptions([])
      setSubmitted(false)
      submittedRef.current = false
      setSubmitResult(null)
      setShowFeedback(false)
      setTimeLeft(question.timeToAnswer || 30)
      const r = roomRef.current
      const soundId = r?.settings?.notificationSound || 'beep'
      const customUrl = r?.settings?.customSoundUrl
      if (soundId === 'custom' && customUrl) {
        try { new Audio(customUrl).play().catch(() => {}) } catch {}
      } else {
        playNotificationSound(soundId)
      }
      
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
            setShowFeedback(true)
            const r = roomRef.current
            if (r?._id && user?._id) {
              fetchPastResponses(r._id, user._id)
            }
            setCurrentQuestion(null)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    const handleRoomEnded = () => {
      const r = roomRef.current
      navigate(`/student/room/${r?._id}/results`)
    }

    // Self-heal after a socket reconnect: the store re-joins the room automatically, but a
    // question pushed WHILE we were briefly disconnected would have been missed. Re-pull the
    // room's questions so any missed one surfaces without the student manually refreshing.
    const handleReconnect = () => {
      const r = roomRef.current
      if (r?._id && user?._id) {
        fetchPastResponses(r._id, user._id)
      }
    }

    socket.on('question:started', handleQuestionStarted)
    socket.on('question:ended', handleQuestionEnded)
    socket.on('new_question', handleNewQuestion)
    socket.on('room:ended', handleRoomEnded)
    socket.on('connect', handleReconnect)

    return () => {
      socket.off('question:started', handleQuestionStarted)
      socket.off('question:ended', handleQuestionEnded)
      socket.off('new_question', handleNewQuestion)
      socket.off('room:ended', handleRoomEnded)
      socket.off('connect', handleReconnect)
    }
  }, [socket, navigate])

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

  const handleSubmitAnswer = async () => {
    if (selectedOptions.length === 0 || submittedRef.current || !currentQuestion) return
    submittedRef.current = true

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

      // Store result for instant feedback display
      if (saveData.success && saveData.response) {
        setSubmitResult({
          isCorrect: saveData.response.isCorrect,
          points: saveData.response.points,
          responseTime: saveData.response.responseTime,
          questionId
        })
      }
    } catch (err) {
      console.error('Failed to save response:', err)
    }

    // Set submitted immediately and fetch past responses without delay
    setSubmitted(true)
    setHasAnsweredPoll(true) // Prevent accidental leave after answering
    if (room?._id && user?._id) {
      fetchPastResponses(room._id, user._id)
    }
  }

  const leaveSession = () => {
    if (room?.code) {
      leaveRoom(room.code, user._id)
    }
    navigate('/student')
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
      overflowX: 'hidden'
    }}>
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
                  textAlign: 'center',
                  padding: '24px',
                  background: showFeedback && submitResult
                    ? (submitResult.isCorrect ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)')
                    : 'rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  border: showFeedback && submitResult
                    ? `2px solid ${submitResult.isCorrect ? '#10b981' : '#ef4444'}`
                    : 'none'
                }}>
                  {showFeedback && submitResult ? (
                    <>
                      <p style={{
                        fontSize: '28px',
                        fontWeight: '700',
                        color: submitResult.isCorrect ? '#10b981' : '#ef4444',
                        marginBottom: '8px'
                      }}>
                        {submitResult.isCorrect ? '✓ Correct!' : '✗ Incorrect'}
                      </p>
                      <p style={{ fontSize: '18px', fontWeight: '600', color: 'white', marginBottom: '4px' }}>
                        +{submitResult.points} points
                      </p>
                      <p style={{ fontSize: '13px', opacity: 0.8, color: 'rgba(255,255,255,0.8)' }}>
                        Answered in {submitResult.responseTime}s
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: '18px', fontWeight: '600', color: 'white' }}>✓ Answer Submitted</p>
                      <p style={{ fontSize: '14px', opacity: 0.9, marginTop: '8px', color: 'rgba(255,255,255,0.8)' }}>
                        {timeLeft > 0 ? `Result reveals in ${timeLeft}s` : 'Revealing results...'}
                      </p>
                    </>
                  )}
                </div>
              ) : (
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
              )}
            </div>
          ) : (
            /* Waiting State - Show Passed Questions */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Result reveal banner — shows briefly after question ends */}
              {showFeedback && submitResult && (
                <div style={{
                  background: submitResult.isCorrect
                    ? 'linear-gradient(135deg, #059669, #10b981)'
                    : 'linear-gradient(135deg, #dc2626, #ef4444)',
                  borderRadius: '16px',
                  padding: '24px 32px',
                  color: 'white',
                  textAlign: 'center',
                  boxShadow: submitResult.isCorrect
                    ? '0 10px 40px rgba(16,185,129,0.3)'
                    : '0 10px 40px rgba(239,68,68,0.3)'
                }}>
                  <p style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>
                    {submitResult.isCorrect ? '✓ Correct!' : '✗ Incorrect'}
                  </p>
                  <p style={{ fontSize: '18px', fontWeight: '600', opacity: 0.9 }}>
                    +{submitResult.points} points · {submitResult.responseTime}s
                  </p>
                </div>
              )}

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
                    {pastResponses
                      .filter(q => {
                        // Hide current question from past list while timer is running (anti-cheat)
                        if (!showFeedback && currentQuestion) {
                          const currentQId = currentQuestion._id || currentQuestion.question?._id
                          return q._id !== currentQId
                        }
                        return true
                      })
                      .map((q, index) => (
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
                            {q.answered && q.responseTime != null && q.responseTime > 0 && (
                              <span style={{
                                padding: '2px 10px',
                                background: '#f0f9ff',
                                color: '#0369a1',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '600'
                              }}>
                                ⏱ {q.responseTime}s
                              </span>
                            )}
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
                        
                        {/* AI Explanation */}
                        {q.answered && q.explanation && (
                          <div style={{
                            marginTop: '12px',
                            padding: '12px 16px',
                            background: '#eff6ff',
                            borderRadius: '8px',
                            border: '1px solid #bfdbfe'
                          }}>
                            <p style={{ fontSize: '12px', fontWeight: '600', color: '#1d4ed8', margin: '0 0 4px 0' }}>
                              💡 Explanation
                            </p>
                            <p style={{ fontSize: '13px', color: '#1e40af', margin: 0, lineHeight: '1.5' }}>
                              {q.explanation}
                            </p>
                          </div>
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default StudentRoomPage