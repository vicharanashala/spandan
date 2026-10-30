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
import { Bell, Check, CircleCheck, Clapperboard, ClipboardList, Hourglass, Lightbulb, Mic, TriangleAlert, Trophy, X } from 'lucide-react'
import { Ico } from '../components/icons'

// Spread the ~N students' navigation to the results page over this window (ms). When a big room
// ends, all students receive room:ended at once; without a spread they'd all hit the results
// endpoints in the same instant (the end-session "results stampede"). Each student waits a random
// delay in [0, this) before navigating. Scoring is unaffected — the session is already over.
const RESULTS_NAV_JITTER_MS = 4000

// Join notice shown at the top of the session: on time (green), late (amber), very late (red).
// The text comes from the server (waitingRoom.joinNotification) so it always matches the room's rules.
const NOTICE_TONES = {
  on_time: { bg: 'var(--tint-success-bg)', fg: 'var(--tint-success-fg)', icon: CircleCheck, title: 'You joined on time' },
  late: { bg: 'var(--tint-warn-bg)', fg: 'var(--tint-warn-fg)', icon: TriangleAlert, title: 'You joined late' },
  very_late: { bg: 'var(--tint-danger-bg)', fg: 'var(--tint-danger-fg)', icon: TriangleAlert, title: 'You joined very late' }
}

