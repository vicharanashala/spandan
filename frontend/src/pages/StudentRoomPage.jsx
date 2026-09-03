import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import Leaderboard from '../components/Leaderboard'
import ErrorBoundary from '../components/ErrorBoundary'
import YouTubeVideo, { extractYouTubeId } from '../components/YouTubeVideo'
import useIsMobile from '../hooks/useIsMobile'
import { API_URL } from '../config.js'

// Spread the ~N students' navigation to the results page over this window (ms). When a
// big room ends, all students receive room:ended at once; without a spread they'd all
// hit the results endpoints in the same instant (the end-session "results stampede").
// Each student waits a random delay in [0, this) before navigating. Scoring is
// unaffected — the session is already over.
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
  const [hasAnsweredPoll, setHasAnsweredPoll] = useState(false) // Track if student has answered at least one poll
  const [timeLeft, setTimeLeft] = useState(0)
  const [results, setResults] = useState(null)
  // Past responses loaded from MongoDB - no sessionStorage needed
  const [pastResponses, setPastResponses] = useState([])
  const [sessionEnded, setSessionEnded] = useState(false) // room ended â†’ show interstitial while we wait for the results page
  const [pendingQuestionId, setPendingQuestionId] = useState(null)
  // --- Academic Integrity States ---
  const [isLockedInFullscreen, setIsLockedInFullscreen] = useState(false)
  const [hasOpenedQuestion, setHasOpenedQuestion] = useState(false)
  const [infractionPoints, setInfractionPoints] = useState(0) // Dynamic student infraction counter
  const [isFullscreenUnsupported, setFullscreenUnsupported] = useState(false)
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
      setCurrentQuestion(data)
      setSelectedOptions([])
      setSubmitted(false)
      setInfractionPoints(0)
      setHasAnsweredPoll(true)

      const tta = data.question?.timeToAnswer || data.timer || 30
      const endTime = Date.now() + (tta * 1000)
      setTimeLeft(tta)

      // Clear any existing timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }

      // Wall-clock calculation prevents background tab sleep / interval lag
      timerIntervalRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
        setTimeLeft(remaining)
        if (remaining <= 0) {
          clearInterval(timerIntervalRef.current)
          timerIntervalRef.current = null
        }
      }, 250)
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
      setPendingQuestionId(null)
      setResults(data?.results || null)
      setCurrentQuestion(null)
    }

    const handleNewQuestion = (question) => {
      setCurrentQuestion(question)
      setSelectedOptions([])
      setSubmitted(false)
      setInfractionPoints(0)
      setHasAnsweredPoll(true)

      const tta = question.timeToAnswer || 30
      const endTime = Date.now() + (tta * 1000)
      setTimeLeft(tta)

      // Clear any existing timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }

      // Wall-clock calculation prevents background tab sleep / interval lag
      timerIntervalRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
        setTimeLeft(remaining)
        if (remaining <= 0) {
          clearInterval(timerIntervalRef.current)
          timerIntervalRef.current = null
        }
      }, 250)
    }

    // Self-heal after a socket reconnect: the store re-joins the room automatically, but a
    // question pushed WHILE we were briefly disconnected would have been missed. Re-pull the
    // room's questions so any missed one surfaces without the student manually refreshing.
    const handleReconnect = () => {
      if (room?._id && user?._id) {
        fetchPastResponses(room._id, user._id)
      }
    }

    // Real-Time Sync: Dynamically update local room settings when the teacher updates them [10]
    const handleRoomUpdated = (updatedRoom) => {
      console.log('Room settings updated via socket:', updatedRoom)
      if (updatedRoom) {
        setRoom(prev => {
          if (prev && prev._id === updatedRoom._id) {
            return { ...prev, ...updatedRoom }
          }
          return prev
        })
      }
    }

    const handleVideoProgress = (data) => {
      const t = Number(data?.time)
      if (!Number.isFinite(t)) return
      teacherVideoTimeRef.current = { time: t, playing: !!data?.playing, at: performance.now() }
    }

    const handleVideoPause = () => setTeacherVideoPaused(true)
    const handleVideoResume = () => setTeacherVideoPaused(false)

    socket.on('question:started', handleQuestionStarted)
    socket.on('question:ended', handleQuestionEnded)
    socket.on('new_question', handleNewQuestion)
    socket.on('video:progress', handleVideoProgress)
    socket.on('video:pause', handleVideoPause)
    socket.on('video:resume', handleVideoResume)
    socket.on('connect', handleReconnect)
    socket.on('room:updated', handleRoomUpdated)
    socket.on('room:ended', () => {
      setSessionEnded(true)
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
      setIsLockedInFullscreen(false)
      setFullscreenUnsupported(false)
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
      socket.off('connect', handleReconnect)
      socket.off('room:updated', handleRoomUpdated)
      socket.off('room:ended')
      if (resultsNavTimerRef.current) {
        clearTimeout(resultsNavTimerRef.current)
      }
    }
  }, [socket, navigate, room?._id])

  // Correctly placed at the root level of the functional component:
  useEffect(() => {
    if (timeLeft === 0 && currentQuestion) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      // Time expired - refresh from MongoDB only if room/user available
      if (room?._id && user?._id) {
        fetchPastResponses(room._id, user._id)
      }
      setPendingQuestionId(null)
      setCurrentQuestion(null)
    }
  }, [timeLeft, currentQuestion, room?._id, user?._id])

  useEffect(() => {
    const antiCheat = room?.settings?.enableAntiCheat || false

    if (!antiCheat) {
      setIsLockedInFullscreen(true)
      setHasOpenedQuestion(true)
    } else {
      const isCurrentlyFullscreen = !!document.fullscreenElement
      // If already fullscreen or Safe View device, stay unlocked seamlessly
      if (isCurrentlyFullscreen || isFullscreenUnsupported) {
        setIsLockedInFullscreen(true)
        setHasOpenedQuestion(true)
      } else {
        setIsLockedInFullscreen(false)
        setHasOpenedQuestion(false)
      }
    }
  }, [
    room?.settings?.enableAntiCheat,
    isFullscreenUnsupported,
    currentQuestion?._id || currentQuestion
  ])

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

  const sendTelemetry = async (eventType) => {
    if (!room?._id || !currentQuestion) return
    const qId = currentQuestion._id || currentQuestion.question?._id
    if (!qId) return

    try {
      await fetch(`${API_URL}/responses/telemetry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: room._id,
          questionId: qId,
          eventType
        })
      })
    } catch (err) {
      console.error('Failed to send telemetry:', err)
    }
  }

  // Fullscreen and split-screen telemetry monitoring stays active after fullscreen exit once the
  // student has opened the question.
  useEffect(() => {
    const isAntiCheatEnabled = room?.settings?.enableAntiCheat || false
    if (!isAntiCheatEnabled || !currentQuestion || !hasOpenedQuestion || submitted) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        console.log('[TELEMETRY] Tab switch detected — 100% penalty applied')
        setInfractionPoints(10.0) // Instant 10.0 points (100% penalty)
        sendTelemetry('visibilitychange')
      }
    }

    const handleFullscreenChange = () => {
      if (!isFullscreenUnsupported && !document.fullscreenElement) {
        console.log('[TELEMETRY] Fullscreen exit detected')
        setInfractionPoints(prev => Math.min(10.0, prev + 1.0)) // Cap at 10.0
        sendTelemetry('fullscreenchange')
        setIsLockedInFullscreen(false) // Drops user to the re-entry gate
      }
    }

    const handleBlur = () => {
      const screenWidth = window.screen?.availWidth || window.screen?.width || window.innerWidth
      const windowWidth = window.outerWidth || window.innerWidth
      if (!document.fullscreenElement && windowWidth < screenWidth * 0.6) {
        console.log('[TELEMETRY] Split-screen blur detected — 100% max penalty applied')
        setInfractionPoints(10.0) // Instant 10.0 points (100% penalty)
        sendTelemetry('blur')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      window.removeEventListener('blur', handleBlur)
    }
  }, [
    currentQuestion,
    hasOpenedQuestion,
    submitted,
    room?._id,
    room?.settings?.enableAntiCheat,
    isFullscreenUnsupported
  ])

  const handleSubmitAnswer = async () => {
    if (selectedOptions.length === 0 || submitted || !currentQuestion) return

    const questionId = currentQuestion._id || currentQuestion.question?._id
    const tta = currentQuestion.timeToAnswer || 30
    // Freeze responseTime at CLICK time. Scoring is based on this value, NOT on when the request
    // is actually sent, so the send-jitter below can never change a student's points.
    const responseTime = tta - timeLeft
    const roomId = room?._id
    const studentId = user?._id

    // Lock the UI immediately so the student sees their answer registered and cannot double-submit,
    // even though the network POST itself is deferred by a small random delay.
    setSubmitted(true)
    setHasAnsweredPoll(true) // Prevent accidental leave after answering
    setPendingQuestionId(questionId)

    // Client-side jitter: spread submissions across 0â€“2s so a synchronized classroom of 500+ does
    // not all hit POST /responses in the same instant. A simultaneous burst saturates the 2-core
    // event loop and starves the next question's broadcast (the missed-poll root cause); smearing
    // the sends flattens that peak. responseTime is already frozen above, so points are unaffected.
    const jitterMs = Math.floor(Math.random() * 2000)

    console.log('[StudentRoom] Submitting answer:', {
      questionId, roomId, studentId, selectedOptions, timeToAnswer: tta, timeLeft, responseTime, jitterMs
    })

    if (jitterMs > 0) await new Promise(resolve => setTimeout(resolve, jitterMs))

    // Save to MongoDB
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
          responseTime
        })
      })
      const saveData = await saveResponse.json()
      console.log('[StudentRoom] Response saved:', saveData)

      // Phase 1: the server emits the throttled leaderboard/answer-count updates itself from this
      // authenticated POST — the client no longer emits points:update / response:submit. The
      // leaderboard (incl. this student's own row) refreshes once per segment, not per submit.
    } catch (err) {
      console.error('Failed to save response:', err)
    }

    if (roomId && studentId) {
      fetchPastResponses(roomId, studentId)
    }

  }

  const leaveSession = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
    setIsLockedInFullscreen(false)
    setFullscreenUnsupported(false)
    if (room?.code) {
      leaveRoom(room.code, user._id)
    }
    navigate('/student')
  }

  const isAntiCheatEnabled = room?.settings?.enableAntiCheat || false

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
              borderTopColor: '#3b82f6',
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
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: isMobile ? '20px 16px' : '24px 32px',
          paddingLeft: isMobile ? '64px' : '32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
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
        <div style={{ flex: 1, padding: isMobile ? '16px' : '32px', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
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
              title={hasAnsweredPoll ? 'You cannot leave after a poll has started' : 'Leave the session'}
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

          {/* Video (video mode) — persistent so it doesn't remount when questions come/go.
              Hidden (not unmounted) while a question is live so the poll takes over like normal mode. */}
          {isVideoMode && videoId && (
            <div style={{
              visibility: currentQuestion ? 'hidden' : 'visible',
              position: currentQuestion ? 'absolute' : 'static',
              pointerEvents: currentQuestion ? 'none' : 'auto',
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
            isAntiCheatEnabled && !isLockedInFullscreen && !submitted ? (
              <div style={{
                background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
                borderRadius: '16px',
                padding: '40px 32px',
                color: 'white',
                textAlign: 'center',
                boxShadow: 'var(--shadow-md)',
                border: '1px solid var(--border-color)',
                animation: 'fadeInUp 0.4s ease-out'
              }}>
                <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>🔒</span>
                <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '12px' }}>Secure Quiz Mode Active</h2>
                <p style={{ fontSize: '15px', opacity: 0.9, marginBottom: '24px', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto', lineHeight: '1.6' }}>
                  To view and answer this question, you must enter secure fullscreen mode. Exiting fullscreen, switching tabs, or clicking out of focus will log violations.
                </p>
                <button
                  onClick={async () => {
                    try {
                      const docEl = document.documentElement
                      const requestMethod = docEl.requestFullscreen ||
                                            docEl.webkitRequestFullscreen ||
                                            docEl.mozRequestFullScreen ||
                                            docEl.msRequestFullscreen
                      
                      if (requestMethod) {
                        await requestMethod.call(docEl)
                        setIsLockedInFullscreen(true)
                        setFullscreenUnsupported(false)
                        setHasOpenedQuestion(true) // Mark question as opened
                      } else {
                        throw new Error('Fullscreen API not supported on this browser')
                      }
                    } catch (err) {
                      console.warn('Fullscreen request failed or unsupported:', err)
                      setFullscreenUnsupported(true)
                      setIsLockedInFullscreen(true)
                      setHasOpenedQuestion(true) // Mark question as opened in Safe View
                      sendTelemetry('fullscreen_unsupported')
                    }
                  }}
                  style={{
                    padding: '14px 28px',
                    background: '#ffd700',
                    color: '#1f2937',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(255, 215, 0, 0.4)'
                  }}
                >
                  Start Question in Fullscreen
                </button>
              </div>
            ) : (
              <div
                onCopy={(e) => { if (isAntiCheatEnabled) e.preventDefault() }}
                onCut={(e) => { if (isAntiCheatEnabled) e.preventDefault() }}
                onContextMenu={(e) => { if (isAntiCheatEnabled) e.preventDefault() }}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                  borderRadius: 'var(--radius-lg)',
                  padding: isMobile ? '20px 16px' : '32px',
                  color: 'white',
                  boxShadow: '0 10px 40px rgba(124, 58, 237, 0.3)',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  userSelect: isAntiCheatEnabled ? 'none' : 'auto',
                  WebkitUserSelect: isAntiCheatEnabled ? 'none' : 'auto',
                  MozUserSelect: isAntiCheatEnabled ? 'none' : 'auto',
                  msUserSelect: isAntiCheatEnabled ? 'none' : 'auto'
                }}>
                {/* Real-Time Proctor Warning Banner */}
                {isAntiCheatEnabled && (infractionPoints > 0 || isFullscreenUnsupported) && !submitted && (
                  <div style={{
                    background: infractionPoints >= 10.0 ? 'rgba(239, 68, 68, 0.95)' :
                                infractionPoints >= 5.0 ? 'rgba(249, 115, 22, 0.95)' :
                                infractionPoints > 0 ? 'rgba(234, 179, 8, 0.95)' :
                                isFullscreenUnsupported ? 'rgba(59, 130, 246, 0.9)' :
                                'rgba(255, 255, 255, 0.15)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    marginBottom: '20px',
                    fontSize: '13px',
                    color: 'white',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    textAlign: 'left',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ fontWeight: '700', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{isFullscreenUnsupported && infractionPoints === 0 ? '🔒 SAFE VIEW FALLBACK' : '⚠️ SECURITY ALERT'}</span>
                      <span>Infraction Score: {Math.round(infractionPoints)} / 10 ({Math.min(100, Math.round(infractionPoints * 10))}% Penalty)</span>
                    </div>
                    <p style={{ margin: 0, opacity: 0.9, lineHeight: '1.4' }}>
                      {isFullscreenUnsupported && infractionPoints === 0 ? (
                        <span>Native fullscreen is unsupported on this device. Standard layout Safe View is active. Tab-switch monitoring remains fully operational.</span>
                      ) : infractionPoints >= 10.0 ? (
                        <strong>CRITICAL: 100% score penalty will be applied to this question (Tab Switch / Split Screen / Max Exits Detected).</strong>
                      ) : (
                        <strong>WARNING: {Math.round(infractionPoints * 10)}% score penalty will be applied to this question ({Math.round(infractionPoints)} fullscreen exit{Math.round(infractionPoints) === 1 ? '' : 's'}).</strong>
                      )}
                    </p>
                  </div>
                )}

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
                        setSelectedOptions(prev => 
                          prev.includes(index) 
                            ? prev.filter(i => i !== index)
                            : [...prev, index]
                        )
                      } else {
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
            )
          )}

          {/* Waiting State (Show Passed Questions) — persistent: display-toggled, NOT unmounted, so the
              Leaderboard keeps its socket subscription and updates ONLY on the once-per-segment
              leaderboard:updated push, instead of re-fetching on every poll's remount. */}
          <div style={{ display: currentQuestion ? 'none' : 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Active question area placeholder — hidden in video mode (the player fills this space) */}
              {!isVideoMode && (
              <div style={{
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
              )}

              {/* Past Questions (flex) + Leaderboard (flex) */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', width: '100%', boxSizing: 'border-box' }}>
                {/* Past Questions - flexible width */}
                <div style={{ flex: isMobile ? '1 1 100%' : '1 1 calc(70% - 8px)', minWidth: 0, maxWidth: '100%', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: isMobile ? '16px' : '24px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
                    📋 Past Questions {pastResponses.length > 0 && `(${pastResponses.length})`}
                  </h3>
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
                              background: q.answered ? '#d1fae5' : (q.resultPending ? '#eff6ff' : '#fee2e2'),
                              color: q.answered ? '#059669' : (q.resultPending ? '#3b82f6' : '#dc2626'),
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {q.answered ? 'Answered' : (q.resultPending ? 'Live' : 'Missed')}
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
                              {q.resultPending ? '—' : (q.answered ? (q.pointsEarned || 0) : 0)}/{q.maxPoints || 100} pts
                            </span>
                          </div>
                          {/* Live poll: result withheld until the poll closes — show a neutral badge, never correct/incorrect. */}
                          {q.resultPending && q.answered && (
                            <span style={{
                              padding: '4px 12px',
                              background: '#3b82f6',
                              color: 'white',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              ⏳ Answer submitted
                            </span>
                          )}
                          {!q.resultPending && q.answered && q.isCorrect && (
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
                          {!q.resultPending && q.answered && !q.isCorrect && (
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
                                bgColor = '#eff6ff'
                                borderColor = '#3b82f6'
                                letterBg = '#3b82f6'
                                // The highlight bg is a fixed light pastel, so text must be a dark
                                // accent (not var(--text-primary), which is white in dark mode and
                                // would wash out over the pastel). Mirrors the teacher side.
                                textColor = '#1e40af'
                                label = ' (Your answer)'
                              }
                            } else if (q.answered && isSelected && isCorrect) {
                              bgColor = '#d1fae5'
                              borderColor = '#059669'
                              letterBg = '#059669'
                              textColor = '#065f46'
                              label = ' (Your correct answer)'
                            } else if (q.answered && isSelected && !isCorrect) {
                              bgColor = '#fee2e2'
                              borderColor = '#dc2626'
                              textColor = '#991b1b'
                              label = ' (Your wrong answer)'
                            } else if (!q.answered && isCorrect) {
                              bgColor = '#d1fae5'
                              borderColor = '#059669'
                              letterBg = '#059669'
                              textColor = '#065f46'
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
                                fontSize: '13px',
                                color: 'var(--text-secondary)'
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
                          <p style={{ fontSize: '13px', color: '#3b82f6', margin: 0, fontStyle: 'italic' }}>
                            ⏳ Result will be shown once this poll closes
                          </p>
                        )}
                        {!q.resultPending && !q.answered && (
                          <p style={{ fontSize: '13px', color: '#dc2626', margin: 0, fontStyle: 'italic' }}>
                            ⚠️ You did not answer this question
                          </p>
                        )}
                        {!q.resultPending && q.answered && !q.isCorrect && q.explanation && (
                          <div style={{
                            marginTop: '12px',
                            padding: '12px 14px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            fontSize: '13px',
                            color: 'var(--text-secondary)'
                          }}>
                            <strong style={{ color: 'var(--text-primary)' }}>Why:</strong> {q.explanation}
                          </div>
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
                <div style={{ flex: isMobile ? '1 1 100%' : '1 1 calc(30% - 10px)', minWidth: 0, maxWidth: '100%', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: isMobile ? '16px' : '24px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-color)', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
                    🏆 Leaderboard
                  </h3>
                  <ErrorBoundary message="Leaderboard unavailable">
                    <Leaderboard roomId={room?._id} token={token} socket={socket} userId={user?._id} />
                  </ErrorBoundary>
                </div>
              </div>
            </div>
        </div>
      </div>
    </div>
  )
}

export default StudentRoomPage
