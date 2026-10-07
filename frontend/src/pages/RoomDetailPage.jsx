import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import useThemeStore from '../stores/themeStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import QuestionApprovalPopup from '../components/QuestionApprovalPopup'
import TextQuestionApprovalPopup from '../components/TextQuestionApprovalPopup'
import CreateQuestionOverlay from '../components/CreateQuestionOverlay'
import TextToQuestionsPopup from '../components/TextToQuestionsPopup'
import RoomSettingsModal from '../components/RoomSettingsModal'
import Leaderboard from '../components/Leaderboard'
import ErrorBoundary from '../components/ErrorBoundary'
import YouTubeVideo, { extractYouTubeId } from '../components/YouTubeVideo'
import useIsMobile from '../hooks/useIsMobile'
import { saveTranscript } from '../services/transcriptService'
import { transcribeAudio, getTranscriptionStatus, convertWebMToWav } from '../services/serverTranscriptionService'
import { requestQuestionGeneration, fetchAllRoomQuestions } from '../services/questionService'
import { API_URL } from '../config.js'

function RoomDetailPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { socket, isConnected, joinRoom, leaveRoom } = useSocketStore()
  const { getRoom, updateRoom, setAuthToken } = useRoomStore()
  const { isDark } = useThemeStore()
  const isMobile = useIsMobile()
  // Room code + participant count use a deep blue on light, but that reads too dark on the dark card;
  // switch to white in dark mode for clean, high contrast.
  const codeColor = isDark ? '#ffffff' : '#1e40af'

  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRoomJoined, setIsRoomJoined] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [coHostCodeCopied, setCoHostCodeCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = useRef(null)
  const transcriptRef = useRef(null)
  const roomCodeRef = useRef('')

  useEffect(() => {
    if (room?.code) {
      roomCodeRef.current = room.code
    }
  }, [room?.code])

  // Real-time transcription state
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [modelStatus, setModelStatus] = useState('Ready')
  const [remoteRecorder, setRemoteRecorder] = useState({ isRecording: false, teacherName: '', teacherId: '' })

  // MediaRecorder refs for server-side Whisper transcription
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const transcriptionIntervalRef = useRef(null)
  const finalTranscriptRef = useRef('')
  const accumulatedTranscriptRef = useRef('')
  // Aborts any in-flight generation poll (Phase 2D) when the page unmounts.
  const genAbortRef = useRef(null)
  const segmentTranscriptRef = useRef('')
  const recordingActiveRef = useRef(false)
  const selectedMimeTypeRef = useRef('audio/webm')
  const mediaRecorderStopPromiseRef = useRef(null)

  // Transcription queue for ordered processing
  const transcriptionQueueRef = useRef([])
  const nextSequenceRef = useRef(0)
  const pendingSequenceRef = useRef(0)
  const isProcessingQueueRef = useRef(false)

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
  const [batchLauncher, setBatchLauncher] = useState(null)
  const [popupIndex, setPopupIndex] = useState(0)
  const [showCreateQuestion, setShowCreateQuestion] = useState(false)
  const [showTextToQuestions, setShowTextToQuestions] = useState(false)
  const [creatorLock, setCreatorLock] = useState(null) // { userId, name, roleLabel, action: 'create' | 'paste' }
  const [pastedText, setPastedText] = useState('') // preserved so a failed generation can reopen the popup with the text intact
  const [isGeneratingFromText, setIsGeneratingFromText] = useState(false)
  const [showTextQuestionPopup, setShowTextQuestionPopup] = useState(false)
  const [showGeneratingPopup, setShowGeneratingPopup] = useState(false)
  const [pendingTextQuestions, setPendingTextQuestions] = useState([])
  const [generatedQuestions, setGeneratedQuestions] = useState([])
  // Segment pause/resume state
  const [isSegmentPaused, setIsSegmentPaused] = useState(false)
  const [segmentTimerValue, setSegmentTimerValue] = useState(0) // frozen value when paused
  // Pending review state - when timer hits zero and questions auto-generated
  const [isPendingReview, setIsPendingReview] = useState(false)
  const [generateQEnabled, setGenerateQEnabled] = useState(true) // fail-safe button
  const [roomSettings, setRoomSettings] = useState({
    segmentTime: 2,
    questionsPerSegment: 2,
    difficulty: 'medium',
    questionProvider: 'minimax',
    questionTypeMix: { MCQ: 0, TF: 100, MSQ: 0 },
    timeToAnswer: 30,
    points: 100
  })
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [answerCounts, setAnswerCounts] = useState({}) // questionId -> count
  const [activeCoHostCode, setActiveCoHostCode] = useState('')
  const [activeCoHostCodeExpiresAt, setActiveCoHostCodeExpiresAt] = useState(null)
  const [codeDuration, setCodeDuration] = useState(15)
  const [maxCoHostsInput, setMaxCoHostsInput] = useState(0)
  const [codeTimeLeft, setCodeTimeLeft] = useState(null)

  const isOwner = room && String(room.teacher?._id ?? room.teacher) === String(user?._id)
  const isCoHost = room && !isOwner && Array.isArray(room.coHosts) && room.coHosts.some(ch => String(ch.userId?._id ?? ch.userId) === String(user?._id))

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
      genAbortRef.current?.abort() // stop any in-flight generation poll
    }
  }, [roomId])

  useEffect(() => {
    if (room?.code && user?._id) {
      joinRoom(room.code, user._id)
    }
  }, [room?.code, user?._id])

  // Co-host socket event listeners
  useEffect(() => {
    if (!socket) return

    const handleCoHostCodeGenerated = (data) => {
      if (data?.coHostCode) {
        setActiveCoHostCode(data.coHostCode)
        setActiveCoHostCodeExpiresAt(data.coHostCodeExpiresAt)
      }
    }

    const handleCoHostCodeError = (data) => {
      console.error('[COHOST CODE ERROR]', data?.error)
      setError(data?.error || 'Failed to generate co-host code')
    }

    const handleCoHostJoined = (data) => {
      if (data?.coHosts) {
        setRoom(prev => prev ? { ...prev, coHosts: data.coHosts } : prev)
      }
    }

    const handleCoHostLeft = (data) => {
      if (data?.coHosts) {
        setRoom(prev => prev ? { ...prev, coHosts: data.coHosts } : prev)
      }
    }

    const handleRemovedFromRoom = () => {
      navigate('/teacher')
    }

    socket.on('cohost:code-generated', handleCoHostCodeGenerated)
    socket.on('cohost:code-error', handleCoHostCodeError)
    socket.on('cohost:joined', handleCoHostJoined)
    socket.on('cohost:left', handleCoHostLeft)
    socket.on('cohost:removed-from-room', handleRemovedFromRoom)
    socket.on('cohost:left-confirmed', handleRemovedFromRoom)

    return () => {
      socket.off('cohost:code-generated', handleCoHostCodeGenerated)
      socket.off('cohost:code-error', handleCoHostCodeError)
      socket.off('cohost:joined', handleCoHostJoined)
      socket.off('cohost:left', handleCoHostLeft)
      socket.off('cohost:removed-from-room', handleRemovedFromRoom)
      socket.off('cohost:left-confirmed', handleRemovedFromRoom)
    }
  }, [socket, navigate])

  // Countdown timer for co-host join code expiry
  useEffect(() => {
    if (!activeCoHostCodeExpiresAt) {
      setCodeTimeLeft(null)
      return
    }
    const updateCountdown = () => {
      const diff = Math.max(0, Math.floor((new Date(activeCoHostCodeExpiresAt).getTime() - Date.now()) / 1000))
      setCodeTimeLeft(diff)
    }
    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [activeCoHostCodeExpiresAt])


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

  // Answer counts arrive live (absolute, server-computed) on the throttled 'counts:updated'
  // event. This is now separate from the ranked leaderboard, which is deferred to a quiet-
  // debounce so its heavy recompute stays out of the answer burst.
  useEffect(() => {
    if (!socket) return
    const handleCounts = (payload) => {
      if (payload?.counts) setAnswerCounts(payload.counts)
    }
    socket.on('counts:updated', handleCounts)
    return () => socket.off('counts:updated', handleCounts)
  }, [socket])

  // Listen for question launch & end events to sync active question & timer across Host & Co-Host
  useEffect(() => {
    if (!socket) return

    const startQuestionTimer = (question, launchedAt) => {
      const timeToAnswer = question?.timeToAnswer || roomSettings.timeToAnswer || 30
      const startTime = launchedAt ? new Date(launchedAt).getTime() : Date.now()

      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current)
        questionTimerRef.current = null
      }

      const getRemaining = () => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
        return Math.max(0, timeToAnswer - elapsedSeconds)
      }

      const initialRemaining = getRemaining()
      setActiveQuestion(question)
      setQuestionTimeLeft(initialRemaining)

      if (initialRemaining <= 0) {
        setActiveQuestion(null)
        return
      }

      questionTimerRef.current = setInterval(() => {
        const remaining = getRemaining()
        setQuestionTimeLeft(remaining)
        if (remaining <= 0) {
          clearInterval(questionTimerRef.current)
          questionTimerRef.current = null
          setActiveQuestion(null)
        }
      }, 1000)
    }

    const handleQuestionLaunched = (data) => {
      console.log('[QUESTION LAUNCHED SOCKET EVENT]', data)
      const q = data?.question || (data?.questionId ? data : null)
      if (q) {
        startQuestionTimer(q, data?.startedAt || data?.startTime)
      }
      if (room?._id) {
        loadQuestions(room._id)
      }
    }

    const handleQuestionEnded = (data) => {
      console.log('[QUESTION ENDED SOCKET EVENT]', data)
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current)
        questionTimerRef.current = null
      }
      setActiveQuestion(null)
      setQuestionTimeLeft(0)
      if (room?._id) {
        loadQuestions(room._id)
      }
    }

    const handleRoomSettingsUpdated = (data) => {
      console.log('[ROOM SETTINGS UPDATED SOCKET EVENT]', data)
      if (data?.settings) {
        setRoomSettings(prev => ({
          ...prev,
          ...data.settings
        }))
      }
    }

    const handleRoomEnded = (data) => {
      console.log('[ROOM ENDED SOCKET EVENT]', data)
      const rId = data?.roomId || room?._id || roomId
      if (rId) {
        navigate(`/teacher/room/${rId}/results`)
      }
    }

    const handleRecordingStarted = (data) => {
      console.log('[RECORDING STARTED SOCKET EVENT]', data)
      const roleLabel = data?.isOwner ? 'Host' : 'Co-Host'
      setRemoteRecorder({
        isRecording: true,
        teacherName: data?.teacherName || roleLabel,
        isOwner: !!data?.isOwner,
        roleLabel,
        teacherId: data?.teacherId
      })
      setIsTranscribing(true)
    }

    const handleRecordingStopped = (data) => {
      console.log('[RECORDING STOPPED SOCKET EVENT]', data)
      setRemoteRecorder({
        isRecording: false,
        teacherName: '',
        teacherId: ''
      })
      setIsTranscribing(false)
    }

    const handleTranscriptUpdated = (data) => {
      console.log('[TRANSCRIPT UPDATED SOCKET EVENT]', data?.transcript)
      if (data?.transcript !== undefined) {
        setTranscript(data.transcript)
        setSegmentTranscript(data.transcript)
        finalTranscriptRef.current = data.transcript
        segmentTranscriptRef.current = data.transcript
      }
    }

    const handleTranscriptCleared = () => {
      setTranscript('')
      finalTranscriptRef.current = ''
      setSegmentTranscript('')
      segmentTranscriptRef.current = ''
    }

    const handleShowReviewPopup = (data) => {
      console.log('[SHOW REVIEW POPUP SOCKET EVENT]', data)
      if (data?.questions && Array.isArray(data.questions) && data.questions.length > 0) {
        setBatchLauncher(null)
        setPopupIndex(0)
        setPendingQuestions(data.questions)
        setShowQuestionPopup(true)
        setIsPopupOpen(true)
      }
    }

    const handleHideReviewPopup = () => {
      console.log('[HIDE REVIEW POPUP SOCKET EVENT]')
      setShowQuestionPopup(false)
      setIsPopupOpen(false)
      setPendingQuestions([])
    }

    const handleGenStatus = (data) => {
      console.log('[GEN STATUS SOCKET EVENT]', data)
      setIsGeneratingQuestions(!!data?.isGenerating)
      setGenerateQEnabled(!data?.isGenerating)
    }

    const handleLauncherLocked = (data) => {
      console.log('[LAUNCHER LOCKED SOCKET EVENT]', data)
      if (data?.launcher) {
        setBatchLauncher(data.launcher)
      }
    }

    const handleLauncherUnlocked = () => {
      console.log('[LAUNCHER UNLOCKED SOCKET EVENT]')
      setBatchLauncher(null)
    }

    const handlePopupNav = (data) => {
      console.log('[POPUP NAV SOCKET EVENT]', data)
      if (typeof data?.index === 'number') {
        setPopupIndex(data.index)
      }
    }

    socket.on('new_question', handleQuestionLaunched)
    socket.on('question:started', handleQuestionLaunched)
    socket.on('question:ended', handleQuestionEnded)
    socket.on('room:settings-updated', handleRoomSettingsUpdated)
    socket.on('room:ended', handleRoomEnded)
    socket.on('recording:started', handleRecordingStarted)
    socket.on('recording:stopped', handleRecordingStopped)
    socket.on('recording:transcript-updated', handleTranscriptUpdated)
    socket.on('recording:transcript-cleared', handleTranscriptCleared)
    const handleCreatorLocked = (data) => {
      console.log('[CREATOR LOCKED SOCKET EVENT]', data)
      if (data?.creator) {
        setCreatorLock(data.creator)
      }
    }

    const handleCreatorUnlocked = () => {
      console.log('[CREATOR UNLOCKED SOCKET EVENT]')
      setCreatorLock(null)
    }

    socket.on('questions:show-popup', handleShowReviewPopup)
    socket.on('questions:hide-popup', handleHideReviewPopup)
    socket.on('questions:gen-status', handleGenStatus)
    socket.on('questions:launcher-locked', handleLauncherLocked)
    socket.on('questions:launcher-unlocked', handleLauncherUnlocked)
    socket.on('questions:popup-nav', handlePopupNav)
    socket.on('questions:creator-locked', handleCreatorLocked)
    socket.on('questions:creator-unlocked', handleCreatorUnlocked)

    return () => {
      socket.off('new_question', handleQuestionLaunched)
      socket.off('question:started', handleQuestionLaunched)
      socket.off('question:ended', handleQuestionEnded)
      socket.off('room:settings-updated', handleRoomSettingsUpdated)
      socket.off('room:ended', handleRoomEnded)
      socket.off('recording:started', handleRecordingStarted)
      socket.off('recording:stopped', handleRecordingStopped)
      socket.off('recording:transcript-updated', handleTranscriptUpdated)
      socket.off('recording:transcript-cleared', handleTranscriptCleared)
      socket.off('questions:show-popup', handleShowReviewPopup)
      socket.off('questions:hide-popup', handleHideReviewPopup)
      socket.off('questions:gen-status', handleGenStatus)
      socket.off('questions:launcher-locked', handleLauncherLocked)
      socket.off('questions:launcher-unlocked', handleLauncherUnlocked)
      socket.off('questions:popup-nav', handlePopupNav)
      socket.off('questions:creator-locked', handleCreatorLocked)
      socket.off('questions:creator-unlocked', handleCreatorUnlocked)
    }
  }, [socket, room?._id, roomSettings.timeToAnswer])

  const isOtherTeacherRecording = remoteRecorder.isRecording && String(remoteRecorder.teacherId) !== String(user?._id)

  // Auto-scroll transcription
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  // Start segment timer when recording
  useEffect(() => {
    console.log('[EFFECT] Timer effect running, isRecording:', isRecording, 'segmentTime:', roomSettings.segmentTime)
    // Only start timer if recording AND not pending review (popup shown)
    if (isRecording && roomSettings.segmentTime > 0 && !isPendingReview) {
      startSegmentTimer()
    } else {
      if (segmentTimerRef.current) {
        clearInterval(segmentTimerRef.current)
      }
    }
  }, [isRecording, roomSettings.segmentTime, isPendingReview])

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])



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
    setIsSegmentPaused(false)

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

  const pauseSegmentTimer = () => {
    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current)
      segmentTimerRef.current = null
    }
    setIsSegmentPaused(true)
    console.log('[TIMER] Timer paused at', segmentTimeLeft, 'seconds')
  }

  const resumeSegmentTimer = () => {
    if (isSegmentPaused && segmentTimeLeft > 0) {
      console.log('[TIMER] Resuming timer from', segmentTimeLeft, 'seconds')
      startSegmentTimer(segmentTimeLeft)
    }
  }

  // On segment timer hit zero - auto-save and auto-generate questions
  const handleSegmentComplete = async () => {
    console.log('[SEGMENT] Timer hit zero - handling segment completion')

    // PAUSE: stop capturing and flush the final complete audio window before using the transcript.
    // In video mode keep the shared tab-audio stream alive for the next segment (only stop the loop).
    if (isVideoMode) {
      await stopVideoTranscriptionLoop()
      ytPlayerRef.current?.pauseVideo?.() // stop the video while questions generate and the poll runs
    } else {
      await stopRecording()
    }

    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current)
      segmentTimerRef.current = null
    }

    // Mark as pending review
    setIsPendingReview(true)
    setGenerateQEnabled(false) // Disable manual button during auto-process

    // Capture transcript
    const textToUse = segmentTranscriptRef.current.trim() || transcript.trim()

    if (!textToUse || textToUse.length < 50) {
      console.log('[SEGMENT] Transcript too short (<50 chars), showing warning')
      // Show warning toast - use window.alert for now since no toast library imported
      window.alert('Transcription too short. Please speak more or trigger manually after starting next segment.')

      // Resume for next segment
      setIsPendingReview(false)
      setGenerateQEnabled(true)
      setCurrentSegment(prev => prev + 1)
      setTranscript('')
      setSegmentTranscript('')
      segmentTranscriptRef.current = ''
      finalTranscriptRef.current = ''
      accumulatedTranscriptRef.current = ''
      startRecording({ resetSegment: false })
      if (isVideoMode) resumeTeacherVideo()
      return
    }

    // Auto-generate questions FIRST. The transcript save is intentionally NOT done before this and
    // never gates generation — a failed/hung transcript POST used to abort the whole segment with no
    // questions. We save the transcript only after questions are produced (below), fire-and-forget.
    let generated = null
    try {
      console.log('[SEGMENT] Auto-generating questions...')
      generated = await generateQuestionsFromText(textToUse, currentSegment)
    } catch (error) {
      console.error('[SEGMENT] First generation attempt failed:', error)
      // Auto-retry once
      try {
        console.log('[SEGMENT] Retrying question generation...')
        generated = await generateQuestionsFromText(textToUse, currentSegment)
      } catch (retryError) {
        console.error('[SEGMENT] Retry also failed:', retryError)
        window.alert('Failed to generate questions after retry. You can use the manual "Generate Q" button.')
        setGenerateQEnabled(true) // Enable fail-safe manual button
        return
      }
    }

    if (generated && generated.length > 0) {
      setBatchLauncher(null)
      setPendingQuestions(generated)
      setShowQuestionPopup(true)
      setIsPopupOpen(true)
      if (socket && room?.code) {
        socket.emit('questions:unlock-launcher', { roomCode: room.code })
        socket.emit('questions:broadcast-popup', { roomCode: room.code, questions: generated, segmentIndex: currentSegment })
      }
      // Questions are in hand and the review popup is up — NOW persist the transcript, fire-and-forget
      // so a slow/failed/hung save can never block the pipeline or lose the generated questions.
      // source defaults to 'audio' (real segment).
      saveTranscript(room._id, currentSegment, textToUse, roomSettings.segmentTime * 60)
        .catch((err) => console.error('[SEGMENT] Failed to save transcript (questions already generated):', err))
    }
  }

  const generateQuestionsFromText = async (text, segmentIndex) => {
    setIsGeneratingQuestions(true)
    setGenerateQEnabled(false)
    if (socket && room?.code) {
      socket.emit('questions:gen-status', { roomCode: room.code, isGenerating: true })
    }
    // New controller per generation; aborted on unmount (see the [roomId] effect cleanup).
    genAbortRef.current = new AbortController()
    try {
      // Backend may answer synchronously (no Redis) or async with a jobId; the helper polls the
      // job internally and returns the same { success, questions } shape either way.
      const data = await requestQuestionGeneration(text, {
        numQuestions: roomSettings.questionsPerSegment,
        difficulty: roomSettings.difficulty,
        provider: roomSettings.questionProvider || 'minimax',
        questionTypeMix: roomSettings.questionTypeMix || { MCQ: 0, TF: 100, MSQ: 0 }
      }, { signal: genAbortRef.current.signal })

      setIsGeneratingQuestions(false)
      setGenerateQEnabled(true)
      if (socket && room?.code) {
        socket.emit('questions:gen-status', { roomCode: room.code, isGenerating: false })
      }
      if (data.success && data.questions && data.questions.length > 0) {
        return data.questions.map(q => ({
          ...q,
          timeToAnswer: roomSettings.timeToAnswer,
          points: roomSettings.points,
          segmentIndex
        }))
      }
      throw new Error(data.error || 'No questions generated')
    } catch (error) {
      setIsGeneratingQuestions(false)
      setGenerateQEnabled(true)
      if (socket && room?.code) {
        socket.emit('questions:gen-status', { roomCode: room.code, isGenerating: false })
      }
      throw error
    }
  }

  // Handle question generation from pasted text (TextToQuestionsPopup)
  const handleTextToQuestionsGenerate = async (text, mode) => {
    setShowTextToQuestions(false) // Close the text popup
    setShowGeneratingPopup(true)  // Show generating popup
    setIsGeneratingFromText(true)

    try {
      const typeMix = mode === 'TF'
        ? { MCQ: 0, TF: 100, MSQ: 0 }
        : (roomSettings.questionTypeMix || { MCQ: 0, TF: 100, MSQ: 0 })

      genAbortRef.current = new AbortController()
      // Helper handles both the sync response and the async (jobId → poll) path.
      const data = await requestQuestionGeneration(text, {
        numQuestions: roomSettings.questionsPerSegment,
        difficulty: roomSettings.difficulty,
        provider: roomSettings.questionProvider || 'minimax',
        questionTypeMix: typeMix
      }, { signal: genAbortRef.current.signal })

      setIsGeneratingFromText(false)
      setShowGeneratingPopup(false) // Close generating popup

      if (data.success && data.questions && data.questions.length > 0) {
        const markedQuestions = data.questions.map(q => ({
          ...q,
          timeToAnswer: roomSettings.timeToAnswer,
          points: roomSettings.points,
          segmentIndex: currentSegment
        }))
        setPendingTextQuestions(markedQuestions)
        setShowTextQuestionPopup(true)
        // Questions generated and the review popup is up — NOW persist the pasted source text,
        // fire-and-forget so a slow/failed/hung save can never block or delay generation. A paste
        // has no segment → source='paste' + sentinel segmentIndex -1 (never collides with audio).
        saveTranscript(room._id, -1, text, 0, 'paste')
          .catch((err) => console.error('[PASTE] Failed to save transcript (questions already generated):', err))
      } else {
        // Generation failed — keep the pasted text and reopen the paste popup so the teacher can
        // retry without re-pasting (the popup unmounts on close, so its own text is otherwise lost).
        setPastedText(text)
        setShowTextToQuestions(true)
        window.alert(data.error || 'Failed to generate questions. Please try again.')
      }
    } catch (error) {
      setIsGeneratingFromText(false)
      setShowGeneratingPopup(false) // Close generating popup
      console.error('Text to questions error:', error)
      if (error.name !== 'AbortError') {
        // Same as above — preserve the pasted text and reopen the popup for a retry.
        setPastedText(text)
        setShowTextToQuestions(true)
        window.alert('Failed to generate questions. Please try again.')
      }
    }
  }

  const loadRoom = async () => {
    setIsLoading(true)
    try {
      const roomData = await getRoom(roomId)
      setRoom(roomData)

      // If room has ended, redirect Host & Co-Host directly to the results page
      if (roomData?.endedAt) {
        navigate(`/teacher/room/${roomData._id}/results`)
        return
      }

      // Seed the live participant count so a mid-session reload doesn't flash 0 until the next join.
      if (roomData?.participants !== undefined) setTotalParticipants(roomData.participants)
      // Apply room settings if they exist
      if (roomData.settings) {
        setRoomSettings(prev => ({
          ...prev,
          ...roomData.settings
        }))
      }
      if (roomData.maxCoHosts !== undefined) {
        setMaxCoHostsInput(roomData.maxCoHosts)
      }
      if (roomData.coHostCode) {
        setActiveCoHostCode(roomData.coHostCode)
      }
      if (roomData.coHostCodeExpiresAt) {
        setActiveCoHostCodeExpiresAt(roomData.coHostCodeExpiresAt)
      }
      // Load questions for this room from database
      loadQuestions(roomId)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerateCoHostCode = () => {
    if (!room?.code) {
      console.warn('[COHOST] Cannot generate code: room.code is missing', room)
      setError('Room code is not available. Please refresh.')
      return
    }
    const { socket, generateCoHostCode: genCode } = useSocketStore.getState()
    if (!socket) {
      console.warn('[COHOST] Cannot generate code: socket connection is missing')
      setError('Real-time connection is not active. Please refresh.')
      return
    }
    genCode(room.code, codeDuration)
  }

  const handleSaveMaxCoHosts = async () => {
    if (!room?._id) return
    try {
      await updateRoom(room._id, { maxCoHosts: Number(maxCoHostsInput) })
      setRoom(prev => prev ? { ...prev, maxCoHosts: Number(maxCoHostsInput) } : prev)
    } catch (err) {
      setError(err.message || 'Failed to update max co-hosts limit')
    }
  }

  const handleRemoveCoHost = (coHostUserId) => {
    if (room?.code) {
      const { removeCoHost: remCoHost } = useSocketStore.getState()
      remCoHost(room.code, coHostUserId)
    }
  }

  const handleLeaveCoHost = () => {
    if (room?.code) {
      const { leaveCoHostRoom: lvcRoom } = useSocketStore.getState()
      lvcRoom(room.code)
      navigate('/teacher')
    }
  }


  const loadQuestions = async (rid) => {
    try {
      // Load ALL questions (pages past the API's 50/page cap) so large rooms show every question,
      // not just the first 50.
      const questions = await fetchAllRoomQuestions(rid)
      setGeneratedQuestions(questions)
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
      const updated = await updateRoom(room._id, {
        isActive: false,
        endedAt: new Date()
      })
      setRoom(updated)
      navigate(`/teacher/room/${room._id}/results`)
    } catch (err) {
      setError(err.message)
    }
  }

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyCoHostCode = () => {
    if (!activeCoHostCode) return
    navigator.clipboard.writeText(activeCoHostCode)
    setCoHostCodeCopied(true)
    setTimeout(() => setCoHostCodeCopied(false), 2000)
  }

  // Process transcription queue in order
  const processTranscriptionQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return
    isProcessingQueueRef.current = true

    while (transcriptionQueueRef.current.length > 0) {
      // Find the next expected sequence number
      const nextItem = transcriptionQueueRef.current.find(item => item.sequence === pendingSequenceRef.current)

      if (!nextItem) {
        // Do not block forever if a sequence was skipped or failed.
        break
      }

      // Remove from queue
      transcriptionQueueRef.current = transcriptionQueueRef.current.filter(item => item !== nextItem)

      // Process the transcription result
      if (nextItem.text && nextItem.text.trim()) {
        const text = nextItem.text.trim()
        console.log(`[TRANSCRIPTION] Processing sequence ${nextItem.sequence}: "${text.substring(0, 50)}..."`)
        finalTranscriptRef.current += text + ' '
        accumulatedTranscriptRef.current += text + ' '
        setTranscript(finalTranscriptRef.current)
        segmentTranscriptRef.current += ' ' + text
        setSegmentTranscript(segmentTranscriptRef.current)

        const activeSocket = socket || useSocketStore.getState().socket
        const codeToUse = roomCodeRef.current || room?.code
        if (activeSocket && codeToUse) {
          activeSocket.emit('recording:transcript', { roomCode: codeToUse, transcript: finalTranscriptRef.current })
        }
      }

      pendingSequenceRef.current++
    }

    isProcessingQueueRef.current = false
  }, [])

  // Add transcription result to queue
  const addToTranscriptionQueue = useCallback((sequence, text) => {
    transcriptionQueueRef.current.push({ sequence, text })
    // Sort by sequence to maintain order
    transcriptionQueueRef.current.sort((a, b) => a.sequence - b.sequence)
    processTranscriptionQueue()
  }, [processTranscriptionQueue])

  const sendForTranscription = useCallback(async (audioBlob, sequence) => {
    if (!audioBlob || audioBlob.size < 100) {
      console.log(`[TRANSCRIPTION] Skipping small audio: ${audioBlob?.size || 0} bytes`)
      addToTranscriptionQueue(sequence, '')
      return
    }

    try {
      const headerBytes = new Uint8Array(await audioBlob.slice(0, 4).arrayBuffer())
      console.log(`[TRANSCRIPTION] Complete blob, sequence ${sequence}, size: ${audioBlob.size}, type: ${audioBlob.type}, header: ${headerBytes[0]},${headerBytes[1]},${headerBytes[2]},${headerBytes[3]}`)
    } catch (error) {
      console.warn('[TRANSCRIPTION] Failed to inspect audio header:', error)
    }

    try {
      // Convert to WAV for Whisper
      const wavBlob = await convertWebMToWav(audioBlob)

      if (!wavBlob) {
        console.log(`[TRANSCRIPTION] Sequence ${sequence} conversion failed, skipping`)
        addToTranscriptionQueue(sequence, '')
        return
      }

      const result = await transcribeAudio(wavBlob)
      addToTranscriptionQueue(sequence, result.text || '')
    } catch (error) {
      console.error(`[TRANSCRIPTION] Error for sequence ${sequence}:`, error.message)
      addToTranscriptionQueue(sequence, '')
    }
  }, [room?._id, addToTranscriptionQueue])

  const startTranscriptionWindow = useCallback(() => {
    if (!recordingActiveRef.current || !streamRef.current) return

    const sequence = nextSequenceRef.current++
    const chunks = []
    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType: selectedMimeTypeRef.current })
    mediaRecorderRef.current = mediaRecorder

    mediaRecorderStopPromiseRef.current = new Promise((resolve) => {
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error)
        setModelStatus('Recording error')
      }

      mediaRecorder.onstop = async () => {
        // This recorder may have been SUPERSEDED by a newer window (a fast pause->play, or a
        // pause->play that lands during the transcription round-trip below, starts a fresh
        // recorder and repoints mediaRecorderRef). A superseded recorder must not touch the shared
        // stop-timer or re-arm the loop, or it would clear the new window's timer and spawn a
        // duplicate recorder — which is what silently stalls transcription on production. It still
        // ships its own captured audio.
        if (mediaRecorderRef.current === mediaRecorder && transcriptionIntervalRef.current) {
          clearTimeout(transcriptionIntervalRef.current)
          transcriptionIntervalRef.current = null
        }

        const audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType || selectedMimeTypeRef.current })
        console.log(`[TRANSCRIPTION] Sending sequence ${sequence}, size: ${audioBlob.size} bytes`)
        await sendForTranscription(audioBlob, sequence)
        resolve()

        // Re-check identity AFTER the async send: only the current window may re-arm the loop.
        if (mediaRecorderRef.current === mediaRecorder && recordingActiveRef.current) {
          startTranscriptionWindow()
        }
      }
    })

    mediaRecorder.start()
    transcriptionIntervalRef.current = setTimeout(() => {
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
      }
    }, 10000)
  }, [sendForTranscription])
  
  const startRecording = async ({ resetSegment = true } = {}) => {
    if (recordingActiveRef.current) return

    // Video mode: the tab-audio stream was acquired once by beginVideoSession and persists across
    // segments (getDisplayMedia can't be re-prompted silently). Just (re)start the transcription
    // loop for the next segment; do NOT call getUserMedia/getDisplayMedia here.
    if (isVideoMode) {
      if (!streamRef.current) return
      setTranscript(''); finalTranscriptRef.current = ''; accumulatedTranscriptRef.current = ''
      setCurrentSegment(prev => resetSegment ? 1 : prev + 1)
      setSegmentTranscript(''); segmentTranscriptRef.current = ''
      transcriptionQueueRef.current = []
      nextSequenceRef.current = 0
      pendingSequenceRef.current = 0
      isProcessingQueueRef.current = false
      recordingActiveRef.current = true
      setIsRecording(true)
      setIsTranscribing(true)
      setModelStatus('Listening...')
      startTranscriptionWindow()
      return
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Initialize MediaRecorder - try OGG first as it handles chunking better than WebM
      let selectedMimeType = 'audio/ogg'
      const possibleTypes = [
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/webm;codecs=opus',
        'audio/webm'
      ]
      for (const mimeType of possibleTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType
          console.log(`[RECORDING] Using mimeType: ${selectedMimeType}`)
          break
        }
      }
      audioChunksRef.current = []
      selectedMimeTypeRef.current = selectedMimeType

      // Initialize segment
      setTranscript('')
      finalTranscriptRef.current = ''
      accumulatedTranscriptRef.current = ''
      setCurrentSegment(prev => resetSegment ? 1 : prev + 1)
      setSegmentTranscript('')
      segmentTranscriptRef.current = ''

      // Reset transcription queue
      transcriptionQueueRef.current = []
      nextSequenceRef.current = 0
      pendingSequenceRef.current = 0
      isProcessingQueueRef.current = false

      recordingActiveRef.current = true
      setIsRecording(true)
      setIsTranscribing(true)
      setModelStatus('Listening...')

      const activeSocket = socket || useSocketStore.getState().socket
      const codeToUse = roomCodeRef.current || room?.code
      if (activeSocket && codeToUse) {
        activeSocket.emit('recording:start', { roomCode: codeToUse })
      }

      startTranscriptionWindow()

    } catch (error) {
      console.error('Error starting recording:', error)
      setModelStatus('Microphone access denied')
    }
  }

  const stopRecording = async () => {
    recordingActiveRef.current = false
    setIsRecording(false)
    setIsTranscribing(false)
    setModelStatus('Processing final audio...')

    // Emit stop immediately to notify peers without waiting for async cleanup
    const activeSocket = socket || useSocketStore.getState().socket
    const codeToUse = roomCodeRef.current || room?.code
    if (activeSocket && codeToUse) {
      activeSocket.emit('recording:stop', { roomCode: codeToUse })
    }

    // Stop the current 10-second recorder window.
    if (transcriptionIntervalRef.current) {
      clearTimeout(transcriptionIntervalRef.current)
      transcriptionIntervalRef.current = null
    }

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    if (mediaRecorderStopPromiseRef.current) {
      await mediaRecorderStopPromiseRef.current
      mediaRecorderStopPromiseRef.current = null
    }

    // Wait briefly for transcription queue updates from the final chunk.
    await new Promise(resolve => setTimeout(resolve, 500))
    await processTranscriptionQueue()

    // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      if (displayStreamRef.current) {
        displayStreamRef.current.getTracks().forEach(track => track.stop())
        displayStreamRef.current = null
      }

    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current)
    }

    setModelStatus('Ready')
  }

  const clearTranscript = () => {
    setTranscript('')
    setSegmentTranscript('')
    finalTranscriptRef.current = ''
    accumulatedTranscriptRef.current = ''
    segmentTranscriptRef.current = ''
    const activeSocket = socket || useSocketStore.getState().socket
    const codeToUse = roomCodeRef.current || room?.code
    if (activeSocket && codeToUse) {
      activeSocket.emit('recording:clear-transcript', { roomCode: codeToUse })
    }
  }

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // --- Video Mode (Phase 2: teacher player + tab-audio capture into the existing pipeline) ---
  const isVideoMode = roomSettings.mode === 'video'
  const videoId = isVideoMode ? extractYouTubeId(roomSettings.videoUrl) : null
  const videoIsLiveHint = /\/live\//.test(roomSettings.videoUrl || '')
  const ytPlayerRef = useRef(null)
  const displayStreamRef = useRef(null)
  const [videoSessionActive, setVideoSessionActive] = useState(false)
  const [isLiveStream, setIsLiveStream] = useState(false)
  // Teacher-side editing of the room's YouTube link (live or normal) after creation.
  const [editingLink, setEditingLink] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const [linkSaving, setLinkSaving] = useState(false)
  const [linkError, setLinkError] = useState('')
  const isValidYouTube = (url) =>
    /(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)[\w-]+/.test((url || '').trim())
  const saveVideoLink = async () => {
    const url = linkDraft.trim()
    if (!isValidYouTube(url)) { setLinkError('Enter a valid YouTube link (watch, live, or youtu.be).'); return }
    setLinkSaving(true)
    setLinkError('')
    try {
      // Merge with current settings so we never drop other keys; PUT /rooms/:id persists it.
      await updateRoom(room._id, { settings: { ...roomSettings, mode: 'video', videoUrl: url } })
      // Update local settings so videoId recomputes and the player reloads with the new video.
      setRoomSettings(prev => ({ ...prev, mode: 'video', videoUrl: url }))
      setEditingLink(false)
    } catch (e) {
      setLinkError(e.message || 'Failed to update the link.')
    } finally {
      setLinkSaving(false)
    }
  }
  // Mirror live status into a ref so resumeTeacherVideo() (invoked from popup/timeout closures) reads
  // the CURRENT value, never a stale-closure snapshot from before detection settled.
  const isLiveStreamRef = useRef(false)
  const handleLiveStatus = (live) => { isLiveStreamRef.current = live; setIsLiveStream(live) }

  // Resume the teacher's video after a poll. For a LIVE stream, jump to the live edge so we rejoin
  // the current broadcast instead of falling behind by the poll + answer time. We query the player
  // DIRECTLY (not the React isLiveStream state) so this fires reliably even if live-detection state
  // hasn't settled or was captured stale by an older closure.
  // Tell the server a question pop-up just closed (a segment's questions are answered) so it folds
  // that segment into the ranked leaderboard (per-segment). A REST call (owner-authed), fired in ALL
  // modes — unlike video:resume, which is video-mode only — so the board updates for normal sessions.
  const emitSegmentDone = () => {
    if (!room?._id || !token) return
    fetch(`${API_URL}/responses/leaderboard/${room._id}/segment-done`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {})
  }

  // Single source of truth for the per-segment leaderboard fold: fire it whenever ANY question
  // pop-up (approval / Paste&Generate / Create-Q) goes from open -> closed, by ANY path — the last
  // question's timer auto-closing it, rejecting the last question, or the teacher closing it
  // manually. Guarantees the update fires exactly once per close and can't be bypassed by a
  // particular close path.
  const approvalPopupWasOpenRef = useRef(false)
  const textPopupWasOpenRef = useRef(false)
  const createPopupWasOpenRef = useRef(false)
  useEffect(() => {
    const open = showQuestionPopup && pendingQuestions.length > 0
    if (approvalPopupWasOpenRef.current && !open) emitSegmentDone()
    approvalPopupWasOpenRef.current = open
  }, [showQuestionPopup, pendingQuestions])
  useEffect(() => {
    const open = showTextQuestionPopup && pendingTextQuestions.length > 0
    if (textPopupWasOpenRef.current && !open) emitSegmentDone()
    textPopupWasOpenRef.current = open
  }, [showTextQuestionPopup, pendingTextQuestions])
  useEffect(() => {
    if (createPopupWasOpenRef.current && !showCreateQuestion) emitSegmentDone()
    createPopupWasOpenRef.current = showCreateQuestion
  }, [showCreateQuestion])

  const resumeTeacherVideo = () => {
    // Tell students the popup window is over so they resume + jump to the live edge (fire even if the
    // teacher's own player ref isn't ready).
    if (socket && room?.code) socket.emit('video:resume', { roomCode: room.code })
    const p = ytPlayerRef.current
    if (!p) return
    let ps = null
    try { ps = p.getProgressState?.() } catch (e) { /* ignore */ }
    const live = (ps && ps.isLive === true) || videoIsLiveHint || isLiveStreamRef.current
    console.log('[VIDEO] resumeTeacherVideo', { live, isLiveState: isLiveStreamRef.current, urlHint: videoIsLiveHint, progressState: ps })
    p.playVideo?.()
    if (!(live && typeof p.seekTo === 'function')) return
    // Jump to the CURRENT live edge. seekTo issued immediately after playVideo() is often ignored
    // while the player is still transitioning out of the paused state, so it lands back at the paused
    // position. Re-seek a couple of times after the player settles, re-querying the fresh live edge
    // (seekableEnd advances in real time even while paused) each attempt.
    const seekToLiveEdge = () => {
      const pl = ytPlayerRef.current
      if (!pl || typeof pl.seekTo !== 'function') return
      let fresh = null
      try { fresh = pl.getProgressState?.() } catch (e) { /* ignore */ }
      let edge = fresh && Number.isFinite(fresh.seekableEnd) ? fresh.seekableEnd : 0
      if (!(edge > 0) && typeof pl.getDuration === 'function') edge = pl.getDuration()
      pl.seekTo(edge > 0 ? edge : 1e7, true)
      pl.playVideo?.()
    }
    seekToLiveEdge()                 // immediate attempt
    setTimeout(seekToLiveEdge, 400)  // after the player resumes out of the paused state
    setTimeout(seekToLiveEdge, 1200) // final catch for slow buffering/transition
  }

  // Acquire the tab's audio ONCE. getDisplayMedia re-prompts on every call, so the stream must persist
  // across the whole segment loop — unlike the mic path, which can re-acquire silently each segment.
  const beginVideoSession = async () => {
    if (isEnded || videoSessionActive) return
    try {
      // preferCurrentTab makes the browser's share picker default to THIS tab (and drop the
      // window/screen chooser), so the teacher just clicks "Share" once instead of hunting for the
      // right tab. Chromium-only hint; ignored elsewhere. The prompt itself can't be removed — the
      // browser always requires an explicit user confirm for screen/tab capture.
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true })
      const audioTracks = display.getAudioTracks()
      if (!audioTracks.length) {
        display.getTracks().forEach(t => t.stop())
        setModelStatus('No tab audio — re-share and tick "Share tab audio"')
        return
      }
      // DO NOT stop the video track! Stopping it causes the audio track to emit silence in Chrome.
      // We just create a stream with only the audio track for the MediaRecorder.
      const stream = new MediaStream([audioTracks[0]])
      displayStreamRef.current = display
      // If the teacher stops sharing via the browser UI, end the capture session.
      audioTracks[0].addEventListener('ended', () => {
        setVideoSessionActive(false)
        stopRecording()
      })
      streamRef.current = stream

      let selectedMimeType = 'audio/ogg'
      for (const t of ['audio/ogg;codecs=opus', 'audio/ogg', 'audio/webm;codecs=opus', 'audio/webm']) {
        if (MediaRecorder.isTypeSupported(t)) { selectedMimeType = t; break }
      }
      selectedMimeTypeRef.current = selectedMimeType

      // Fresh session state
      setTranscript(''); finalTranscriptRef.current = ''; accumulatedTranscriptRef.current = ''
      setSegmentTranscript(''); segmentTranscriptRef.current = ''
      transcriptionQueueRef.current = []; nextSequenceRef.current = 0
      pendingSequenceRef.current = 0; isProcessingQueueRef.current = false
      setCurrentSegment(1)
      setVideoSessionActive(true)
      setModelStatus('Ready - press play to begin')

      const activeSocket = socket || useSocketStore.getState().socket
      const codeToUse = roomCodeRef.current || room?.code
      if (activeSocket && codeToUse) {
        activeSocket.emit('recording:start', { roomCode: codeToUse })
      }

      // If the video is already playing, begin capturing immediately.
      if (ytPlayerRef.current?.getPlayerState?.() === 1) {
        recordingActiveRef.current = true
        setIsTranscribing(true); setModelStatus('Listening...')
        startTranscriptionWindow()
        setIsRecording(true)
      }
    } catch (e) {
      console.error('beginVideoSession failed:', e)
      setModelStatus('Tab share cancelled')
    }
  }

  // Stop the transcription windows but KEEP the shared tab-audio stream (used at segment completion).
  const stopVideoTranscriptionLoop = async () => {
    recordingActiveRef.current = false
    if (transcriptionIntervalRef.current) { clearTimeout(transcriptionIntervalRef.current); transcriptionIntervalRef.current = null }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
    if (mediaRecorderStopPromiseRef.current) { await mediaRecorderStopPromiseRef.current; mediaRecorderStopPromiseRef.current = null }
    await new Promise(resolve => setTimeout(resolve, 500))
    await processTranscriptionQueue()
    if (segmentTimerRef.current) { clearInterval(segmentTimerRef.current); segmentTimerRef.current = null }
    setIsRecording(false); setIsTranscribing(false); setModelStatus('Ready')
    // streamRef intentionally kept alive for the next segment.
  }

  // Play -> (re)start the 10s transcription windows + arm/resume the segment timer. Stream stays alive.
  const handleVideoPlay = () => {
    if (isEnded || !videoSessionActive) return
    if (recordingActiveRef.current) return
    recordingActiveRef.current = true
    setIsTranscribing(true); setModelStatus('Listening...')
    startTranscriptionWindow()
    if (isSegmentPaused) resumeSegmentTimer()
    else if (!isRecording) setIsRecording(true) // first play arms a fresh segment timer
  }

  // Pause -> stop the transcription windows (flush current) + freeze the timer. Keep the stream.
  const handleVideoPause = () => {
    if (!videoSessionActive || !recordingActiveRef.current) return
    recordingActiveRef.current = false
    if (transcriptionIntervalRef.current) { clearTimeout(transcriptionIntervalRef.current); transcriptionIntervalRef.current = null }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
    setIsTranscribing(false)
    if (segmentTimerRef.current) pauseSegmentTimer()
  }

  // Broadcast the teacher's video position so students can use it as their forward-seek ceiling
  // (lets a reloaded/late-joining student catch up to where the class is).
  useEffect(() => {
    if (!isVideoMode || !socket || !room?.code) return
    const id = setInterval(() => {
      const p = ytPlayerRef.current
      if (p && typeof p.getCurrentTime === 'function') {
        const playing = typeof p.getPlayerState === 'function' ? p.getPlayerState() === 1 : true
        socket.emit('video:progress', { roomCode: room.code, time: p.getCurrentTime(), playing })
      }
    }, 2000)
    return () => clearInterval(id)
  }, [isVideoMode, socket, room?.code])

  // Hold students' video paused for the whole approval-popup window: pause the moment the popup OPENS
  // (after generation), not when the teacher's own video paused at segment-complete. Resume is handled
  // by resumeTeacherVideo() when the popup closes.
  useEffect(() => {
    if (!isVideoMode || !showQuestionPopup || !socket || !room?.code) return
    socket.emit('video:pause', { roomCode: room.code })
  }, [showQuestionPopup, isVideoMode, socket, room?.code])

  const handleManualGenerateQuestions = async () => {
    const textToUse = segmentTranscript.trim() || transcript
    if (!textToUse) {
      alert('No transcript available to generate questions from.')
      return
    }

    setIsGeneratingQuestions(true)
    setGenerateQEnabled(false)

    try {
      // Manual "Generate Q" is the fail-safe RETRY of the CURRENT segment's automatic generation, so
      // it targets `currentSegment` (matching handleSegmentComplete) and does NOT advance the counter
      // — it re-does segment N, it does not move to N+1 (the next segment is bumped later by
      // startRecording when the teacher resumes).
      const questions = await generateQuestionsFromText(textToUse, currentSegment)
      if (questions && questions.length > 0) {
        setBatchLauncher(null)
        setPendingQuestions(questions)
        setShowQuestionPopup(true)
        setIsPopupOpen(true)
        if (socket && room?.code) {
          socket.emit('questions:unlock-launcher', { roomCode: room.code })
          socket.emit('questions:broadcast-popup', { roomCode: room.code, questions, segmentIndex: currentSegment })
        }
        // Persist the transcript only once questions exist — fire-and-forget so it never blocks.
        // Live transcript → source 'audio'; segmentIndex matches the questions (currentSegment).
        saveTranscript(room._id, currentSegment, textToUse, roomSettings.segmentTime * 60)
          .catch((err) => console.error('[MANUAL] Failed to save transcript (questions already generated):', err))
      }
    } catch (error) {
      console.error('Manual question generation failed:', error)
      alert('Failed to generate questions: ' + error.message)
      setGenerateQEnabled(true)
    }
    setIsGeneratingQuestions(false)
  }

  const handleApproveQuestion = async (question) => {
    if (activeQuestion) {
      alert('A poll is currently active in this room. Please wait for it to complete before launching another question.')
      return
    }

    if (batchLauncher && batchLauncher.userId && String(batchLauncher.userId) !== String(user?._id)) {
      alert(`This set of questions is being managed by ${batchLauncher.roleLabel} (${batchLauncher.name}). Only they can launch these questions.`)
      return
    }

    // Lock batch launcher if not locked yet
    if (!batchLauncher && user) {
      const launcherObj = {
        userId: user._id,
        name: user.name || 'Teacher',
        roleLabel: isOwner ? 'Host' : 'Co-Host'
      }
      setBatchLauncher(launcherObj)
      if (socket && room?.code) {
        socket.emit('questions:lock-launcher', { roomCode: room.code, launcher: launcherObj })
      }
    }
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

        if (socket && isConnected) {
          socket.emit('question:start', {
            roomCode: room.code,
            questionId: data.question._id,
            question: data.question,
            timer: data.question.timeToAnswer || roomSettings.timeToAnswer || 30
          })
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

  // Handle approve from TextQuestionApprovalPopup (text-based questions)
  const handleTextQuestionApprove = async (question) => {
    if (activeQuestion) {
      alert('A poll is currently active in this room. Please wait for it to complete before launching another question.')
      return
    }
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

        if (socket && isConnected) {
          socket.emit('question:start', {
            roomCode: room.code,
            questionId: data.question._id,
            question: data.question,
            timer: data.question.timeToAnswer || roomSettings.timeToAnswer || 30
          })
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

  const isOtherCreating = !!(creatorLock && String(creatorLock.userId) !== String(user?._id))

  const handleOpenCreateQuestion = () => {
    if (isOtherCreating || isEnded) return
    const activeSocket = socket || useSocketStore.getState().socket
    const codeToUse = roomCodeRef.current || room?.code
    if (activeSocket && codeToUse) {
      activeSocket.emit('questions:creator-lock', { roomCode: codeToUse, action: 'create' })
    }
    setShowCreateQuestion(true)
  }

  const handleCloseCreateQuestion = () => {
    setShowCreateQuestion(false)
    const activeSocket = socket || useSocketStore.getState().socket
    const codeToUse = roomCodeRef.current || room?.code
    if (activeSocket && codeToUse) {
      activeSocket.emit('questions:creator-unlock', { roomCode: codeToUse })
    }
  }

  const handleOpenTextToQuestions = () => {
    if (isOtherCreating || isEnded) return
    const activeSocket = socket || useSocketStore.getState().socket
    const codeToUse = roomCodeRef.current || room?.code
    if (activeSocket && codeToUse) {
      activeSocket.emit('questions:creator-lock', { roomCode: codeToUse, action: 'paste' })
    }
    setPastedText('')
    setShowTextToQuestions(true)
  }

  const handleCloseTextToQuestions = () => {
    setShowTextToQuestions(false)
    const activeSocket = socket || useSocketStore.getState().socket
    const codeToUse = roomCodeRef.current || room?.code
    if (activeSocket && codeToUse) {
      activeSocket.emit('questions:creator-unlock', { roomCode: codeToUse })
    }
  }

  const handleTextQuestionClose = () => {
    setShowTextQuestionPopup(false)
    setPendingTextQuestions([])
    const activeSocket = socket || useSocketStore.getState().socket
    const codeToUse = roomCodeRef.current || room?.code
    if (activeSocket && codeToUse) {
      activeSocket.emit('questions:creator-unlock', { roomCode: codeToUse })
    }
    // leaderboard fold fires via the pop-up-close watcher (textPopupWasOpenRef) on close
  }

  const handleCreateQuestion = async (questionData) => {
    if (activeQuestion) {
      alert('A poll is currently active in this room. Please wait for it to complete before launching another question.')
      return
    }
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

        if (socket && isConnected) {
          socket.emit('question:start', {
            roomCode: room.code,
            questionId: data.question._id,
            question: data.question,
            timer: data.question.timeToAnswer || roomSettings.timeToAnswer || 30
          })
          socket.emit('new_question', {
            roomCode: room.code,
            question: data.question
          })
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
        <div style={{ flex: 1, marginLeft: 'var(--sidebar-width, 240px)', padding: '32px' }}>
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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width, 240px)', minWidth: 0, maxWidth: 'calc(100vw - var(--sidebar-width, 240px))', overflowX: 'hidden' }}>
        {/* Header */}
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: isMobile ? '16px 16px' : '16px 32px', paddingLeft: isMobile ? '64px' : '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.name}</h1>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '24px 32px', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
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
            flexWrap: 'wrap',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-md)',
            padding: '12px 16px',
            marginBottom: '20px',
            maxWidth: '100%',
            boxSizing: 'border-box'
          }}>
            <button onClick={() => navigate('/teacher')} style={{
              padding: '8px 12px',
              background: 'var(--nav-hover)',
              color: 'var(--text-primary)',
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
              <span style={{ fontSize: '28px', fontWeight: '700', color: codeColor, letterSpacing: '4px' }}>
                {room.code}
              </span>
              <button onClick={copyRoomCode} disabled={isEnded} style={{
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

            {/* Live participant count — seeded on load, kept current by room:joined / room:left */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 20px',
              border: '2px solid var(--border-color)',
              borderRadius: '10px'
            }}>
              <span style={{ fontSize: '28px', fontWeight: '700', color: codeColor }}>
                {totalParticipants}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', whiteSpace: 'nowrap' }}>
                👥 Participants
              </span>
            </div>

            <div style={{ flex: 1, minWidth: 0, display: isMobile ? 'none' : 'block' }} />

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

            {/* Question Timer Display - Shows when a question is active */}
            {activeQuestion && questionTimeLeft > 0 && (
              <div style={{
                padding: '8px 16px',
                background: questionTimeLeft <= 5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                border: `2px solid ${questionTimeLeft <= 5 ? '#ef4444' : '#10b981'}`
              }}>
                <span style={{ fontSize: '14px', color: questionTimeLeft <= 5 ? '#ef4444' : '#10b981', fontWeight: '600' }}>
                  ⏱️ Answer
                </span>
                <span style={{
                  fontSize: '20px',
                  color: questionTimeLeft <= 5 ? '#ef4444' : '#10b981',
                  fontWeight: '700',
                  animation: questionTimeLeft <= 5 ? 'pulse 0.5s infinite' : 'none'
                }}>
                  {questionTimeLeft}s
                </span>
                {questionTimeLeft <= 5 && (
                  <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600' }}>
                    TIME!
                  </span>
                )}
              </div>
            )}
            {activeQuestion && questionTimeLeft === 0 && (
              <div style={{
                padding: '8px 16px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                border: '2px solid #ef4444'
              }}>
                <span style={{ fontSize: '14px', color: '#ef4444', fontWeight: '600' }}>
                  ⏱️ Time's Up!
                </span>
              </div>
            )}

            {/* Creator Lock Banner Indicator */}
            {isOtherCreating && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#d97706',
                fontWeight: 600
              }}>
                <span>🔒</span>
                <span>
                  {creatorLock.name || creatorLock.roleLabel} is {creatorLock.action === 'paste' ? 'pasting & generating' : 'creating'} questions
                </span>
              </div>
            )}

            {/* Paste & Generate Button */}
            {!isEnded && (
              <button
                onClick={handleOpenTextToQuestions}
                disabled={isOtherCreating || isGeneratingQuestions}
                title={isOtherCreating ? `${creatorLock?.name || creatorLock?.roleLabel || 'Another teacher'} is currently ${creatorLock?.action === 'paste' ? 'generating questions from text' : 'creating a question'}` : ''}
                style={{
                  padding: '8px 16px',
                  background: (isOtherCreating || isGeneratingQuestions) ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: (isOtherCreating || isGeneratingQuestions) ? 'not-allowed' : 'pointer',
                  opacity: (isOtherCreating || isGeneratingQuestions) ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                📝 Paste & Generate
              </button>
            )}

            {/* Create Question Button */}
            {!isEnded && (
              <button
                onClick={handleOpenCreateQuestion}
                disabled={isOtherCreating || isGeneratingQuestions}
                title={isOtherCreating ? `${creatorLock?.name || creatorLock?.roleLabel || 'Another teacher'} is currently ${creatorLock?.action === 'paste' ? 'generating questions from text' : 'creating a question'}` : ''}
                style={{
                  padding: '8px 16px',
                  background: (isOtherCreating || isGeneratingQuestions) ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: (isOtherCreating || isGeneratingQuestions) ? 'not-allowed' : 'pointer',
                  opacity: (isOtherCreating || isGeneratingQuestions) ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                ✍️ Create Q
              </button>
            )}

            {/* Settings Dropdown */}
            <div style={{ position: 'relative' }} ref={settingsRef}>
              <button
                onClick={() => setShowSettings(true)}
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

              <RoomSettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                settings={roomSettings}
                onSave={async (newSettings) => {
                  setRoomSettings(newSettings)
                  // Persist settings to backend
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
            </div>

            {/* End Room Button (Host Only) */}
            {!isEnded && isOwner && (
              <button onClick={handleEndRoom} style={{
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

            {/* Leave Room Button (Co-Host Only) */}
            {isCoHost && (
              <button onClick={handleLeaveCoHost} style={{
                padding: '8px 16px',
                background: '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}>
                Leave Room
              </button>
            )}
          </div>

          {/* Co-Hosts Management Panel (Host Only) */}
          {isOwner && (
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
              padding: '20px',
              marginBottom: '20px',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>👥</span> Co-Host Management
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Generate a join code for approved teachers to join as co-hosts with shared operational permissions.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Max Co-Hosts:
                  </label>
                  <input
                    type="number"
                    min={room?.coHosts?.length || 0}
                    max={10}
                    value={maxCoHostsInput}
                    onChange={(e) => setMaxCoHostsInput(Math.max(room?.coHosts?.length || 0, parseInt(e.target.value, 10) || 0))}
                    style={{ width: '60px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                  />
                  <button
                    onClick={handleSaveMaxCoHosts}
                    style={{ padding: '6px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Save
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-primary)', padding: '14px', borderRadius: 'var(--radius)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Validity Window:</label>
                  <select
                    value={codeDuration}
                    onChange={(e) => setCodeDuration(Number(e.target.value))}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '13px' }}
                  >
                    <option value={10}>10 minutes</option>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>60 minutes</option>
                  </select>
                </div>

                <button
                  onClick={handleGenerateCoHostCode}
                  style={{ padding: '8px 16px', background: 'var(--accent-gradient)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {activeCoHostCode ? '🔄 Regenerate Code' : '⚡ Generate Join Code'}
                </button>

                {activeCoHostCode && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'var(--bg-card)', padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>ACTIVE CODE</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                        <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '2px', color: 'var(--accent)' }}>{activeCoHostCode}</span>
                        <button
                          onClick={copyCoHostCode}
                          style={{
                            padding: '3px 10px',
                            background: coHostCodeCopied ? '#10b981' : '#3b82f6',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'background 0.2s ease, transform 0.1s ease'
                          }}
                        >
                          {coHostCodeCopied ? '✓ Copied' : '📋 Copy'}
                        </button>
                      </div>
                    </div>
                    {codeTimeLeft !== null && (
                      <div style={{ fontSize: '12px', color: codeTimeLeft > 0 ? '#10b981' : '#ef4444', fontWeight: 600, marginLeft: '4px' }}>
                        {codeTimeLeft > 0 ? `Expires in ${Math.floor(codeTimeLeft / 60)}m ${codeTimeLeft % 60}s` : 'Expired'}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Joined Co-Hosts List */}
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Active Co-Hosts ({room?.coHosts?.length || 0} / {room?.maxCoHosts || 0})
                </h4>
                {(!room?.coHosts || room.coHosts.length === 0) ? (
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No co-hosts joined yet.</p>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {room.coHosts.map(ch => (
                      <div key={ch.userId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'var(--bg-primary)', borderRadius: '20px', border: '1px solid var(--border-color)', fontSize: '13px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ch.name}</span>
                        <button
                          onClick={() => handleRemoveCoHost(ch.userId)}
                          title="Remove Co-Host"
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: '14px', padding: '0 2px' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}


          {/* Microphone and Transcription Row - 30/70 Split */}
          <div style={{ display: 'flex', gap: '20px', height: isMobile ? 'auto' : '470px', marginBottom: '20px', flexWrap: 'wrap', overflowX: 'hidden' }}>
            {/* Microphone / Video Card */}
            <div style={{
              flex: isMobile ? '1 1 100%' : (isVideoMode ? '1 1 calc(60% - 10px)' : '1 1 calc(30% - 10px)'),
              minWidth: isMobile ? 0 : '280px',
              maxWidth: '100%',
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-md)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              boxSizing: 'border-box',
              overflow: 'hidden'
            }}>
              {/* Video player (video mode) */}
              {isVideoMode && (
                <div style={{ width: '100%' }}>
                  {/* Editable YouTube link (live or normal) */}
                  <div style={{ marginBottom: '10px' }}>
                    {!editingLink ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {roomSettings.videoUrl || 'No link set'}
                        </span>
                        <button
                          onClick={() => { setLinkDraft(roomSettings.videoUrl || ''); setLinkError(''); setEditingLink(true) }}
                          disabled={isEnded}
                          style={{
                            padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                            background: 'transparent', color: 'var(--accent)',
                            border: '1px solid var(--accent)', borderRadius: 'var(--radius)',
                            cursor: isEnded ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap'
                          }}
                        >
                          Edit link
                        </button>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="text"
                          value={linkDraft}
                          onChange={(e) => { setLinkDraft(e.target.value); if (linkError) setLinkError('') }}
                          placeholder="Paste YouTube live or video link"
                          autoFocus
                          style={{
                            width: '100%', padding: '9px 12px', fontSize: '13px',
                            border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxSizing: 'border-box'
                          }}
                        />
                        {linkError && (
                          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#dc2626' }}>{linkError}</p>
                        )}
                        {videoSessionActive && (
                          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#b45309' }}>
                            A capture session is active — changing the link reloads the player.
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button
                            onClick={saveVideoLink}
                            disabled={linkSaving || !isValidYouTube(linkDraft)}
                            style={{
                              padding: '7px 16px', fontSize: '12px', fontWeight: 600,
                              background: (linkSaving || !isValidYouTube(linkDraft)) ? '#9ca3af' : 'var(--accent-gradient)',
                              color: '#fff', border: 'none', borderRadius: 'var(--radius)',
                              cursor: (linkSaving || !isValidYouTube(linkDraft)) ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {linkSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditingLink(false); setLinkError('') }}
                            disabled={linkSaving}
                            style={{
                              padding: '7px 16px', fontSize: '12px', fontWeight: 600,
                              background: 'transparent', color: 'var(--text-secondary)',
                              border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {isLiveStream && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'blink 1s infinite' }} />
                      <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 700, letterSpacing: '0.03em' }}>LIVE</span>
                    </div>
                  )}
                  {videoId ? (
                    <YouTubeVideo
                      videoId={videoId}
                      controls={true}
                      playerRef={ytPlayerRef}
                      onPlay={handleVideoPlay}
                      onPause={handleVideoPause}
                      onEnd={handleVideoPause}
                      onLiveStatus={handleLiveStatus}
                    />
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#dc2626', fontSize: '13px' }}>
                      Invalid YouTube link for this room.
                    </div>
                  )}
                  {videoId && !videoSessionActive && (
                    <button
                      onClick={beginVideoSession}
                      disabled={isEnded || isOtherTeacherRecording}
                      style={{
                        width: '100%',
                        marginTop: '12px',
                        padding: '11px 16px',
                        background: (isEnded || isOtherTeacherRecording) ? '#9ca3af' : 'var(--accent-gradient)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: (isEnded || isOtherTeacherRecording) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isOtherTeacherRecording
                        ? `Session started by ${remoteRecorder.teacherName || (remoteRecorder.isOwner ? 'Host' : 'Co-Host')}`
                        : "Start Session (share this tab's audio)"}
                    </button>
                  )}
                  <p style={{ margin: '10px 0 0', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                    {videoSessionActive
                      ? (isTranscribing ? 'Listening to tab audio...' : 'Session ready - press play to capture.')
                      : 'Share this tab’s audio, then play the video to capture the lecture.'}
                    {'  '}{modelStatus}
                  </p>
                </div>
              )}

              {/* Mic controls (normal mode) */}
              {!isVideoMode && (
              <>
              {/* Mic Button */}
              <button
                onClick={toggleRecording}
                disabled={isEnded || isOtherTeacherRecording}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: (isEnded || isOtherTeacherRecording)
                    ? 'linear-gradient(135deg, #6b7280, #9ca3af)'
                    : (isRecording
                        ? 'linear-gradient(135deg, #dc2626, #ef4444)'
                        : 'linear-gradient(135deg, #10b981, #059669)'),
                  color: 'white',
                  border: 'none',
                  cursor: (isEnded || isOtherTeacherRecording) ? 'not-allowed' : 'pointer',
                  opacity: isOtherTeacherRecording ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  boxShadow: isRecording
                    ? '0 0 30px rgba(239, 68, 68, 0.5)'
                    : '0 8px 25px rgba(16, 185, 129, 0.4)',
                  transform: isRecording ? 'scale(1.05)' : 'scale(1)',
                  transition: 'all 0.3s ease'
                }}
              >
                {isRecording ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                  </svg>
                )}
              </button>

              {/* Status Text */}
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: (isRecording || isOtherTeacherRecording) ? '#ef4444' : 'var(--text-primary)' }}>
                  {isOtherTeacherRecording
                    ? `🎙️ ${remoteRecorder.roleLabel || remoteRecorder.teacherName || 'Co-Host'} is recording...`
                    : (isTranscribing ? 'Listening...' : (isRecording ? 'Recording...' : 'Start Recording'))}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: isOtherTeacherRecording ? '#ef4444' : 'var(--text-secondary)', fontWeight: isOtherTeacherRecording ? '600' : 'normal' }}>
                  {isOtherTeacherRecording
                    ? `Recording is currently active by ${remoteRecorder.roleLabel ? remoteRecorder.roleLabel.toLowerCase() : (remoteRecorder.isOwner ? 'room host' : 'co-host')}`
                    : modelStatus}
                </p>
              </div>

              {/* Live indicator */}
              {(isRecording || isOtherTeacherRecording) && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '20px'
                }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'blink 1s infinite' }} />
                  <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '500' }}>
                    {isOtherTeacherRecording ? `${remoteRecorder.roleLabel || remoteRecorder.teacherName || 'Co-Host'} LIVE` : 'LIVE'}
                  </span>
                </div>
              )}
              </>
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
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{roomSettings.questionProvider || 'minimax'}</span>
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
                    <span style={{ color: 'var(--text-primary)', fontWeight: '600', textTransform: 'capitalize' }}>{roomSettings.difficulty}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Transcription Card */}
            <div style={{
              flex: isMobile ? '1 1 100%' : (isVideoMode ? '1 1 calc(40% - 10px)' : '1 1 calc(70% - 10px)'),
              minWidth: isMobile ? 0 : '300px',
              maxWidth: '100%',
              minHeight: isMobile ? '260px' : undefined,
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-md)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{ fontSize: '18px' }}>🎙️</span>
                  <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    Current Segment Transcription
                  </span>
                  {isTranscribing && (
                    <div style={{ padding: '2px 8px', background: '#fef2f2', borderRadius: '10px', fontSize: '10px', color: '#ef4444', fontWeight: '600' }}>
                      LIVE
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {transcript && (
                    <button onClick={clearTranscript} style={{
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
                    disabled={isGeneratingQuestions || !transcript || !generateQEnabled}
                    style={{
                      padding: '4px 12px',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: isGeneratingQuestions || !transcript || !generateQEnabled ? 'not-allowed' : 'pointer',
                      opacity: isGeneratingQuestions || !transcript || !generateQEnabled ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {isGeneratingQuestions ? '⏳ Generating...' : '🔄 Generate Q'}
                  </button>
                </div>
              </div>

              <div ref={transcriptRef} style={{
                flex: 1,
                fontSize: '15px',
                lineHeight: '1.8',
                color: transcript ? 'var(--text-primary)' : 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                // Cap the height so a long transcript scrolls INSIDE this box instead of growing the
                // card and forcing the whole page to scroll.
                maxHeight: isMobile ? '220px' : '470px',
                overflowY: 'auto'
              }}>
                {transcript ? (
                  transcript
                ) : (
                  <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                    {isOtherTeacherRecording
                      ? `Waiting for live transcript from ${remoteRecorder.teacherName || 'Host'}...`
                      : 'Click the microphone to start real-time transcription.'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Third Row - Session Questions (flex) + Leaderboard (flex) */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', width: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
            {/* Session Questions - flexible width */}
            <div style={{ flex: isMobile ? '1 1 100%' : '1 1 calc(70% - 10px)', minWidth: isMobile ? 0 : '300px', maxWidth: '100%', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)', padding: '20px', boxSizing: 'border-box', overflow: 'hidden' }}>
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
              <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
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
              {generatedQuestions.length > 6 && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '36px', background: 'linear-gradient(to bottom, rgba(var(--bg-card-rgb), 0), rgba(var(--bg-card-rgb), 1))', pointerEvents: 'none', borderRadius: '0 0 10px 10px' }} />
              )}
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
            <div style={{ flex: isMobile ? '1 1 100%' : '1 1 calc(30% - 10px)', minWidth: isMobile ? 0 : '280px', maxWidth: '100%', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)', padding: '20px', boxSizing: 'border-box', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontSize: '20px' }}>🏆</span>
                <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  Leaderboard
                </span>
              </div>
              <ErrorBoundary message="Leaderboard unavailable">
                <Leaderboard roomId={room?._id} token={token} socket={socket} />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </div>

      {/* Question Approval Popup */}
      {showQuestionPopup && pendingQuestions.length > 0 && (
        <QuestionApprovalPopup
          questions={pendingQuestions}
          batchLauncher={batchLauncher}
          currentUserId={user?._id}
          popupIndex={popupIndex}
          onNavIndexChange={(idx) => {
            setPopupIndex(idx)
            if (socket && room?.code) {
              socket.emit('questions:popup-nav', { roomCode: room.code, index: idx })
            }
          }}
          onApprove={handleApproveQuestion}
          onReject={handleRejectQuestion}
          onComplete={() => {
            // All questions reviewed - close popup and resume for next segment
            setShowQuestionPopup(false)
            setIsPopupOpen(false)
            setPendingQuestions([])
            setBatchLauncher(null)
            if (socket && room?.code) {
              socket.emit('questions:dismiss-popup', { roomCode: room.code })
              socket.emit('questions:unlock-launcher', { roomCode: room.code })
            }

            // Clear segment transcript for fresh start
            setSegmentTranscript('')
            segmentTranscriptRef.current = ''
            finalTranscriptRef.current = ''

            // Reset pending review flag
            setIsPendingReview(false)
            setGenerateQEnabled(true)

            // Reset segment timer
            setSegmentTimeLeft(roomSettings.segmentTime * 60)

            // Resume recording for next segment (only Host triggers room recording)
            if (isOwner) {
              startRecording({ resetSegment: false })
              if (isVideoMode) resumeTeacherVideo() // resume the video (live: jump to live edge) after review
            }
            // leaderboard fold fires via the pop-up-close watcher (approvalPopupWasOpenRef) on close

            // Timer will auto-start via the useEffect since isPendingReview is now false
          }}
          onClose={() => {
            // Co-Host closing popup closes only locally; Host closing popup dismisses for all & resumes
            setShowQuestionPopup(false)
            setIsPopupOpen(false)
            if (isOwner) {
              setPendingQuestions([])
              setBatchLauncher(null)
              if (socket && room?.code) {
                socket.emit('questions:dismiss-popup', { roomCode: room.code })
                socket.emit('questions:unlock-launcher', { roomCode: room.code })
              }
              setSegmentTranscript('')
              segmentTranscriptRef.current = ''
              finalTranscriptRef.current = ''
              setIsPendingReview(false)
              setGenerateQEnabled(true)
              setSegmentTimeLeft(roomSettings.segmentTime * 60)
              startRecording({ resetSegment: false })
              if (isVideoMode) resumeTeacherVideo() // resume the video (live: jump to live edge) after review
            }
            // leaderboard fold fires via the pop-up-close watcher (approvalPopupWasOpenRef) on close
          }}
        />
      )}

      {/* Create Question Overlay */}
      {showCreateQuestion && (
        <CreateQuestionOverlay
          isOpen={showCreateQuestion}
          onClose={handleCloseCreateQuestion}
          onLaunch={handleCreateQuestion}
        />
      )}

      {/* Text to Questions Popup */}
      {showTextToQuestions && (
        <TextToQuestionsPopup
          isOpen={showTextToQuestions}
          onClose={handleCloseTextToQuestions}
          onGenerate={handleTextToQuestionsGenerate}
          roomSettings={roomSettings}
          isGenerating={isGeneratingFromText}
          initialText={pastedText}
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
          isLast={true}
        />
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
      `}</style>
    </div>
  )
}

export default RoomDetailPage