function JoinNotice({ status, message, onDismiss }) {
  const tone = NOTICE_TONES[status]
  if (!tone || !message) return null
  const Icon = tone.icon
  return (
    <div role="status" style={{
      background: tone.bg, color: tone.fg, border: '1px solid color-mix(in srgb, currentColor 30%, transparent)',
      borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '14px'
    }}>
      <Icon size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>{tone.title}</div>
        <div style={{ lineHeight: 1.5 }}>{message}</div>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss notice" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

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
  // Waiting-room admission state. `admitted === false` means the student is in the lobby (viewers
  // channel) and must see a watch-only waiting screen rather than the live session. The server also
  // rejects their responses (403), so this is UI only — never the security boundary.
  // `watchOnly` marks a very-late arrival: admitted, but they see only the video (the server keeps
  // them on the viewers channel and refuses their answers/leaderboard reads).
  const [joinState, setJoinState] = useState({
    admitted: true,
    waitingRoom: false,
    watchOnly: false,
    admissionStatus: 'admitted',
    attendanceStatus: 'on_time',
    lateMinutes: 0,
    notification: '',
    attendance: null
  })
  const [lobby, setLobby] = useState({ participants: 0, waiting: 0 })
  // Mirrors joinState.admitted for socket callbacks created once (they'd otherwise close over a
  // stale value). Used to decide whether a room-end should navigate to results (admitted) or just
  // show "this room has ended" in the lobby (waiting/rejected — they have no results to view).
  const admittedRef = useRef(true)
  // Watch-only students have no results either, so a room end treats them like the lobby.
  useEffect(() => { admittedRef.current = joinState.admitted && !joinState.watchOnly }, [joinState.admitted, joinState.watchOnly])
  // The join notice (on time / late / very late) can be dismissed; a new notification shows again.
  const [noticeDismissed, setNoticeDismissed] = useState(false)
  useEffect(() => { setNoticeDismissed(false) }, [joinState.notification])
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [selectedOptions, setSelectedOptions] = useState([]) // Array for MSQ support
  const [submitted, setSubmitted] = useState(false)
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
    }

    // Waiting room: server pushes the student's admission state on their private channel.
    const handleWaiting = (data) => {
      setJoinState((prev) => ({
        ...prev,
        admitted: !!data?.admitted,
        waitingRoom: data?.waitingRoom !== false,
        watchOnly: !!data?.watchOnly,
        admissionStatus: data?.admissionStatus || 'waiting',
        attendanceStatus: data?.attendanceStatus || prev.attendanceStatus,
        notification: data?.notification || prev.notification
      }))
    }

    const handleLobby = (data) => {
      setLobby({ participants: data?.participants || 0, waiting: data?.waiting || 0 })
    }

    const handleAdmitted = (data) => {
      setJoinState((prev) => ({
        ...prev,
        admitted: true,
        waitingRoom: false,
        watchOnly: !!data?.watchOnly,
        admissionStatus: 'admitted',
        attendanceStatus: data?.attendanceStatus || prev.attendanceStatus,
        notification: data?.notification || 'You are now in the room.'
      }))
      // Re-emit room:join so the server relocates this socket from the viewers channel to the
      // participants channel (it alone decides the channel; this is just the trigger).
      if (room?.code && user?._id) joinRoom(room.code, user._id)
      if (!data?.watchOnly && room?._id && user?._id) fetchPastResponses(room._id, user._id)
    }

    const handleRejected = (data) => {
      setJoinState((prev) => ({
        ...prev,
        admitted: false,
        waitingRoom: true,
        admissionStatus: 'rejected',
        attendanceStatus: 'excused',
        notification: data?.notification || (data?.reason ? `Declined: ${data.reason}` : prev.notification)
      }))
    }

    socket.on('room:waiting', handleWaiting)
    socket.on('room:lobby', handleLobby)
    socket.on('room:admitted', handleAdmitted)
    socket.on('room:rejected', handleRejected)
    socket.on('question:started', handleQuestionStarted)
    socket.on('question:ended', handleQuestionEnded)
    socket.on('new_question', handleNewQuestion)
    socket.on('video:progress', handleVideoProgress)
    socket.on('video:pause', handleVideoPause)
    socket.on('video:resume', handleVideoResume)
    socket.on('questions:ready', handleQuestionsReady)
    socket.on('connect', handleReconnect)
    socket.on('room:ended', () => {
      // A student who was never admitted has no results to load; just tell them the room ended and
      // let them leave. Admitted students get the staggered results interstitial.
      if (!admittedRef.current) {
        setJoinState((prev) => ({ ...prev, notification: 'This room has ended.' }))
        return
      }
      // Show the interstitial immediately, but stagger the actual navigation across a jitter window
      // so all students don't hit the results endpoints in the same instant.
      setSessionEnded(true)
      const delay = Math.random() * RESULTS_NAV_JITTER_MS
      resultsNavTimerRef.current = setTimeout(() => {
        navigate(`/student/room/${room?._id}/results`)
      }, delay)
    })

    return () => {
      socket.off('room:waiting', handleWaiting)
      socket.off('room:lobby', handleLobby)
      socket.off('room:admitted', handleAdmitted)
      socket.off('room:rejected', handleRejected)
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
      const result = await joinRoomByCode(roomCode)
      const roomData = result.room
      setRoom(roomData)
      setJoinState({
        admitted: result.admitted,
        waitingRoom: result.waitingRoom,
        watchOnly: !!result.watchOnly,
        admissionStatus: result.admissionStatus,
        attendanceStatus: result.attendanceStatus,
        lateMinutes: result.lateMinutes,
        notification: result.notification,
        attendance: result.attendance
      })
      if (user?._id && socket) {
        // Join via socket - room:joined confirms the student was added to RoomMember. A waiting
        // student is accepted onto the viewers channel and receives room:waiting instead.
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.off('room:joined', handleRoomJoined)
            socket.off('room:waiting', handleRoomWaiting)
            // Still fetch even if timeout - RoomMember should already exist from HTTP join
            if (result.admitted && !result.watchOnly) fetchPastResponses(roomData._id, user._id)
            resolve()
          }, 3000)

          const handleRoomJoined = (data) => {
            if (data.roomCode === roomData.code) {
              clearTimeout(timeout)
              socket.off('room:joined', handleRoomJoined)
              socket.off('room:waiting', handleRoomWaiting)
              fetchPastResponses(roomData._id, user._id)
              resolve()
            }
          }
          // A waiting student never sees room:joined (they are not in the participants channel);
          // resolve on the lobby push instead so the loading spinner clears.
          const handleRoomWaiting = (data) => {
            if (data?.roomCode === roomData.code) {
              clearTimeout(timeout)
              socket.off('room:joined', handleRoomJoined)
              socket.off('room:waiting', handleRoomWaiting)
              resolve()
            }
          }
          socket.on('room:joined', handleRoomJoined)
          socket.on('room:waiting', handleRoomWaiting)
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

    // Client-side jitter: spread submissions across 0–2s so a synchronized classroom of 500+ does
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

  // Waiting room / rejected: watch-only lobby. The live session UI is never rendered until the
  // server admits this student (joinState.admitted). Polls/leaderboard are not subscribed to.
  if (joinState.waitingRoom && !joinState.admitted) {
    const rejected = joinState.admissionStatus === 'rejected'
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width, 240px)', minWidth: 0 }}>
          <PageHeader isMobile={isMobile} icon={Hourglass} eyebrow={rejected ? 'Not admitted' : 'Waiting room'} title={room.name} subtitle={<>Code <strong style={{ letterSpacing: '0.1em' }}>{room.code}</strong></>} />
          <div style={{ flex: 1, padding: isMobile ? '16px' : '32px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
            <div style={{
              background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-md)', padding: isMobile ? '28px 20px' : '40px', maxWidth: 520, width: '100%', textAlign: 'center'
            }}>
              <div style={{ width: 76, height: 76, margin: '0 auto 20px', borderRadius: '50%', background: rejected ? 'var(--tint-danger-bg)' : 'var(--tint-info-bg)', color: rejected ? 'var(--tint-danger-fg)' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {rejected ? <X size={36} aria-hidden="true" /> : <Hourglass size={36} aria-hidden="true" />}
              </div>
              <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 750, color: 'var(--text-primary)' }}>
                {rejected ? 'Your request was declined' : 'You are in the waiting room'}
              </h2>
              <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55 }}>
                {joinState.notification || (rejected
                  ? 'The teacher did not admit you to this session. You can leave this page.'
                  : 'Your teacher will admit you shortly. Keep this tab open — you will join automatically.')}
              </p>
              {!rejected && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 24, margin: '20px 0', padding: '16px 0', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{lobby.participants}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>in the room</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{lobby.waiting}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>waiting ahead</div>
                  </div>
                </div>
              )}
              {joinState.attendance?.currentLateStreak > 0 && (
                <p style={{ fontSize: 13, color: 'var(--tint-warn-fg)', margin: '0 0 16px' }}>
                  <Ico as={TriangleAlert} /> {joinState.attendance.currentLateStreak} consecutive late arrival(s) on record.
                </p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, color: isConnected ? '#10b981' : '#ef4444', fontSize: 13 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: isConnected ? '#10b981' : '#ef4444' }} />
                {isConnected ? 'Connected — listening for admission' : 'Reconnecting…'}
              </div>
              <button onClick={leaveSession} style={{ padding: '12px 24px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Leave
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Very late: admitted but watch-only. Only the video (and a notice) is rendered; polls, past
  // questions and the leaderboard are never mounted. The server enforces the same restriction.
  if (joinState.watchOnly) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif', width: '100vw', maxWidth: '100vw', overflowX: 'hidden' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width, 240px)', minWidth: 0, maxWidth: 'calc(100vw - var(--sidebar-width, 240px))', overflowX: 'hidden' }}>
          <PageHeader isMobile={isMobile} icon={Clapperboard} eyebrow="Watch only" title={room.name} subtitle={<>Code <strong style={{ letterSpacing: '0.1em' }}>{room.code}</strong></>} />
          <div style={{ flex: 1, padding: isMobile ? '16px' : '32px', width: '100%', boxSizing: 'border-box' }}>
            <JoinNotice status="very_late" message={joinState.notification || 'You joined very late, so you can only watch the video in this session.'} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button onClick={leaveSession} style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                Leave
              </button>
            </div>
            {isVideoMode && videoId ? (
              <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: isMobile ? '12px' : '16px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-color)' }}>
                <YouTubeVideo
                  videoId={videoId}
                  controls={true}
                  noForwardSeek={true}
                  seekCeilingRef={teacherVideoTimeRef}
                  capSuppressUntilRef={capSuppressUntilRef}
                  playerRef={studentPlayerRef}
                  onLiveStatus={setIsLiveStream}
                />
              </div>
            ) : (
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
                This session has no video to watch.
              </p>
            )}
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
          {!noticeDismissed && (
            <JoinNotice status={joinState.attendanceStatus} message={joinState.notification} onDismiss={() => setNoticeDismissed(true)} />
          )}
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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

              {/* Submit Button */}
              {submitted ? (
                <div style={{
                  textAlign: 'center',
                  padding: '20px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '12px'
                }}>
                  <p style={{ fontSize: '18px', fontWeight: '600' }}><Ico as={CircleCheck} /> Answer Submitted</p>
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
          )}

          {/* Waiting State (Show Passed Questions) — persistent: display-toggled, NOT unmounted, so the
              Leaderboard keeps its socket subscription and updates ONLY on the once-per-segment
              leaderboard:updated push, instead of re-fetching on every poll's remount. */}
          <div style={{ display: currentQuestion ? 'none' : 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Active question area placeholder — hidden in video mode (the player fills this space) */}
              {!isVideoMode && (
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
              )}

              {/* Past Questions (flex) + Leaderboard (flex) */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', width: '100%', boxSizing: 'border-box' }}>
                {/* Past Questions - flexible width */}
                <div data-tour="past-questions" style={{ flex: isMobile ? '1 1 100%' : '1 1 calc(70% - 8px)', minWidth: 0, maxWidth: '100%', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: isMobile ? '16px' : '24px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
                    <Ico as={ClipboardList} style={{ color: 'var(--accent)' }} /> Past Questions {pastResponses.length > 0 && `(${pastResponses.length})`}
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
    </div>
  )
}

export default StudentRoomPage