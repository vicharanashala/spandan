import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import { PageHeader } from '../components/AppUI'
import Leaderboard from '../components/Leaderboard'
import ErrorBoundary from '../components/ErrorBoundary'
import SoundToggle from '../components/SoundToggle'
import YouTubeVideo, { extractYouTubeId } from '../components/YouTubeVideo'
import useIsMobile from '../hooks/useIsMobile'
import { API_URL } from '../config.js'
import { installUnlockOnInteraction, playStudentQuestion, unlockAudio } from '../lib/sounds'
import { Bell, Check, CircleCheck, Clapperboard, ClipboardList, Flame, HelpCircle, Hourglass, Lightbulb, MessageSquare, Mic, TriangleAlert, Trophy, X } from 'lucide-react'
import { Ico } from '../components/icons'
import { triggerConfetti } from '../lib/confetti'
import DoubtBoxModal from '../components/DoubtBoxModal'
import ConfusedIcon from '../components/ConfusedIcon'

// Spread the ~N students' navigation to the results page over this window (ms). When a big room
// ends, all students receive room:ended at once; without a spread they'd all hit the results
// endpoints in the same instant (the end-session "results stampede"). Each student waits a random
// delay in [0, this) before navigating. Scoring is unaffected — the session is already over.
const RESULTS_NAV_JITTER_MS = 4000

