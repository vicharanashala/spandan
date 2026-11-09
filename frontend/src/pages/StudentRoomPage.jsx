import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
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
import useAttentionTracker from '../hooks/useAttentionTracker'
import { classApi } from '../lib/api'
import { API_URL } from '../config.js'
import { installUnlockOnInteraction, playStudentQuestion, unlockAudio } from '../lib/sounds'
import { Bell, Check, CircleCheck, Clapperboard, ClipboardList, Hourglass, Lightbulb, Mic, TriangleAlert, Trophy, X } from 'lucide-react'
import { Ico } from '../components/icons'

// Spread the ~N students' navigation to the results page over this window (ms). When a big room
// ends, all students receive room:ended at once; without a spread they'd all hit the results
// endpoints in the same instant (the end-session "results stampede"). Each student waits a random
// delay in [0, this) before navigating. Scoring is unaffected — the session is already over.
const RESULTS_NAV_JITTER_MS = 4000

// Teacher-facing wording for the reason a student's presence interval closed.
const AWAY_REASON_LABELS = {
  'tab-hidden': 'this tab is hidden',
  'window-blur': 'another window has focus',
  frozen: 'this tab stopped responding',
  untracked: 'Spandan could not confirm this tab was active',
  leave: 'you left the session',
  disconnect: 'the connection dropped',
  attention: 'the Spandan window lost focus'
}

const normalizeQuestionData = (data) => {
  if (!data) return null
  if (data.question && typeof data.question === 'object') {
    const inner = data.question
    return {
      ...inner,
      _id: inner._id || inner.id || data.questionId || data._id,
      question: typeof inner.question === 'string' ? inner.question : (inner.question?.question || inner.text || ''),
      options: inner.options || [],
      type: inner.type || data.type || 'MCQ',
      timeToAnswer: inner.timeToAnswer || data.timer || 30,
      timer: data.timer || inner.timeToAnswer || 30,
      startTime: data.startTime || Date.now()
    }
  }
  return {
    ...data,
    _id: data._id || data.id || data.questionId,
    question: typeof data.question === 'string' ? data.question : (data.question?.question || data.text || ''),
    options: data.options || [],
    type: data.type || 'MCQ',
    timeToAnswer: data.timeToAnswer || data.timer || 30,
    timer: data.timer || data.timeToAnswer || 30,
    startTime: data.startTime || Date.now()
  }
}

