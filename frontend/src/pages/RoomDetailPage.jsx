import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import QuestionApprovalPopup from '../components/QuestionApprovalPopup'
import TextQuestionApprovalPopup from '../components/TextQuestionApprovalPopup'
import CreateQuestionOverlay from '../components/CreateQuestionOverlay'
import TextToQuestionsPopup from '../components/TextToQuestionsPopup'
import RoomSettingsModal from '../components/RoomSettingsModal'
import Leaderboard from '../components/Leaderboard'
import { saveTranscript } from '../services/transcriptService'
import { transcribeAudio, getTranscriptionStatus, convertWebMToWav } from '../services/serverTranscriptionService'
import { API_URL } from '../config.js'

// Keep in sync with backend AI_PROVIDERS (config.js). Guards against stale
// saved room settings (e.g. old 'groq' values from before that provider was
// folded into minimax) leaking into display or outgoing requests.
const KNOWN_PROVIDERS = ['minimax', 'openai', 'anthropic', 'google']
const safeProvider = (p) => (KNOWN_PROVIDERS.includes(p) ? p : 'minimax')

function RoomDetailPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { socket, isConnected, joinRoom, leaveRoom } = useSocketStore()
  const { getRoom, updateRoom, setAuthToken } = useRoomStore()

  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRoomJoined, setIsRoomJoined] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [toast, setToast] = useState(null) // {msg, type: 'info'|'error'|'success'}
  const showToast = (msg, type = 'info', duration = 3500) => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), duration)
  }
  const settingsRef = useRef(null)
  const transcriptRef = useRef(null)

  // Real-time transcription state
  const isRecordingRef = useRef(false)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [modelStatus, setModelStatus] = useState('Ready')

  // MediaRecorder refs for server-side Whisper transcription
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const transcriptionIntervalRef = useRef(null)
  const finalTranscriptRef = useRef('')
  const accumulatedTranscriptRef = useRef('')

  // Segment tracking
  const [currentSegment, setCurrentSegment] = useState(0)
  const [segmentTranscript, setSegmentTranscript] = useState('')
  const [segmentTimeLeft, setSegmentTimeLeft] = useState(0)
  const segmentTimerRef = useRef(null)

  // Question timer for teacher visibility
  const [activeQuestion, setActiveQuestion] = useState(null)
  const [questionTimeLeft, setQuestionTimeLeft] = useState(0)
  const questionTimerRef = useRef(null)


  // Question generation
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false)
  const [pendingQuestions, setPendingQuestions] = useState([])
  const [showQuestionPopup, setShowQuestionPopup] = useState(false)
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const [showCreateQuestion, setShowCreateQuestion] = useState(false)
  const [showTextToQuestions, setShowTextToQuestions] = useState(false)
  const [isGeneratingFromText, setIsGeneratingFromText] = useState(false)
  const [showTextQuestionPopup, setShowTextQuestionPopup] = useState(false)
  const [showGeneratingPopup, setShowGeneratingPopup] = useState(false)
  const [pendingTextQuestions, setPendingTextQuestions] = useState([])
  const [generatedQuestions, setGeneratedQuestions] = useState([])
  const [roomSettings, setRoomSettings] = useState({
    segmentTime: 2,
    questionsPerSegment: 2,
    difficultyMix: { medium: 70, hard: 30 },
    questionProvider: 'minimax',
    timeToAnswer: 30,
    points: 100
  })
  // Derives human-readable label from difficultyMix
  const getDifficultyLabel = (difficultyMix) => {
    const hard = 100 - (difficultyMix?.medium ?? 70)
    if (hard >= 65) return 'Hard'
    if (hard >= 35) return 'Medium / Hard'
    return 'Medium'
  }
  // Derives the effective API difficulty value from difficultyMix
  const getEffectiveDifficulty = (difficultyMix) => {
    const hard = 100 - (difficultyMix?.medium ?? 70)
    if (hard >= 65) return 'hard'
    if (hard >= 35) return 'medium'   // backend gets 'medium', prompt gets pushed harder
    return 'medium'
  }
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [answerCounts, setAnswerCounts] = useState({}) // questionId -> count
  const [answerCountsByOption, setAnswerCountsByOption] = useState({}) // questionId -> {optionIndex: count}
  const [confusionCount, setConfusionCount] = useState(0)
  const [totalStudents, setTotalStudents] = useState(0)
  const [recentQuestion, setRecentQuestion] = useState(null) // For quick re-poll
  const [showResultsModal, setShowResultsModal] = useState(false) // Show results after poll ends

  useEffect(() => {
    const anyOpen = showQuestionPopup || showTextQuestionPopup
    document.body.style.overflow = anyOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [showQuestionPopup, showTextQuestionPopup])

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      loadRoom()
      checkServerTranscription()
    }

    return () => {
      if (room?.code) {
        leaveRoom(room.code, user?._id)
      }
      stopRecording()
      if (segmentTimerRef.current) {
        clearInterval(segmentTimerRef.current)
      }
    }
  }, [roomId])

  useEffect(() => {
    if (room?.code && user?._id) {
      joinRoom(room.code, user._id)
    }
  }, [room?.code, user?._id])

  // Listen for room:joined event
  useEffect(() => {
    if (!socket) return

    const handleRoomJoined = (data) => {
      console.log('Teacher joined room successfully')
      setIsRoomJoined(true)
      if (data?.participants !== undefined) setTotalParticipants(data.participants)
    }

    const handleRoomLeft = (data) => {
      if (data?.participants !== undefined) setTotalParticipants(data.participants)
    }

    socket.on('room:joined', handleRoomJoined)
    socket.on('room:left', handleRoomLeft)

    return () => {
      socket.off('room:joined', handleRoomJoined)
      socket.off('room:left', handleRoomLeft)
    }
  }, [socket])

  // Listen for response:new events to update answer counts
  useEffect(() => {
    if (!socket) return
    const handleNewResponse = (data) => {
      console.log('[DEBUG] New response received:', data)
      const qid = data.questionId
      const opt = data.selectedOption
      
      // Update total answer count
      setAnswerCounts(prev => ({
        ...prev,
        [qid]: (prev[qid] || 0) + 1
      }))
      
      // Update per-option answer counts for live participation bar
      if (typeof opt === 'number') {
        setAnswerCountsByOption(prev => {
          const newByOption = { ...prev }
          if (!newByOption[qid]) newByOption[qid] = {}
          newByOption[qid][opt] = (newByOption[qid][opt] || 0) + 1
          return newByOption
        })
      }
    }
    const handleConfusionSignal = (data) => {
      console.log('[CONFUSION]', data)
      // data: { count, totalStudents, percentage, level }
      // confusionCount must stay a number (it's used in "confusionCount / totalStudents"
      // math and "confusionCount > 0" checks below) — storing an object here made those
      // checks silently always-false.
      setConfusionCount(data.count || 0)
      if (data.totalStudents !== undefined) setTotalStudents(data.totalStudents)
    }
    socket.on('response:new', handleNewResponse)
    socket.on('confusion:signal', handleConfusionSignal)
    socket.on('student:joined', () => setTotalStudents(c => c + 1))
    socket.on('student:left', () => setTotalStudents(c => Math.max(0, c - 1)))
    return () => {
      socket.off('response:new', handleNewResponse)
      socket.off('confusion:signal', handleConfusionSignal)
    }
  }, [socket])

  // Listen for question launch events to show timer to teacher
  useEffect(() => {
    if (!socket) return

    const startQuestionTimer = (question) => {
      const timeToAnswer = question.timeToAnswer || roomSettings.timeToAnswer || 30

      // Clear any existing timer
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current)
        questionTimerRef.current = null
      }

      setActiveQuestion(question)
      setQuestionTimeLeft(timeToAnswer)

      questionTimerRef.current = setInterval(() => {
        setQuestionTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(questionTimerRef.current)
            questionTimerRef.current = null
            setActiveQuestion(null)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    const handleNewQuestionLaunched = (question) => {
      console.log('[QUESTION LAUNCHED] new_question', question)
      if (question) startQuestionTimer(question)
    }

    const handleQuestionStartedLaunched = (data) => {
      console.log('[QUESTION LAUNCHED] question:started', data)
      if (data && data.question) startQuestionTimer(data.question)
    }

    socket.on('new_question', handleNewQuestionLaunched)
    socket.on('question:started', handleQuestionStartedLaunched)

    return () => {
      socket.off('new_question', handleNewQuestionLaunched)
      socket.off('question:started', handleQuestionStartedLaunched)
    }
  }, [socket, roomSettings.timeToAnswer])

  // NOTE: previously locked page scroll while a question was active
  // (`el.style.overflowY = activeQuestion ? 'hidden' : 'auto'`). Removed —
  // it made the "⏹ End Poll" button and rest of the dashboard unreachable
  // by scroll for the full duration of every question, which is exactly
  // what was being reported as "page unresponsive until timer hits 0".


  // Auto-scroll transcription with a layout-repaint safety guard
  useEffect(() => {
    if (transcriptRef.current) {
      requestAnimationFrame(() => {
        if (transcriptRef.current) {
          transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
        }
      })
    }
  }, [transcript])

  // Start segment timer when recording, pause when popup is shown
  useEffect(() => {
    if (isRecording && !showQuestionPopup && !showTextQuestionPopup && roomSettings.segmentTime > 0) {
      startSegmentTimer()
    } else {
      if (segmentTimerRef.current) {
        clearInterval(segmentTimerRef.current)
        segmentTimerRef.current = null
      }
    }
  }, [isRecording, showQuestionPopup, showTextQuestionPopup, roomSettings.segmentTime])

  // // Close settings dropdown when clicking outside
  // useEffect(() => {
  //   const handleClickOutside = (event) => {
  //     if (settingsRef.current && !settingsRef.current.contains(event.target)) {
  //       setShowSettings(false)
  //     }
  //   }

  //   document.addEventListener('mousedown', handleClickOutside)
  //   return () => document.removeEventListener('mousedown', handleClickOutside)
  // }, [])


  // Check server transcription status on mount
  const checkServerTranscription = async () => {
    try {
      const status = await getTranscriptionStatus()
      if (status.status === 'ready') {
        setModelStatus('Server Ready')
      } else {
        setModelStatus('Server Loading...')
      }
    } catch (error) {
      console.error('Failed to check transcription status:', error)
      setModelStatus('Server Error')
    }
  }

  const startSegmentTimer = (startFromSeconds = null) => {
    console.log('[TIMER] startSegmentTimer called, segmentTime:', roomSettings.segmentTime, 'startFrom:', startFromSeconds)

    // Clear any existing timer
    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current)
      segmentTimerRef.current = null
    }

    if (roomSettings.segmentTime <= 0) {
      console.log('[TIMER] segmentTime is 0, not starting timer')
      return
    }

    const totalSeconds = startFromSeconds !== null ? startFromSeconds : (roomSettings.segmentTime * 60)
    console.log('[TIMER] Starting timer for', totalSeconds, 'seconds')

    let secondsLeft = totalSeconds
    setSegmentTimeLeft(secondsLeft)

    console.log('[TIMER] Creating interval for', totalSeconds, 'seconds')
    segmentTimerRef.current = setInterval(() => {
      secondsLeft -= 1
      setSegmentTimeLeft(secondsLeft)
      console.log('[TIMER] Tick:', secondsLeft, 'left')

      if (secondsLeft <= 0) {
        console.log('[TIMER] Timer reached 0!')
        console.log('[TIMER] Clearing interval')
        clearInterval(segmentTimerRef.current)
        segmentTimerRef.current = null

        console.log('[TIMER] Calling handleSegmentComplete')
        try {
          handleSegmentComplete()
          console.log('[TIMER] handleSegmentComplete called successfully')
        } catch (e) {
          console.error('[TIMER] Error calling handleSegmentComplete:', e)
        }
      }
    }, 1000)
  }

  // On segment timer hit zero - auto-save and auto-generate questions
  const handleSegmentComplete = async () => {
    console.log('[SEGMENT] Timer hit zero - handling segment completion')

    // Clear timer
    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current)
      segmentTimerRef.current = null
    }

    // Strip noise artifacts before using transcript
    const clean = (s) => s.replace(/\[BLANK_AUDIO\]/gi, '').replace(/\s+/g, ' ').trim()
    const textToUse = clean(segmentTranscript) || clean(transcript)

    if (!textToUse || textToUse.length < 50) {
      console.log('[SEGMENT] Transcript too short, resuming next segment silently')
      setCurrentSegment(prev => prev + 1)
      setSegmentTranscript('')
      finalTranscriptRef.current = ''
      // useEffect deps haven't changed so it won't re-fire — restart directly
      if (isRecordingRef.current) startSegmentTimer()
      return
    }

    // Save transcript to database
    saveTranscript(room._id, currentSegment, textToUse, roomSettings.segmentTime * 60)
      .then(() => console.log('[SEGMENT] Transcript saved to DB'))
      .catch(err => console.error('[SEGMENT] Failed to save transcript:', err))

    // Auto-generate questions
    let popupShown = false
    try {
      console.log('[SEGMENT] Auto-generating questions...')
      const questions = await generateQuestionsFromText(textToUse, currentSegment)
      if (questions && questions.length > 0) {
        setPendingQuestions(questions)
        setShowQuestionPopup(true)
        popupShown = true
      }
    } catch (error) {
      console.error('[SEGMENT] First generation attempt failed:', error)
      // Auto-retry once
      try {
        console.log('[SEGMENT] Retrying question generation...')
        const questions = await generateQuestionsFromText(textToUse, currentSegment)
        if (questions && questions.length > 0) {
          setPendingQuestions(questions)
          setShowQuestionPopup(true)
          popupShown = true
        }
      } catch (retryError) {
        console.error('[SEGMENT] Retry also failed:', retryError)
        showToast('Failed to generate questions after retry. Use Generate Q button manually.', 'error')
      }
    }

    // Reset segment state
    setSegmentTranscript('')
    finalTranscriptRef.current = ''
    // If popup was shown, timer restarts via useEffect when popup closes.
    // If not (failed/no questions), useEffect deps unchanged — restart directly.
    if (!popupShown && isRecordingRef.current) {
      startSegmentTimer()
    }
    
  }

  const generateQuestionsFromText = async (text, segmentIndex) => {
    return new Promise((resolve, reject) => {
      setIsGeneratingQuestions(true)
      fetch(`${API_URL}/questions/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
        transcript: text,
        config: {
          numQuestions: roomSettings.questionsPerSegment,
          difficulty: getEffectiveDifficulty(roomSettings.difficultyMix),  // ← was hardcoded 'medium'
          difficultyMix: roomSettings.difficultyMix,                        // ← NEW: pass the split
          provider: safeProvider(roomSettings.questionProvider)
        }
      })
      })
        .then(response => response.json())
        .then(data => {
          setIsGeneratingQuestions(false)

          if (data.success && data.questions && data.questions.length > 0) {
            const markedQuestions = data.questions.map(q => ({
              ...q,
              timeToAnswer: roomSettings.timeToAnswer,
              points: roomSettings.points,
              segmentIndex: segmentIndex
            }))
            resolve(markedQuestions) // Return questions for popup handling
          } else {
            reject(new Error(data.error || 'No questions generated'))
          }
        })
        .catch(error => {
          setIsGeneratingQuestions(false)
          reject(error)
        })
    })
  }

  // Handle question generation from pasted text (TextToQuestionsPopup)
  const handleTextToQuestionsGenerate = async (text, mode) => {
    setShowTextToQuestions(false) // Close the text popup
    setShowGeneratingPopup(true)  // Show generating popup
    setIsGeneratingFromText(true)

    try {
      const generationMode = mode === 'TF' ? 'tf' : 'mixed'

      const response = await fetch(`${API_URL}/questions/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
        transcript: text,
        config: {
        mode: generationMode,
        numQuestions: roomSettings.questionsPerSegment,
        difficulty: getEffectiveDifficulty(roomSettings.difficultyMix),   // ← fixed
        difficultyMix: roomSettings.difficultyMix,                         // ← NEW
        provider: safeProvider(roomSettings.questionProvider)
      }
      })
      })

      let data
      try {
        data = await response.json()
      } catch (parseError) {
        // Response wasn't valid JSON - show raw error
        throw new Error(`Server returned status ${response.status} with invalid response`)
      }
      
      setIsGeneratingFromText(false)
      setShowGeneratingPopup(false)

      if (data.success && data.questions && data.questions.length > 0) {
        const markedQuestions = data.questions.map(q => ({
          ...q,
          timeToAnswer: roomSettings.timeToAnswer,
          points: roomSettings.points,
          segmentIndex: currentSegment
        }))
        setPendingTextQuestions(markedQuestions)
        setShowTextQuestionPopup(true)
      } else {
        showToast(data.error || 'Failed to generate questions', 'error')
      }
    } catch (error) {
      setIsGeneratingFromText(false)
      setShowGeneratingPopup(false)
      console.error('Text to questions error:', error)
      showToast('Failed to generate: ' + (error.message || 'Unknown error').slice(0, 80), 'error')
    }
  }

  const loadRoom = async () => {
    setIsLoading(true)
    try {
      const roomData = await getRoom(roomId)
      setRoom(roomData)
      // Apply room settings if they exist
      if (roomData.settings) {
        setRoomSettings(prev => ({
          ...prev,
          ...roomData.settings
        }))
      }
      // Fetch current student count on load so a teacher refresh mid-session
      // doesn't reset "X% responded" to 0% until the next socket event.
      // Adjust the field name below to match whatever your /rooms/:id response uses.
      const studentCount = roomData.participantCount ?? roomData.studentsCount ?? roomData.students?.length
      if (studentCount !== undefined) setTotalStudents(studentCount)
      // Load questions for this room from database
      loadQuestions(roomId)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const loadQuestions = async (rid) => {
    try {
      const response = await fetch(`${API_URL}/questions?roomId=${rid}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        if (data.questions) {
          setGeneratedQuestions(data.questions)
        }
      }
      // Also load answer counts
      const countsRes = await fetch(`${API_URL}/responses/counts/${rid}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (countsRes.ok) {
        const countsData = await countsRes.json()
        if (countsData.counts) {
          setAnswerCounts(countsData.counts)
        }
      }
    } catch (err) {
      console.error('Failed to load questions:', err)
    }
  }

  const handleEndRoom = async () => {
    if (room.endedAt) return

    try {
      // Generate session summary via API — retry up to 2 times (3 attempts total)
      // before giving up, so a transient AI/API failure doesn't leave the
      // summary permanently null for the room.
      const MAX_SUMMARY_ATTEMPTS = 3
      let summaryGenerated = false

      for (let attempt = 1; attempt <= MAX_SUMMARY_ATTEMPTS; attempt++) {
        try {
          const summaryRes = await fetch(`${API_URL}/summary/generate/${room._id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          })

          if (summaryRes.ok) {
            console.log(`Session summary generated successfully (attempt ${attempt})`)
            summaryGenerated = true
            break
          }

          console.warn(`Summary generation failed (attempt ${attempt}/${MAX_SUMMARY_ATTEMPTS})`)
        } catch (summaryErr) {
          console.warn(`Summary generation request errored (attempt ${attempt}/${MAX_SUMMARY_ATTEMPTS}):`, summaryErr.message)
        }

        // Wait briefly before retrying (skip wait after the last attempt)
        if (attempt < MAX_SUMMARY_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, 1500))
        }
      }

      if (!summaryGenerated) {
        console.warn('Failed to generate session summary after all retries, continuing anyway')
      }

      const updated = await updateRoom(room._id, {
        isActive: false,
        endedAt: new Date()
      })
      setRoom(updated)
      navigate(`/teacher/room/${room._id}/results`)
    } catch (err) {
      console.error('Failed to end room:', err)
      setError(err.message)
      // Even if summary generation fails, still try to navigate to results
      navigate(`/teacher/room/${room._id}/results`)
    }
  }

  // Manually end the currently active poll instead of waiting for the local
  // countdown to reach 0. Clears local state immediately (unlocks scroll)
  // and tells students + resets confusion tracking via the same event the
  // countdown already relies on server-side.
  const handleEndActiveQuestion = () => {
    if (!activeQuestion) return

    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current)
      questionTimerRef.current = null
    }
    setActiveQuestion(null)
    setQuestionTimeLeft(0)

    if (socket && isConnected && room) {
      socket.emit('question:end', {
        roomCode: room.code,
        questionId: activeQuestion._id
      })
    }
  }

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Send accumulated audio for transcription
  const sendForTranscription = useCallback(async () => {
    if (!mediaRecorderRef.current || !streamRef.current) return
    if (audioChunksRef.current.length === 0) return

    await new Promise((resolve) => {
      const recorder = mediaRecorderRef.current

      recorder.onstop = async () => {
        const chunks = [...audioChunksRef.current]
        audioChunksRef.current = []

        if (streamRef.current && isRecordingRef.current) {
          // Restart immediately so recording never pauses
          if (streamRef.current) {
            const next = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm' })
            next.ondataavailable = (e) => {
              if (e.data.size > 0) audioChunksRef.current.push(e.data)
            }
            next.onerror = (e) => console.error('MediaRecorder error:', e)
            next.start(1000)
            mediaRecorderRef.current = next
          }
        }


        // Now transcribe the complete blob (has EBML header)
        if (chunks.length > 0) {
          try {
            const webmBlob = new Blob(chunks, { type: 'audio/webm' })
            const wavBlob = await convertWebMToWav(webmBlob)
            const result = await transcribeAudio(wavBlob)
            if (result.text?.trim()) {
              const text = result.text.trim()
              finalTranscriptRef.current += text + ' '
              accumulatedTranscriptRef.current += text + ' '
              setTranscript(finalTranscriptRef.current)
              setSegmentTranscript(prev => prev + ' ' + text)
            }
          } catch (error) {
            console.error('Transcription error:', error)
          }
        }
        resolve()
      }

      recorder.stop()
    })
  }, [room?._id])

  const startRecording = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Initialize MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error)
        setModelStatus('Recording error')
      }

      // Start recording
      mediaRecorder.start(1000) // Collect data every second
      isRecordingRef.current = true

      // Initialize segment
      finalTranscriptRef.current = transcript
      accumulatedTranscriptRef.current = ''
      setCurrentSegment(1)
      setSegmentTranscript('')

      setIsRecording(true)
      setIsTranscribing(true)
      setModelStatus('Listening...')

      // Start periodic transcription (every 5 seconds)
      transcriptionIntervalRef.current = setInterval(() => {
        sendForTranscription()
      }, 5000)

    } catch (error) {
      console.error('Error starting recording:', error)
      setModelStatus('Microphone access denied')
    }
  }

  const stopRecording = () => {
  isRecordingRef.current = false  // ← must be FIRST

  if (transcriptionIntervalRef.current) {
    clearInterval(transcriptionIntervalRef.current)
    transcriptionIntervalRef.current = null
  }

  if (audioChunksRef.current.length > 0) {
    sendForTranscription()
  }

  if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
    mediaRecorderRef.current.stop()
  }

  if (streamRef.current) {
    streamRef.current.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  if (segmentTimerRef.current) {
    clearInterval(segmentTimerRef.current)
  }

  setIsRecording(false)
  setIsTranscribing(false)
  setModelStatus('Ready')
}

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const clearTranscript = () => {
    setTranscript('')
    finalTranscriptRef.current = ''
    setSegmentTranscript('')
  }

  const handleManualGenerateQuestions = async () => {
    const clean = (s) => s.replace(/\[BLANK_AUDIO\]/gi, '').replace(/\s+/g, ' ').trim()
    const textToUse = clean(segmentTranscript) || clean(transcript)
    if (!textToUse) {
      alert('No transcript available to generate questions from.')
      return
    }

    setIsGeneratingQuestions(true)

    try {
      const questions = await generateQuestionsFromText(textToUse, currentSegment + 1)
      if (questions && questions.length > 0) {
        setPendingQuestions(questions)
        setShowQuestionPopup(true)
        setCurrentSegment(prev => prev + 1)
      }
    } catch (error) {
      console.error('Manual question generation failed:', error)
      alert('Failed to generate questions: ' + error.message)
    }
    setIsGeneratingQuestions(false)
  }

  const handleApproveQuestion = async (question) => {
    // A new poll is about to go live — never let two run at once. This is
    // what was silently missing before: the old question's timer/UI kept
    // ticking in the background instead of being told to stop.
    if (activeQuestion) handleEndActiveQuestion()

    try {
      const response = await fetch(`${API_URL}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: room._id,
          type: question.type,
          question: question.question,
          options: question.options,
          explanation: question.explanation,
          segmentIndex: question.segmentIndex,
          timeToAnswer: question.timeToAnswer || roomSettings.timeToAnswer || 30,
          points: question.points || roomSettings.points || 100,
          status: 'approved'
        })
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedQuestions(prev => [data.question, ...prev])
        
        // Store recent question for quick re-poll
        setRecentQuestion(data.question)
        // Reset answer counts for new question
        setAnswerCounts(prev => ({ ...prev, [data.question._id]: 0 }))
        setAnswerCountsByOption(prev => ({ ...prev, [data.question._id]: {} }))

        // Emit to students via socket
        if (socket && isConnected) {
          socket.emit('new_question', {
            roomCode: room.code,
            question: data.question
          })
        }
      }
    } catch (error) {
      console.error('Failed to save question:', error)
    }
  }

  const handleRejectQuestion = (question) => {
    console.log('Question rejected:', question.question)
  }

  // Save + emit a question picked from the AI queue
  const handleLaunchQueuedQuestion = async (question) => {
    if (activeQuestion) handleEndActiveQuestion()

    try {
      const response = await fetch(`${API_URL}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: room._id,
          type: question.type,
          question: question.question,
          options: question.options,
          explanation: question.explanation,
          segmentIndex: question.segmentIndex,
          timeToAnswer: question.timeToAnswer || roomSettings.timeToAnswer || 30,
          points: question.points || roomSettings.points || 100,
          status: 'approved'
        })
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedQuestions(prev => [data.question, ...prev])
        
        // Store recent question for quick re-poll
        setRecentQuestion(data.question)
        // Reset answer counts for new question
        setAnswerCounts(prev => ({ ...prev, [data.question._id]: 0 }))
        setAnswerCountsByOption(prev => ({ ...prev, [data.question._id]: {} }))

        if (socket && isConnected) {
          socket.emit('new_question', {
            roomCode: room.code,
            question: data.question
          })
        }
      }
    } catch (error) {
      console.error('Failed to launch queued question:', error)
    }
  }

  // Quick re-poll - relaunch the most recently asked question
  const handleQuickRepoll = async () => {
    if (!recentQuestion) return
    if (activeQuestion) handleEndActiveQuestion()

    try {
      // Create a duplicate of the question with a new timestamp
      const response = await fetch(`${API_URL}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: room._id,
          type: recentQuestion.type,
          question: recentQuestion.question,
          options: recentQuestion.options,
          explanation: recentQuestion.explanation,
          segmentIndex: recentQuestion.segmentIndex,
          timeToAnswer: roomSettings.timeToAnswer || 30,
          points: roomSettings.points || 100,
          status: 'approved'
        })
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedQuestions(prev => [data.question, ...prev])
        
        // Reset answer counts for new question
        setAnswerCounts(prev => ({ ...prev, [data.question._id]: 0 }))
        setAnswerCountsByOption(prev => ({ ...prev, [data.question._id]: {} }))
        
        // Update recent question reference
        setRecentQuestion(data.question)

        if (socket && isConnected) {
          socket.emit('new_question', {
            roomCode: room.code,
            question: data.question
          })
        }
      }
    } catch (error) {
      console.error('Failed to quick re-poll question:', error)
    }
  }

  // Handle approve from TextQuestionApprovalPopup (text-based questions)
  const handleTextQuestionApprove = async (question) => {
    if (activeQuestion) handleEndActiveQuestion()

    try {
      const response = await fetch(`${API_URL}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: room._id,
          type: question.type,
          question: question.question,
          options: question.options,
          explanation: question.explanation,
          segmentIndex: question.segmentIndex,
          timeToAnswer: question.timeToAnswer || roomSettings.timeToAnswer || 30,
          points: question.points || roomSettings.points || 100,
          status: 'approved'
        })
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedQuestions(prev => [data.question, ...prev])
        setAnswerCounts(prev => ({ ...prev, [data.question._id]: 0 }))
        setAnswerCountsByOption(prev => ({ ...prev, [data.question._id]: {} }))

        if (socket && isConnected) {
          socket.emit('new_question', {
            roomCode: room.code,
            question: data.question
          })
        }
      }
    } catch (error) {
      console.error('Failed to save text question:', error)
    }
  }

  const handleTextQuestionReject = (question) => {
    console.log('Text question rejected:', question.question)
  }

  const handleTextQuestionClose = () => {
    setShowTextQuestionPopup(false)
    setPendingTextQuestions([])
  }

  const handleCreateQuestion = async (questionData) => {
    if (activeQuestion) handleEndActiveQuestion()

    try {
      const response = await fetch(`${API_URL}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId: room._id,
          type: questionData.type,
          question: questionData.question,
          options: questionData.options,
          timeToAnswer: questionData.timeToAnswer || roomSettings.timeToAnswer || 30,
          points: questionData.points || roomSettings.points || 100,
          status: 'approved'
        })
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedQuestions(prev => [data.question, ...prev])
        setAnswerCounts(prev => ({ ...prev, [data.question._id]: 0 }))
        setAnswerCountsByOption(prev => ({ ...prev, [data.question._id]: {} }))

        // Emit to socket for students to receive (include roomCode)
        console.log('Emitting new_question event:', { roomCode: room.code, question: data.question })
        console.log('Socket connected:', !!socket, 'isConnected:', isConnected, 'isRoomJoined:', isRoomJoined)
        if (socket && isConnected) {
          socket.emit('new_question', {
            roomCode: room.code,
            question: data.question
          })
          console.log('new_question event emitted successfully')
        } else {
          console.error('Socket not available or not connected:', { socket: !!socket, isConnected })
        }
      } else {
        const errorData = await response.json()
        console.error('Failed to save question:', errorData)
        alert('Failed to save question: ' + (errorData.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to create question:', error)
      alert('Failed to create question')
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1,marginLeft: 'var(--sidebar-width)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
            <p style={{ color: 'var(--text-secondary)' }}>Loading room...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: 'var(--sidebar-width)', padding: '32px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
            <h2 style={{ color: 'var(--text-primary)' }}>{error || 'Room not found'}</h2>
            <button onClick={() => navigate('/teacher')} style={{
              marginTop: '16px',
              padding: '12px 24px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer'
            }}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isEnded = !!room.endedAt

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', width: '100vw', maxWidth: '100vw', overflowX: 'hidden' }}>
      <Sidebar user={user} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width)', minWidth: 0, maxWidth: 'calc(100vw - var(--sidebar-width))', overflowX: 'hidden', height: '100vh' }}>
        {/* Header */}
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>{room?.name || 'Room'} Results</h1>
            <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                  Code: {room?.code} • Ongoing
                </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div id="room-page-root" style={{ flex: 1, padding: '24px 32px', width: '100%', boxSizing: 'border-box', overflowX: 'hidden', overflowY: 'auto' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#dc2626' }}>
              {error}
            </div>
          )}

          {/* Room Code Row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--bg-card)',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '20px'
          }}>
            <button onClick={() => navigate('/teacher')} className="btn-hover" style={{
              padding: '8px 12px',
              background: 'var(--nav-hover)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '18px'
            }}>
              ←
            </button>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 20px',
              border: '2px solid var(--border-color)',
              borderRadius: '10px'
            }}>
              <span style={{ fontSize: '28px', fontWeight: '700', color: '#1e40af', letterSpacing: '4px' }}>
                {room.code}
              </span>
              <button onClick={copyRoomCode} disabled={isEnded} className="btn-hover" style={{
                padding: '4px 12px',
                background: isEnded ? '#9ca3af' : (copied ? '#10b981' : '#3b82f6'),
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: isEnded ? 'not-allowed' : 'pointer'
              }}>
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>

            <div style={{ flex: 1 }} />

            {/* Segment Timer Display */}
            {isRecording && (
              <div style={{
                padding: '8px 16px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '14px', color: '#ef4444', fontWeight: '600' }}>
                  Segment {currentSegment}
                </span>
                <span style={{ fontSize: '20px', color: '#ef4444', fontWeight: '700' }}>
                  {formatTime(segmentTimeLeft)}
                </span>
              </div>
            )}

            {/* Show Results Button - Appears when poll ends */}
            {!activeQuestion && recentQuestion && (
              <button
                onClick={() => setShowResultsModal(true)}
                className="btn-hover"
                style={{
                  padding: '8px 16px',
                  background: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                📊 Show Results
              </button>
            )}

            {/* Quick Re-poll Button - Relaunch last question */}
            {!isEnded && recentQuestion && !activeQuestion && (
              <button
                onClick={handleQuickRepoll}
                className="btn-hover"
                style={{
                  padding: '8px 16px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                🔄 Quick Re-poll
              </button>
            )}

            {/* Paste & Generate Button */}
            {!isEnded && (
              <button
                onClick={() => setShowTextToQuestions(true)}
                className="btn-hover"
                style={{
                  padding: '8px 16px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                📝 Paste & Generate
              </button>
            )}

            {/* Create Question Button */}
            {!isEnded && (
              <button
                onClick={() => setShowCreateQuestion(true)}
                className="btn-hover"
                style={{
                  padding: '8px 16px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                ✍️ Create Q
              </button>
            )}

            {/* Settings button - ref kept for future use, modal is now top-level */}
            <div ref={settingsRef}>
              <button
                onClick={() => setShowSettings(true)}
                className="btn-hover"
                style={{
                  padding: '8px 16px',
                  background: 'var(--nav-hover)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                ⚙️ Settings
              </button>
            </div>

            {/* Room Settings Modal - top-level, fixed positioned, not inside toolbar */}
            <RoomSettingsModal
              isOpen={showSettings}
              onClose={() => setShowSettings(false)}
              settings={roomSettings}
              onSave={async (newSettings) => {
                setRoomSettings(newSettings)
                try {
                  await fetch(`${API_URL}/rooms/${room._id}`, {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ settings: newSettings })
                  })
                } catch (err) {
                  console.error('Failed to save room settings:', err)
                }
                setShowSettings(false)
              }}
            />

            {/* End Room Button */}
            {!isEnded && (
              <button onClick={handleEndRoom} className="btn-hover" style={{
                padding: '8px 16px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}>
                End Room
              </button>
            )}
          </div>

          {/* Microphone and Transcription Row - 30/70 Split */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', alignItems: 'flex-start' }}>
            {/* Microphone Card - 30% */}
            <div className="card-hover" style={{
              flex: '1 1 calc(30% - 10px)',
              minWidth: '280px',
              maxWidth: '100%',
              height: '420px', 
              overflow: 'auto',
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              boxSizing: 'border-box'
            }}>
              {/* Mic Button */}
              <button
                onClick={toggleRecording}
                disabled={isEnded}
                className={isRecording ? 'mic-btn mic-btn-recording' : 'mic-btn'}
                style={{
                  width: '80px',
                  height: '80px',
                  marginTop: '4px',
                  marginBottom: '8px',
                  flexShrink: 0,
                  borderRadius: '50%',
                  background: isEnded
                    ? 'linear-gradient(135deg, #6b7280, #9ca3af)'
                    : (isRecording
                      ? 'linear-gradient(135deg, #dc2626, #ef4444)'
                      : 'linear-gradient(135deg, #10b981, #059669)'),
                  color: 'white',
                  border: 'none',
                  cursor: isEnded ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  boxShadow: isRecording
                    ? '0 0 0 rgba(239, 68, 68, 0.5)'
                    : '0 8px 25px rgba(16, 185, 129, 0.4)',
                  transform: isRecording ? 'scale(1.05)' : 'scale(1)',
                  transition: 'transform 0.3s ease, background 0.3s ease'
                }}
              >
                {isRecording ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                )}
              </button>

              {/* Status Text */}
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: isRecording ? '#ef4444' : 'var(--text-primary)' }}>
                  {isTranscribing ? 'Listening...' : (isRecording ? 'Recording...' : 'Start Recording')}
                </p>
                {modelStatus !== 'Listening...' && (
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {modelStatus}
                  </p>
                )}
              </div>

              {/* Live indicator */}
              {isRecording && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '20px'
                }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'blink 1s infinite' }} />
                  <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '500' }}>LIVE</span>
                </div>
              )}

              {/* Settings Labels Below Mic */}
              <div style={{
                width: '100%',
                background: 'var(--bg-primary)',
                borderRadius: '10px',
                padding: '10px',
                fontSize: '11px'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Provider:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{safeProvider(roomSettings.questionProvider)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Time/Answer:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{roomSettings.timeToAnswer}s</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Points:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{roomSettings.points}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Segment Time:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{roomSettings.segmentTime} min</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Questions/Segment:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{roomSettings.questionsPerSegment}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Difficulty:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
                      {getDifficultyLabel(roomSettings.difficultyMix)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Confusion Indicator */}
              {confusionCount > 0 && (() => {
                const pct = totalStudents > 0 ? Math.round((confusionCount / totalStudents) * 100) : 0
                const level = pct >= 40 ? 'HIGH' : pct >= 20 ? 'MEDIUM' : 'LOW'
                const color = pct >= 40 ? '#dc2626' : pct >= 20 ? '#f59e0b' : '#10b981'
                return (
                  <div style={{
                    width: '100%', padding: '10px 12px', borderRadius: '10px',
                    background: `${color}18`, border: `1px solid ${color}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontSize: '11px', color, fontWeight: '700' }}>😕 CLASS CONFUSION: {level}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {confusionCount} of {totalStudents || '?'} students
                      </div>
                    </div>
                    <button
                      onClick={() => setConfusionCount(0)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: 'var(--text-secondary)' }}
                    >Clear</button>
                  </div>
                )
              })()}
            </div>

            {/* Transcription Card - 70% */}
            <div className="card-hover" style={{
              flex: '1 1 calc(70% - 10px)',
              minWidth: '300px',
              maxWidth: '100%',
              maxHeight: '420px', // Changed from height: '420px' to allow dynamic expansion
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: '1px solid var(--border-color)',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🎙️</span>
                  <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    Real-time Transcription
                  </span>
                  {isTranscribing && (
                    <div style={{ padding: '2px 8px', background: '#fef2f2', borderRadius: '10px', fontSize: '10px', color: '#ef4444', fontWeight: '600' }}>
                      LIVE
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {transcript && (
                    <button onClick={clearTranscript} className="btn-hover" style={{
                      padding: '4px 12px',
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}>
                      ✕ Clear
                    </button>
                  )}
                  <button
                    onClick={handleManualGenerateQuestions}
                    disabled={isGeneratingQuestions || !transcript}
                    className="btn-hover"
                    style={{
                      padding: '4px 12px',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: isGeneratingQuestions || !transcript ? 'not-allowed' : 'pointer',
                      opacity: isGeneratingQuestions || !transcript ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {isGeneratingQuestions ? '⏳ Generating...' : '🔄 Generate Q'}
                  </button>
                </div>
              </div>

              {/* Fixed scrolling layer */}
              <div ref={transcriptRef} style={{
                flex: 1,
                fontSize: '15px',
                lineHeight: '1.8',
                color: transcript ? 'var(--text-primary)' : 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowY: 'auto',
                overscrollBehavior: 'contain'
              }}>
                {transcript ? transcript : (
                  <span style={{ fontStyle: 'italic' }}>
                    Click the microphone to start real-time transcription.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Active Poll Banner - Teacher only, in content (not toolbar) */}
          {activeQuestion && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '12px 20px',
              background: 'var(--bg-card)',
              borderRadius: '12px',
              border: `2px solid ${questionTimeLeft <= 5 ? '#ef4444' : '#10b981'}`,
              marginBottom: '20px',
              flexWrap: 'wrap'
            }}>
              <span style={{ fontWeight: '600', color: 'var(--text-primary)', flex: 1, fontSize: '14px' }}>
                📢 {activeQuestion.question?.substring(0, 80)}...
              </span>

              {/* Countdown timer */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                background: questionTimeLeft <= 5 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.1)',
                borderRadius: '8px',
                border: `1.5px solid ${questionTimeLeft <= 5 ? '#ef4444' : '#10b981'}`
              }}>
                <span style={{ fontSize: '13px', color: questionTimeLeft <= 5 ? '#ef4444' : '#10b981', fontWeight: '600' }}>⏱️ Answer</span>
                <span style={{
                  fontSize: '20px',
                  fontWeight: '700',
                  color: questionTimeLeft <= 5 ? '#ef4444' : '#10b981',
                  animation: questionTimeLeft <= 5 ? 'pulse 0.5s infinite' : 'none'
                }}>{questionTimeLeft}s</span>
              </div>

              <button
                onClick={handleEndActiveQuestion}
                className="btn-hover"
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: '1.5px solid #ef4444',
                  background: 'rgba(239,68,68,0.1)',
                  color: '#ef4444',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                ⏹ End Poll
              </button>

              {/* Response metric - teacher only, never leaks to student */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
                padding: '6px 14px',
                background: 'rgba(59,130,246,0.08)',
                borderRadius: '8px',
                border: '1.5px solid #3b82f6',
                minWidth: '130px'
              }}>
                <span style={{ fontSize: '13px', color: '#3b82f6', fontWeight: '600' }}>
                  📊 {totalStudents > 0
                    ? Math.round(((answerCounts[activeQuestion._id] || 0) / totalStudents) * 100)
                    : 0}% Responded
                </span>
                <div style={{ height: '3px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${totalStudents > 0 ? Math.round(((answerCounts[activeQuestion._id] || 0) / totalStudents) * 100) : 0}%`,
                    background: '#3b82f6',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            </div>
          )}

          {/* Third Row - Session Questions (flex) + Leaderboard (flex) */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', width: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
            {/* Session Questions - flexible width */}
            <div className="card-hover" style={{ flex: '1 1 calc(70% - 10px)', minWidth: '300px', maxWidth: '100%', background: 'var(--bg-card)', borderRadius: '16px', padding: '20px', boxSizing: 'border-box', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '20px' }}>📝</span>
                <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  Session Questions
                </span>
                {generatedQuestions.length > 0 && (
                  <span style={{
                    padding: '2px 10px',
                    background: '#d1fae5',
                    color: '#059669',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    {generatedQuestions.length}
                  </span>
                )}
              </div>

              {generatedQuestions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {generatedQuestions.map((q, index) => (
                    <div key={q._id || index} style={{
                      padding: '14px 16px',
                      background: 'var(--bg-primary)',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px'
                    }}>
                      <span style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: '#3b82f6',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: '600',
                        flexShrink: 0
                      }}>
                        {index + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: '600',
                            background: q.type === 'MCQ' ? '#3b82f620' : q.type === 'TF' ? '#10b9820' : '#8b5cf620',
                            color: q.type === 'MCQ' ? '#3b82f6' : q.type === 'TF' ? '#10b982' : '#8b5cf6'
                          }}>
                            {q.type}
                          </span>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: '600',
                            background: '#fef3c7',
                            color: '#92400e'
                          }}>
                            {q.points || 100} pts
                          </span>
                        </div>
                        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.5', fontWeight: '500' }}>
                          {q.question}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {(q.options || []).map((opt, optIdx) => {
                            const letter = String.fromCharCode(65 + optIdx)
                            return (
                              <div key={optIdx} style={{
                                padding: '8px 12px',
                                background: opt.isCorrect ? '#d1fae5' : 'var(--bg-secondary)',
                                border: `2px solid ${opt.isCorrect ? '#059669' : 'var(--border-color)'}`,
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '13px',
                                color: opt.isCorrect ? '#059669' : 'var(--text-primary)'
                              }}>
                                <span style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '50%',
                                  background: opt.isCorrect ? '#059669' : 'var(--border-color)',
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  flexShrink: 0
                                }}>
                                  {letter}
                                </span>
                                <span style={{ fontWeight: opt.isCorrect ? '600' : '400' }}>
                                  {opt.text}
                                </span>
                                {opt.isCorrect && (
                                  <span style={{ marginLeft: 'auto', fontSize: '12px' }}>✓</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', marginLeft: '8px' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          background: (answerCounts[q._id] || 0) > 0 ? '#d1fae5' : '#fef3c7',
                          color: (answerCounts[q._id] || 0) > 0 ? '#059669' : '#92400e'
                        }}>
                          {answerCounts[q._id] || 0}/{totalParticipants}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>answered</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '32px',
                  color: 'var(--text-secondary)',
                  fontSize: '13px'
                }}>
                  No questions generated yet. Start recording to auto-generate questions.
                </div>
              )}
            </div>
            {/* Leaderboard - flexible width */}
            <div className="card-hover" style={{ flex: '1 1 calc(30% - 10px)', minWidth: '280px', maxWidth: '100%', background: 'var(--bg-card)', borderRadius: '16px', padding: '20px', boxSizing: 'border-box', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '20px' }}>🏆</span>
                <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  Leaderboard
                </span>
              </div>
              <Leaderboard roomId={room?._id} token={token} socket={socket} />
            </div>
          </div>
        </div>
      </div>

      {/* Question Approval Popup */}
      {showQuestionPopup && pendingQuestions.length > 0 && (
        <QuestionApprovalPopup
          questions={pendingQuestions}
          onApprove={handleApproveQuestion}
          onReject={handleRejectQuestion}
          onComplete={() => {
            setShowQuestionPopup(false)
            setIsPopupOpen(false)
            setPendingQuestions([])
            // Timer auto-restarts via useEffect when showQuestionPopup becomes false
          }}
          onClose={() => {
            setShowQuestionPopup(false)
            setIsPopupOpen(false)
            setPendingQuestions([])
            // Timer auto-restarts via useEffect when showQuestionPopup becomes false
          }}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, padding: '12px 20px', borderRadius: '10px',
          background: toast.type === 'error' ? '#dc2626' : toast.type === 'success' ? '#059669' : '#1e40af',
          color: 'white', fontSize: '13px', fontWeight: '500',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          animation: 'pollPopIn 0.2s ease',
          maxWidth: '480px', textAlign: 'center'
        }}>
          {toast.msg}
        </div>
      )}

      {/* Create Question Overlay */}
      {showCreateQuestion && (
        <CreateQuestionOverlay
          isOpen={showCreateQuestion}
          onClose={() => setShowCreateQuestion(false)}
          onLaunch={handleCreateQuestion}
        />
      )}

      {/* Text to Questions Popup */}
      {showTextToQuestions && (
        <TextToQuestionsPopup
          isOpen={showTextToQuestions}
          onClose={() => setShowTextToQuestions(false)}
          onGenerate={handleTextToQuestionsGenerate}
          roomSettings={roomSettings}
          isGenerating={isGeneratingFromText}
        />
      )}

      {/* Generating Questions Popup */}
      {showGeneratingPopup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000
        }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '20px',
            padding: '32px',
            textAlign: 'center',
            minWidth: '280px',
            boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '16px',
              animation: 'spin 1s linear infinite'
            }}>⏳</div>
            <h3 style={{
              margin: '0 0 8px',
              color: 'var(--text-primary)',
              fontSize: '18px',
              fontWeight: '600'
            }}>Generating Questions...</h3>
            <p style={{
              margin: 0,
              color: 'var(--text-secondary)',
              fontSize: '14px'
            }}>Please wait while AI creates your questions</p>
          </div>
        </div>
      )}

      {/* Text Question Approval Popup (for pasted text questions) */}
      {showTextQuestionPopup && pendingTextQuestions.length > 0 && (
        <TextQuestionApprovalPopup
          questions={pendingTextQuestions}
          onApprove={handleTextQuestionApprove}
          onReject={handleTextQuestionReject}
          onClose={handleTextQuestionClose}
          onNext={handleTextQuestionClose}
          onEndActivePoll={handleEndActiveQuestion}
          hasActivePoll={!!activeQuestion}
          activePollText={activeQuestion?.question}
          roomSettings={roomSettings}
          isLast={true}
        />
      )}

      {/* Show Results Modal - Displays quick results after poll ends */}
      {showResultsModal && recentQuestion && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000
        }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '480px',
            width: '90%',
            boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
                📊 Poll Results
              </h3>
              <button onClick={() => setShowResultsModal(false)} style={{
                background: 'transparent',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                color: 'var(--text-secondary)'
              }}>✕</button>
            </div>
            
            <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--text-primary)', fontWeight: '500' }}>
              {recentQuestion.question}
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {(recentQuestion.options || []).map((opt, idx) => {
                const optCount = answerCountsByOption[recentQuestion._id]?.[idx] || 0
                const total = answerCounts[recentQuestion._id] || 0
                const pct = total > 0 ? Math.round((optCount / total) * 100) : 0
                const letter = String.fromCharCode(65 + idx)
                
                return (
                  <div key={idx} style={{
                    padding: '10px 12px',
                    background: opt.isCorrect ? '#d1fae5' : 'var(--bg-secondary)',
                    border: `2px solid ${opt.isCorrect ? '#059669' : 'var(--border-color)'}`,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <span style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: opt.isCorrect ? '#059669' : 'var(--border-color)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: '700'
                    }}>{letter}</span>
                    <span style={{ flex: 1, fontSize: '13px', color: opt.isCorrect ? '#065f46' : 'var(--text-primary)', fontWeight: opt.isCorrect ? '600' : '400' }}>
                      {opt.text}
                    </span>
                    <span style={{ fontSize: '11px', color: opt.isCorrect ? '#059669' : 'var(--text-secondary)', fontWeight: '600' }}>
                      {pct}% ({optCount})
                    </span>
                  </div>
                )
              })}
            </div>
            
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowResultsModal(false)}
                className="btn-hover"
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowResultsModal(false)
                  navigate(`/teacher/room/${roomId}/results`)
                }}
                className="btn-hover"
                style={{
                  padding: '8px 16px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                View Full Results →
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @keyframes recordRing {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
          70% { box-shadow: 0 0 0 14px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .mic-btn-recording {
          animation: recordRing 1.5s ease-out infinite;
        }
        .btn-hover {
          transition: filter 0.15s ease, transform 0.15s ease;
        }
        .btn-hover:hover:not(:disabled) {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }
        .btn-hover:active:not(:disabled) {
          transform: translateY(0);
        }
        .card-hover {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .card-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
        }
          /* Fix z-index clipping from card hover transforms */
        .card-hover {
          position: relative;
          z-index: 0;
          isolation: isolate;
        }

        /* Fix white flash on load/theme switch */
        html, body {
          background: var(--bg-primary) !important;
          overflow-x: hidden;
        }

        /* Fix right-edge overflow track */
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
    </div>
  )
}

export default RoomDetailPage