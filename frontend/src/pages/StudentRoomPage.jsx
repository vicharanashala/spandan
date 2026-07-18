import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import Leaderboard from '../components/Leaderboard'
import ConfettiEffect from '../components/ConfettiEffect'
import AchievementToast from '../components/AchievementToast'
import AnnouncementBanner from '../components/AnnouncementBanner'
import InstantPoll from '../components/InstantPoll'
import DifficultyRater from '../components/DifficultyRater'
import FloatingReactions from '../components/FloatingReactions'
import SessionNotepad from '../components/SessionNotepad'
import LiveQnABoard from '../components/LiveQnABoard'
import useSound from '../hooks/useSound'
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
  const activeQuestionIdRef = useRef(null) // track active question to exclude from past list

  // ── NEW: Gamification state ──
  const [streak, setStreak] = useState(0)              // current correct-answer streak
  const [totalPoints, setTotalPoints] = useState(0)    // accumulated session points
  const [showConfetti, setShowConfetti] = useState(false)
  const [pendingBadges, setPendingBadges] = useState([]) // badges to show in toast
  const [isPaused, setIsPaused] = useState(false)       // teacher paused the timer
  const [pausedTimeLeft, setPausedTimeLeft] = useState(0)
  const [revealedOptions, setRevealedOptions] = useState(null) // options with isCorrect shown
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState(null) // null | true | false
  const [answerCounts, setAnswerCounts] = useState({})  // questionId -> option counts array
  const firstRespondRef = useRef(false)                 // track first-to-answer badge

  // ── NEW: Communication features ──
  const [handRaised, setHandRaised] = useState(false)
  const [announcement, setAnnouncement] = useState(null) // { message, type }
  const [activeInstantPoll, setActiveInstantPoll] = useState(null) // { pollId, question, type }
  const [difficultyQId, setDifficultyQId] = useState(null) // show rater after answering

  // ── NEW: Reactions, Sound, Session Clock, Participant Count ──
  const [incomingReactions, setIncomingReactions] = useState([])  // for FloatingReactions
  const [soundOn, setSoundOn] = useState(localStorage.getItem('spandan_sound') !== 'off')
  const [sessionElapsed, setSessionElapsed] = useState(0)          // seconds since joined
  const [participantCount, setParticipantCount] = useState(1)      // live count in header
  const sessionStartRef = useRef(Date.now())
  const sound = useSound()

  // Session clock — counts up from the moment we join
  useEffect(() => {
    sessionStartRef.current = Date.now()
    const id = setInterval(() => {
      setSessionElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Keyboard shortcuts: 1-4 select option, Enter submits
  useEffect(() => {
    const handleKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (!currentQuestion || submitted) return
      const n = parseInt(e.key)
      if (!isNaN(n) && n >= 1 && n <= 4) {
        const idx = n - 1
        if (!currentQuestion.options?.[idx]) return
        const isMSQ = currentQuestion.type === 'MSQ'
        if (isMSQ) {
          setSelectedOptions(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])
        } else {
          setSelectedOptions([idx])
        }
      }
      if (e.key === 'Enter' && selectedOptions.length > 0 && !submitted) {
        handleSubmitAnswer()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentQuestion, submitted, selectedOptions])

  useEffect(() => {
    if (!token || !socket) return
    setAuthToken(token)
    joinSession()

    // Handle reconnections to auto-rejoin
    const handleConnect = () => {
      joinSession()
    }
    socket.on('connect', handleConnect)

    return () => {
      socket.off('connect', handleConnect)
      if (room?.code) leaveRoom(room.code, user._id)
    }
  }, [token, socket])

  // Reaction & Participant socket listeners
  useEffect(() => {
    if (!socket) return
    const handleReaction = (data) => setIncomingReactions(prev => [...prev, data])
    const handleParticipantCount = (count) => setParticipantCount(count)
    
    socket.on('reaction:received', handleReaction)
    socket.on('participant:count', handleParticipantCount)
    
    return () => {
      socket.off('reaction:received', handleReaction)
      socket.off('participant:count', handleParticipantCount)
    }
  }, [socket])

  useEffect(() => {
    if (!socket) return

    const handleQuestionStarted = (data) => {
      // Normalize: socket payload is { questionId, question: {...doc}, timer, startTime }
      // Extract the actual question doc so rendering works for both event shapes
      const questionDoc = (data.question && typeof data.question === 'object' && data.question.options)
        ? data.question
        : data
      
      const timeToAnswer = questionDoc.timeToAnswer || data.timer || 30
      const qId = questionDoc._id?.toString() || questionDoc.id?.toString()
      activeQuestionIdRef.current = qId // mark as active so it's excluded from past list

      setCurrentQuestion(questionDoc)
      setSelectedOptions([])
      setSubmitted(false)
      setTimeLeft(timeToAnswer)
      
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
            // Time expired - clear active marker then refresh from MongoDB
            activeQuestionIdRef.current = null
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
      
      // Clear active question marker, then fetch
      activeQuestionIdRef.current = null
      // Only fetch if room and user are available
      if (room?._id && user?._id) {
        fetchPastResponses(room._id, user._id)
      }
      setResults(data?.results || null)
      setCurrentQuestion(null)
    }

    const handleNewQuestion = (questionData) => {
      // Handle manually created questions from teacher
      // Normalize: may arrive as full question doc or wrapped object
      const questionDoc = (questionData && typeof questionData === 'object' && questionData.options)
        ? questionData
        : (questionData?.question && typeof questionData.question === 'object' && questionData.question.options)
          ? questionData.question
          : questionData

      const qId = questionDoc?._id?.toString() || questionDoc?.id?.toString()
      activeQuestionIdRef.current = qId // mark as active so it's excluded from past list

      // Clear any existing timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      
      setCurrentQuestion(questionDoc)
      setSelectedOptions([])
      setSubmitted(false)
      setTimeLeft(questionDoc?.timeToAnswer || 30)
      
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
            // Time expired - clear active marker then refresh from MongoDB
            activeQuestionIdRef.current = null
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

    // ── NEW: Pause / Resume ──
    const handlePaused = ({ timeLeft: tl }) => {
      setIsPaused(true)
      setPausedTimeLeft(tl)
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
    }
    const handleResumed = ({ timeLeft: tl }) => {
      setIsPaused(false)
      setTimeLeft(tl)
      // Restart timer from remaining time
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
            activeQuestionIdRef.current = null
            if (room?._id && user?._id) fetchPastResponses(room._id, user._id)
            setCurrentQuestion(null)
            return 0
          }
          if (prev <= 6) {
            sound.playTick()
          }
          return prev - 1
        })
      }, 1000)
    }

    // ── NEW: Skip ──
    const handleSkipped = () => {
      if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
      activeQuestionIdRef.current = null
      setCurrentQuestion(null)
      setIsPaused(false)
      setRevealedOptions(null)
      if (room?._id && user?._id) fetchPastResponses(room._id, user._id)
    }

    // ── NEW: Answer Reveal ──
    const handleAnswerRevealed = ({ options }) => {
      setRevealedOptions(options)
    }

    socket.on('question:started', handleQuestionStarted)
    socket.on('question:ended', handleQuestionEnded)
    socket.on('new_question', handleNewQuestion)
    socket.on('question:paused', handlePaused)
    socket.on('question:resumed', handleResumed)
    socket.on('question:skipped', handleSkipped)
    socket.on('answer:revealed', handleAnswerRevealed)

    // \u2500\u2500 NEW: Announcement from teacher \u2500\u2500
    const handleAnnouncement = ({ message, type }) => {
      setAnnouncement({ message, type })
    }

    // \u2500\u2500 NEW: Instant poll \u2500\u2500
    const handleInstantPollStarted = (poll) => setActiveInstantPoll(poll)
    const handleInstantPollEnded   = ()     => setActiveInstantPoll(null)

    const handleHandLowered = ({ userId }) => {
      if (userId === user?._id?.toString()) setHandRaised(false)
    }

    // ── NEW: Background Music ──
    const handleMusicState = ({ isPlaying }) => {
      sound.toggleBgMusic(isPlaying)
    }

    socket.on('announcement:received',  handleAnnouncement)
    socket.on('instant:poll:started',   handleInstantPollStarted)
    socket.on('instant:poll:ended',     handleInstantPollEnded)
    socket.on('hand:lowered',           handleHandLowered)
    socket.on('room:music:state',       handleMusicState)

    socket.on('room:ended', () => {
      navigate(`/student/review/${room?._id}`)
    })

    return () => {
      socket.off('question:started', handleQuestionStarted)
      socket.off('question:ended', handleQuestionEnded)
      socket.off('new_question', handleNewQuestion)
      socket.off('question:paused', handlePaused)
      socket.off('question:resumed', handleResumed)
      socket.off('question:skipped', handleSkipped)
      socket.off('answer:revealed', handleAnswerRevealed)
      socket.off('announcement:received', handleAnnouncement)
      socket.off('instant:poll:started', handleInstantPollStarted)
      socket.off('instant:poll:ended', handleInstantPollEnded)
      socket.off('hand:lowered', handleHandLowered)
      socket.off('room:music:state', handleMusicState)
      socket.off('room:ended')
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      sound.toggleBgMusic(false)
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
        const now = Date.now()
        const pastList = []
        let lateJoinQuestion = null
        let lateJoinTimeLeft = 0

        data.questions.forEach(q => {
          // Check if this unanswered question is still within its time window
          // (student joined while question was already active)
          if (!q.answered) {
            const createdAt = new Date(q.createdAt).getTime()
            const tta = q.timeToAnswer || 30
            const elapsedSeconds = (now - createdAt) / 1000
            const remaining = Math.floor(tta - elapsedSeconds)

            if (remaining > 0) {
              // Question is still live — show it as the active question
              console.log('[StudentRoom] Late-join: question still active,', remaining, 's remaining:', q.question)
              lateJoinQuestion = q
              lateJoinTimeLeft = remaining
              return // don't add to past list
            }
          }
          // Exclude whatever is currently being shown as the live question
          const activeId = activeQuestionIdRef.current
          if (activeId && String(q._id) === String(activeId)) return
          pastList.push(q)
        })

        // If we found a still-active question, display it live with remaining time
        if (lateJoinQuestion && !currentQuestion) {
          const qId = String(lateJoinQuestion._id)
          activeQuestionIdRef.current = qId
          setCurrentQuestion(lateJoinQuestion)
          setSelectedOptions([])
          setSubmitted(false)
          setTimeLeft(lateJoinTimeLeft)

          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
          }
          timerIntervalRef.current = setInterval(() => {
            setTimeLeft(prev => {
              if (prev <= 1) {
                clearInterval(timerIntervalRef.current)
                timerIntervalRef.current = null
                activeQuestionIdRef.current = null
                // Re-fetch to get final status
                fetchPastResponses(roomId, studentId)
                setCurrentQuestion(null)
                return 0
              }
              if (prev <= 6) {
                sound.playTick()
              }
              return prev - 1
            })
          }, 1000)
        }

        setPastResponses(pastList)
        if (pastList.some(q => q.answered)) {
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
      
      // Emit points:update for leaderboard broadcast
      if (saveData.success && saveData.response) {
        const isCorrect = saveData.response.isCorrect
        const pts       = saveData.response.points || 0

        socket.emit('points:update', {
          roomCode: room.code,
          questionId,
          studentId: user._id,
          points: pts,
          isCorrect
        })

        // ── Gamification: streak + badges + confetti ──
        setLastAnswerCorrect(isCorrect)
        setTotalPoints(p => p + pts)

        const newBadges = []
        if (isCorrect) {
          setStreak(prev => {
            const next = prev + 1
            if (next === 5) newBadges.push('streak5')
            else if (next === 3) newBadges.push('streak3')
            return next
          })
          // Confetti on correct answer
          setShowConfetti(true)
          setTimeout(() => setShowConfetti(false), 3000)
        } else {
          setStreak(0)
        }

        // Perfect-score badge (only if first question answered and correct)
        if (isCorrect && pts >= (currentQuestion?.points || 10)) newBadges.push('perfect')

        // First-responder badge (only once per question)
        if (!firstRespondRef.current) {
          newBadges.push('firstBlood')
          firstRespondRef.current = true
        }

        if (newBadges.length) {
          setPendingBadges(newBadges)
          sound.playSuccess()
        } else if (isCorrect) {
          sound.playCorrect()
        } else {
          sound.playWrong()
        }


        // ── Emit live analytics for teacher ──
        const curCounts = { ...(answerCounts[questionId] || {}) }
        selectedOptions.forEach(idx => { curCounts[idx] = (curCounts[idx] || 0) + 1 })
        setAnswerCounts(prev => ({ ...prev, [questionId]: curCounts }))
        socket.emit('analytics:response', {
          roomCode: room.code,
          questionId,
          optionIndex: selectedOptions[0],
          counts: Object.values(curCounts),
        })
      }
    } catch (err) {
      console.error('Failed to save response:', err)
    }

    // Emit via socket
    socket.emit('response:submit', {
      roomCode: room.code,
      questionId,
      studentId: user._id,
      selectedOptions,
      responseTime
    })
    
    // Set submitted immediately
    activeQuestionIdRef.current = null
    setSubmitted(true)
    setHasAnsweredPoll(true)
    // Show difficulty rater after submitting
    setDifficultyQId(questionId)
    if (room?._id && user?._id) {
      fetchPastResponses(room._id, user._id)
    }
  }

  const leaveSession = () => {
    if (room?.code) leaveRoom(room.code, user._id)
    navigate('/student')
  }

  // Raise hand toggle
  const toggleHand = () => {
    if (!socket || !room) return
    if (handRaised) {
      socket.emit('hand:lower', { roomCode: room.code, userId: user._id })
      setHandRaised(false)
    } else {
      socket.emit('raise:hand', { roomCode: room.code, userId: user._id, userName: user.name || user.email })
      setHandRaised(true)
    }
  }

  // Instant poll vote
  const handlePollVote = (pollId, value) => {
    if (!socket || !room) return
    socket.emit('instant:poll:response', { roomCode: room.code, pollId, userId: user._id, value })
  }

  // Difficulty feedback
  const handleDifficultyRate = (questionId, rating) => {
    if (!socket || !room) return
    socket.emit('difficulty:feedback', { roomCode: room.code, questionId, userId: user._id, rating })
  }

  // Send emoji reaction
  const sendReaction = (emoji) => {
    if (!socket || !room) return
    socket.emit('reaction:send', { roomCode: room.code, userId: user._id, userName: user.name || user.email, emoji })
  }

  // Sound toggle
  const toggleSound = () => {
    const next = sound.toggle()
    setSoundOn(next)
  }

  // Format session elapsed time as mm:ss
  const formatElapsed = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // Urgency states for the live question timer
  const isUrgent = timeLeft <= 5 && timeLeft > 0 && !!currentQuestion
  const isWarning = timeLeft <= 10 && timeLeft > 5 && !!currentQuestion
  const timerGradient = isUrgent
    ? 'linear-gradient(135deg,#7f1d1d,#dc2626)'
    : isWarning
      ? 'linear-gradient(135deg,#78350f,#d97706)'
      : 'linear-gradient(135deg,#4c1d95,#7c3aed)'

  // Stats derived from past responses
  const answeredCount = pastResponses.filter(q => q.answered).length
  const totalPast = pastResponses.length
  const correctCount = pastResponses.filter(q => q.answered && q.isCorrect).length

  const S = {
    page: { display:'flex', minHeight:'100vh', background:'var(--bg-primary)', fontFamily:'"Segoe UI",system-ui,sans-serif', width:'100vw', maxWidth:'100vw', overflowX:'hidden' },
    main: { flex:1, display:'flex', flexDirection:'column', marginLeft:'240px', minWidth:0, maxWidth:'calc(100vw - 240px)', overflowX:'hidden' },
    content: { flex:1, padding:'24px 32px', width:'100%', boxSizing:'border-box', overflowX:'hidden' },
  }

  if (isLoading) return (
    <div style={S.page}>
      <Sidebar user={user} />
      <div style={{flex:1,marginLeft:'240px',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{textAlign:'center'}}>
          <div style={{width:'52px',height:'52px',border:'4px solid var(--border-color)',borderTopColor:'#7c3aed',borderRadius:'50%',animation:'spin 0.9s linear infinite',margin:'0 auto 20px'}} />
          <p style={{color:'var(--text-secondary)',fontSize:'15px',fontWeight:'500'}}>Joining classroom session…</p>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!room) return (
    <div style={S.page}>
      <Sidebar user={user} />
      <div style={{flex:1,marginLeft:'240px',padding:'40px',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{background:'var(--bg-card)',borderRadius:'20px',padding:'40px',border:'1px solid var(--border-color)',textAlign:'center',maxWidth:'420px',width:'100%'}}>
          <div style={{fontSize:'52px',marginBottom:'16px'}}>⚠️</div>
          <h2 style={{color:'var(--text-primary)',fontSize:'20px',fontWeight:'700',marginBottom:'8px'}}>{error || 'Could not join session'}</h2>
          <p style={{color:'var(--text-secondary)',fontSize:'14px',marginBottom:'24px'}}>Please check the room code and try again.</p>
          <button onClick={()=>navigate('/student')} style={{padding:'12px 28px',background:'linear-gradient(135deg,#7c3aed,#a855f7)',color:'white',border:'none',borderRadius:'12px',cursor:'pointer',fontWeight:'700',fontSize:'14px'}}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={S.page}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes popIn{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.04)}100%{transform:scale(1);opacity:1}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .opt-btn{transition:transform .18s,box-shadow .18s,background .18s,border-color .18s}
        .opt-btn:hover:not(:disabled){transform:translateX(5px);box-shadow:0 4px 16px rgba(124,58,237,.15)}
        .sub-btn{transition:transform .18s,filter .18s}
        .sub-btn:not(:disabled):hover{transform:scale(1.02);filter:brightness(1.08)}
      `}</style>

      {/* ── Overlays ── */}
      <ConfettiEffect trigger={showConfetti} duration={2800} />
      <AchievementToast badges={pendingBadges} onDone={() => setPendingBadges([])} />

      <Sidebar user={user} />

      <div style={S.main}>
        {/* ── Header ── */}
        <header style={{background:'linear-gradient(135deg,#1e1b4b 0%,#312e81 55%,#4c1d95 100%)',color:'white',padding:'14px 32px',boxShadow:'0 4px 24px rgba(0,0,0,.25)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
              {/* Session clock */}
              <div style={{
                background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)',
                borderRadius: '10px', padding: '5px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}>
                <span style={{fontSize:'9px',opacity:.5,fontWeight:'700',letterSpacing:'.8px',textTransform:'uppercase'}}>Session</span>
                <span style={{fontSize:'15px',fontWeight:'900',letterSpacing:'1px',fontVariantNumeric:'tabular-nums'}}>{formatElapsed(sessionElapsed)}</span>
              </div>
              
              {/* Participant Count */}
              <div style={{
                background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)',
                borderRadius: '10px', padding: '5px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center',
              }} title="Live Participants">
                <span style={{fontSize:'9px',opacity:.5,fontWeight:'700',letterSpacing:'.8px',textTransform:'uppercase'}}>Live</span>
                <span style={{fontSize:'15px',fontWeight:'900',letterSpacing:'1px',display:'flex',alignItems:'center',gap:'4px'}}>
                  👥 {participantCount}
                </span>
              </div>
              <div>
                <h1 style={{margin:0,fontSize:'20px',fontWeight:'700',letterSpacing:'-.3px'}}>📚 {room.name}</h1>
                <div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'3px'}}>
                  <span style={{fontSize:'11px',opacity:.65}}>Room</span>
                  <span style={{background:'rgba(255,255,255,.14)',padding:'1px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:'700',letterSpacing:'2px'}}>{room.code}</span>
                </div>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              {/* Streak chip */}
              {streak >= 2 && (
                <span style={{background:'rgba(249,115,22,.2)',border:'1px solid rgba(249,115,22,.4)',borderRadius:'20px',padding:'3px 10px',fontSize:'11px',fontWeight:'700',color:'#fdba74'}}>
                  🔥 ×{streak}
                </span>
              )}
              {/* Session points */}
              {totalPoints > 0 && (
                <span style={{background:'rgba(124,58,237,.2)',border:'1px solid rgba(124,58,237,.35)',borderRadius:'20px',padding:'3px 10px',fontSize:'11px',fontWeight:'700',color:'#c4b5fd'}}>
                  ⭐ {totalPoints} pts
                </span>
              )}
              {totalPast > 0 && <>
                <span style={{background:'rgba(16,185,129,.2)',border:'1px solid rgba(16,185,129,.35)',borderRadius:'20px',padding:'3px 10px',fontSize:'11px',fontWeight:'700',color:'#6ee7b7'}}>✓ {correctCount} Correct</span>
                <span style={{background:'rgba(239,68,68,.2)',border:'1px solid rgba(239,68,68,.35)',borderRadius:'20px',padding:'3px 10px',fontSize:'11px',fontWeight:'700',color:'#fca5a5'}}>✗ {totalPast-answeredCount} Missed</span>
              </>}
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <div style={S.content}>

          {/* ── ALERT: Disconnected ── */}
          {!isConnected && (
            <div style={{background:'linear-gradient(135deg,#7f1d1d,#991b1b)',border:'1px solid #ef4444',borderRadius:'12px',padding:'13px 20px',marginBottom:'14px',display:'flex',alignItems:'center',gap:'12px',animation:'slideDown .3s ease',boxShadow:'0 4px 20px rgba(239,68,68,.3)'}}>
              <span style={{fontSize:'20px',animation:'pulse 1s infinite'}}>🔴</span>
              <div>
                <p style={{margin:0,color:'#fecaca',fontWeight:'700',fontSize:'14px'}}>Connection Lost — Reconnecting…</p>
                <p style={{margin:'2px 0 0',color:'#fca5a5',fontSize:'12px'}}>Your answers may not save until reconnected. Please wait.</p>
              </div>
            </div>
          )}

          {/* ── ALERT: Urgency (≤5s) ── */}
          {isUrgent && (
            <div style={{background:'linear-gradient(135deg,#7f1d1d,#dc2626)',border:'2px solid #ef4444',borderRadius:'12px',padding:'11px 20px',marginBottom:'14px',display:'flex',alignItems:'center',gap:'12px',animation:'slideDown .3s ease',boxShadow:'0 4px 24px rgba(239,68,68,.4)'}}>
              <span style={{fontSize:'22px',animation:'pulse .5s infinite'}}>⏰</span>
              <p style={{margin:0,color:'white',fontWeight:'700',fontSize:'15px'}}>Hurry! Only {timeLeft} second{timeLeft!==1?'s':''} left!</p>
            </div>
          )}

          {/* ── ALERT: Warning (≤10s) ── */}
          {isWarning && (
            <div style={{background:'linear-gradient(135deg,#78350f,#92400e)',border:'1px solid #f59e0b',borderRadius:'12px',padding:'11px 20px',marginBottom:'14px',display:'flex',alignItems:'center',gap:'12px',animation:'slideDown .3s ease'}}>
              <span style={{fontSize:'20px'}}>⚠️</span>
              <p style={{margin:0,color:'#fcd34d',fontWeight:'700',fontSize:'14px'}}>Less than 10 seconds remaining — choose quickly!</p>
            </div>
          )}

          {/* ── Status Bar ── */}
          <div style={{background:'var(--bg-card)',borderRadius:'14px',padding:'11px 20px',border:'1px solid var(--border-color)',marginBottom:'20px',display:'flex',alignItems:'center',justifyContent:'space-between',boxShadow:'var(--card-shadow)'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <div style={{width:'9px',height:'9px',borderRadius:'50%',background:isConnected?'#10b981':'#ef4444',boxShadow:isConnected?'0 0 7px #10b981':'0 0 7px #ef4444',animation:isConnected?'none':'pulse 1.2s infinite'}} />
              <span style={{color:'var(--text-primary)',fontSize:'13px',fontWeight:'600'}}>{isConnected?'Live Session':'Reconnecting…'}</span>
              {currentQuestion && <span style={{background:'rgba(124,58,237,.12)',border:'1px solid rgba(124,58,237,.25)',color:'#a78bfa',padding:'2px 10px',borderRadius:'20px',fontSize:'11px',fontWeight:'700'}}>QUESTION ACTIVE</span>}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              {totalPast>0 && <div style={{background:'var(--bg-primary)',border:'1px solid var(--border-color)',borderRadius:'20px',padding:'3px 12px',fontSize:'12px',fontWeight:'600',color:'var(--text-secondary)'}}>Q {answeredCount}/{totalPast} answered</div>}
              {/* Raise Hand Button */}
              <button
                onClick={toggleHand}
                title={handRaised ? 'Lower your hand' : 'Raise your hand to ask a question'}
                style={{
                  padding:'6px 14px', borderRadius:'8px', fontSize:'12px', fontWeight:'700', cursor:'pointer', transition:'all .2s',
                  background: handRaised ? 'linear-gradient(135deg,#d97706,#f59e0b)' : 'var(--bg-hover)',
                  color: handRaised ? 'white' : 'var(--text-secondary)',
                  border: handRaised ? 'none' : '1px solid var(--border-color)',
                  boxShadow: handRaised ? '0 4px 14px rgba(245,158,11,.35)' : 'none',
                  animation: handRaised ? 'pulse 1.5s infinite' : 'none',
                }}
              >
                {handRaised ? '✋ Raised!' : '✋ Raise Hand'}
              </button>
              <button
                onClick={leaveSession}
                disabled={hasAnsweredPoll}
                title={hasAnsweredPoll?'Locked in — you answered a question':'Leave this session'}
                style={{padding:'6px 16px',background:hasAnsweredPoll?'transparent':'linear-gradient(135deg,#ef4444,#dc2626)',color:hasAnsweredPoll?'var(--text-secondary)':'white',border:hasAnsweredPoll?'1px solid var(--border-color)':'none',borderRadius:'8px',fontSize:'12px',fontWeight:'700',cursor:hasAnsweredPoll?'not-allowed':'pointer',opacity:hasAnsweredPoll?.5:1,transition:'all .2s'}}
              >
                {hasAnsweredPoll?'Locked In':'← Leave'}
              </button>
            </div>
          </div>

          {/* ── ALERT: Teacher Paused ── */}
          {isPaused && (
            <div style={{background:'linear-gradient(135deg,#1e3a5f,#1d4ed8)',border:'1px solid #3b82f6',borderRadius:'12px',padding:'13px 20px',marginBottom:'14px',display:'flex',alignItems:'center',gap:'12px',animation:'slideDown .3s ease'}}>
              <span style={{fontSize:'22px'}}>⏸️</span>
              <div>
                <p style={{margin:0,color:'#93c5fd',fontWeight:'700',fontSize:'14px'}}>Teacher paused the timer</p>
                <p style={{margin:'2px 0 0',color:'#bfdbfe',fontSize:'12px'}}>Time is frozen at {pausedTimeLeft}s. Sit tight!</p>
              </div>
            </div>
          )}

          {/* ── ALERT: Answer Revealed ── */}
          {revealedOptions && (
            <div style={{background:'linear-gradient(135deg,#064e3b,#065f46)',border:'1px solid #10b981',borderRadius:'12px',padding:'13px 20px',marginBottom:'14px',display:'flex',alignItems:'center',gap:'12px',animation:'slideDown .3s ease'}}>
              <span style={{fontSize:'22px'}}>👁️</span>
              <p style={{margin:0,color:'#6ee7b7',fontWeight:'700',fontSize:'14px'}}>Teacher revealed the correct answer!</p>
            </div>
          )}

          {/* ── Announcement Banner ── */}
          <AnnouncementBanner
            message={announcement?.message}
            type={announcement?.type}
            onDismiss={() => setAnnouncement(null)}
          />

          {/* ── Instant Poll widget ── */}
          {activeInstantPoll && (
            <InstantPoll poll={activeInstantPoll} onVote={handlePollVote} />
          )}

          {/* ── INFO: Locked in ── */}
          {hasAnsweredPoll && !currentQuestion && (
            <div style={{background:'rgba(59,130,246,.08)',border:'1px solid #3b82f6',borderRadius:'12px',padding:'11px 20px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'10px',animation:'slideDown .3s ease'}}>
              <span style={{fontSize:'16px'}}>ℹ️</span>
              <p style={{margin:0,color:'#93c5fd',fontSize:'13px',fontWeight:'500'}}>You've answered a question — your session is locked in. You can view results below but cannot leave.</p>
            </div>
          )}

          {/* ══════════ LIVE QUESTION PANEL ══════════ */}
          {currentQuestion ? (
            <div style={{background:timerGradient,borderRadius:'20px',padding:'32px',color:'white',boxShadow:isUrgent?'0 0 0 4px rgba(239,68,68,.3),0 20px 60px rgba(239,68,68,.35)':'0 20px 60px rgba(124,58,237,.3)',animation:'popIn .4s ease',position:'relative',overflow:'hidden'}}>
              {/* Decorative circles */}
              <div style={{position:'absolute',top:'-50px',right:'-50px',width:'200px',height:'200px',borderRadius:'50%',background:'rgba(255,255,255,.04)',pointerEvents:'none'}} />
              <div style={{position:'absolute',bottom:'-70px',left:'-40px',width:'240px',height:'240px',borderRadius:'50%',background:'rgba(255,255,255,.03)',pointerEvents:'none'}} />

              {/* Type + Points row */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'22px',position:'relative'}}>
                <span style={{background:'rgba(255,255,255,.18)',padding:'4px 14px',borderRadius:'20px',fontSize:'11px',fontWeight:'700',letterSpacing:'1px'}}>
                  {currentQuestion.type==='MCQ'?'🔵 MULTIPLE CHOICE':currentQuestion.type==='TF'?'⚖️ TRUE / FALSE':'🟣 MULTI-SELECT'}
                </span>
                {currentQuestion.points && (
                  <span style={{background:'rgba(255,215,0,.22)',border:'1px solid rgba(255,215,0,.45)',padding:'4px 14px',borderRadius:'20px',fontSize:'11px',fontWeight:'700',color:'#ffd700'}}>
                    🏆 {currentQuestion.points} pts
                  </span>
                )}
              </div>

              {/* SVG Timer Ring */}
              <div style={{textAlign:'center',marginBottom:'26px',position:'relative'}}>
                <div style={{display:'inline-block',position:'relative'}}>
                  <svg width="108" height="108" viewBox="0 0 108 108">
                    <circle cx="54" cy="54" r="44" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="8"/>
                    <circle cx="54" cy="54" r="44" fill="none"
                      stroke={isUrgent?'#fca5a5':isWarning?'#fcd34d':'rgba(255,255,255,.75)'}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray="276"
                      strokeDashoffset={276-(276*timeLeft/(currentQuestion.timeToAnswer||30))}
                      style={{transform:'rotate(-90deg)',transformOrigin:'54px 54px',transition:'stroke-dashoffset .95s linear,stroke .4s'}}
                    />
                  </svg>
                  <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center'}}>
                    <div style={{fontSize:'28px',fontWeight:'800',color:isUrgent?'#fca5a5':'white',animation:isUrgent?'pulse .5s infinite':'none',lineHeight:1}}>{timeLeft}</div>
                    <div style={{fontSize:'9px',opacity:.65,marginTop:'2px'}}>SEC</div>
                  </div>
                </div>
              </div>

              {/* Question Text */}
              <h2 style={{fontSize:'22px',fontWeight:'700',textAlign:'center',marginBottom:'24px',lineHeight:1.45,position:'relative'}}>{currentQuestion.question}</h2>

              {/* MSQ hint */}
              {currentQuestion.type==='MSQ' && !submitted && (
                <div style={{background:'rgba(255,255,255,.12)',border:'1px solid rgba(255,255,255,.22)',borderRadius:'8px',padding:'8px 14px',marginBottom:'16px',fontSize:'12px',textAlign:'center',color:'rgba(255,255,255,.85)'}}>
                  ℹ️ Select ALL correct options before submitting
                </div>
              )}

              {/* Options */}
              <div style={{display:'flex',flexDirection:'column',gap:'10px',marginBottom:'22px',position:'relative'}}>
                {currentQuestion.options && currentQuestion.options.map((option,index) => {
                  const isMSQ = currentQuestion.type==='MSQ'
                  const isSelected = isMSQ ? selectedOptions.includes(index) : selectedOptions.length===1&&selectedOptions[0]===index
                  const optionText = typeof option==='string'?option:option.text
                  const optionLabel = String.fromCharCode(65+index)
                  const handleOptionClick = () => {
                    if(submitted) return
                    if(isMSQ) setSelectedOptions(prev=>prev.includes(index)?prev.filter(i=>i!==index):[...prev,index])
                    else setSelectedOptions([index])
                  }
                  return (
                    <button key={index} className="opt-btn" onClick={handleOptionClick} disabled={submitted} style={{padding:'15px 20px',background:isSelected?'rgba(255,255,255,.28)':submitted?'rgba(255,255,255,.07)':'rgba(255,255,255,.1)',border:`2px solid ${isSelected?'#ffd700':'rgba(255,255,255,.2)'}`,borderRadius:'12px',color:'white',fontSize:'16px',textAlign:'left',cursor:submitted?'default':'pointer',display:'flex',alignItems:'center',gap:'14px',backdropFilter:'blur(3px)',boxShadow:isSelected?'0 4px 20px rgba(255,215,0,.2)':'none'}}>
                      {isMSQ && <span style={{width:'22px',height:'22px',borderRadius:'6px',flexShrink:0,background:isSelected?'#ffd700':'transparent',border:`2px solid ${isSelected?'#ffd700':'rgba(255,255,255,.4)'}`,display:'flex',alignItems:'center',justifyContent:'center',color:isSelected?'#1f2937':'white',fontSize:'12px',fontWeight:'700'}}>{isSelected?'✓':''}</span>}
                      <span style={{width:'32px',height:'32px',borderRadius:'50%',flexShrink:0,background:isSelected?'#ffd700':'rgba(255,255,255,.2)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'800',color:isSelected?'#1f2937':'white',fontSize:'13px',transition:'all .2s'}}>{optionLabel}</span>
                      <span style={{fontWeight:isSelected?'600':'400'}}>{optionText}</span>
                      {isSelected && <span style={{marginLeft:'auto',fontSize:'16px'}}>✓</span>}
                    </button>
                  )
                })}
              </div>

              {/* Submit / Submitted */}
              {submitted ? (
                <div>
                  <div style={{textAlign:'center',padding:'22px',background:'rgba(16,185,129,.22)',border:'2px solid rgba(16,185,129,.45)',borderRadius:'14px',animation:'popIn .4s ease'}}>
                    <div style={{fontSize:'30px',marginBottom:'8px'}}>✅</div>
                    <p style={{fontSize:'18px',fontWeight:'700',margin:'0 0 4px'}}>Answer Submitted!</p>
                    <p style={{fontSize:'13px',opacity:.82,margin:0}}>Waiting for the next question…</p>
                  </div>
                  {/* Difficulty Rater */}
                  <DifficultyRater
                    questionId={difficultyQId}
                    onRate={handleDifficultyRate}
                    onDismiss={() => setDifficultyQId(null)}
                  />
                </div>
              ) : (
                <button className="sub-btn" onClick={handleSubmitAnswer} disabled={selectedOptions.length===0} style={{width:'100%',padding:'16px',background:selectedOptions.length>0?'linear-gradient(135deg,#ffd700,#f59e0b)':'rgba(255,255,255,.14)',color:selectedOptions.length>0?'#1f2937':'rgba(255,255,255,.35)',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'700',cursor:selectedOptions.length>0?'pointer':'not-allowed',boxShadow:selectedOptions.length>0?'0 6px 24px rgba(255,215,0,.3)':'none'}}>
                  {selectedOptions.length>0?'Submit Answer':'Select an option to submit'}
                </button>
              )}
            </div>

          ) : (
            /* ══════════ WAITING STATE ══════════ */
            <div style={{display:'flex',flexDirection:'column',gap:'20px',animation:'fadeIn .4s ease'}}>

              {/* Waiting card */}
              <div style={{background:'var(--bg-card)',borderRadius:'20px',padding:'40px',boxShadow:'var(--card-shadow)',border:'1px solid var(--border-color)',textAlign:'center',position:'relative',overflow:'hidden'}}>
                <div style={{position:'absolute',top:0,left:0,right:0,height:'4px',background:'linear-gradient(90deg,#7c3aed,#a855f7,#ec4899)',borderRadius:'20px 20px 0 0'}} />
                <div style={{width:'76px',height:'76px',background:'linear-gradient(135deg,#ede9fe,#ddd6fe)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 18px',fontSize:'34px',boxShadow:'0 8px 24px rgba(124,58,237,.12)'}}>⏳</div>
                <h2 style={{fontSize:'21px',fontWeight:'700',color:'var(--text-primary)',marginBottom:'8px'}}>Waiting for Next Question</h2>
                <p style={{color:'var(--text-secondary)',fontSize:'14px',margin:'0 auto',maxWidth:'340px'}}>Your teacher will launch a poll soon. Stay focused!</p>
                {totalPast>0 && (
                  <div style={{display:'flex',gap:'10px',justifyContent:'center',marginTop:'20px',flexWrap:'wrap'}}>
                    <div style={{background:'#d1fae5',borderRadius:'12px',padding:'9px 16px',fontSize:'13px',fontWeight:'700',color:'#065f46'}}>✅ {correctCount} Correct</div>
                    <div style={{background:'#fee2e2',borderRadius:'12px',padding:'9px 16px',fontSize:'13px',fontWeight:'700',color:'#991b1b'}}>❌ {totalPast-answeredCount} Missed</div>
                    <div style={{background:'#eff6ff',borderRadius:'12px',padding:'9px 16px',fontSize:'13px',fontWeight:'700',color:'#1e40af'}}>📝 {totalPast} Total</div>
                  </div>
                )}
              </div>

              {/* Past Questions + Leaderboard */}
              <div style={{display:'flex',gap:'16px',flexWrap:'wrap',width:'100%',boxSizing:'border-box'}}>

                {/* Past Questions */}
                <div style={{flex:'1 1 calc(65% - 8px)',minWidth:'300px',maxWidth:'100%',background:'var(--bg-card)',borderRadius:'16px',padding:'24px',boxShadow:'var(--card-shadow)',border:'1px solid var(--border-color)',boxSizing:'border-box'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'20px'}}>
                    <span style={{fontSize:'18px'}}>📋</span>
                    <h3 style={{fontSize:'16px',fontWeight:'700',color:'var(--text-primary)',margin:0}}>Past Questions</h3>
                    {pastResponses.length>0 && <span style={{background:'linear-gradient(135deg,#7c3aed,#a855f7)',color:'white',borderRadius:'20px',padding:'2px 10px',fontSize:'11px',fontWeight:'700'}}>{pastResponses.length}</span>}
                  </div>

                  {pastResponses.length===0 ? (
                    <div style={{textAlign:'center',padding:'32px 0'}}>
                      <div style={{fontSize:'38px',marginBottom:'10px'}}>🎯</div>
                      <p style={{color:'var(--text-secondary)',fontSize:'14px'}}>No questions yet — answered questions will appear here.</p>
                    </div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                      {pastResponses.map((q,index) => (
                        <div key={`past-${index}`} style={{padding:'16px',background:q.answered?(q.isCorrect?'linear-gradient(135deg,#f0fdf4,#dcfce7)':'linear-gradient(135deg,#fffbeb,#fef3c7)'):'linear-gradient(135deg,#fef2f2,#fee2e2)',borderRadius:'14px',border:`2px solid ${q.answered?(q.isCorrect?'#86efac':'#fcd34d'):'#fca5a5'}`,animation:'slideDown .3s ease'}}>
                          {/* Badge row */}
                          <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'10px',flexWrap:'wrap'}}>
                            <span style={{padding:'3px 10px',background:q.answered?(q.isCorrect?'#16a34a':'#d97706'):'#dc2626',color:'white',borderRadius:'20px',fontSize:'10px',fontWeight:'700'}}>
                              {q.answered?(q.isCorrect?'✓ Correct':'✗ Incorrect'):'⚠ Missed'}
                            </span>
                            <span style={{padding:'3px 10px',background:'#eff6ff',color:'#1d4ed8',borderRadius:'20px',fontSize:'10px',fontWeight:'700'}}>{q.type}</span>
                            <span style={{padding:'3px 10px',background:'#fef3c7',color:'#92400e',borderRadius:'20px',fontSize:'10px',fontWeight:'700'}}>🏆 {q.answered?(q.pointsEarned||0):0}/{q.maxPoints||100} pts</span>
                          </div>
                          {/* Question text */}
                          <p style={{fontSize:'14px',fontWeight:'600',color:'#1f2937',margin:'0 0 12px',lineHeight:1.5}}>{q.question||'Question'}</p>
                          {/* Options */}
                          <div style={{display:'flex',flexDirection:'column',gap:'5px',marginBottom:q.answered?'0':'10px'}}>
                            {(q.options||[]).map((option,optIdx)=>{
                              const isSelected = q.selectedOptions?.includes(optIdx)
                              const isCorrect = option.isCorrect
                              const letter = String.fromCharCode(65+optIdx)
                              let bg='#f3f4f6',border='#e5e7eb',label=''
                              if(q.answered&&isSelected&&isCorrect){bg='#d1fae5';border='#059669';label='✓ Your correct answer'}
                              else if(q.answered&&isSelected&&!isCorrect){bg='#fee2e2';border='#dc2626';label='✗ Your wrong answer'}
                              else if(isCorrect&&!q.answered){bg='#d1fae5';border='#059669';label='Correct answer'}
                              else if(isCorrect){bg='#d1fae5';border='#059669'}
                              return (
                                <div key={optIdx} style={{padding:'9px 13px',background:bg,border:`2px solid ${border}`,borderRadius:'8px',display:'flex',alignItems:'center',gap:'10px'}}>
                                  <span style={{width:'24px',height:'24px',borderRadius:'50%',background:isCorrect?'#059669':'#9ca3af',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'700',fontSize:'11px',flexShrink:0}}>{letter}</span>
                                  <span style={{fontSize:'13px',color:'#374151',fontWeight:isCorrect?'600':'400',flex:1}}>{option.text||option}</span>
                                  {label && <span style={{fontSize:'10px',fontWeight:'700',color:label.startsWith('✓')?'#059669':label.startsWith('✗')?'#dc2626':'#059669',whiteSpace:'nowrap'}}>{label}</span>}
                                </div>
                              )
                            })}
                          </div>
                          {/* Missed notice */}
                          {!q.answered && (
                            <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:'8px',padding:'7px 12px',display:'flex',alignItems:'center',gap:'8px'}}>
                              <span style={{fontSize:'13px'}}>⚠️</span>
                              <p style={{fontSize:'12px',color:'#dc2626',margin:0,fontWeight:'600'}}>You did not answer this question in time.</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Leaderboard */}
                <div style={{flex:'1 1 calc(35% - 10px)',minWidth:'260px',maxWidth:'100%',background:'var(--bg-card)',borderRadius:'16px',padding:'24px',boxShadow:'var(--card-shadow)',border:'1px solid var(--border-color)',boxSizing:'border-box',overflow:'hidden'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'20px'}}>
                    <span style={{fontSize:'18px'}}>🏆</span>
                    <h3 style={{fontSize:'16px',fontWeight:'700',color:'var(--text-primary)',margin:0}}>Leaderboard</h3>
                  </div>
                  <Leaderboard roomId={room?._id} token={token} socket={socket} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Floating Notepad */}
      <SessionNotepad roomCode={room.code} />
      {/* ── NEW: Live Q&A Board ── */}
      <LiveQnABoard socket={socket} roomCode={room?.code} isTeacher={false} userName={user?.name || 'Student'} />

    </div>
  )
}

export default StudentRoomPage