function StudentRoomPage() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const { user, token, logout } = useAuthStore()
  const { socket, isConnected, joinRoom, leaveRoom } = useSocketStore()
  const { joinRoomByCode, setAuthToken } = useRoomStore()
  const isMobile = useIsMobile()

  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [selectedOptions, setSelectedOptions] = useState([]) // Array for MSQ support
  const [submitted, setSubmitted] = useState(false)
  const [streakFeedback, setStreakFeedback] = useState(null)
  const [isConfused, setIsConfused] = useState(false)
  const [confusedReason, setConfusedReason] = useState('')
  const [showDoubtBox, setShowDoubtBox] = useState(false)
  const [hasAnsweredPoll, setHasAnsweredPoll] = useState(false) // Track if student has answered at least one poll
  const [timeLeft, setTimeLeft] = useState(0)
  const [results, setResults] = useState(null)
  // Past responses loaded from MongoDB - no sessionStorage needed
  const [pastResponses, setPastResponses] = useState([])
  const [sessionEnded, setSessionEnded] = useState(false) // room ended → show interstitial while we stagger navigation
  const timerIntervalRef = useRef(null)
  const resultsNavTimerRef = useRef(null)

  // Video mode: students watch independently (pause + rewind allowed, no forward-seek), and the
  // player pauses locally while a question is live.
  const isVideoMode = room?.settings?.mode === 'video'
  const videoId = isVideoMode ? extractYouTubeId(room?.settings?.videoUrl) : null
  const studentPlayerRef = useRef(null)
  const teacherVideoTimeRef = useRef(null) // { time, playing, at } — teacher position for the forward-seek ceiling
  const capSuppressUntilRef = useRef(0) // performance.now() until which the forward cap is suspended (post-poll live-edge resume)
  const [isLiveStream, setIsLiveStream] = useState(false)
  // True while the teacher's question-approval popup is open. The student video stays paused for the
  // WHOLE popup window (across every question the teacher launches from it), not just per-question.
  const [teacherVideoPaused, setTeacherVideoPaused] = useState(false)
  // True when a "question time" chime could not play because the browser has not seen a user gesture on
  // this page yet (e.g. after a reload). Shows a one-tap "Enable sound" button; cleared once sound works.
  const [soundBlocked, setSoundBlocked] = useState(false)
  // One-time hint for new students (per device). Dismissed with ✕; never shown again on this browser.
  const [showHint, setShowHint] = useState(() => { try { return localStorage.getItem('spandan.studentHintSeen') !== '1' } catch (e) { return true } })
  const dismissHint = () => { setShowHint(false); try { localStorage.setItem('spandan.studentHintSeen', '1') } catch (e) { /* ignore */ } }
  useEffect(() => { installUnlockOnInteraction() }, [])
  const enableSound = async () => {
    await unlockAudio()
    const r = await playStudentQuestion()
    if (r !== 'blocked') setSoundBlocked(false)
  }

  // Calculate consecutive correct answer streak from server-verified responses
  const { currentStreak, maxStreak } = React.useMemo(() => {
    if (!pastResponses || pastResponses.length === 0) {
      return { currentStreak: 0, maxStreak: 0 }
    }
    // Only evaluate questions whose answers/correctness have been revealed
    const revealedQuestions = [...pastResponses]
      .filter(q => !q.resultPending)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))

    let curr = 0
    let max = 0
    for (const q of revealedQuestions) {
      if (q.answered && q.isCorrect) {
        curr += 1
        if (curr > max) max = curr
      } else {
        // Any incorrect answer or missed question resets the active streak
        curr = 0
      }
    }
    return { currentStreak: curr, maxStreak: max }
  }, [pastResponses])

  // Trigger celebratory confetti on streak milestones (3, 5, 10, 20)
  const prevStreakRef = useRef(0)
  useEffect(() => {
    const STREAK_MILESTONES = [3, 5, 10, 20]
    if (currentStreak > prevStreakRef.current && STREAK_MILESTONES.includes(currentStreak)) {
      triggerConfetti({
        particleCount: currentStreak >= 10 ? 110 : currentStreak >= 5 ? 80 : 60
      })
    }
    prevStreakRef.current = currentStreak
  }, [currentStreak])

  // Ref to track current question synchronously for socket events & timers
  const currentQuestionRef = useRef(null)
  currentQuestionRef.current = currentQuestion

  const startQuestion = (q) => {
    if (!q) return
    console.log('[StudentRoom] Starting question:', q)
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    setCurrentQuestion(q)
    setSelectedOptions([])
    setSubmitted(false)
    setIsConfused(false)
    setConfusedReason('')
    setStreakFeedback(null)

    const tta = Number(q.timeToAnswer) || 30
    setTimeLeft(tta)

    timerIntervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current)
          timerIntervalRef.current = null
          handleTimeExpired(q)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleTimeExpired = (q) => {
    setStreakFeedback({
      type: 'expired',
      message: "⏱️ Time's up for this question! Streak reset."
    })
    setSubmitted(true)

    const qId = q._id || q.question?._id
    setPastResponses(prev => {
      const updated = prev.map(item => {
        const id = item._id || item.question?._id
        if (String(id) === String(qId)) {
          return {
            ...item,
            answered: true,
            isCorrect: false,
            pointsEarned: 0,
            resultPending: false
          }
        }
        return item
      })

      const sorted = [...updated].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      const nextQ = sorted.find(item => {
        const id = item._id || item.question?._id
        return String(id) !== String(qId) && !item.answered
      })

      setTimeout(() => {
        if (nextQ) {
          startQuestion(nextQ)
        } else {
          setCurrentQuestion(null)
        }
      }, 1500)

      return updated
    })
  }

  const advanceToNextQuestion = (currentQId) => {
    setPastResponses(currentList => {
      const sorted = [...currentList].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      const nextQ = sorted.find(item => {
        const id = item._id || item.question?._id
        return String(id) !== String(currentQId) && !item.answered
      })

      if (nextQ) {
        startQuestion(nextQ)
      } else {
        setCurrentQuestion(null)
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current)
          timerIntervalRef.current = null
        }
      }
      return currentList
    })
  }

  useEffect(() => {
    if (!isVideoMode) return
    const p = studentPlayerRef.current
    if (!p) return
    if (teacherVideoPaused || currentQuestion) {
      p.pauseVideo?.()
    } else {
      // For a live stream, jump back to the live edge on resume so students rejoin the broadcast.
      // Query the player directly so it fires even if the isLiveStream state hasn't settled.
      let live = isLiveStream
      try { const ps = p.getProgressState?.(); if (ps && typeof ps.isLive === 'boolean') live = ps.isLive } catch (e) { /* ignore */ }
      if (live && typeof p.seekTo === 'function') {
        const dur = typeof p.getDuration === 'function' ? p.getDuration() : 0
        p.seekTo(dur > 0 ? dur : 1e7, true)
        // Suspend the teacher-cap briefly so the student isn't snapped off the live edge before the
        // teacher's post-jump position broadcast (every 2s) lands and refreshes the ceiling.
        capSuppressUntilRef.current = performance.now() + 4000
      }
      p.playVideo?.()
    }
  }, [teacherVideoPaused, currentQuestion, isVideoMode, isLiveStream])

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
      const q = data.question || data
      startQuestion(q)
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
      if (!question) return
      setPastResponses(prev => {
        const qId = question._id || question.question?._id
        const exists = prev.some(item => String(item._id || item.question?._id) === String(qId))
        if (!exists) {
          return [...prev, { ...question, answered: false }]
        }
        return prev
      })
      if (!currentQuestionRef.current) {
        startQuestion(question)
      }
    }

    // Self-heal after a socket reconnect: the store re-joins the room automatically, but a
    // question pushed WHILE we were briefly disconnected would have been missed. Re-pull the
    // room's questions so any missed one surfaces without the student manually refreshing.
    const handleReconnect = () => {
      if (room?._id && user?._id) {
        fetchPastResponses(room._id, user._id)
      }
    }

    const handleVideoProgress = (data) => {
      const t = Number(data?.time)
      if (!Number.isFinite(t)) return
      teacherVideoTimeRef.current = { time: t, playing: !!data?.playing, at: performance.now() }
    }

    const handleVideoPause = () => setTeacherVideoPaused(true)
    const handleVideoResume = () => setTeacherVideoPaused(false)
    // Teacher's GENERATED batch arrived (once per segment / Paste & Generate; never for Create Q).
    const handleQuestionsReady = async () => {
      const r = await playStudentQuestion()
      if (r === 'blocked') setSoundBlocked(true)
      if (room?._id && user?._id) {
        fetchPastResponses(room._id, user._id)
      }
    }

    socket.on('question:started', handleQuestionStarted)
    socket.on('question:ended', handleQuestionEnded)
    socket.on('new_question', handleNewQuestion)
    socket.on('video:progress', handleVideoProgress)
    socket.on('video:pause', handleVideoPause)
    socket.on('video:resume', handleVideoResume)
    socket.on('questions:ready', handleQuestionsReady)
    socket.on('connect', handleReconnect)
    socket.on('room:ended', () => {
      // Show the interstitial immediately, but stagger the actual navigation across a jitter window
      // so all students don't hit the results endpoints in the same instant.
      setSessionEnded(true)
      const delay = Math.random() * RESULTS_NAV_JITTER_MS
      resultsNavTimerRef.current = setTimeout(() => {
        navigate(`/student/room/${room?._id}/results`)
      }, delay)
    })

    return () => {
      socket.off('question:started', handleQuestionStarted)
      socket.off('question:ended', handleQuestionEnded)
      socket.off('new_question', handleNewQuestion)
      socket.off('video:progress', handleVideoProgress)
      socket.off('video:pause', handleVideoPause)
      socket.off('video:resume', handleVideoResume)
      socket.off('questions:ready', handleQuestionsReady)
      socket.off('connect', handleReconnect)
      socket.off('room:ended')
      if (resultsNavTimerRef.current) clearTimeout(resultsNavTimerRef.current)
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

        // Auto-start first unanswered question if student doesn't have an active question
        if (!currentQuestionRef.current) {
          const sorted = [...data.questions].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
          const firstUnanswered = sorted.find(q => !q.answered)
          if (firstUnanswered) {
            startQuestion(firstUnanswered)
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch past responses:', err)
    }
  }

  const handleSubmitAnswer = async () => {
    if (selectedOptions.length === 0 || submitted || !currentQuestion) return

    const questionId = currentQuestion._id || currentQuestion.question?._id
    const tta = Number(currentQuestion.timeToAnswer) || 30
    const responseTime = Math.max(1, tta - timeLeft)
    const roomId = room?._id
    const studentId = user?._id

    // Stop timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    setSubmitted(true)
    setHasAnsweredPoll(true)

    console.log('[StudentRoom] Submitting answer:', {
      questionId, roomId, studentId, selectedOptions, timeToAnswer: tta, timeLeft, responseTime
    })

    try {
      const saveResponse = await fetch(`${API_URL}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId,
          questionId,
          studentId,
          selectedOptions,
          isConfused,
          confusedReason: isConfused ? confusedReason.trim() : '',
          responseTime
        })
      })
      const saveData = await saveResponse.json()
      console.log('[StudentRoom] Response saved:', saveData)

      const isCorrect = !!(saveData.isCorrect ?? saveData.response?.isCorrect)
      const points = saveData.points ?? saveData.response?.points ?? (isCorrect ? (currentQuestion.points || currentQuestion.maxPoints || 100) : 0)

      if (isCorrect) {
        const nextStreakVal = currentStreak + 1
        triggerConfetti({ particleCount: 75, spread: 60 })
        setStreakFeedback({
          type: 'correct',
          message: `🎉 Correct! +${points} pts • 🔥 ${nextStreakVal} Streak!`,
          points
        })
      } else {
        setStreakFeedback({
          type: 'incorrect',
          message: `❌ Not quite! Streak reset to 0. Keep going!`,
          points: 0
        })
      }

      // Update pastResponses with user response and proceed to next question after 1.2s
      setPastResponses(prev => {
        const updated = prev.map(item => {
          const id = item._id || item.question?._id
          if (String(id) === String(questionId)) {
            return {
              ...item,
              answered: true,
              selectedOptions,
              isCorrect,
              pointsEarned: points,
              resultPending: false,
              userResponse: {
                selectedOptions,
                isCorrect,
                points
              }
            }
          }
          return item
        })

        const sorted = [...updated].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
        const nextQ = sorted.find(item => {
          const id = item._id || item.question?._id
          return String(id) !== String(questionId) && !item.answered
        })

        setTimeout(() => {
          if (nextQ) {
            startQuestion(nextQ)
          } else {
            setCurrentQuestion(null)
          }
        }, 1200)

        return updated
      })
    } catch (err) {
      console.error('Failed to save response:', err)
      setTimeout(() => {
        advanceToNextQuestion(questionId)
      }, 1200)
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
        <div style={{ flex: 1, marginLeft: 'var(--sidebar-width, 240px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid var(--border-color)',
              borderTopColor: 'var(--accent)',
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
        <div style={{ flex: 1, marginLeft: 'var(--sidebar-width, 240px)', padding: '32px' }}>
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
                background: 'var(--accent-solid)',
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

  if (sessionEnded) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
      }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: 'var(--sidebar-width, 240px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid var(--border-color)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            <p style={{ color: 'var(--text-secondary)' }}>Session ended — loading your results...</p>
          </div>
        </div>
      </div>
    )
  }

  // Progression & streak helpers
  const currentQId = currentQuestion ? (currentQuestion._id || currentQuestion.question?._id) : null
  const sortedQuestions = [...pastResponses].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))

  const currentQIndex = sortedQuestions.findIndex(q => {
    const id = q._id || q.question?._id
    return String(id) === String(currentQId)
  })

  const totalQuestions = sortedQuestions.length
  const hasNextQuestion = sortedQuestions.some(q => {
    const id = q._id || q.question?._id
    return String(id) !== String(currentQId) && !q.answered
  })

  const isAllCompleted = totalQuestions > 0 && sortedQuestions.every(q => q.answered)

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
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width, 240px)', minWidth: 0, maxWidth: 'calc(100vw - var(--sidebar-width, 240px))', overflowX: 'hidden' }}>
        <PageHeader isMobile={isMobile} icon={room.settings?.mode === 'video' ? Clapperboard : Mic} eyebrow="Live session" title={room.name} subtitle={<>Code <strong style={{ letterSpacing: '0.1em' }}>{room.code}</strong></>} />

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '32px', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
          {showHint && (
            <div role="note" style={{
              background: 'var(--bg-card)', border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)', borderLeft: '4px solid var(--accent)',
              borderRadius: '12px', padding: '12px 16px', marginBottom: '16px',
              display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-primary)', fontSize: '14px'
            }}>
              <span aria-hidden="true" style={{ fontSize: '18px', display: 'inline-flex', color: '#f59e0b' }}><Lightbulb size={18} /></span>
              <span style={{ flex: 1 }}>
                When your teacher's questions are ready you will hear a chime, and each question takes over this screen until its timer ends.
                Answer quickly — points reward speed. Tap the ⓘ button in the header for the full guide.
              </span>
              <button onClick={dismissHint} aria-label="Dismiss hint" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '16px', cursor: 'pointer', padding: '4px', display: 'inline-flex' }}><X size={16} aria-hidden="true" /></button>
            </div>
          )}

          {/* Connection Status */}
          <div data-tour="status-row" style={{
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: isConnected ? '#10b981' : '#ef4444'
              }} />
              <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500' }}>
                {isConnected ? 'Connected' : 'Reconnecting...'}
              </span>

              {/* Streak Badge */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                background: currentStreak >= 3
                  ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                  : currentStreak > 0
                    ? 'color-mix(in srgb, #f59e0b 22%, transparent)'
                    : 'color-mix(in srgb, var(--text-secondary) 14%, transparent)',
                color: currentStreak >= 3
                  ? '#ffffff'
                  : currentStreak > 0
                    ? '#f59e0b'
                    : 'var(--text-secondary)',
                border: currentStreak >= 3
                  ? '1px solid rgba(255,255,255,0.3)'
                  : currentStreak > 0
                    ? '1px solid color-mix(in srgb, #f59e0b 45%, transparent)'
                    : '1px solid var(--border-color)',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '700',
                boxShadow: currentStreak >= 3 ? '0 0 12px rgba(245, 158, 11, 0.45)' : 'none'
              }}>
                <Ico as={Flame} size={15} style={{ color: currentStreak >= 3 ? '#ffffff' : currentStreak > 0 ? '#f59e0b' : 'var(--text-secondary)' }} />
                <span>{currentStreak} Streak{currentStreak >= 3 ? ' — On Fire!' : ''}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Anonymous Doubt Box Toggle */}
            <button
              onClick={() => setShowDoubtBox(true)}
              title="Open Anonymous Doubt Box"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                color: 'var(--accent)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              <Ico as={MessageSquare} size={15} />
              <span>Doubts</span>
            </button>

            {/* Sound on/off for the question-time chime (per device) */}
            <SoundToggle />
            {soundBlocked && (
              <button
                onClick={enableSound}
                title="Your browser blocked the chime until you interact with the page — tap once to enable it"
                style={{
                  padding: '8px 14px',
                  background: '#f59e0b',
                  color: '#111827',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                <Ico as={Bell} /> Enable sound
              </button>
            )}
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
          </div>

          {/* Video (video mode) — persistent so it doesn't remount when questions come/go.
              Hidden (not unmounted) while a question is live so the poll takes over like normal mode. */}
          {isVideoMode && videoId && (
            <div style={{
              display: currentQuestion ? 'none' : 'block',
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-lg)',
              padding: isMobile ? '12px' : '16px',
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--border-color)',
              marginBottom: '24px'
            }}>
              {isLiveStream && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'blink 1s infinite' }} />
                  <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 700, letterSpacing: '0.03em' }}>LIVE</span>
                </div>
              )}
              <YouTubeVideo
                videoId={videoId}
                controls={true}
                noForwardSeek={true}
                seekCeilingRef={teacherVideoTimeRef}
                capSuppressUntilRef={capSuppressUntilRef}
                playerRef={studentPlayerRef}
                onLiveStatus={setIsLiveStream}
              />
              <p style={{ margin: '10px 0 0', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                {isLiveStream
                  ? 'Live stream. You can rewind, and the video pauses automatically during a poll.'
                  : 'You can pause and rewind, but not skip ahead. The video pauses automatically during a poll.'}
              </p>
            </div>
          )}

          {/* Live Question — only mounted while a poll is live */}
          {currentQuestion && (
            <div style={{
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              borderRadius: 'var(--radius-lg)',
              padding: isMobile ? '20px 16px' : '32px',
              color: 'white',
              boxShadow: '0 10px 40px rgba(124, 58, 237, 0.3)',
              maxWidth: '100%',
              boxSizing: 'border-box'
            }}>
              {/* Question Header: Progression & Streak */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '14px',
                borderBottom: '1px solid rgba(255,255,255,0.2)',
                marginBottom: '18px',
                fontSize: '13px',
                fontWeight: '600',
                color: 'rgba(255,255,255,0.95)'
              }}>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.2)',
                  fontSize: '12.5px',
                  fontWeight: '700'
                }}>
                  Question {currentQIndex >= 0 ? currentQIndex + 1 : 1} of {Math.max(totalQuestions, 1)}
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  background: currentStreak >= 3 ? 'rgba(245, 158, 11, 0.45)' : 'rgba(255,255,255,0.2)',
                  color: '#ffffff',
                  fontSize: '12.5px',
                  fontWeight: '700'
                }}>
                  <Ico as={Flame} size={15} style={{ color: '#ffd700' }} />
                  {currentStreak} Streak • {currentQuestion.points || currentQuestion.maxPoints || 100} pts
                </span>
              </div>

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
              <h2 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', textAlign: 'center', marginBottom: isMobile ? '24px' : '32px', wordBreak: 'break-word' }}>
                {currentQuestion.question}
              </h2>

              {/* Streak feedback alert */}
              {streakFeedback && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  marginBottom: '18px',
                  background: streakFeedback.type === 'correct' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)',
                  border: `1.5px solid ${streakFeedback.type === 'correct' ? '#10b981' : '#ef4444'}`,
                  color: '#ffffff',
                  fontWeight: '700',
                  textAlign: 'center',
                  fontSize: '15px'
                }}>
                  {streakFeedback.message}
                </div>
              )}

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
                        width: '100%',
                        minHeight: '48px',
                        boxSizing: 'border-box',
                        padding: isMobile ? '14px 16px' : '20px 24px',
                        background: submitted
                          ? 'rgba(255,255,255,0.1)'
                          : (isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'),
                        border: `2px solid ${isSelected ? '#ffd700' : 'rgba(255,255,255,0.2)'}`,
                        borderRadius: '12px',
                        color: 'white',
                        fontSize: isMobile ? '16px' : '18px',
                        textAlign: 'left',
                        cursor: submitted ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: isMobile ? '12px' : '16px'
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
                          fontSize: '14px',
                          flexShrink: 0
                        }}>
                          {isSelected ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : ''}
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
                        fontSize: '16px',
                        flexShrink: 0
                      }}>
                        {optionLabel}
                      </span>
                      <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{optionText}</span>
                    </button>
                  )
                })}
              </div>

              {/* In-Question Actions: Confused Signal + Ask Doubt Button */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: '10px',
                marginBottom: '16px'
              }}>
                {!submitted ? (
                  <button
                    type="button"
                    onClick={() => setIsConfused(prev => !prev)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      background: isConfused ? 'rgba(245, 158, 11, 0.28)' : 'rgba(255, 255, 255, 0.08)',
                      border: `2px dashed ${isConfused ? '#f59e0b' : 'rgba(255, 255, 255, 0.25)'}`,
                      borderRadius: '12px',
                      color: isConfused ? '#fef08a' : 'rgba(255, 255, 255, 0.85)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '13.5px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <ConfusedIcon size={20} />
                    <span>{isConfused ? "✓ Marked as Confused" : "I'm Confused (Signal Teacher)"}</span>
                  </button>
                ) : <div />}

                <button
                  type="button"
                  onClick={() => setShowDoubtBox(true)}
                  title="Open Anonymous Doubt Box"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.12)',
                    border: '2px solid rgba(255, 255, 255, 0.28)',
                    borderRadius: '12px',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '13.5px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Ico as={MessageSquare} size={17} />
                  <span>💬 Ask a Doubt / View Doubts</span>
                </button>
              </div>

              {/* Optional explanation input for student to specify what is confusing */}
              {!submitted && isConfused && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  borderRadius: '10px',
                  border: '1px solid rgba(245, 158, 11, 0.3)'
                }}>
                  <label style={{
                    display: 'block',
                    fontSize: '12.5px',
                    color: '#fef08a',
                    fontWeight: '600',
                    marginBottom: '6px'
                  }}>
                    What part is confusing? (Optional — help the teacher explain better)
                  </label>
                  <textarea
                    value={confusedReason}
                    onChange={(e) => setConfusedReason(e.target.value.slice(0, 200))}
                    placeholder="e.g. Can you explain why step 2 changed the sign? / Option B vs D is unclear"
                    rows={2}
                    maxLength={200}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      background: 'rgba(0, 0, 0, 0.4)',
                      color: '#ffffff',
                      fontSize: '13px',
                      outline: 'none',
                      resize: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '4px',
                    fontSize: '11px',
                    color: 'rgba(255, 255, 255, 0.5)'
                  }}>
                    <span>Sent to teacher live on answer submission</span>
                    <span>{confusedReason.length}/200</span>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              {submitted ? (
                <div style={{
                  textAlign: 'center',
                  padding: '20px',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.25)'
                }}>
                  <p style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 6px' }}>
                    <Ico as={CircleCheck} /> {streakFeedback?.message || 'Answer Saved!'}
                  </p>
                  <p style={{ fontSize: '14px', opacity: 0.9, margin: 0 }}>
                    {hasNextQuestion ? 'Loading next question...' : 'All questions answered! Great job!'}
                  </p>
                  {hasNextQuestion && (
                    <button
                      type="button"
                      onClick={() => advanceToNextQuestion(currentQuestion._id || currentQuestion.question?._id)}
                      style={{
                        marginTop: '12px',
                        padding: '8px 18px',
                        background: '#ffd700',
                        color: '#1f2937',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Next Question Now →
                    </button>
                  )}
                  <div style={{ marginTop: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setShowDoubtBox(true)}
                      style={{
                        padding: '6px 14px',
                        background: 'rgba(255, 255, 255, 0.15)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: '8px',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Ico as={MessageSquare} size={13} />
                      <span>💬 Have a Doubt? Open Doubt Box</span>
                    </button>
                  </div>
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
                    fontWeight: '700',
                    cursor: selectedOptions.length > 0 ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: selectedOptions.length > 0 ? '0 4px 14px rgba(255,215,0,0.35)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>💾</span>
                  <span>{hasNextQuestion ? 'Save & Next Question →' : 'Save & Submit Quiz ✓'}</span>
                </button>
              )}
            </div>
          )}

          {/* Waiting State (Show Passed Questions) — persistent: display-toggled, NOT unmounted, so the
              Leaderboard keeps its socket subscription and updates ONLY on the once-per-segment
              leaderboard:updated push, instead of re-fetching on every poll's remount. */}
          <div style={{ display: currentQuestion ? 'none' : 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Active question area placeholder — hidden in video mode (the player fills this space) */}
              {!isVideoMode && (
                isAllCompleted ? (
                  <div data-tour="question-area" style={{
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-lg)',
                    padding: isMobile ? '32px 20px' : '44px',
                    boxShadow: 'var(--shadow-md)',
                    border: '2px solid var(--accent)',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
                    <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
                      All Questions Completed!
                    </h2>
                    <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
                      You have answered all {totalQuestions} questions in this session.
                    </p>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 20px',
                      background: 'color-mix(in srgb, #f59e0b 16%, transparent)',
                      borderRadius: '24px',
                      border: '1px solid color-mix(in srgb, #f59e0b 35%, transparent)',
                      marginBottom: '16px'
                    }}>
                      <Ico as={Flame} size={20} style={{ color: '#f59e0b' }} />
                      <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        Final Streak: {currentStreak} 🔥 • Max Streak: {maxStreak} ⚡
                      </span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                      Scroll down to review all your answers, correct options, and detailed stats!
                    </p>
                  </div>
                ) : (
                  <div data-tour="question-area" style={{
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-lg)',
                    padding: isMobile ? '32px 20px' : '48px',
                    boxShadow: 'var(--shadow-md)',
                    border: '1px solid var(--border-color)',
                    textAlign: 'center'
                  }}>
                    <div style={{
                      width: '80px',
                      height: '80px',
                      background: 'var(--tint-info-bg)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 24px',
                      fontSize: '40px',
                      color: 'var(--accent)'
                    }}>
                      <Hourglass size={38} aria-hidden="true" />
                    </div>
                    <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
                      Waiting for Next Question
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '0' }}>
                      The teacher will start a poll soon. Stay tuned!
                    </p>
                  </div>
                )
              )}

              {/* Past Questions (flex) + Leaderboard (flex) */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', width: '100%', boxSizing: 'border-box' }}>
                {/* Past Questions - flexible width */}
                <div data-tour="past-questions" style={{ flex: isMobile ? '1 1 100%' : '1 1 calc(70% - 8px)', minWidth: 0, maxWidth: '100%', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: isMobile ? '16px' : '24px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Ico as={ClipboardList} style={{ color: 'var(--accent)' }} /> Past Questions {pastResponses.length > 0 && `(${pastResponses.length})`}
                    </h3>
                    {currentStreak > 0 && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 10px',
                        background: currentStreak >= 3 ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'color-mix(in srgb, #f59e0b 16%, transparent)',
                        color: currentStreak >= 3 ? '#ffffff' : '#f59e0b',
                        border: '1px solid color-mix(in srgb, #f59e0b 35%, transparent)',
                        borderRadius: '16px',
                        fontSize: '12px',
                        fontWeight: '700'
                      }}>
                        <Ico as={Flame} size={14} style={{ color: currentStreak >= 3 ? '#ffffff' : '#f59e0b' }} />
                        {currentStreak} Streak!
                      </span>
                    )}
                  </div>
                {pastResponses.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                    No questions answered yet. Questions you answer will appear here.
                  </p>
                ) : (
                  <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
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
                              background: q.answered ? 'var(--tint-success-bg)' : (q.resultPending ? 'var(--tint-info-bg)' : 'var(--tint-danger-bg)'),
                              color: q.answered ? 'var(--tint-success-fg)' : (q.resultPending ? 'var(--tint-info-fg)' : 'var(--tint-danger-fg)'),
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {q.answered ? 'Answered' : (q.resultPending ? 'Live' : 'Missed')}
                            </span>
                            <span style={{
                              padding: '2px 10px',
                              background: 'var(--tint-info-bg)',
                              color: 'var(--tint-info-fg)',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {q.type}
                            </span>
                            <span style={{
                              padding: '2px 10px',
                              background: 'var(--tint-warn-bg)',
                              color: 'var(--tint-warn-fg)',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {q.resultPending ? '—' : (q.answered ? (q.pointsEarned || 0) : 0)}/{q.maxPoints || 100} pts
                            </span>
                          </div>
                          {/* Live poll: result withheld until the poll closes — show a neutral badge, never correct/incorrect. */}
                          {q.resultPending && q.answered && (
                            <span style={{
                              padding: '4px 12px',
                              background: 'var(--accent-solid)',
                              color: 'white',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              <Ico as={Hourglass} /> Answer submitted
                            </span>
                          )}
                          {!q.resultPending && q.answered && q.isCorrect && (
                            <span style={{
                              padding: '4px 12px',
                              background: 'var(--success-solid)',
                              color: 'white',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              <Ico as={Check} /> Correct (+{q.pointsEarned || 0})
                            </span>
                          )}
                          {!q.resultPending && q.answered && !q.isCorrect && (
                            <span style={{
                              padding: '4px 12px',
                              background: '#ef4444',
                              color: 'white',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              <Ico as={X} /> Incorrect (+{q.pointsEarned || 0})
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
                            const pending = !!q.resultPending
                            const isSelected = q.selectedOptions?.includes(optIdx)
                            const isCorrect = option.isCorrect
                            const letter = String.fromCharCode(65 + optIdx)

                            let bgColor = 'var(--bg-secondary)'
                            let borderColor = 'var(--border-color)'
                            let textColor = 'var(--text-primary)'
                            let letterBg = 'var(--border-color)'
                            let label = ''

                            if (pending) {
                              // Live poll: NEVER reveal the correct option. Only mark what the student
                              // picked, in blue — the correct/incorrect result comes after it closes.
                              if (q.answered && isSelected) {
                                bgColor = 'var(--tint-info-bg)'
                                borderColor = 'var(--tint-info-border)'
                                letterBg = 'var(--accent)'
                                // Theme-aware tint + matching text (pale + dark text in light mode,
                                // translucent + light text in dark mode).
                                textColor = 'var(--tint-info-fg)'
                                label = ' (Your answer)'
                              }
                            } else if (q.answered && isSelected && isCorrect) {
                              bgColor = 'var(--tint-success-bg)'
                              borderColor = 'var(--tint-success-border)'
                              letterBg = '#059669'
                              textColor = 'var(--tint-success-fg)'
                              label = ' (Your correct answer)'
                            } else if (q.answered && isSelected && !isCorrect) {
                              bgColor = 'var(--tint-danger-bg)'
                              borderColor = 'var(--tint-danger-border)'
                              textColor = 'var(--tint-danger-fg)'
                              label = ' (Your wrong answer)'
                            } else if (!q.answered && isCorrect) {
                              bgColor = 'var(--tint-success-bg)'
                              borderColor = 'var(--tint-success-border)'
                              letterBg = '#059669'
                              textColor = 'var(--tint-success-fg)'
                              label = ' (Correct answer)'
                            } else if (isCorrect) {
                              letterBg = '#059669'
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
                                  background: letterBg,
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
                        
                        {/* Live poll: result withheld until it closes. Otherwise, missed-question notice. */}
                        {q.resultPending && (
                          <p style={{ fontSize: '13px', color: 'var(--accent)', margin: 0, fontStyle: 'italic' }}>
                            <Ico as={Hourglass} /> Result will be shown once this poll closes
                          </p>
                        )}
                        {!q.resultPending && !q.answered && (
                          <p style={{ fontSize: '13px', color: 'var(--tint-danger-fg)', margin: 0, fontStyle: 'italic' }}>
                            <Ico as={TriangleAlert} /> You did not answer this question
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {pastResponses.length > 3 && (
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '36px', background: 'linear-gradient(to bottom, rgba(var(--bg-card-rgb), 0), rgba(var(--bg-card-rgb), 1))', pointerEvents: 'none', borderRadius: '0 0 12px 12px' }} />
                  )}
                  </div>
                )}
                </div>
                {/* Leaderboard - flexible width */}
                <div data-tour="leaderboard" style={{ flex: isMobile ? '1 1 100%' : '1 1 calc(30% - 10px)', minWidth: 0, maxWidth: '100%', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: isMobile ? '16px' : '24px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-color)', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
                    <Ico as={Trophy} style={{ color: '#f59e0b' }} /> Leaderboard
                  </h3>
                  <ErrorBoundary message="Leaderboard unavailable">
                    <Leaderboard roomId={room?._id} token={token} socket={socket} userId={user?._id} />
                  </ErrorBoundary>
                </div>
              </div>
            </div>
        </div>
      </div>

      {/* Floating Doubt Box Action Button (Always accessible) */}
      <button
        onClick={() => setShowDoubtBox(true)}
        title="Open Anonymous Doubt Box"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 90,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 18px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#ffffff',
          border: 'none',
          borderRadius: '30px',
          boxShadow: '0 4px 16px rgba(99, 102, 241, 0.45)',
          fontSize: '13.5px',
          fontWeight: '700',
          cursor: 'pointer'
        }}
      >
        <Ico as={MessageSquare} size={16} />
        <span>💬 Doubts</span>
      </button>

      {showDoubtBox && (
        <DoubtBoxModal
          roomId={room?._id}
          token={token}
          socket={socket}
          isTeacher={false}
          onClose={() => setShowDoubtBox(false)}
        />
      )}
    </div>
  )
}

export default StudentRoomPage