import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import useThemeStore from '../stores/themeStore'
import useTeacherPositionStore from '../stores/teacherPositionStore'
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
import ConfusionAlertCard from '../components/ConfusionAlertCard'
import ConfusionTimeline from '../components/ConfusionTimeline'
import TopicHeatmap from '../components/TopicHeatmap'
import TopicMarkerBar from '../components/TopicMarkerBar'
import useIsMobile from '../hooks/useIsMobile'
import { saveTranscript } from '../services/transcriptService'
import { transcribeAudio, getTranscriptionStatus, convertWebMToWav } from '../services/serverTranscriptionService'
import { requestQuestionGeneration, fetchAllRoomQuestions } from '../services/questionService'
import { API_URL } from '../config.js'
import api from '../lib/api.js'

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
  const [showSettings, setShowSettings] = useState(false)
  const [showAnalyticsPanel, setShowAnalyticsPanel] = useState(false)
  const settingsRef = useRef(null)
  const transcriptRef = useRef(null)

  // Real-time transcription state
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
  const currentSegmentRef = useRef(0)
  useEffect(() => { currentSegmentRef.current = currentSegment }, [currentSegment])
  const [segmentTranscript, setSegmentTranscript] = useState('')
  const [segmentTimeLeft, setSegmentTimeLeft] = useState(0)
  const segmentTimerRef = useRef(null)

  // Question timer for teacher visibility
  const [activeQuestion, setActiveQuestion] = useState(null)
  const teacherPositionBroadcastRef = useRef(null)
  const roomStartedAtRef = useRef(null)
  const [questionTimeLeft, setQuestionTimeLeft] = useState(0)
  const questionTimerRef = useRef(null)


  // Question generation
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false)
  const [pendingQuestions, setPendingQuestions] = useState([])
  const [showQuestionPopup, setShowQuestionPopup] = useState(false)
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const [showCreateQuestion, setShowCreateQuestion] = useState(false)
  const [showTextToQuestions, setShowTextToQuestions] = useState(false)
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
  const [pollCountdown, setPollCountdown] = useState(null) // 5s countdown state before pushing question
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

  // Doubt Raising System state
  const [doubts, setDoubts] = useState([])
  const [resolvedDoubts, setResolvedDoubts] = useState([])
  const [replyTexts, setReplyTexts] = useState({})
  const [showDoubtsPanel, setShowDoubtsPanel] = useState(false)
  const [doubtViewMode, setDoubtViewMode] = useState('list') // 'list' | 'topic'
  const [selectedDoubts, setSelectedDoubts] = useState({}) // { [doubtId]: boolean }
  const [bulkReplyText, setBulkReplyText] = useState('')

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
    if (room?.code && user?._id && isConnected && socket) {
      console.log('Teacher joining socket room:', room.code)
      joinRoom(room.code, user._id)
    }
  }, [room?.code, user?._id, isConnected, socket])

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

  // Listen for doubt events
  useEffect(() => {
    if (!socket) return
    
    const handleDoubtsHistory = (list) => {
      setDoubts(list.filter(d => !d.resolved))
      const resList = list.filter(d => d.resolved)
      setResolvedDoubts(Array.from(new Map(resList.map(item => [item.doubtId, item])).values()))
    }

    const handleDoubtRaised = (data) => {
      console.log('New doubt raised:', data)
      setDoubts(prev => prev.some(d => d.doubtId === data.doubtId) ? prev : [data, ...prev])
    }

    const handleDoubtUpvoted = (data) => {
      setDoubts(prev => prev.map(d => d.doubtId === data.doubtId ? { ...d, ...data, upvotes: data.upvotes } : d))
    }

    const handleDoubtResolved = (data) => {
      setDoubts(prev => {
        const d = prev.find(item => item.doubtId === data.doubtId)
        if (d) {
          setResolvedDoubts(r => {
            const filtered = r.filter(item => item.doubtId !== data.doubtId)
            return [{ ...d, reply: data.reply || d.reply, resolvedAt: new Date().toISOString() }, ...filtered]
          })
        }
        return prev.filter(item => item.doubtId !== data.doubtId)
      })
      setSelectedDoubts(prev => {
        const next = { ...prev }
        delete next[data.doubtId]
        return next
      })
    }

    const handleDoubtsBulkResolved = (data) => {
      const ids = Array.isArray(data.doubtIds) ? data.doubtIds : []
      setDoubts(prev => {
        const resolved = prev.filter(item => ids.includes(item.doubtId)).map(item => ({
          ...item,
          resolved: true,
          reply: data.reply,
          resolvedAt: data.resolvedAt || new Date().toISOString()
        }))
        if (resolved.length > 0) {
          setResolvedDoubts(r => {
            const filtered = r.filter(item => !ids.includes(item.doubtId))
            return [...resolved, ...filtered]
          })
        }
        return prev.filter(item => !ids.includes(item.doubtId))
      })
      setSelectedDoubts(prev => {
        const next = { ...prev }
        ids.forEach(id => delete next[id])
        return next
      })
    }

    const handleDoubtReopened = (data) => {
      setResolvedDoubts(prev => prev.filter(d => d.doubtId !== data.doubtId))
      setDoubts(prev => {
        const filtered = prev.filter(d => d.doubtId !== data.doubtId)
        return [data, ...filtered]
      })
    }

    const handleDoubtAcknowledged = (data) => {
      setResolvedDoubts(prev => prev.map(d => d.doubtId === data.doubtId ? { ...d, acknowledgedUsers: data.acknowledgedUsers, acknowledged: data.acknowledged } : d))
    }

    socket.on('doubts_history', handleDoubtsHistory)
    socket.on('doubt_raised', handleDoubtRaised)
    socket.on('doubt_upvoted', handleDoubtUpvoted)
    socket.on('doubt_resolved', handleDoubtResolved)
    socket.on('doubts_bulk_resolved', handleDoubtsBulkResolved)
    socket.on('doubt_reopened', handleDoubtReopened)
    socket.on('doubt_acknowledged', handleDoubtAcknowledged)

    return () => {
      socket.off('doubts_history', handleDoubtsHistory)
      socket.off('doubt_raised', handleDoubtRaised)
      socket.off('doubt_upvoted', handleDoubtUpvoted)
      socket.off('doubt_resolved', handleDoubtResolved)
      socket.off('doubts_bulk_resolved', handleDoubtsBulkResolved)
      socket.off('doubt_reopened', handleDoubtReopened)
      socket.off('doubt_acknowledged', handleDoubtAcknowledged)
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

  const handleQuestionLaunched = (data) => {
    console.log('[QUESTION LAUNCHED]', data)
  }

    socket.on('new_question', handleQuestionLaunched)
    socket.on('question:started', handleQuestionLaunched)

    return () => {
      socket.off('new_question', handleQuestionLaunched)
      socket.off('question:started', handleQuestionLaunched)
    }
  }, [socket, roomSettings.timeToAnswer])

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

    // Capture transcript and save if long enough.
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

    // Save transcript to database BEFORE generating questions. This guarantees
    // the backend's auto-topic pipeline (which fires on POST /api/transcripts)
    // has produced topics by the time question generation runs. A failed save
    // here aborts generation so we never generate questions from an unsaved
    // transcript (which would later produce "topic: General Confusion" on
    // the recovery dashboard). Auto-topic + topic-leak fix depends on this order.
    let generated = null
    if (!(await saveCurrentSegmentTranscript())) {
      window.alert('Transcript could not be saved. Please try generating questions manually after checking the connection.')
      setGenerateQEnabled(true)
      return
    }

    // Auto-generate questions
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
      setPendingQuestions(generated)
      setShowQuestionPopup(true)
      setIsPopupOpen(true)
      // Questions are in hand and the review popup is up — NOW persist the transcript, fire-and-forget
      // so a slow/failed/hung save can never block the pipeline or lose the generated questions.
      // source defaults to 'audio' (real segment).
      saveTranscript(room._id, currentSegment, textToUse, roomSettings.segmentTime * 60)
        .catch((err) => console.error('[SEGMENT] Failed to save transcript (questions already generated):', err))
    }
  }

  const generateQuestionsFromText = async (text, segmentIndex) => {
    setIsGeneratingQuestions(true)
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
      throw error
    }
  }

  // Handle question generation from pasted text (TextToQuestionsPopup)
  const handleTextToQuestionsGenerate = async (text, mode, tone = 'professional') => {
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
        questionTypeMix: typeMix,
        tone: tone
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
      // Seed the live participant count so a mid-session reload doesn't flash 0 until the next join.
      if (roomData?.participants !== undefined) setTotalParticipants(roomData.participants)
      // Apply room settings if they exist
      if (roomData.settings) {
        setRoomSettings(prev => ({
          ...prev,
          ...roomData.settings
        }))
      }
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
    if (!audioBlob || audioBlob.size < 5000) {
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

  // ============================================================
  // LIVE TEACHER POSITION BROADCAST
  // While recording, broadcast our wall-clock recording offset every 2s so
  // students can attach it to their "I'm lost" signals. Without this,
  // student signals arrive with recordingOffsetMs=0 and the topic resolver
  // can't tell what we were teaching when the spike happened.
  // ============================================================
  const startTeacherBroadcast = useCallback(() => {
    // Stop any prior broadcast (defensive)
    if (teacherPositionBroadcastRef.current) {
      clearInterval(teacherPositionBroadcastRef.current)
      teacherPositionBroadcastRef.current = null
    }
    const posStore = useTeacherPositionStore.getState()
    roomStartedAtRef.current = Date.now()
    posStore.startSession(room._id, room.code, roomStartedAtRef.current).catch(() => {})
    // Persist the session start on the backend so Room.roomStartedAt is set.
    // The auto-topic pipeline (POST /api/transcripts) bails out early when
    // this field is null, which made brand-new rooms fall back to "General
    // confusion" instead of generating a real topic marker.
    api.doubts.startSession(room._id).catch(() => {})
    teacherPositionBroadcastRef.current = setInterval(() => {
      const offsetMs = Date.now() - (roomStartedAtRef.current || Date.now())
      const seg = currentSegmentRef.current ?? 0
      const utterance = accumulatedTranscriptRef.current?.slice(-200) || ''
      useTeacherPositionStore.getState().broadcastPosition(room.code, {
        recordingOffsetMs: offsetMs,
        segmentIndex: seg,
        utteranceSnapshot: utterance
      })
    }, 2000)
  }, [room])

  const stopTeacherBroadcast = useCallback(() => {
    if (teacherPositionBroadcastRef.current) {
      clearInterval(teacherPositionBroadcastRef.current)
      teacherPositionBroadcastRef.current = null
    }
    useTeacherPositionStore.getState().reset()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (teacherPositionBroadcastRef.current) {
        clearInterval(teacherPositionBroadcastRef.current)
      }
    }
  }, [])

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

      startTranscriptionWindow()

      // Live teacher position broadcast so students can attach their "I'm lost"
      // signals to the current recording offset (otherwise spikes stack at 00:00).
      startTeacherBroadcast()

    } catch (error) {
      console.error('Error starting recording:', error)
      setModelStatus('Microphone access denied')
    }
  }

  const stopRecording = async () => {
    recordingActiveRef.current = false

    // Stop live teacher position broadcast
    stopTeacherBroadcast()

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

    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current)
    }

    setIsRecording(false)
    setIsTranscribing(false)
    setModelStatus('Ready')
  }

  // Save whatever transcript we have accumulated for the current segment.
  // Returns true if saved, false if skipped (too short / error).
  // Used by both the segment-timer path (handleSegmentComplete) and the
  // manual stop path (toggleRecording) so auto-topic generation can fire
  // even when the teacher stops recording before the timer expires.
  const saveCurrentSegmentTranscript = async () => {
    const textToUse = (segmentTranscriptRef.current || '').trim() || (transcript || '').trim()
    if (!textToUse || textToUse.length < 50) {
      console.log('[SEGMENT] Transcript too short (<50 chars), skipping save')
      return false
    }
    try {
      await saveTranscript(room._id, currentSegment, textToUse, (roomSettings.segmentTime || 0) * 60)
      console.log('[SEGMENT] Transcript saved to DB')
      return true
    } catch (err) {
      console.error('[SEGMENT] Failed to save transcript:', err)
      return false
    }
  }

  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording()
      // Manual stop: still flush whatever transcript has accumulated so the
      // auto-topic pipeline can extract a topic before the next doubt lands.
      await saveCurrentSegmentTranscript()
    } else {
      startRecording()
    }
  }

  // --- Video Mode (Phase 2: teacher player + tab-audio capture into the existing pipeline) ---
  const isVideoMode = roomSettings.mode === 'video'
  const videoId = isVideoMode ? extractYouTubeId(roomSettings.videoUrl) : null
  const videoIsLiveHint = /\/live\//.test(roomSettings.videoUrl || '')
  const ytPlayerRef = useRef(null)
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
      display.getVideoTracks().forEach(t => t.stop()) // only the audio is needed
      const stream = new MediaStream(audioTracks)
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

  const clearTranscript = () => {
    setTranscript('')
    finalTranscriptRef.current = ''
    setSegmentTranscript('')
    segmentTranscriptRef.current = ''
  }

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
        setPendingQuestions(questions)
        setShowQuestionPopup(true)
        setIsPopupOpen(true)
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

  const broadcastQuestionWithCountdown = (question) => {
    if (!socket || !isConnected) return;
    
    // Emit prepare_poll to show countdown on student side
    socket.emit('prepare_poll', {
      roomCode: room.code
    });
    
    // Set local UI countdown on teacher side
    setPollCountdown(5);
    let count = 5;
    
    const interval = setInterval(() => {
      count -= 1;
      setPollCountdown(count > 0 ? count : null);
      
      if (count <= 0) {
        clearInterval(interval);
        // Emit actual question to students
        socket.emit('new_question', {
          roomCode: room.code,
          question: question
        });
      }
    }, 1000);
  };

  const handleApproveQuestion = async (question) => {
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
        broadcastQuestionWithCountdown(data.question)
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
        broadcastQuestionWithCountdown(data.question)
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
    // leaderboard fold fires via the pop-up-close watcher (textPopupWasOpenRef) on close
  }

  const handleCreateQuestion = async (questionData) => {
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
        broadcastQuestionWithCountdown(data.question)
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

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
                  ⚠ Answer
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
                  ⚠ Time's Up!
                </span>
              </div>
            )}

            {/* Paste & Generate Button */}
            {!isEnded && (
              <button
                onClick={() => { setPastedText(''); setShowTextToQuestions(true) }}
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
                📋 Paste & Generate
              </button>
            )}

            {/* Create Question Button */}
            {!isEnded && (
              <button
                onClick={() => setShowCreateQuestion(true)}
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
                ⚙ Create Q
              </button>
            )}

            {/* Doubts Button */}
            {!isEnded && (
              <button 
                onClick={() => setShowDoubtsPanel(!showDoubtsPanel)} 
                style={{
                  padding: '8px 16px',
                  background: doubts.length > 0 ? '#ef4444' : 'var(--nav-hover)',
                  color: doubts.length > 0 ? 'white' : 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  position: 'relative',
                  transition: 'background 0.2s'
                }}
              >
                🙋‍♂️ Doubts 
                {doubts.length > 0 && (
                  <span style={{
                    background: 'white',
                    color: '#ef4444',
                    borderRadius: '12px',
                    padding: '2px 8px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    marginLeft: '4px'
                  }}>
                    {doubts.length}
                  </span>
                )}
              </button>
            )}

            {/* Confusion Analytics Button */}
            {!isEnded && (
              <button 
                onClick={() => setShowAnalyticsPanel(!showAnalyticsPanel)} 
                style={{
                  padding: '8px 16px',
                  background: 'var(--nav-hover)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  position: 'relative',
                  transition: 'background 0.2s'
                }}
              >
                📉 Confusion Analytics
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
                ⚙ Settings
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

            {/* End Room Button */}
            {!isEnded && (
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
            </div>
          </div>

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
                      disabled={isEnded}
                      style={{
                        width: '100%',
                        marginTop: '12px',
                        padding: '11px 16px',
                        background: isEnded ? '#9ca3af' : 'var(--accent-gradient)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: isEnded ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Start Session (share this tab's audio)
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
                disabled={isEnded}
                style={{
                  width: '80px',
                  height: '80px',
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
                <p style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: isRecording ? '#ef4444' : 'var(--text-primary)' }}>
                  {isTranscribing ? 'Listening...' : (isRecording ? 'Recording...' : 'Start Recording')}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {modelStatus}
                </p>
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
                    {isGeneratingQuestions ? '⏳ Generating...' : '⚙ Generate Q'}
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
                {transcript ? transcript : (
                  <span style={{ fontStyle: 'italic' }}>
                    Click the microphone to start real-time transcription.
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
              <span style={{ fontSize: '20px' }}>📋</span>
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
                <span style={{ fontSize: '20px' }}>📋</span>
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


      {/* Contextual Doubt-Anchored Polling: live confusion signals for the teacher */}
      {room?._id && (
        <>
          {/* Analytics Sliding Panel */}
          {showAnalyticsPanel && (
            <div style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: isMobile ? '100%' : '420px',
              height: '100%',
              background: 'var(--bg-card)',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
              zIndex: 2000,
              display: 'flex',
              flexDirection: 'column',
              borderLeft: '1px solid var(--border-color)',
              transition: 'transform 0.3s ease-in-out'
            }}>
              <div style={{
                padding: '20px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📉 Confusion Analytics
                </h2>
                <button 
                  onClick={() => setShowAnalyticsPanel(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '24px',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >&times;</button>
              </div>
              
              <div className="confusion-stack" style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'block' }}>
                {/* Milestone 3: ONE live card -- tier-styled, animated count, status pill */}
                <ConfusionAlertCard roomId={room._id} hasTranscript={!!room?.roomStartedAt} />
                {/* Milestone 3: ranked topic heat bars */}
                <TopicHeatmap roomId={room._id} />
                {/* Milestone 3: history-only timeline (replaces legacy ConfusionSpikePanel live card) */}
                <ConfusionTimeline roomId={room._id} />
                {/* Topic markers -- teacher sets "what we were on at this time" so spike cards show real topics */}
                <TopicMarkerBar roomId={room._id} roomCode={room.code} editable />
              </div>
            </div>
          )}
        </>
      )}

      {/* Question Approval Popup */}
      {showQuestionPopup && pendingQuestions.length > 0 && (
        <QuestionApprovalPopup
          questions={pendingQuestions}
          onApprove={handleApproveQuestion}
          onReject={handleRejectQuestion}
          onComplete={() => {
            // All questions reviewed - close popup and resume for next segment
            setShowQuestionPopup(false)
            setIsPopupOpen(false)
            setPendingQuestions([])

            // Clear segment transcript for fresh start
            setSegmentTranscript('')
            segmentTranscriptRef.current = ''
            finalTranscriptRef.current = ''

            // Reset pending review flag
            setIsPendingReview(false)
            setGenerateQEnabled(true)

            // Reset segment timer
            setSegmentTimeLeft(roomSettings.segmentTime * 60)

            // Resume recording for next segment
            startRecording({ resetSegment: false })
            if (isVideoMode) resumeTeacherVideo() // resume the video (live: jump to live edge) after review
            // leaderboard fold fires via the pop-up-close watcher (approvalPopupWasOpenRef) on close

            // Timer will auto-start via the useEffect since isPendingReview is now false
          }}
          onClose={() => {
            // Teacher manually closed popup - same as complete for next segment
            setShowQuestionPopup(false)
            setIsPopupOpen(false)
            setPendingQuestions([])
            setSegmentTranscript('')
            segmentTranscriptRef.current = ''
            finalTranscriptRef.current = ''
            setIsPendingReview(false)
            setGenerateQEnabled(true)
            setSegmentTimeLeft(roomSettings.segmentTime * 60)
            startRecording({ resetSegment: false })
            if (isVideoMode) resumeTeacherVideo() // resume the video (live: jump to live edge) after review
            // leaderboard fold fires via the pop-up-close watcher (approvalPopupWasOpenRef) on close
          }}
        />
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

      {/* Doubts Sliding Panel */}
      {showDoubtsPanel && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '350px',
          height: '100%',
          background: 'var(--bg-card)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--border-color)',
          transition: 'transform 0.3s ease-in-out'
        }}>
          <div style={{
            padding: '20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🙋‍♂️ Active Doubts
              <span style={{
                background: '#ef4444',
                color: 'white',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '12px'
              }}>{doubts.length}</span>
            </h2>
            <button 
              onClick={() => setShowDoubtsPanel(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '4px'
              }}
            >&times;</button>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
            {/* Always-Visible View Mode Toggle Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px', background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setDoubtViewMode('list')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: doubtViewMode === 'list' ? 'var(--primary)' : 'transparent',
                    color: doubtViewMode === 'list' ? 'white' : 'var(--text-secondary)',
                    fontWeight: '600',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  📋 List ({doubts.filter(d => !d.reopened).length})
                </button>
                <button
                  onClick={() => setDoubtViewMode('topic')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: doubtViewMode === 'topic' ? 'var(--primary)' : 'transparent',
                    color: doubtViewMode === 'topic' ? 'white' : 'var(--text-secondary)',
                    fontWeight: '600',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  🗂️ Group by Topic
                </button>
              </div>
              {Object.values(selectedDoubts).some(Boolean) && (
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#6366f1', background: '#eef2ff', padding: '4px 10px', borderRadius: '12px', border: '1px solid #c7d2fe' }}>
                  ✔ {Object.keys(selectedDoubts).filter(id => selectedDoubts[id]).length} selected
                </span>
              )}
            </div>

            {/* Sticky Bulk Action Bar ONLY for normal doubts selected */}
            {Object.values(selectedDoubts).some(Boolean) && (
              <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 20,
                background: '#eef2ff',
                border: '1px solid #818cf8',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '16px',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.15)',
                boxSizing: 'border-box'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontWeight: '700', color: '#3730a3', fontSize: '13px' }}>
                    💬 Bulk Resolve ({Object.keys(selectedDoubts).filter(id => selectedDoubts[id]).length} selected)
                  </span>
                  <button
                    onClick={() => setSelectedDoubts({})}
                    style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                  >
                    Clear selection
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Write a bulk explanation note (optional)..."
                  value={bulkReplyText}
                  onChange={(e) => setBulkReplyText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #c7d2fe',
                    marginBottom: '8px',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  onClick={() => {
                    const ids = Object.keys(selectedDoubts).filter(id => selectedDoubts[id])
                    socket.emit('bulk_resolve_doubts', { roomCode: room.code, doubtIds: ids, reply: bulkReplyText || null })
                    setBulkReplyText('')
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '13px'
                  }}
                >
                  ⚡ Resolve Selected Doubts at Once
                </button>
              </div>
            )}

            {/* PRIORITY SECTION: Re-Opened Individual Nuances */}
            {doubts.filter(d => d.reopened).length > 0 && (
              <div style={{ marginBottom: '20px', background: '#fff7ed', borderRadius: '12px', padding: '16px', border: '1px solid #fdba74', boxSizing: 'border-box' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: '700', color: '#c2410c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🔥 Priority Re-Opened Nuances: {doubts.filter(d => d.reopened).length} {doubts.filter(d => d.reopened).length === 1 ? 'Pending' : 'Pending'}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {doubts.filter(d => d.reopened).map(doubt => (
                    <div key={doubt.doubtId} style={{
                      background: 'var(--bg-card)',
                      borderRadius: '10px',
                      padding: '14px',
                      border: '1px solid #ea580c',
                      borderLeft: '4px solid #ea580c',
                      boxSizing: 'border-box'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>🙋 {doubt.userName}</span>
                          <span style={{ background: '#ffedd5', color: '#c2410c', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
                            {doubt.topic || '#General'} Nuance
                          </span>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {new Date(doubt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', padding: '6px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>
                        ⚠️ Student Reason: {doubt.reopenReason || 'Specific nuance not covered'}
                      </div>
                      <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-primary)', fontWeight: '500' }}>
                        "{doubt.message}"
                      </p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          placeholder="Answer this exact nuance individually..."
                          value={replyTexts[doubt.doubtId] || ''}
                          onChange={(e) => setReplyTexts({ ...replyTexts, [doubt.doubtId]: e.target.value })}
                          style={{
                            flex: '1 1 200px',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #fdba74',
                            background: 'var(--bg-main)',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            boxSizing: 'border-box'
                          }}
                        />
                        <button
                          onClick={() => {
                            const reply = replyTexts[doubt.doubtId] || 'Answered during live explanation'
                            socket.emit('resolve_doubt', { roomCode: room.code, doubtId: doubt.doubtId, reply })
                          }}
                          style={{
                            padding: '8px 16px',
                            background: '#ea580c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            flexShrink: 0
                          }}
                        >
                          💬 Resolve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {doubts.filter(d => !d.reopened).length === 0 && doubts.filter(d => d.reopened).length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '40px' }}>
                <div style={{ fontSize: '40px', opacity: 0.5, marginBottom: '10px' }}>🙌</div>
                <p>No active doubts right now.<br/>Everyone is following along!</p>
              </div>
            ) : doubtViewMode === 'topic' ? (
              /* Group by Topic Mode (Only Normal Doubts) */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {Object.entries(doubts.filter(d => !d.reopened).reduce((acc, d) => {
                  const topic = d.topic || '#General'
                  if (!acc[topic]) acc[topic] = []
                  acc[topic].push(d)
                  return acc
                }, {})).map(([topic, list]) => {
                  const totalUpvotes = list.reduce((sum, item) => sum + (item.upvotes?.length || 0), 0)
                  const allSelected = list.length > 0 && list.every(item => selectedDoubts[item.doubtId])
                  return (
                    <div key={topic} style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', boxSizing: 'border-box' }}>
                      <div style={{ background: 'var(--bg-main)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <span style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '15px' }}>{topic}</span>
                          <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            ({list.length} {list.length === 1 ? 'doubt' : 'doubts'}{totalUpvotes > 0 ? `, 👍 ${totalUpvotes} upvotes` : ''})
                          </span>
                        </div>
                        {(list.length > 1 || totalUpvotes > 0) && (
                          <button
                            onClick={() => {
                              const next = { ...selectedDoubts }
                              list.forEach(item => { next[item.doubtId] = !allSelected })
                              setSelectedDoubts(next)
                            }}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: `1px solid ${allSelected ? '#6366f1' : 'var(--border-color)'}`,
                              background: allSelected ? '#eef2ff' : 'var(--bg-card)',
                              color: allSelected ? '#6366f1' : 'var(--text-secondary)',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            {allSelected ? '✔ All Selected' : 'Select All in Topic'}
                          </button>
                        )}
                      </div>
                      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {list.map(doubt => {
                          const isSingleIndividual = list.length === 1 && (doubt.upvotes?.length || 0) === 0
                          return (
                            <div key={doubt.doubtId} style={{
                              background: 'var(--bg-main)',
                              borderRadius: '10px',
                              padding: '12px',
                              border: '1px solid var(--border-color)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  {!isSingleIndividual && (
                                    <input
                                      type="checkbox"
                                      checked={!!selectedDoubts[doubt.doubtId]}
                                      onChange={(e) => setSelectedDoubts({ ...selectedDoubts, [doubt.doubtId]: e.target.checked })}
                                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                    />
                                  )}
                                  <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{doubt.userName}</span>
                                  {(doubt.upvotes?.length || 0) > 0 ? (
                                    <span style={{ background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #f59e0b' }}>
                                      👥 {doubt.upvotes.length + 1} students (👍 {doubt.upvotes.length} upvotes)
                                    </span>
                                  ) : (
                                    <span style={{ background: '#f3f4f6', color: '#4b5563', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #d1d5db' }}>
                                      👤 1 student (individual doubt)
                                    </span>
                                  )}
                                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
                                    "{doubt.message}"
                                  </span>
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                  {new Date(doubt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {isSingleIndividual && (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }}>
                                  <input
                                    type="text"
                                    placeholder="Write an individual reply to this student..."
                                    value={replyTexts[doubt.doubtId] || ''}
                                    onChange={(e) => setReplyTexts({ ...replyTexts, [doubt.doubtId]: e.target.value })}
                                    style={{
                                      flex: '1 1 200px',
                                      padding: '8px 12px',
                                      borderRadius: '6px',
                                      border: '1px solid var(--border-color)',
                                      background: 'var(--bg-card)',
                                      color: 'var(--text-primary)',
                                      fontSize: '13px',
                                      boxSizing: 'border-box'
                                    }}
                                  />
                                  <button
                                    onClick={() => {
                                      const reply = replyTexts[doubt.doubtId] || null
                                      socket.emit('resolve_doubt', { roomCode: room.code, doubtId: doubt.doubtId, reply })
                                    }}
                                    style={{
                                      padding: '8px 16px',
                                      background: '#10b981',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontWeight: '600',
                                      fontSize: '13px',
                                      flexShrink: 0
                                    }}
                                  >
                                    💬 Reply & Resolve
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* List View Mode (Only Normal Doubts - No Checkboxes, Direct Individual Reply) */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {doubts.filter(d => !d.reopened).map(doubt => (
                  <div key={doubt.doubtId} style={{
                    background: 'var(--bg-main)',
                    borderRadius: '12px',
                    padding: '16px',
                    border: '1px solid var(--border-color)',
                    borderLeft: '4px solid #ef4444',
                    boxSizing: 'border-box'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{doubt.userName}</span>
                        <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>
                          {doubt.topic || '#General'}
                        </span>
                        {(doubt.upvotes?.length || 0) > 0 ? (
                          <span style={{ background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #f59e0b' }}>
                            👥 {doubt.upvotes.length + 1} students (👍 {doubt.upvotes.length} upvotes)
                          </span>
                        ) : (
                          <span style={{ background: '#f3f4f6', color: '#4b5563', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #d1d5db' }}>
                            👤 1 student (individual doubt)
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {new Date(doubt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                      "{doubt.message}"
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder={(doubt.upvotes?.length || 0) > 0 ? `Reply to all ${doubt.upvotes.length + 1} students asking this question...` : "Write an individual reply to this student..."}
                        value={replyTexts[doubt.doubtId] || ''}
                        onChange={(e) => setReplyTexts({ ...replyTexts, [doubt.doubtId]: e.target.value })}
                        style={{
                          flex: '1 1 200px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-card)',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          boxSizing: 'border-box'
                        }}
                      />
                      <button
                        onClick={() => {
                          const reply = replyTexts[doubt.doubtId] || null
                          socket.emit('resolve_doubt', { roomCode: room.code, doubtId: doubt.doubtId, reply })
                        }}
                        style={{
                          padding: '8px 16px',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: '600',
                          fontSize: '13px',
                          flexShrink: 0
                        }}
                      >
                        💬 Reply & Resolve{(doubt.upvotes?.length || 0) > 0 ? ` (${doubt.upvotes.length + 1})` : ''}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {resolvedDoubts.length > 0 && (
              <div style={{ marginTop: '28px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  ✅ Resolved History ({resolvedDoubts.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Array.from(new Map(resolvedDoubts.map(item => [item.doubtId, item])).values()).map((d, idx) => (
                    <div key={d.doubtId || idx} style={{
                      background: 'var(--bg-main)',
                      borderRadius: '8px',
                      padding: '12px',
                      opacity: 0.75,
                      borderLeft: '4px solid #10b981'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{d.userName}</span>
                        {(() => {
                          const ackUsers = Array.isArray(d.acknowledgedUsers) ? d.acknowledgedUsers : []
                          const ackCount = ackUsers.length > 0 ? ackUsers.length : (d.acknowledged ? 1 : 0)
                          const totalCount = 1 + (d.upvotes?.length || 0)
                          if (totalCount === 1) {
                            return (
                              <span style={{ color: '#10b981', fontWeight: '600' }}>
                                {ackCount >= 1 || d.acknowledged ? '✅ Student Acknowledged' : '✔ Resolved'}
                              </span>
                            )
                          }
                          if (ackCount === 0) {
                            return (
                              <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>
                                ✔ Resolved (0/{totalCount} acknowledged)
                              </span>
                            )
                          } else if (ackCount < totalCount) {
                            return (
                              <span style={{ color: '#d97706', fontWeight: '600', background: '#fef3c7', padding: '2px 8px', borderRadius: '12px' }}>
                                ⏳ {ackCount}/{totalCount} Students Acknowledged ({Math.round((ackCount / totalCount) * 100)}%)
                              </span>
                            )
                          } else {
                            return (
                              <span style={{ color: '#10b981', fontWeight: '600' }}>
                                ✅ All {totalCount} Students Acknowledged (100%)
                              </span>
                            )
                          }
                        })()}
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>"{d.message}"</p>
                      {d.reply && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#059669' }}>💬 Reply: {d.reply}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
      `}</style>

      {/* Poll Incoming Countdown Overlay (Teacher Side) */}
      {pollCountdown !== null && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          color: 'white',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '20px', color: '#10b981' }}>
            Sending Poll to Students...
          </div>
          <div style={{ 
            fontSize: '96px', 
            fontWeight: 'bold', 
            background: 'linear-gradient(135deg, #34d399, #10b981)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'pulse 1s infinite'
          }}>
            {pollCountdown}
          </div>
          <div style={{ marginTop: '20px', fontSize: '18px', color: '#9ca3af' }}>
            Students are seeing a "Get Ready" screen
          </div>
        </div>
      )}
    </div>
  )
}

export default RoomDetailPage