function StudentRoomPage() {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const { user, token, logout } = useAuthStore()
  const { socket, isConnected, joinRoom, leaveRoom } = useSocketStore()
  const { joinRoomByCode, setAuthToken } = useRoomStore()
  const isMobile = useIsMobile()
  const location = useLocation()

  const [room, setRoom] = useState(null)
  const [classCode, setClassCode] = useState(location.state?.classCode || '')
  const [className, setClassName] = useState(location.state?.className || '')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [selectedOptions, setSelectedOptions] = useState([]) // Array for MSQ support
  const [submitted, setSubmitted] = useState(false)
  // Set when POST /responses refuses an answer because the student was marked away. The optimistic
  // "submitted" lock is rolled back so they can answer again once presence reopens.
  const [awayAnswerRejected, setAwayAnswerRejected] = useState(false)
  const [hasAnsweredPoll, setHasAnsweredPoll] = useState(false) // Track if student has answered at least one poll
  const [timeLeft, setTimeLeft] = useState(0)
  const [results, setResults] = useState(null)
  // Past responses loaded from MongoDB - no sessionStorage needed
  const [pastResponses, setPastResponses] = useState([])
  const [sessionEnded, setSessionEnded] = useState(false) // room ended → show interstitial while we stagger navigation
  // Waiting-room state for this student: { enabled, mode, graceSeconds, status, onTime, joinedAt }.
  // When status is 'waiting' or 'rejected' the live session UI is replaced by a holding screen.
  const [waitingRoom, setWaitingRoom] = useState(null)
  const [waitNow, setWaitNow] = useState(() => Date.now())
  const refreshAfterAdmitRef = useRef(null)
  const timerIntervalRef = useRef(null)
  const resultsNavTimerRef = useRef(null)
  // The room this page actually joined, captured for leave cleanup. Keeping it in a ref lets the
  // unmount/navigation path emit `room:leave` with the CURRENT code, instead of the null `room` from
  // the join effect's first-render closure.
  const activeRoomRef = useRef(null)
  const leaveSentRef = useRef(false)

  // ── Attention tracking ───────────────────────────────────────────────────────────────────────
  // A room setting can switch this off (legacy rooms with no settings.attention are enabled). It is
  // suspended while the student is held in the waiting room or after the session has ended.
  const attentionConfig = room?.settings?.attention || {}
  const attentionEnabled = attentionConfig.enabled !== false
  const attentionGraceSeconds = Number.isFinite(Number(attentionConfig.graceSeconds))
    ? Number(attentionConfig.graceSeconds)
    : 7
  const heldByWaitingRoom = !!(waitingRoom?.enabled &&
    (waitingRoom.status === 'waiting' || waitingRoom.status === 'rejected'))
  const attention = useAttentionTracker({
    socket,
    roomCode: room?.code || roomCode,
    enabled: attentionEnabled && !heldByWaitingRoom && !sessionEnded,
    graceSeconds: attentionGraceSeconds
  })
  const answerLocked = attention.blocked
  const awayReasonLabel = AWAY_REASON_LABELS[attention.reason] || AWAY_REASON_LABELS.attention

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
  }, [token, socket])

  // Leave on unmount / room change using the values captured after the join completed. This is
  // separate from the join effect so a navigation cleanup never reads the stale `room` from the
  // first render (which used to skip `room:leave` entirely).
  useEffect(() => {
    if (!room?.code || !user?._id) {
      activeRoomRef.current = null
      return undefined
    }
    activeRoomRef.current = { roomCode: room.code, userId: user._id }
    leaveSentRef.current = false
    return () => {
      const active = activeRoomRef.current
      activeRoomRef.current = null
      if (!active || leaveSentRef.current) return
      leaveSentRef.current = true
      leaveRoom(active.roomCode, active.userId)
    }
  }, [room?.code, user?._id, leaveRoom])

  // Live countdown to the end of the on-time grace window while the student waits.
  useEffect(() => {
    if (!waitingRoom?.graceEndsAt) return undefined
    setWaitNow(Date.now())
    const id = setInterval(() => setWaitNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [waitingRoom?.graceEndsAt])

  const handleQuestionStarted = useCallback((data) => {
    if (!data) return
    const q = normalizeQuestionData(data)
    if (!q) return

    // Clear any existing timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    setCurrentQuestion(q)
    setSelectedOptions([])
    setSubmitted(false)
    setAwayAnswerRejected(false)

    let initialTime = q.timer || q.timeToAnswer || 30
    if (q.startTime && q.timer) {
      const elapsedSeconds = Math.floor((Date.now() - q.startTime) / 1000)
      if (elapsedSeconds > 0 && elapsedSeconds < q.timer) {
        initialTime = q.timer - elapsedSeconds
      } else if (elapsedSeconds >= q.timer) {
        initialTime = 1
      }
    }
    setTimeLeft(initialTime)

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
  }, [room?._id, user?._id])

  useEffect(() => {
    if (!socket) return

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
      handleQuestionStarted(question)
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

    // Waiting-room pushes arrive on the student's private user channel.
    const handleWaitingJoined = (data) => {
      setWaitingRoom(prev => ({
        ...(prev || {}),
        enabled: true,
        status: 'waiting',
        mode: data?.mode || prev?.mode || 'automatic',
        onTime: data?.onTime !== false,
        joinedAt: data?.joinedAt || prev?.joinedAt
      }))
    }
    const handleWaitingAdmitted = (data) => {
      setWaitingRoom(prev => ({ ...(prev || {}), status: 'admitted' }))
      // The server already moved this socket into the live room channel; pull the current question
      // and past responses so the live UI is ready the moment the holding screen disappears.
      refreshAfterAdmitRef.current?.(data)
    }
    const handleWaitingRejected = () => {
      setWaitingRoom(prev => ({ ...(prev || {}), status: 'rejected' }))
    }

    socket.on('question:started', handleQuestionStarted)
    socket.on('question:ended', handleQuestionEnded)
    socket.on('new_question', handleNewQuestion)
    socket.on('video:progress', handleVideoProgress)
    socket.on('video:pause', handleVideoPause)
    socket.on('video:resume', handleVideoResume)
    socket.on('questions:ready', handleQuestionsReady)
    socket.on('waiting:joined', handleWaitingJoined)
    socket.on('waiting:admitted', handleWaitingAdmitted)
    socket.on('waiting:rejected', handleWaitingRejected)
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
      socket.off('waiting:joined', handleWaitingJoined)
      socket.off('waiting:admitted', handleWaitingAdmitted)
      socket.off('waiting:rejected', handleWaitingRejected)
      socket.off('connect', handleReconnect)
      socket.off('room:ended')
      if (resultsNavTimerRef.current) clearTimeout(resultsNavTimerRef.current)
    }
  }, [socket, navigate, room?._id])

  const fetchActiveQuestionForRoom = async (roomId, currentQId) => {
    if (!roomId || !token) return null
    try {
      const qRes = await fetch(`${API_URL}/questions?roomId=${roomId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!qRes.ok) return null
      const qData = await qRes.json()
      const questions = qData.questions || []
      if (questions.length === 0) return null

      let targetQ = null
      if (currentQId) {
        targetQ = questions.find(q => String(q._id) === String(currentQId))
      }
      if (!targetQ && currentQId) {
        targetQ = questions[0]
      }
      if (!targetQ) return null

      if (targetQ.closeAt && new Date(targetQ.closeAt) <= new Date()) {
        return null
      }

      if (user?._id) {
        const rRes = await fetch(`${API_URL}/responses/room/${roomId}/student/${user._id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (rRes.ok) {
          const rData = await rRes.json()
          const answered = (rData.questions || []).some(
            p => String(p._id) === String(targetQ._id) && p.answered
          )
          if (answered) return null
        }
      }

      return targetQ
    } catch (err) {
      console.warn('[StudentRoom] Failed to recover active question:', err)
      return null
    }
  }

  const joinSession = async () => {
    setIsLoading(true)
    try {
      const roomData = await joinRoomByCode(roomCode)
      setRoom(roomData)
      const membership = roomData?.waitingRoom || null
      setWaitingRoom(membership)
      const isHeldByWaitingRoom = !!(membership?.enabled &&
        (membership.status === 'waiting' || membership.status === 'rejected'))
      // Extract class code/name from populated classId
      if (roomData?.classId) {
        if (typeof roomData.classId === 'object') {
          if (roomData.classId.code && !classCode) setClassCode(roomData.classId.code)
          if (roomData.classId.name && !className) setClassName(roomData.classId.name)
        } else if (typeof roomData.classId === 'string') {
          classApi.getById(roomData.classId).then(res => {
            if (res?.class?.code) setClassCode(res.class.code)
            if (res?.class?.name) setClassName(res.class.name)
          }).catch(() => {})
        }
      }

      // Late-join active question recovery: if the room already has a current/active question,
      // recover it and set it as currentQuestion with timer so the student can still answer.
      // Waiting/rejected students must not receive it.
      let activeQ = isHeldByWaitingRoom ? null : (roomData?.activeQuestion || null)
      if (!isHeldByWaitingRoom && !activeQ && (roomData?.currentQuestion || roomData?._id)) {
        activeQ = await fetchActiveQuestionForRoom(roomData._id, roomData.currentQuestion)
      }
      if (activeQ) {
        handleQuestionStarted(activeQ)
      }

      if (user?._id && socket) {
        // Join via socket - room:joined confirms the student was added to RoomMember. A waiting
        // student gets waiting:joined instead (they are held outside the live room channel).
        return new Promise((resolve) => {
          const finish = () => {
            clearTimeout(timeout)
            socket.off('room:joined', handleRoomJoined)
            socket.off('waiting:joined', handleRoomJoined)
            socket.off('waiting:rejected', handleRoomJoined)
          }
          const handleRoomJoined = (data) => {
            if (!data?.roomCode || data.roomCode === roomData.code) {
              finish()
              if (!isHeldByWaitingRoom && user?._id) {
                fetchPastResponses(roomData._id, user._id)
              }
              resolve()
            }
          }
          const timeout = setTimeout(() => {
            finish()
            // Still fetch even if timeout - RoomMember should already exist from HTTP join
            if (!isHeldByWaitingRoom) fetchPastResponses(roomData._id, user._id)
            resolve()
          }, 3000)

          socket.on('room:joined', handleRoomJoined)
          socket.on('waiting:joined', handleRoomJoined)
          socket.on('waiting:rejected', handleRoomJoined)
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

  // After the teacher admits this student, pull the full room state (active question + history) so
  // the live UI is ready as soon as the holding screen disappears. The socket was already moved into
  // the live room channel by the server when it emitted waiting:admitted.
  useEffect(() => {
    refreshAfterAdmitRef.current = async () => {
      try {
        const roomData = await joinRoomByCode(roomCode)
        setRoom(roomData)
        if (roomData?.waitingRoom) setWaitingRoom(roomData.waitingRoom)
        if (roomData?.activeQuestion) handleQuestionStarted(roomData.activeQuestion)
        if (user?._id) fetchPastResponses(roomData._id, user._id)
      } catch (err) {
        console.error('[StudentRoom] Failed to refresh after admission:', err)
      }
    }
    return () => { refreshAfterAdmitRef.current = null }
  }, [roomCode, user?._id, token])

  const handleSubmitAnswer = async () => {
    if (selectedOptions.length === 0 || submitted || !currentQuestion) return
    // While the window is away/unfocused the server has closed presence and would reject the
    // answer. Refuse locally too, so the student is never shown a false "submitted" state.
    if (attention.blocked) {
      setAwayAnswerRejected(true)
      return
    }

    const questionId = currentQuestion._id || currentQuestion.id || currentQuestion.questionId || currentQuestion.question?._id
    const tta = currentQuestion.timeToAnswer || currentQuestion.timer || 30
    // Freeze responseTime at CLICK time. Scoring is based on this value, NOT on when the request
    // is actually sent, so the send-jitter below can never change a student's points.
    const responseTime = tta - timeLeft
    const roomId = room?._id
    const studentId = user?._id
    const hadAnsweredPoll = hasAnsweredPoll

    // Lock the UI immediately so the student sees their answer registered and cannot double-submit,
    // even though the network POST itself is deferred by a small random delay.
    setSubmitted(true)
    setAwayAnswerRejected(false)
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

      // Presence closed between click and POST (tab hidden / window lost focus / another app took
      // focus). The answer was NOT recorded: roll back the optimistic lock so the student can answer
      // again after returning.
      if (saveResponse.status === 409 && saveData?.code === 'AWAY') {
        setSubmitted(false)
        setAwayAnswerRejected(true)
        setHasAnsweredPoll(hadAnsweredPoll)
        return
      }

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
    const active = activeRoomRef.current
    if (active) {
      leaveSentRef.current = true
      leaveRoom(active.roomCode, active.userId)
    } else if (room?.code && user?._id) {
      leaveSentRef.current = true
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

  if (waitingRoom?.enabled && waitingRoom.status === 'waiting') {
    const onTime = waitingRoom.onTime !== false
    const joinedLabel = waitingRoom.joinedAt
      ? new Date(waitingRoom.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'just now'
    const scheduledLabel = waitingRoom.scheduledAt
      ? new Date(waitingRoom.scheduledAt).toLocaleString([], {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
      : ''
    const graceLeftMs = waitingRoom.graceEndsAt
      ? new Date(waitingRoom.graceEndsAt).getTime() - waitNow
      : 0
    const graceOpen = graceLeftMs > 0
    const graceTotal = Math.max(0, Math.ceil(graceLeftMs / 1000))
    const graceLeftLabel = `${Math.floor(graceTotal / 60)}:${String(graceTotal % 60).padStart(2, '0')}`
    const allowanceSeconds = Math.max(0, Number(waitingRoom.reconnectAllowanceSeconds) || 0)
    const allowanceLabel = allowanceSeconds >= 60
      ? `${Math.floor(allowanceSeconds / 60)}m${allowanceSeconds % 60 ? ` ${allowanceSeconds % 60}s` : ''}`
      : `${allowanceSeconds}s`
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
      }}>
        <Sidebar user={user} />
        <div style={{
          flex: 1,
          marginLeft: 'var(--sidebar-width, 240px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobile ? '20px' : '32px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            maxWidth: 560,
            width: '100%',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 24,
            padding: isMobile ? '30px 20px' : '44px 40px',
            textAlign: 'center',
            boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 14px 36px rgba(16,24,40,0.08)'
          }}>
            <div style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              margin: '0 auto 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              color: 'var(--accent)'
            }}>
              <Hourglass size={36} />
            </div>
            <h1 style={{ margin: '0 0 10px', fontSize: isMobile ? 22 : 27, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
              You&apos;re in the waiting room
            </h1>
            <p style={{ margin: '0 auto 22px', maxWidth: 420, fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              We&apos;ve let the host know you&apos;re here. You&apos;ll be admitted shortly — please keep this tab open.
            </p>

            <div style={{
              display: 'inline-flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 14,
              background: 'var(--bg-secondary, var(--nav-hover))',
              border: '1px solid var(--border-color)',
              marginBottom: 20
            }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                background: onTime ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.14)',
                color: onTime ? '#059669' : '#b45309'
              }}>
                <CircleCheck size={13} /> {onTime ? 'On time' : 'Late'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {room?.name || 'Live session'} · joined {joinedLabel}
              </span>
            </div>

            {scheduledLabel && (
              <p style={{ margin: '0 auto 18px', fontSize: 13, color: 'var(--text-secondary)' }}>
                Class scheduled for <strong style={{ color: 'var(--text-primary)' }}>{scheduledLabel}</strong>
                {graceOpen
                  ? <> · grace closes in <strong style={{ color: '#047857' }}>{graceLeftLabel}</strong></>
                  : ' · grace window closed'}
              </p>
            )}

            {allowanceSeconds > 0 && (
              <p style={{ margin: '0 auto 18px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                If your connection drops, up to <strong style={{ color: 'var(--text-primary)' }}>{allowanceLabel}</strong> of missed time is excused automatically.
              </p>
            )}

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              fontSize: 13,
              color: 'var(--text-secondary)'
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--accent)',
                display: 'inline-block',
                animation: 'pulse 1.4s ease-in-out infinite'
              }} />
              Waiting for the host to admit you…
            </div>

            <button
              onClick={() => navigate('/student')}
              style={{
                marginTop: 24,
                padding: '10px 18px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 10,
                cursor: 'pointer',
                fontSize: 13.5
              }}
            >
              Leave waiting room
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (waitingRoom?.enabled && waitingRoom.status === 'rejected') {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
      }}>
        <Sidebar user={user} />
        <div style={{
          flex: 1,
          marginLeft: 'var(--sidebar-width, 240px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobile ? '20px' : '32px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            maxWidth: 520,
            width: '100%',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 24,
            padding: isMobile ? '30px 20px' : '44px 40px',
            textAlign: 'center',
            boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 14px 36px rgba(16,24,40,0.08)'
          }}>
            <div style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              margin: '0 auto 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(220,38,38,0.1)',
              color: '#dc2626'
            }}>
              <X size={36} />
            </div>
            <h1 style={{ margin: '0 0 10px', fontSize: isMobile ? 22 : 26, fontWeight: 800, color: 'var(--text-primary)' }}>
              The host didn&apos;t admit you
            </h1>
            <p style={{ margin: '0 auto 24px', maxWidth: 400, fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              Your request to join {room?.name ? `“${room.name}”` : 'this session'} was declined. Ask your teacher to let you in.
            </p>
            <button
              onClick={() => navigate('/student')}
              style={{
                padding: '12px 22px',
                background: 'var(--accent-solid)',
                color: 'white',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              Back to dashboard
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
        <PageHeader isMobile={isMobile} icon={room.settings?.mode === 'video' ? Clapperboard : Mic} eyebrow="Live session" title={room.name} subtitle={room?.classId ? (className ? <>Class <strong>{className}</strong>{classCode ? <> · Code <strong style={{ letterSpacing: '0.1em' }}>{classCode}</strong></> : null}</> : (classCode ? <>Class code <strong style={{ letterSpacing: '0.1em' }}>{classCode}</strong></> : <>Class session</>)) : (<>Code <strong style={{ letterSpacing: '0.1em' }}>{room.code}</strong></>)} />

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

          {/* Attention banner: the student is away (tab hidden / window unfocused) or returning. */}
          {attention.away && (
            <div role="alert" style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '12px 16px',
              marginBottom: '16px',
              borderRadius: 12,
              border: `1px solid ${attention.returning ? 'rgba(14,165,233,0.4)' : 'rgba(217,119,6,0.45)'}`,
              background: attention.returning ? 'rgba(14,165,233,0.1)' : 'rgba(245,158,11,0.12)',
              color: 'var(--text-primary)'
            }}>
              <span style={{ display: 'inline-flex', color: attention.returning ? '#0ea5e9' : '#b45309', flexShrink: 0, marginTop: 1 }}>
                <Ico as={TriangleAlert} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {attention.returning ? 'Welcome back — restoring your attendance…' : 'You are marked away'}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5 }}>
                  {attention.returning
                    ? 'Answers unlock as soon as the server confirms you are present again.'
                    : `Detected because ${awayReasonLabel}. This time counts against your absence budget, and poll answers are paused. Return to this tab to continue.`}
                </div>
              </div>
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
                {typeof currentQuestion.question === 'string'
                  ? currentQuestion.question
                  : (currentQuestion.question?.question || currentQuestion.text || '')}
              </h2>

              {/* Options */}
              {answerLocked && (
                <div role="status" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  marginBottom: '16px',
                  borderRadius: 10,
                  background: 'rgba(0,0,0,0.18)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  fontSize: 13,
                  fontWeight: 600
                }}>
                  <Ico as={TriangleAlert} />
                  {attention.returning
                    ? 'Reconnecting your attendance — answers unlock in a moment.'
                    : 'Answers are paused while you are away. Return to the Spandan window to answer.'}
                </div>
              )}
              <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
                {(currentQuestion.options || currentQuestion.question?.options || []).map((option, index) => {
                  const isMSQ = (currentQuestion.type || currentQuestion.question?.type) === 'MSQ'
                  const isSelected = isMSQ 
                    ? selectedOptions.includes(index)
                    : selectedOptions.length === 1 && selectedOptions[0] === index
                  const optionText = typeof option === 'string' ? option : option.text
                  const optionLabel = String.fromCharCode(65 + index)
                  
                  const handleOptionClick = () => {
                    if (submitted || answerLocked) return
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
                      disabled={submitted || answerLocked}
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
                        cursor: (submitted || answerLocked) ? 'default' : 'pointer',
                        opacity: answerLocked && !submitted ? 0.65 : 1,
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
                <>
                  {awayAnswerRejected && !answerLocked && (
                    <div role="alert" style={{
                      marginBottom: '12px',
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: 'rgba(220,38,38,0.18)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      fontSize: '13px',
                      fontWeight: 600
                    }}>
                      <Ico as={TriangleAlert} /> Your previous answer was not recorded because you were
                      away. Please answer again.
                    </div>
                  )}
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={selectedOptions.length === 0 || answerLocked}
                    style={{
                      width: '100%',
                      padding: '16px',
                      background: answerLocked
                        ? 'rgba(255,255,255,0.15)'
                        : (selectedOptions.length > 0 ? '#ffd700' : 'rgba(255,255,255,0.2)'),
                      color: answerLocked
                        ? 'rgba(255,255,255,0.65)'
                        : (selectedOptions.length > 0 ? '#1f2937' : 'rgba(255,255,255,0.5)'),
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '16px',
                      fontWeight: '600',
                      cursor: (selectedOptions.length > 0 && !answerLocked) ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {answerLocked ? 'Return to the Spandan window to answer' : 'Submit Answer'}
                  </button>
                </>
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