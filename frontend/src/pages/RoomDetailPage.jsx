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
  const isMobile = useIsMobile()

  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRoomJoined, setIsRoomJoined] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
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
  const [segmentTranscript, setSegmentTranscript] = useState('')
  const [segmentTimeLeft, setSegmentTimeLeft] = useState(0)
  const segmentTimerRef = useRef(null)

  // Unified segment entries
  const [segmentEntries, setSegmentEntries] = useState([])
  const segmentEntriesRef = useRef([])

  useEffect(() => {
    segmentEntriesRef.current = segmentEntries
  }, [segmentEntries])

  const addTranscriptEntry = useCallback((text, source) => {
    if (!text || !text.trim()) return
    const cleanedText = text.trim()
    setSegmentEntries(prev => {
      const newEntry = {
        text: cleanedText,
        source, // 'video' | 'mic'
        timestamp: Date.now()
      }
      return [...prev, newEntry]
    })
  }, [])

  const groupedEntries = React.useMemo(() => {
    const groups = []
    for (const entry of segmentEntries) {
      const last = groups[groups.length - 1]
      if (last && last.source === entry.source) {
        last.chunks.push(entry.text)
      } else {
        groups.push({ source: entry.source, chunks: [entry.text] })
      }
    }
    return groups
  }, [segmentEntries])

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

  // YouTube Player refs and state
  const ytPlayerRef = useRef(null)
  const [ytPlayerReady, setYtPlayerReady] = useState(false)
  const ytSyncIntervalRef = useRef(null)
  const ytIsSeekingRef = useRef(false)
  const loadedVideoIdRef = useRef(null)
  const [sharedMediaExpanded, setSharedMediaExpanded] = useState(true)
  const [mediaUrlInput, setMediaUrlInput] = useState('')
  const [hasCaptions, setHasCaptions] = useState(false)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)

  // Helper to extract YouTube video ID
  const getYouTubeId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  // Handle YouTube player state changes
  const handlePlayerStateChange = useCallback((event) => {
    if (!socket || !room) return
    const player = ytPlayerRef.current
    if (!player || typeof player.getCurrentTime !== 'function') return

    const currentTime = player.getCurrentTime()

    if (event.data === window.YT.PlayerState.PLAYING) {
      setIsVideoPlaying(true)
      if (ytIsSeekingRef.current) {
        socket.emit('video:seek', { roomCode: room.code, currentTime })
        ytIsSeekingRef.current = false
      } else {
        socket.emit('video:play', { roomCode: room.code, currentTime })
      }
      
      // Start 5-second sync interval
      if (!ytSyncIntervalRef.current) {
        ytSyncIntervalRef.current = setInterval(() => {
          if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
            socket.emit('video:sync', {
              roomCode: room.code,
              currentTime: ytPlayerRef.current.getCurrentTime(),
              isPlaying: true
            })
          }
        }, 5000)
      }
    } else if (event.data === window.YT.PlayerState.PAUSED) {
      setIsVideoPlaying(false)
      if (ytIsSeekingRef.current) {
        socket.emit('video:seek', { roomCode: room.code, currentTime })
        ytIsSeekingRef.current = false
      } else {
        socket.emit('video:pause', { roomCode: room.code, currentTime })
      }
      
      // Clear interval when paused
      if (ytSyncIntervalRef.current) {
        clearInterval(ytSyncIntervalRef.current)
        ytSyncIntervalRef.current = null
      }
    } else if (event.data === window.YT.PlayerState.BUFFERING) {
      ytIsSeekingRef.current = true
    }
  }, [socket, room])

  // Proactively load YouTube Iframe API script on component mount
  useEffect(() => {
    if (!window.YT) {
      if (!document.getElementById('youtube-iframe-api-script')) {
        const tag = document.createElement('script')
        tag.id = 'youtube-iframe-api-script'
        tag.src = 'https://www.youtube.com/iframe_api'
        const firstScriptTag = document.getElementsByTagName('script')[0]
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)
      }
    }
  }, [])

  // Load YouTube Player API and initialize
  useEffect(() => {
    if (!room) return
    const isVideoRoom = room.mode === 'video'
    const sharedMediaActive = room.sharedMedia && room.sharedMedia.provider === 'youtube' && room.sharedMedia.url

    if (!isVideoRoom && !sharedMediaActive) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
        ytPlayerRef.current.destroy()
        ytPlayerRef.current = null
        setYtPlayerReady(false)
        loadedVideoIdRef.current = null
      }
      return
    }

    const videoUrl = isVideoRoom ? room.videoUrl : room.sharedMedia.url
    const videoId = getYouTubeId(videoUrl)
    if (!videoId) return

    // If loaded video ID has changed, destroy and recreate
    if (ytPlayerRef.current && loadedVideoIdRef.current !== videoId) {
      if (typeof ytPlayerRef.current.destroy === 'function') {
        ytPlayerRef.current.destroy()
      }
      ytPlayerRef.current = null
      setYtPlayerReady(false)
    }

    loadedVideoIdRef.current = videoId

    const initPlayer = () => {
      if (ytPlayerRef.current) return
      
      try {
        ytPlayerRef.current = new window.YT.Player('youtube-player', {
          videoId: videoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            modestbranding: 1
          },
          events: {
            onReady: () => {
              console.log('Teacher YT Player Ready')
              setYtPlayerReady(true)
            },
            onStateChange: handlePlayerStateChange
          }
        })
      } catch (err) {
        console.error('Failed to create YT Player:', err)
      }
    }

    if (window.YT && window.YT.Player) {
      initPlayer()
    } else {
      const handleReady = () => {
        if (window.YT && window.YT.Player) {
          initPlayer()
        }
      }
      if (window.onYouTubeIframeAPIReady) {
        const original = window.onYouTubeIframeAPIReady
        window.onYouTubeIframeAPIReady = () => {
          original()
          handleReady()
        }
      } else {
        window.onYouTubeIframeAPIReady = handleReady
      }
    }
  }, [room, handlePlayerStateChange])

  // Cleanup player on unmount
  useEffect(() => {
    return () => {
      if (ytSyncIntervalRef.current) {
        clearInterval(ytSyncIntervalRef.current)
        ytSyncIntervalRef.current = null
      }
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === 'function') {
        ytPlayerRef.current.destroy()
        ytPlayerRef.current = null
      }
    }
  }, [])

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

  // Listen for video sync and automated question generation events
  useEffect(() => {
    if (!socket) return

    const handleVideoState = (data) => {
      console.log('[VIDEO STATE] Received:', data)
      if (data) {
        if (data.hasCaptions !== undefined) {
          setHasCaptions(data.hasCaptions)
        }
        if (data.segmentEntries !== undefined) {
          setSegmentEntries(data.segmentEntries)
        }
      }
    }

    const handleMediaUpdated = (data) => {
      console.log('[MEDIA UPDATED] Received:', data)
      if (data && data.hasCaptions !== undefined) {
        setHasCaptions(data.hasCaptions)
      }
      clearTranscript()
    }

    const handleMediaRemoved = () => {
      console.log('[MEDIA REMOVED]')
      setHasCaptions(false)
      clearTranscript()
    }

    const handleQuestionsGenerated = (data) => {
      console.log('[YT AI] Questions generated from YouTube transcript:', data)
      if (data && data.questions && data.questions.length > 0) {
        setPendingQuestions(data.questions)
        setShowQuestionPopup(true)
        setIsPopupOpen(true)
        if (data.transcript) {
          setTranscript(data.transcript)
        }
      }
    }

    const handleTranscriptChunk = (data) => {
      console.log('[VIDEO TRANSCRIPT CHUNK] Received:', data)
      if (data && data.text) {
        addTranscriptEntry(data.text, 'video')
      }
    }

    socket.on('video:state', handleVideoState)
    socket.on('media:updated', handleMediaUpdated)
    socket.on('media:removed', handleMediaRemoved)
    socket.on('video:questions-generated', handleQuestionsGenerated)
    socket.on('video:transcript-chunk', handleTranscriptChunk)

    return () => {
      socket.off('video:state', handleVideoState)
      socket.off('media:updated', handleMediaUpdated)
      socket.off('media:removed', handleMediaRemoved)
      socket.off('video:questions-generated', handleQuestionsGenerated)
      socket.off('video:transcript-chunk', handleTranscriptChunk)
    }
  }, [socket, addTranscriptEntry])

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
  }, [segmentEntries])

  // Start segment timer when recording OR when video is playing
  useEffect(() => {
    if (roomSettings.segmentTime > 0 && !isPendingReview && !room?.endedAt) {
      const shouldRun = isRecording || isVideoPlaying
      if (shouldRun) {
        if (!segmentTimerRef.current) {
          startSegmentTimer(segmentTimeLeft > 0 ? segmentTimeLeft : roomSettings.segmentTime * 60)
        }
      } else {
        pauseSegmentTimer()
      }
    } else {
      if (segmentTimerRef.current) {
        clearInterval(segmentTimerRef.current)
        segmentTimerRef.current = null
      }
    }
  }, [isRecording, isVideoPlaying, roomSettings.segmentTime, isPendingReview, room?.endedAt])

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
        clearInterval(segmentTimerRef.current)
        segmentTimerRef.current = null

        console.log('[TIMER] Calling handleSegmentComplete')
        handleSegmentComplete().catch(err => {
          console.error('[TIMER] handleSegmentComplete error:', err)
        })
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

    // 1. Pause video if playing
    if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
      try {
        ytPlayerRef.current.pauseVideo()
      } catch (err) {
        console.warn('Failed to pause video on segment complete:', err)
      }
    }

    // 2. Stop recording and flush final audio chunk/grace period
    const wasRecording = recordingActiveRef.current
    if (wasRecording) {
      await stopRecording()
    }

    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current)
      segmentTimerRef.current = null
    }

    // Mark as pending review
    setIsPendingReview(true)
    setGenerateQEnabled(false) // Disable manual button during auto-process

    // Wait a brief moment to allow in-flight transcripts to update segmentEntries state
    await new Promise(resolve => setTimeout(resolve, 100))

    // 3. Compute combinedTranscriptText from the segmentEntries state
    const textToUse = segmentEntriesRef.current.map(e => e.text).join(' ').trim()

    if (!textToUse || textToUse.length < 50) {
      console.log('[SEGMENT] Transcript too short (<50 chars), showing warning')
      window.alert('Transcription too short. Please speak more or play video to trigger questions.')

      // Resume for next segment
      setIsPendingReview(false)
      setGenerateQEnabled(true)
      setCurrentSegment(prev => prev + 1)
      
      resetSegmentState()

      if (wasRecording) {
        startRecording({ resetSegment: false })
      }
      return
    }

    // Auto-generate questions
    let generated = null
    try {
      console.log('[SEGMENT] Auto-generating questions...')
      generated = await generateQuestionsFromText(textToUse, currentSegment)
    } catch (error) {
      console.error('[SEGMENT] First generation attempt failed:', error)
      try {
        console.log('[SEGMENT] Retrying question generation...')
        generated = await generateQuestionsFromText(textToUse, currentSegment)
      } catch (retryError) {
        console.error('[SEGMENT] Retry also failed:', retryError)
        window.alert('Failed to generate questions after retry. You can use the manual "Generate Q" button.')
        setGenerateQEnabled(true)
        return
      }
    }

    if (generated && generated.length > 0) {
      setPendingQuestions(generated)
      setShowQuestionPopup(true)
      setIsPopupOpen(true)
      // Save transcript
      saveTranscript(room._id, currentSegment, textToUse, roomSettings.segmentTime * 60)
        .catch((err) => console.error('[SEGMENT] Failed to save transcript:', err))
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
      // Apply room settings if they exist
      if (roomData.settings) {
        setRoomSettings(prev => ({
          ...prev,
          ...roomData.settings
        }))
        if (roomData.settings.segmentTime) {
          setSegmentTimeLeft(roomData.settings.segmentTime * 60)
        }
      }
      // Load questions for this room from database
      loadQuestions(roomId)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoadMedia = async (url) => {
    try {
      const updated = await updateRoom(room._id, {
        sharedMedia: {
          provider: 'youtube',
          url: url
        }
      })
      setRoom(updated)
    } catch (err) {
      console.error('Failed to load shared media:', err)
      window.alert('Failed to load media: ' + err.message)
    }
  }

  const handleRemoveMedia = async () => {
    try {
      const updated = await updateRoom(room._id, {
        sharedMedia: null
      })
      setRoom(updated)
    } catch (err) {
      console.error('Failed to remove shared media:', err)
      window.alert('Failed to remove media: ' + err.message)
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
        
        // 1. Add locally to unified segment entries
        addTranscriptEntry(text, 'mic')

        // 2. Emit to backend socket to cache in segmentEntries
        if (socket && isConnected && room?.code) {
          socket.emit('mic:transcript-chunk', { roomCode: room.code, text })
        }

        finalTranscriptRef.current += text + ' '
        accumulatedTranscriptRef.current += text + ' '
        setTranscript(finalTranscriptRef.current)
        segmentTranscriptRef.current += ' ' + text
        setSegmentTranscript(segmentTranscriptRef.current)
      }

      pendingSequenceRef.current++
    }

    isProcessingQueueRef.current = false
  }, [addTranscriptEntry, socket, isConnected, room?.code])

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
        if (transcriptionIntervalRef.current) {
          clearTimeout(transcriptionIntervalRef.current)
          transcriptionIntervalRef.current = null
        }

        const audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType || selectedMimeTypeRef.current })
        console.log(`[TRANSCRIPTION] Sending sequence ${sequence}, size: ${audioBlob.size} bytes`)
        await sendForTranscription(audioBlob, sequence)
        resolve()

        if (recordingActiveRef.current) {
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
  
  const startRecording = async ({ resetSegment = false } = {}) => {
    if (recordingActiveRef.current) return

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
      if (resetSegment) {
        setSegmentEntries([])
        segmentEntriesRef.current = []
      }
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

    } catch (error) {
      console.error('Error starting recording:', error)
      setModelStatus('Microphone access denied')
    }
  }

  const stopRecording = async () => {
    recordingActiveRef.current = false

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

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording({ resetSegment: false })
    }
  }

  const resetSegmentState = useCallback(() => {
    setSegmentEntries([])
    segmentEntriesRef.current = []
    setTranscript('')
    setSegmentTranscript('')
    segmentTranscriptRef.current = ''
    finalTranscriptRef.current = ''
    accumulatedTranscriptRef.current = ''
  }, [])

  const clearTranscript = () => {
    resetSegmentState()
  }

  const handleManualGenerateQuestions = async () => {
    const textToUse = segmentEntries.map(e => e.text).join(' ').trim()
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
        <div style={{ flex: 1, marginLeft: '240px', padding: '32px' }}>
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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px', minWidth: 0, maxWidth: 'calc(100vw - 240px)', overflowX: 'hidden' }}>
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

            <div style={{ flex: 1, minWidth: 0, display: isMobile ? 'none' : 'block' }} />

            {/* Segment Timer Display */}
            {(isRecording || room?.mode === 'video' || (room?.sharedMedia && room.sharedMedia.url)) && (
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
                📝 Paste & Generate
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
                  // Also reset the segment timer if it's not currently active
                  if (!segmentTimerRef.current) {
                    setSegmentTimeLeft(newSettings.segmentTime * 60)
                  }
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

          {room.mode === 'video' ? (
            <div style={{ display: 'flex', gap: '20px', height: '420px', marginBottom: '20px', flexWrap: 'wrap', overflowX: 'hidden' }}>
              <div style={{
                flex: '1 1 100%',
                background: 'var(--bg-card)',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                overflow: 'hidden'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>📺</span>
                    <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      Interactive Video Class
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Synchronized playback across all students in the room
                  </div>
                </div>
                <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', minHeight: '300px', borderRadius: '8px', overflow: 'hidden' }}>
                  <div id="youtube-player" style={{ width: '100%', height: '100%', border: 'none' }} />
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Shared Media Card */}
              {!isEnded && (
                <div style={{
                  background: 'var(--bg-card)',
                  borderRadius: '16px',
                  padding: '20px',
                  boxShadow: 'var(--card-shadow)',
                  border: '1px solid var(--border-color)',
                  marginBottom: '20px',
                  boxSizing: 'border-box'
                }}>
                  <div 
                    onClick={() => setSharedMediaExpanded(!sharedMediaExpanded)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>📺</span>
                      <span style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                        Shared Media
                      </span>
                      {room.sharedMedia && room.sharedMedia.url && (
                        <span style={{
                          background: '#eff6ff',
                          color: '#3b82f6',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          Active
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {sharedMediaExpanded ? '▲' : '▼'}
                    </span>
                  </div>

                  {sharedMediaExpanded && (
                    <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                      {(!room.sharedMedia || !room.sharedMedia.url) ? (
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <input
                            type="text"
                            value={mediaUrlInput}
                            onChange={(e) => setMediaUrlInput(e.target.value)}
                            placeholder="Paste YouTube URL..."
                            style={{
                              flex: 1,
                              padding: '10px 14px',
                              border: '1px solid var(--border-color)',
                              borderRadius: '8px',
                              background: 'var(--bg-primary)',
                              color: 'var(--text-primary)',
                              fontSize: '14px',
                              outline: 'none'
                            }}
                          />
                          <button
                            onClick={() => {
                              if (!mediaUrlInput.trim()) return
                              handleLoadMedia(mediaUrlInput.trim())
                              setMediaUrlInput('')
                            }}
                            style={{
                              padding: '10px 20px',
                              background: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '14px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            Load
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                              Loaded: {room.sharedMedia.url}
                            </span>
                            <button
                              onClick={handleRemoveMedia}
                              style={{
                                padding: '6px 12px',
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              Remove Video
                            </button>
                          </div>

                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            color: 'var(--text-secondary)',
                            background: 'var(--bg-primary)',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            boxSizing: 'border-box'
                          }}>
                            <strong>Transcript Source:</strong>
                            {hasCaptions ? (
                              <span style={{ color: '#10b981', fontWeight: '600' }}>✓ Captions Available</span>
                            ) : (
                              <span style={{ color: '#ef4444', fontWeight: '600' }}>⚠ Captions Unavailable</span>
                            )}
                          </div>
                          
                          <div style={{ 
                            position: 'relative', 
                            width: '100%', 
                            paddingTop: '56.25%', /* 16:9 Aspect Ratio */
                            borderRadius: '8px', 
                            overflow: 'hidden',
                            background: '#000'
                          }}>
                            <div id="youtube-player" style={{ 
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%', 
                              height: '100%', 
                              border: 'none' 
                            }} />
                          </div>

                          {/* Replace Section */}
                          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                            <input
                              type="text"
                              value={mediaUrlInput}
                              onChange={(e) => setMediaUrlInput(e.target.value)}
                              placeholder="Paste new YouTube URL to replace..."
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                background: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                fontSize: '13px',
                                outline: 'none'
                              }}
                            />
                            <button
                              onClick={() => {
                                if (!mediaUrlInput.trim()) return
                                handleLoadMedia(mediaUrlInput.trim())
                                setMediaUrlInput('')
                              }}
                              style={{
                                padding: '8px 16px',
                                background: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              Replace
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '20px', height: isMobile ? 'auto' : '420px', marginBottom: '20px', flexWrap: 'wrap', overflowX: 'hidden' }}>
              {/* Microphone Card - 30% */}
              <div style={{
                flex: isMobile ? '1 1 100%' : '1 1 calc(30% - 10px)',
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

              {/* Transcription Card - 70% */}
              <div style={{
                flex: isMobile ? '1 1 100%' : '1 1 calc(70% - 10px)',
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
                    {segmentEntries.length > 0 && (
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
                      disabled={isGeneratingQuestions || segmentEntries.length === 0 || !generateQEnabled}
                      style={{
                        padding: '4px 12px',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: isGeneratingQuestions || segmentEntries.length === 0 || !generateQEnabled ? 'not-allowed' : 'pointer',
                        opacity: isGeneratingQuestions || segmentEntries.length === 0 || !generateQEnabled ? 0.6 : 1,
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
                  overflowY: 'auto'
                }}>
                  {groupedEntries.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {groupedEntries.map((group, idx) => (
                        <div key={idx} style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          background: group.source === 'video' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(16, 185, 129, 0.05)',
                          borderLeft: `3px solid ${group.source === 'video' ? '#3b82f6' : '#10b981'}`
                        }}>
                          <span style={{
                            fontSize: '10px',
                            textTransform: 'uppercase',
                            fontWeight: 'bold',
                            color: group.source === 'video' ? '#3b82f6' : '#10b981',
                            minWidth: '45px',
                            marginTop: '3px'
                          }}>
                            {group.source}
                          </span>
                          <span style={{ color: 'var(--text-primary)', flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {group.chunks.join(' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                      {room?.mode === 'video' || (room?.sharedMedia && room.sharedMedia.url)
                        ? 'Video transcript will appear here when the segment is complete.'
                        : 'Click the microphone to start real-time transcription.'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

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
            // All questions reviewed - close popup and resume for next segment
            setShowQuestionPopup(false)
            setIsPopupOpen(false)
            setPendingQuestions([])

            // Clear segment transcript for fresh start
            resetSegmentState()

            // Reset pending review flag
            setIsPendingReview(false)
            setGenerateQEnabled(true)

            // Reset segment timer
            setSegmentTimeLeft(roomSettings.segmentTime * 60)

            // Commit segment to backend to clear segmentEntries and update playhead
            if (socket) {
              const videoTime = ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function'
                ? ytPlayerRef.current.getCurrentTime()
                : 0
              socket.emit('video:commit-segment', {
                roomCode: room.code,
                currentTime: videoTime
              })
            }

            setCurrentSegment(prev => prev + 1)

            const isVideoMode = room?.mode === 'video' || (room?.sharedMedia && room.sharedMedia.url)
            if (!isVideoMode) {
              // Resume recording for next segment
              startRecording({ resetSegment: false })
            }
          }}
          onClose={() => {
            // Teacher manually closed popup - same as complete for next segment
            setShowQuestionPopup(false)
            setIsPopupOpen(false)
            setPendingQuestions([])

            resetSegmentState()

            setIsPendingReview(false)
            setGenerateQEnabled(true)
            setSegmentTimeLeft(roomSettings.segmentTime * 60)

            // Commit segment to backend to clear segmentEntries and update playhead
            if (socket) {
              const videoTime = ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function'
                ? ytPlayerRef.current.getCurrentTime()
                : 0
              socket.emit('video:commit-segment', {
                roomCode: room.code,
                currentTime: videoTime
              })
            }

            setCurrentSegment(prev => prev + 1)

            const isVideoMode = room?.mode === 'video' || (room?.sharedMedia && room.sharedMedia.url)
            if (!isVideoMode) {
              startRecording({ resetSegment: false })
            }
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
