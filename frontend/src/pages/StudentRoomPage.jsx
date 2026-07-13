import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import { playBuzzer, notifyUser } from '../lib/sound'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import Leaderboard from '../components/Leaderboard'
import { API_URL } from '../config.js'
import { findMatchingOptionIndex } from '../lib/voiceAnswering'

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
  const [timeLeft, setTimeLeft] = useState(0)
  const [results, setResults] = useState(null)
  const [pollAlert, setPollAlert] = useState(false)
  const [pollAlertMessage, setPollAlertMessage] = useState('')
  const [copyProtectionEnabled, setCopyProtectionEnabled] = useState(true)
  const [copyProtectionAction, setCopyProtectionAction] = useState('close-poll-only')
  const [copyProtectionBlocked, setCopyProtectionBlocked] = useState(false)
  const [copyProtectionOutcome, setCopyProtectionOutcome] = useState('')
  const [activeQuestionNumber, setActiveQuestionNumber] = useState(0)
  const [copyDebug, setCopyDebug] = useState('')
  const copyProtectionEnabledRef = useRef(false)
  // Past responses loaded from MongoDB - no sessionStorage needed
  const [pastResponses, setPastResponses] = useState([])
  const [voiceStatus, setVoiceStatus] = useState('')
  const timerIntervalRef = useRef(null)
  const recognitionRef = useRef(null)
  const copyProtectionBlockedRef = useRef(false)
  const selectedOptionsRef = useRef([])
  const discardedQuestionIdRef = useRef(null)
  const currentQuestionRef = useRef(null)
  const selectionInsidePollRef = useRef(false)
  const roomRef = useRef(null)
  const userRef = useRef(null)
  const copyProtectionActionRef = useRef('close-poll-only')
  const activeQuestionNumberRef = useRef(0)
  const pollContainerRef = useRef(null)

  useEffect(() => {
    currentQuestionRef.current = currentQuestion
  }, [currentQuestion])

  useEffect(() => {
    roomRef.current = room
  }, [room])

  useEffect(() => {
    userRef.current = user
  }, [user])

  useEffect(() => {
    copyProtectionActionRef.current = copyProtectionAction
  }, [copyProtectionAction])

  useEffect(() => {
    copyProtectionEnabledRef.current = copyProtectionEnabled
  }, [copyProtectionEnabled])

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
      if (copyProtectionBlockedRef.current) return

      const nextQuestionNumber = activeQuestionNumberRef.current + 1
      activeQuestionNumberRef.current = nextQuestionNumber
      setActiveQuestionNumber(nextQuestionNumber)

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

      // Play buzzer and notify student that a poll started
      try {
        playBuzzer()
        notifyUser('Poll started', 'A new poll has started — submit your answer now')
      } catch (e) {
        // ignore
      }

      // Show on-screen banner for a few seconds
      try {
        const timerText = data?.question?.timeToAnswer || data?.timer || 30
        setPollAlertMessage(`Poll started — answer now! ${timerText}s timer`)
        setPollAlert(true)
        setTimeout(() => setPollAlert(false), 5000)
      } catch (e) {}
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
      if (copyProtectionBlockedRef.current) return

      const nextQuestionNumber = activeQuestionNumberRef.current + 1
      activeQuestionNumberRef.current = nextQuestionNumber
      setActiveQuestionNumber(nextQuestionNumber)

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

      // Play buzzer for manually created question and show banner
      try {
        playBuzzer()
        notifyUser('Poll started', 'A teacher launched a new poll — answer now')
        const timerText = question?.timeToAnswer || 30
        setPollAlertMessage(`Quiz / Poll started — answer now! ${timerText}s timer`)
        setPollAlert(true)
        setTimeout(() => setPollAlert(false), 5000)
      } catch (e) {
        // ignore
      }
    }

    const handleRoomSettingsUpdated = (data) => {
      if (data?.settings) {
        setCopyProtectionEnabled(true)
        setCopyProtectionAction(data.settings?.copyProtectionAction || 'close-poll-only')
      }
    }

    socket.on('question:started', handleQuestionStarted)
    socket.on('question:ended', handleQuestionEnded)
    socket.on('new_question', handleNewQuestion)
    socket.on('room:settings:update', handleRoomSettingsUpdated)
    socket.on('room:ended', () => {
      navigate(`/student/room/${room?._id}/results`)
    })

    return () => {
      socket.off('question:started', handleQuestionStarted)
      socket.off('question:ended', handleQuestionEnded)
      socket.off('new_question', handleNewQuestion)
      socket.off('room:settings:update', handleRoomSettingsUpdated)
      socket.off('room:ended')
    }
  }, [socket, navigate, room?._id])

  const joinSession = async () => {
    setIsLoading(true)
    try {
      const roomData = await joinRoomByCode(roomCode)
      setRoom(roomData)
      setCopyProtectionEnabled(true)
      setCopyProtectionAction(roomData?.settings?.copyProtectionAction || 'close-poll-only')
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
    if (copyProtectionBlockedRef.current) return
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
        let pastQs = data.questions;
        
        // Check if the most recent question is still active
        if (pastQs.length > 0) {
          const newestQ = pastQs[0];
          const createdTime = new Date(newestQ.createdAt).getTime();
          const timeToAnswerMs = (newestQ.timeToAnswer || 30) * 1000;
          const now = Date.now();
          
          if (now < createdTime + timeToAnswerMs && !currentQuestion) {
            // It's still active!
            const secondsLeft = Math.ceil((createdTime + timeToAnswerMs - now) / 1000);
            
            // Set as current question
            setCurrentQuestion(newestQ);
            setTimeLeft(secondsLeft);
            
            if (newestQ.answered) {
              setSubmitted(true);
              setSelectedOptions(newestQ.selectedOptions || [newestQ.selectedOption].filter(x => x !== undefined));
            } else {
              setSubmitted(false);
              setSelectedOptions([]);
            }
            
            // Start timer
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
            }
            timerIntervalRef.current = setInterval(() => {
              setTimeLeft(prev => {
                if (prev <= 1) {
                  clearInterval(timerIntervalRef.current);
                  timerIntervalRef.current = null;
                  setCurrentQuestion(null);
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);
            
            // Remove from past responses so it doesn't show twice
            pastQs = pastQs.slice(1);
          }
        }
        
        setPastResponses(pastQs)
        // If student has already answered polls, disable leave button
        if (data.questions.some(q => q.answered)) {
          setHasAnsweredPoll(true)
        }
      }
    } catch (err) {
      console.error('Failed to fetch past responses:', err)
    }
  }

  const submitCurrentAnswer = async (answers = selectedOptionsRef.current, questionOverride = currentQuestionRef.current) => {
    if (!answers || answers.length === 0 || submitted || !questionOverride) return

    const questionId = questionOverride._id || questionOverride.question?._id
    const tta = questionOverride.timeToAnswer || 30
    const responseTime = tta - timeLeft

    try {
      const saveResponse = await fetch(`${API_URL}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: roomRef.current._id,
          questionId,
          studentId: user._id,
          selectedOptions: answers,
          responseTime
        })
      })
      const saveData = await saveResponse.json()

      if (saveData.success && saveData.response) {
        socket.emit('points:update', {
          roomCode: roomRef.current.code,
          questionId,
          studentId: user._id,
          points: saveData.response.points,
          isCorrect: saveData.response.isCorrect
        })
      }
    } catch (err) {
      console.error('Failed to save response:', err)
    }

    socket.emit('response:submit', {
      roomCode: roomRef.current.code,
      questionId,
      studentId: user._id,
      selectedOptions: answers,
      responseTime
    })

    setSubmitted(true)
    setHasAnsweredPoll(true)
    if (roomRef.current?._id && userRef.current?._id) {
      fetchPastResponses(roomRef.current._id, userRef.current._id)
    }
  }

  const handleSubmitAnswer = async () => {
    await submitCurrentAnswer(selectedOptions)
  }

  useEffect(() => {
    selectedOptionsRef.current = selectedOptions
  }, [selectedOptions])

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setVoiceStatus('Voice input is not supported in this browser')
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    recognitionRef.current = new SpeechRecognition()
    recognitionRef.current.continuous = false
    recognitionRef.current.interimResults = false
    recognitionRef.current.lang = 'en-US'

    recognitionRef.current.onstart = () => setVoiceStatus('Listening for option name...')
    recognitionRef.current.onerror = () => setVoiceStatus('Voice input unavailable')
    recognitionRef.current.onend = () => setVoiceStatus('')
    recognitionRef.current.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(' ')
        .trim()

      if (!currentQuestion?.options) return

      const matchedIndex = findMatchingOptionIndex(transcript, currentQuestion.options)
      if (matchedIndex === -1) {
        setVoiceStatus(`Could not hear: ${transcript}`)
        return
      }

      setVoiceStatus(`Selected option ${matchedIndex + 1}`)
      if (submitted) return
      const nextSelection = currentQuestion.type === 'MSQ'
        ? (selectedOptions.includes(matchedIndex)
          ? selectedOptions.filter((i) => i !== matchedIndex)
          : [...selectedOptions, matchedIndex])
        : [matchedIndex]

      setSelectedOptions(nextSelection)
      if (nextSelection.length > 0) {
        submitCurrentAnswer(nextSelection)
      }
    }

    return () => {
      try { recognitionRef.current?.stop() } catch (e) {}
    }
  }, [currentQuestion?._id, submitted])

  const startVoiceInput = () => {
    if (!recognitionRef.current || copyProtectionBlockedRef.current) return
    try {
      recognitionRef.current.start()
    } catch (e) {
      setVoiceStatus('Voice input is already active')
    }
  }

  const discardActivePoll = (options = {}) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    const questionId = currentQuestionRef.current?._id || currentQuestionRef.current?.question?._id || null
    if (questionId) {
      discardedQuestionIdRef.current = questionId
    }

    copyProtectionBlockedRef.current = true
    setCopyProtectionBlocked(true)
    setCurrentQuestion(null)
    setSelectedOptions([])
    selectedOptionsRef.current = []
    setTimeLeft(0)

    if (options?.clearSubmitted) {
      setSubmitted(false)
    }
    if (options?.markAnswered) {
      setHasAnsweredPoll(true)
    }
    if (options?.clearAnswered) {
      setHasAnsweredPoll(false)
    }
    currentQuestionRef.current = null
  }

  const isPollSelection = (selectionText) => {
    if (!selectionText || !currentQuestionRef.current) return false
    const normalizedSelection = selectionText.trim().toLowerCase()
    const questionText = String(currentQuestionRef.current.question || '').toLowerCase()
    const options = (currentQuestionRef.current.options || []).map((option) => {
      return typeof option === 'string' ? option.toLowerCase() : String(option.text || '').toLowerCase()
    })

    if (questionText.includes(normalizedSelection)) return true
    if (normalizedSelection.includes(questionText)) return true
    if (options.some((optionText) => optionText.includes(normalizedSelection) || normalizedSelection.includes(optionText))) return true
    return false
  }

  const selectionWithinPoll = () => {
    try {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false
      const container = pollContainerRef.current
      if (!container) return false

      for (let i = 0; i < selection.rangeCount; i += 1) {
        const range = selection.getRangeAt(i)
        if (container.contains(range.commonAncestorContainer)) return true
      }

      return false
    } catch (e) {
      return false
    }
  }

  const getSelectedText = () => window.getSelection?.()?.toString() || ''

  const updateSelectionInsidePoll = () => {
    const inside = selectionWithinPoll()
    selectionInsidePollRef.current = inside
    return inside
  }

  const handleCopyDetection = async (copyMethod) => {
    if (!copyProtectionEnabledRef.current || !currentQuestionRef.current || copyProtectionBlockedRef.current) return

    const actionTaken = copyProtectionActionRef.current === 'mark-not-submitted'
      ? 'mark-not-submitted'
      : copyProtectionActionRef.current === 'close-poll-only'
        ? 'close-poll-only'
        : 'auto-submit'

    const outcomeText = actionTaken === 'auto-submit'
      ? 'Your response has been submitted according to teacher settings.'
      : actionTaken === 'mark-not-submitted'
        ? 'Your response was not submitted according to teacher settings.'
        : 'The poll has been closed for you.'

    setCopyProtectionOutcome(outcomeText)
    const protectedQuestion = currentQuestionRef.current
    const protectedSelection = [...selectedOptionsRef.current]

    discardActivePoll({
      clearSubmitted: true,
      markAnswered: actionTaken !== 'close-poll-only',
      clearAnswered: actionTaken === 'close-poll-only'
    })

    if (actionTaken === 'auto-submit' && protectedSelection.length > 0) {
      await submitCurrentAnswer(protectedSelection, protectedQuestion)
      setSubmitted(true)
      setHasAnsweredPoll(true)
    } else if (actionTaken === 'mark-not-submitted') {
      setSubmitted(false)
      setHasAnsweredPoll(true)
    } else {
      setSubmitted(false)
    }

    if (socket && roomRef.current?.code) {
      socket.emit('copy-protection:detect', {
        roomCode: roomRef.current.code,
        studentId: userRef.current?._id,
        studentName: userRef.current?.name,
        rollNumber: userRef.current?.enrollmentNumber || '',
        pollName: roomRef.current?.name || 'Live Poll',
        questionNumber: activeQuestionNumberRef.current,
        questionId: protectedQuestion?._id || protectedQuestion?.question?._id || '',
        questionText: protectedQuestion?.question || '',
        copyMethod,
        actionTaken
      })
    }
  }

  useEffect(() => {
    const handleCopyShortcut = (event) => {
      if (!copyProtectionEnabledRef.current || !currentQuestionRef.current || copyProtectionBlockedRef.current) return
      const isCopyShortcut = (event.ctrlKey || event.metaKey) && ['c', 'C', 'Insert', 'insert'].includes(event.key)
      if (!isCopyShortcut) return

      const selected = getSelectedText()
      const container = pollContainerRef.current
      const targetWithin = container && container.contains(event.target)
      const focusedWithin = container && container.contains(document.activeElement)
      const selectionMatches = isPollSelection(selected)
      const selectionInside = selectionInsidePollRef.current || updateSelectionInsidePoll()
      if (!selectionMatches && !selectionInside && !targetWithin && !focusedWithin) return

      console.log('[CopyProtection] keydown shortcut detected', event.key, event.ctrlKey, event.metaKey, selected, { targetWithin, focusedWithin, selectionMatches, selectionInside })
      setCopyDebug('Keyboard copy attempt detected')
      event.preventDefault()
      event.stopPropagation()
      handleCopyDetection('Ctrl+C / Ctrl+Insert')
    }

    const handleCopyEvent = (event) => {
      if (!copyProtectionEnabledRef.current || !currentQuestionRef.current || copyProtectionBlockedRef.current) return
      const selected = getSelectedText()
      const container = pollContainerRef.current
      const targetWithin = container && container.contains(event.target)
      const focusedWithin = container && container.contains(document.activeElement)
      const selectionMatches = isPollSelection(selected)
      const selectionInside = selectionInsidePollRef.current || updateSelectionInsidePoll()
      if (!selectionMatches && !selectionInside && !targetWithin && !focusedWithin) return

      console.log('[CopyProtection] copy event detected', event.target, selected, { targetWithin, focusedWithin, selectionMatches, selectionInside })
      setCopyDebug('Browser copy event detected')
      event.preventDefault()
      event.stopPropagation()
      handleCopyDetection('Browser Copy')
    }

    const handleCutEvent = (event) => {
      if (!copyProtectionEnabledRef.current || !currentQuestionRef.current || copyProtectionBlockedRef.current) return
      const selected = getSelectedText()
      const container = pollContainerRef.current
      const targetWithin = container && container.contains(event.target)
      const focusedWithin = container && container.contains(document.activeElement)
      const selectionMatches = isPollSelection(selected)
      const selectionInside = selectionInsidePollRef.current || updateSelectionInsidePoll()
      if (!selectionMatches && !selectionInside && !targetWithin && !focusedWithin) return

      console.log('[CopyProtection] cut event detected', event.target, selected, { targetWithin, focusedWithin, selectionMatches, selectionInside })
      setCopyDebug('Cut / clipboard event detected')
      event.preventDefault()
      event.stopPropagation()
      handleCopyDetection('Cut / Clipboard')
    }

    const handleContextMenu = (event) => {
      if (!copyProtectionEnabledRef.current || !currentQuestionRef.current || copyProtectionBlockedRef.current) return
      const selected = getSelectedText()
      const container = pollContainerRef.current
      const targetWithin = container && container.contains(event.target)
      const focusedWithin = container && container.contains(document.activeElement)
      const selectionMatches = isPollSelection(selected)
      const selectionInside = selectionInsidePollRef.current || updateSelectionInsidePoll()
      if (!selectionMatches && !selectionInside && !targetWithin && !focusedWithin) return

      console.log('[CopyProtection] context menu inside poll detected', event.target, selected, { targetWithin, focusedWithin, selectionMatches, selectionInside })
      setCopyDebug('Context menu attempt detected')
      event.preventDefault()
      event.stopPropagation()
      handleCopyDetection('Right-click')
    }

    const handleBeforeCopy = (event) => {
      if (!copyProtectionEnabledRef.current || !currentQuestionRef.current || copyProtectionBlockedRef.current) return
      const selected = getSelectedText()
      const container = pollContainerRef.current
      const targetWithin = container && container.contains(event.target)
      const focusedWithin = container && container.contains(document.activeElement)
      const selectionMatches = isPollSelection(selected)
      const selectionInside = selectionInsidePollRef.current || updateSelectionInsidePoll()
      if (!selectionMatches && !selectionInside && !targetWithin && !focusedWithin) return

      console.log('[CopyProtection] beforecopy detected', event.target, selected, { targetWithin, focusedWithin, selectionMatches, selectionInside })
      setCopyDebug('Before copy attempt detected')
      event.preventDefault()
      event.stopPropagation()
      handleCopyDetection('Before Copy')
    }

    document.addEventListener('keydown', handleCopyShortcut, true)
    document.addEventListener('copy', handleCopyEvent, true)
    document.addEventListener('cut', handleCutEvent, true)
    document.addEventListener('contextmenu', handleContextMenu, true)
    document.addEventListener('beforecopy', handleBeforeCopy, true)
    document.addEventListener('selectionchange', updateSelectionInsidePoll, true)
    window.addEventListener('keydown', handleCopyShortcut, true)
    window.addEventListener('copy', handleCopyEvent, true)
    window.addEventListener('cut', handleCutEvent, true)
    window.addEventListener('beforecopy', handleBeforeCopy, true)
    window.addEventListener('selectionchange', updateSelectionInsidePoll, true)

    return () => {
      document.removeEventListener('keydown', handleCopyShortcut, true)
      document.removeEventListener('copy', handleCopyEvent, true)
      document.removeEventListener('cut', handleCutEvent, true)
      document.removeEventListener('contextmenu', handleContextMenu, true)
      document.removeEventListener('beforecopy', handleBeforeCopy, true)
      document.removeEventListener('selectionchange', updateSelectionInsidePoll, true)
      window.removeEventListener('keydown', handleCopyShortcut, true)
      window.removeEventListener('copy', handleCopyEvent, true)
      window.removeEventListener('cut', handleCutEvent, true)
      window.removeEventListener('beforecopy', handleBeforeCopy, true)
      window.removeEventListener('selectionchange', updateSelectionInsidePoll, true)
    }
  }, [])

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
      {copyProtectionBlocked && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 30000,
          background: 'rgba(10, 10, 10, 0.95)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            maxWidth: '560px',
            textAlign: 'center',
            color: 'white',
            padding: '32px',
            borderRadius: '24px',
            background: 'linear-gradient(135deg, rgba(248,113,113,0.2), rgba(239,68,68,0.3))',
            border: '1px solid rgba(248,113,113,0.4)'
          }}>
            <div style={{ fontSize: '56px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ margin: '0 0 12px', fontSize: '32px', fontWeight: '700' }}>Poll Closed</h2>
            <p style={{ margin: '0 0 12px', fontSize: '18px', lineHeight: 1.6 }}>
              Copying questions is disabled during live polls.
            </p>
            <p style={{ margin: 0, fontSize: '16px', opacity: 0.95 }}>{copyProtectionOutcome}</p>
          </div>
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
          {/* On-screen poll/quiz banner */}
          {pollAlert && (
            <div style={{ position: 'fixed', top: 88, left: '50%', transform: 'translateX(-50%)', zIndex: 9999 }}>
              <div style={{
                background: '#f59e0b',
                color: '#1f2937',
                padding: '12px 20px',
                borderRadius: '12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                fontWeight: 700,
                fontSize: '16px'
              }}>{pollAlertMessage}</div>
            </div>
          )}
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
            <div
              ref={pollContainerRef}
              tabIndex={0}
              onKeyDownCapture={(event) => {
                const isCopyShortcut = (event.ctrlKey || event.metaKey) && ['c', 'C', 'Insert', 'insert'].includes(event.key)
                if (isCopyShortcut) {
                  event.preventDefault()
                  event.stopPropagation()
                  handleCopyDetection('Ctrl+C / Ctrl+Insert')
                }
              }}
              onCopyCapture={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleCopyDetection('Browser Copy')
              }}
              onCutCapture={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleCopyDetection('Cut / Clipboard')
              }}
              onContextMenuCapture={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleCopyDetection('Right-click')
              }}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                borderRadius: '16px',
                padding: '32px',
                color: 'white',
                boxShadow: '0 10px 40px rgba(124, 58, 237, 0.3)',
                userSelect: 'text'
              }}
            >
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
              {copyDebug && (
                <div style={{
                  margin: '0 auto 16px',
                  padding: '10px 16px',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  color: 'white',
                  textAlign: 'center',
                  maxWidth: '580px'
                }}>
                  {copyDebug}
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
                    const nextSelection = isMSQ
                      ? (selectedOptions.includes(index)
                        ? selectedOptions.filter(i => i !== index)
                        : [...selectedOptions, index])
                      : [index]

                    setSelectedOptions(nextSelection)
                    if (nextSelection.length > 0) {
                      submitCurrentAnswer(nextSelection)
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

              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={startVoiceInput}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '999px',
                    border: '1px solid rgba(255,255,255,0.3)',
                    background: 'rgba(255,255,255,0.16)',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  🎤 Say an option
                </button>
                {voiceStatus && <span style={{ alignSelf: 'center', color: 'rgba(255,255,255,0.95)', fontSize: '14px' }}>{voiceStatus}</span>}
              </div>

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
                <div style={{
                  textAlign: 'center',
                  padding: '16px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  color: 'rgba(255,255,255,0.95)',
                  fontSize: '14px'
                }}>
                  Tap an option or say its name to answer instantly.
                </div>
              )}
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
                  <Leaderboard roomId={room?._id} token={token} socket={socket} />
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