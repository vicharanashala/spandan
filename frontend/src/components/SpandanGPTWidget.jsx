import React, { useState, useEffect, useRef } from 'react'
import useAuthStore from '../stores/authStore'
import { useSocketStore } from '../stores/socketStore'
import { useRoomStore } from '../stores/roomStore'
import { API_URL } from '../config.js'

// ── Config ─────────────────────────────────────────────────────────
const STORAGE_KEY = 'spandangpt-state'

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function persistState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════
// SpandanGPT Widget — Dual-Mode Command Center
// ═══════════════════════════════════════════════════════════════════════
export default function SpandanGPTWidget({ isCompanionMode = false }) {
  const persisted = loadPersistedState()
  
  // ── Global Stores ──
  const { token, user, isAuthenticated, login, register, logout } = useAuthStore()
  const { participants, isConnected, socket, connect } = useSocketStore()
  const { createRoom } = useRoomStore()

  // ── Local UI state ──
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [layoutCache, setLayoutCache] = useState({ panelOnRight: false, panelGoesUp: true })
  const [isDark, setIsDark] = useState(persisted?.isDark ?? true)
  const [activeTab, setActiveTab] = useState(persisted?.defaultTab ?? 'assistant')
  const [defaultTab, setDefaultTab] = useState(persisted?.defaultTab ?? 'assistant')
  
  // ── Advanced Settings ──
  const [pollDifficulty, setPollDifficulty] = useState(persisted?.pollDifficulty ?? 'Normal')
  const [pollTimer, setPollTimer] = useState(persisted?.pollTimer ?? 30)
  const [autoLaunch, setAutoLaunch] = useState(persisted?.autoLaunch ?? false)
  
  const [position, setPosition] = useState(() => {
    const saved = persisted?.position
    const winW = Math.max(window.innerWidth || 1024, 800)
    const winH = Math.max(window.innerHeight || 768, 600)
    
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number' && !isNaN(saved.x) && !isNaN(saved.y)) {
      return {
        x: Math.min(Math.max(0, saved.x), winW - 80),
        y: Math.min(Math.max(0, saved.y), winH - 80)
      }
    }
    return { x: winW - 90, y: winH - 90 }
  })
  
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef(false)
  
  // ── Classroom State ──
  const [activeRoom, setActiveRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  // ── Chat state ──
  const [assistantMessages, setAssistantMessages] = useState(persisted?.assistantMessages ?? [{ type: 'system', text: "👋 Hi! I'm your Spandan Assistant. Ask me anything about your classroom stats!" }])
  const [commandMessages, setCommandMessages] = useState(persisted?.commandMessages ?? [{ type: 'system', text: "⚡ Command Mode active. You can generate polls and manage rooms here." }])
  const [inputValue, setInputValue] = useState('')
  const chatBodyRef = useRef(null)
  const inputRef = useRef(null)

  // ── Auth Wall State ──
  const [isLoginView, setIsLoginView] = useState(true)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authName, setAuthName] = useState('')
  const [authError, setAuthError] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [authRole, setAuthRole] = useState('teacher')

  // ── Role-Based Feature State ──
  const [activeTeacherTool, setActiveTeacherTool] = useState(null) // 'room', 'poll', 'history', 'stats'
  const [teacherHistory, setTeacherHistory] = useState([])
  const [studentHistory, setStudentHistory] = useState([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)

  // ── Student Poll State ──
  const [activePoll, setActivePoll] = useState(null)
  const [pollTimerLeft, setPollTimerLeft] = useState(0)
  const [selectedOption, setSelectedOption] = useState(null)
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false)
  const [pollSubmitSuccess, setPollSubmitSuccess] = useState(false)

  // ── Initialization ──
  useEffect(() => {
    if (isAuthenticated && token) {
      checkActiveRoom()
    }
  }, [isAuthenticated, token])

  const checkActiveRoom = async () => {
    try {
      const res = await fetch(`${API_URL}/spandangpt/active-room`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) {
        setActiveRoom(data.room)
      }
    } catch (err) { /* ignore */ }
  }

  // ── Real-time Room Sync ──
  
  useEffect(() => {
    if (isAuthenticated && token) {
      connect(token)
    }
  }, [isAuthenticated, token, connect])

  useEffect(() => {
    if (!socket) return
    const handleRoomJoined = (data) => {
      // If we don't have an active room, or the room we joined is different, fetch it
      if (!activeRoom || data.roomCode !== activeRoom.code) {
        checkActiveRoom()
      } else if (activeRoom && data.roomCode === activeRoom.code && data.participants !== undefined) {
        setActiveRoom(prev => ({ ...prev, activeParticipants: data.participants }))
      }
    }

    const handleNewQuestion = (qData) => {
      const question = qData.question || qData
      if (user?.role === 'student' && question) {
        setActivePoll(question)
        setPollTimerLeft(qData.timer || question.timeToAnswer || 30)
        setSelectedOption(null)
        setPollSubmitSuccess(false)
        setIsChatOpen(true) // Auto-open widget so student sees poll
      }
    }

    const handleQuestionEnded = () => {
      setActivePoll(null)
    }

    socket.on('room:joined', handleRoomJoined)
    socket.on('new_question', handleNewQuestion)
    socket.on('question:started', handleNewQuestion)
    socket.on('question:ended', handleQuestionEnded)

    return () => {
      socket.off('room:joined', handleRoomJoined)
      socket.off('new_question', handleNewQuestion)
      socket.off('question:started', handleNewQuestion)
      socket.off('question:ended', handleQuestionEnded)
    }
  }, [socket, activeRoom?.code, user?.role])

  // ── Student Poll Timer ──
  useEffect(() => {
    if (!activePoll || pollSubmitSuccess) return
    if (pollTimerLeft <= 0) {
      if (!pollSubmitSuccess && !isSubmittingAnswer) {
        setActivePoll(null)
      }
      return
    }
    const t = setInterval(() => {
      setPollTimerLeft(prev => prev - 1)
    }, 1000)
    return () => clearInterval(t)
  }, [activePoll, pollTimerLeft, pollSubmitSuccess, isSubmittingAnswer])

  // ── Persist state ──
  useEffect(() => {
    persistState({
      position,
      isDark,
      defaultTab,
      pollDifficulty,
      pollTimer,
      autoLaunch,
      assistantMessages: assistantMessages.slice(-30),
      commandMessages: commandMessages.slice(-30),
    })
  }, [position, isDark, defaultTab, pollDifficulty, pollTimer, autoLaunch, assistantMessages, commandMessages])

  // ── Auto-scroll chat ──
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight
    }
  }, [assistantMessages, commandMessages, activeTab, isChatOpen, isAuthenticated])

  // ── Make body completely transparent for companion mode ──
  useEffect(() => {
    if (isCompanionMode) {
      document.body.style.background = 'transparent'
      document.body.style.backgroundColor = 'transparent'
      document.documentElement.style.background = 'transparent'
      document.documentElement.style.backgroundColor = 'transparent'
    }
  }, [isCompanionMode])

  // ── Dragging logic ──
  const hasMovedRef = useRef(false)

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return
      
      if (isCompanionMode && window.electronAPI?.dragMove && typeof dragRef.current === 'object') {
        const dx = Math.abs(e.screenX - dragRef.current.screenX)
        const dy = Math.abs(e.screenY - dragRef.current.screenY)
        if (dx > 3 || dy > 3) hasMovedRef.current = true

        if (hasMovedRef.current) {
          window.electronAPI.dragMove(e.screenX, e.screenY)
        }
      } else {
        // Browser mode
        hasMovedRef.current = true
        dragRef.current = true 
        const newX = e.clientX - dragOffset.x
        const newY = e.clientY - dragOffset.y
        setPosition({
          x: Math.min(Math.max(0, newX), window.innerWidth - 70),
          y: Math.min(Math.max(0, newY), window.innerHeight - 70)
        })
      }
    }
    const handleMouseUp = () => {
      setIsDragging(false)
      setTimeout(() => { dragRef.current = false }, 50)
    }
    const handleBlur = () => {
      setIsDragging(false)
      dragRef.current = false
    }
    
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('blur', handleBlur)
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [isDragging, dragOffset])

  const handleMouseDown = (e) => {
    e.preventDefault()
    hasMovedRef.current = false
    if (isCompanionMode) {
      dragRef.current = { screenX: e.screenX, screenY: e.screenY }
      if (window.electronAPI?.dragStart) {
        window.electronAPI.dragStart(e.screenX, e.screenY)
      }
    } else {
      dragRef.current = false
      setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
    setIsDragging(true)
  }

  // ── Companion Mode: Click-through management ──
  const enableMouseEvents = () => { 
    if (window.electronAPI) window.electronAPI.setIgnoreMouseEvents(false) 
  }
  const disableMouseEvents = () => { 
    if (window.electronAPI) window.electronAPI.setIgnoreMouseEvents(true, { forward: true }) 
  }

  // ── Companion Mode: Global hotkey rescue ──
  useEffect(() => {
    if (!isCompanionMode || !window.electronAPI?.onGlobalHotkey) return
    window.electronAPI.onGlobalHotkey(() => {
      console.log('[SpandanGPT] Rescue hotkey (Alt+S) triggered')
      setIsChatOpen(true)
    })
  }, [isCompanionMode])

  const toggleChat = () => {
    if (hasMovedRef.current) return // Ignore click if we were dragging
    const newState = !isChatOpen
    setIsChatOpen(newState)
    
    if (newState && isCompanionMode) {
       const currentX = window.screenX
       const currentY = window.screenY
       const targetScreenX = currentX + 38
       const targetScreenY = currentY + 38
       const screenW = window.screen.availWidth || window.screen.width
       const screenH = window.screen.availHeight || window.screen.height
       
       const PANEL_W_COMPACT = 360
       const PANEL_H_COMPACT = 520
       const GAP_COMPACT = 12
       const MARGIN_COMPACT = 16
       const ORB_VIS = 64
       
       const panelOnRight = (targetScreenX + ORB_VIS + GAP_COMPACT + PANEL_W_COMPACT + MARGIN_COMPACT <= screenW)
       const panelGoesUp = (targetScreenY + ORB_VIS - PANEL_H_COMPACT - MARGIN_COMPACT >= 0)
       
       const layout = { panelOnRight, panelGoesUp }
       setLayoutCache(layout)
       
       if (window.electronAPI?.resizeWindow) {
         window.electronAPI.resizeWindow(newState, layout)
       }
    } else {
      // Tell Electron to resize the window
      if (window.electronAPI?.resizeWindow) {
        window.electronAPI.resizeWindow(newState, null)
      }
    }
    
    if (newState && isAuthenticated) setTimeout(() => inputRef.current?.focus(), 100)
  }

  // ── Auth Handler ──
  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    setIsAuthLoading(true)
    try {
      if (isLoginView) {
        await login(authEmail, authPassword)
      } else {
        await register(authName, authEmail, authPassword, authRole)
      }
      setAuthPassword('') // clear for security
      // After login, reset the chat view to default tab
      setActiveTab(defaultTab)
      setTimeout(() => inputRef.current?.focus(), 100)
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setIsAuthLoading(false)
    }
  }
  
  // ── API Actions ──
  const handleStudentSubmitAnswer = async () => {
    if (selectedOption === null || !activePoll || !activeRoom) return
    setIsSubmittingAnswer(true)
    const responseTime = Math.max(0, Math.round((activePoll.timeToAnswer || 30) - pollTimerLeft))
    
    try {
      const res = await fetch(`${API_URL}/responses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: activeRoom._id,
          questionId: activePoll._id,
          selectedOptions: [selectedOption],
          responseTime
        })
      })
      
      const data = await res.json()
      // Even if 409 (already responded), we treat it as success locally so UI moves on
      if (res.ok || res.status === 409) {
        setPollSubmitSuccess(true)
        setTimeout(() => setActivePoll(null), 3000)
      } else {
        setAssistantMessages(prev => [...prev, { type: 'bot', text: `❌ Failed to submit: ${data.error || 'Unknown error'}` }])
      }
    } catch (e) {
      setAssistantMessages(prev => [...prev, { type: 'bot', text: '❌ Network error submitting answer.' }])
    } finally {
      setIsSubmittingAnswer(false)
    }
  }

  const handleStartRoom = async (customName) => {
    try {
      const roomName = typeof customName === 'string' ? customName : 'Live Class via SpandanGPT'
      setCommandMessages(prev => [...prev, { type: 'system', text: `🚀 Starting room: ${roomName}...` }])
      const res = await fetch(`${API_URL}/rooms`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName, settings: {} })
      })
      const data = await res.json()
      if (data.room) {
        setActiveRoom(data.room)
        setCommandMessages(prev => [...prev, { type: 'system', text: `✅ Room created! Code: ${data.room.code}` }])
      }
    } catch (e) {
      setCommandMessages(prev => [...prev, { type: 'system', text: `❌ Failed to create room: ${e.message}` }])
    }
  }

  const handleEndRoom = async () => {
    if (!activeRoom) return
    try {
      const res = await fetch(`${API_URL}/rooms/${activeRoom._id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false })
      })
      if (!res.ok) throw new Error('Network response was not ok')
      setActiveRoom(null)
      setCommandMessages(prev => [...prev, { type: 'system', text: `🛑 Room ${activeRoom.code} has been successfully ended.` }])
    } catch (e) {
      setCommandMessages(prev => [...prev, { type: 'system', text: `❌ Failed to end room: ${e.message}` }])
    }
  }

  const launchPoll = async (questionData, customTimer = null) => {
    if (!activeRoom) return
    const timerToUse = customTimer || pollTimer
    try {
      const res = await fetch(`${API_URL}/spandangpt/launch-poll`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: activeRoom._id, timeToAnswer: timerToUse, ...questionData })
      })
      const data = await res.json()
      
      if (data.success) {
        setCommandMessages(prev => [...prev, { type: 'success', text: `✅ Poll launched successfully to the class (${timerToUse}s timer)!` }])
        
        // Emit to socket for students to receive
        if (socket && isConnected && activeRoom) {
          socket.emit('new_question', {
            roomCode: activeRoom.code,
            question: data.question
          })
          console.log('[SpandanGPT] Emitted new_question via socket:', data.question)
        }
        
      }
    } catch (e) {
      setCommandMessages(prev => [...prev, { type: 'system', text: `❌ Failed to launch poll: ${e.message}` }])
    }
  }

  const fetchGlobalStats = async () => {
    try {
      const res = await fetch(`${API_URL}/spandangpt/global-stats`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) {
        setAssistantMessages(prev => [...prev, { type: 'bot', text: `📊 ${data.stats.message}` }])
      } else {
        setAssistantMessages(prev => [...prev, { type: 'bot', text: "❌ Couldn't fetch stats right now." }])
      }
    } catch (e) {
      setAssistantMessages(prev => [...prev, { type: 'bot', text: "❌ Error connecting to Spandan." }])
    }
  }

  const fetchTeacherHistory = async () => {
    setIsHistoryLoading(true)
    try {
      const res = await fetch(`${API_URL}/spandangpt/teacher/history`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) setTeacherHistory(data.history)
    } catch (e) {}
    setIsHistoryLoading(false)
  }

  const fetchStudentHistory = async () => {
    setIsHistoryLoading(true)
    try {
      const res = await fetch(`${API_URL}/spandangpt/student/history`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) setStudentHistory(data.history)
    } catch (e) {}
    setIsHistoryLoading(false)
  }

  const getStudentInsight = async (h) => {
    setAssistantMessages(prev => [...prev, { type: 'bot', text: `🤖 Analyzing why you got this wrong: "${h.question}"...` }])
    setActiveTab('assistant')
    try {
      const res = await fetch(`${API_URL}/spandangpt/student/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: `Question: "${h.question}"\nMy incorrect answer: "${h.selectedOption}"\nCorrect answer: "${h.correctOption}"\nExplain briefly (max 3 lines) why my answer was wrong and what the correct concept is.` 
        })
      })
      const data = await res.json()
      if (data.success) {
        setAssistantMessages(prev => [...prev, { type: 'bot', text: `💡 Insight: ${data.reply}` }])
      } else {
        setAssistantMessages(prev => [...prev, { type: 'bot', text: `❌ ${data.reply || 'Could not generate insight.'}` }])
      }
    } catch (e) {
      setAssistantMessages(prev => [...prev, { type: 'bot', text: '❌ Failed to connect.' }])
    }
  }

  // ── Chat Input Handler ──
  const handleSend = async () => {
    const text = inputValue.trim()
    if (!text) return
    setInputValue('')
    
    if (!isAuthenticated) return

    const lower = text.toLowerCase()

    if (activeTab === 'assistant') {
      setAssistantMessages(prev => [...prev, { type: 'user', text }])
      setIsLoading(true)
      
      if (user?.role === 'student') {
        try {
          const res = await fetch(`${API_URL}/spandangpt/student/chat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text })
          })
          const data = await res.json()
          if (data.success) {
            setAssistantMessages(prev => [...prev, { type: 'bot', text: data.reply }])
          }
        } catch (e) {
          setAssistantMessages(prev => [...prev, { type: 'bot', text: '❌ Failed to connect to assistant.' }])
        }
      } else {
        // Teacher Assistant (AI-powered insights)
        try {
          const res = await fetch(`${API_URL}/spandangpt/teacher/chat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text })
          })
          const data = await res.json()
          if (data.success) {
            setAssistantMessages(prev => [...prev, { type: 'bot', text: data.reply }])
          } else {
            setAssistantMessages(prev => [...prev, { type: 'bot', text: '❌ I am unable to generate insights right now.' }])
          }
        } catch (e) {
          setAssistantMessages(prev => [...prev, { type: 'bot', text: '❌ Failed to connect to assistant.' }])
        }
      }
      setIsLoading(false)
      
    } else if (activeTab === 'command') {
      setCommandMessages(prev => [...prev, { type: 'user', text }])
      
      // ── Advanced NLP Command Parser ──
      const lower = text.toLowerCase()

      // 1. SET TIMER (Extract from ANY command)
      const timerMatch = lower.match(/(\d+)\s*(sec|seconds|s)\b/i)
      let customTimer = pollTimer
      if (timerMatch) {
        customTimer = parseInt(timerMatch[1])
        setPollTimer(customTimer)
        // If the command is ONLY about setting the timer (no other intent words), stop here
        const remainingText = lower.replace(/\d+\s*(sec|seconds|s|to|this|the|poll|timer|set|give|change|update|make|for|with|and)/ig, '').trim()
        if (remainingText.length < 3) {
          setCommandMessages(prev => [...prev, { type: 'system', text: `⏱️ Poll timer set to ${customTimer}s.` }])
          return
        }
      }

      // 2. END ROOM
      if (/(end|stop|close|cancel|terminate|finish|wrap\s*up).*(room|session|class|it|now)/i.test(lower)) {
        if (!activeRoom) {
          setCommandMessages(prev => [...prev, { type: 'system', text: '⚠️ There is no active room to end.' }])
        } else {
          handleEndRoom()
        }
        return
      }

      // 3. LAUNCH/SEND EXISTING POLL
      // Triggers if they say "launch poll" but DOES NOT trigger if they say "create poll"
      if (/(send|start|launch|deploy|dispatch).*(poll|question|quiz)/i.test(lower) && !/(create|generate|make)/i.test(lower)) {
        if (!activeRoom) {
          setCommandMessages(prev => [...prev, { type: 'system', text: '⚠️ Start a room first before launching a poll.' }])
          return
        }
        const lastPollMsg = [...commandMessages].reverse().find(m => m.type === 'poll_preview')
        if (lastPollMsg && lastPollMsg.question) {
          launchPoll(lastPollMsg.question, customTimer)
        } else {
          setCommandMessages(prev => [...prev, { type: 'system', text: '⚠️ No generated poll found to launch. Please generate one first.' }])
        }
        return
      }

      // 4. CREATE ROOM
      if (/(create|start|begin|open|new|initiate|launch).*(room|session|class)/i.test(lower)) {
        let roomName = 'Live Class via SpandanGPT'
        const nameMatch = text.match(/(?:named?|called|title|as|name)\s+([\w\s]+)/i)
        if (nameMatch && nameMatch[1]) {
          roomName = nameMatch[1].trim()
        } else {
          const parts = text.split(/(?:room|session|class)/i)
          if (parts.length > 1 && parts[1].trim().length > 0) {
             roomName = parts[1].trim().replace(/^name(d?)\s+/i, '')
          }
        }
        setActiveTeacherTool(null) // Ensure full screen tools are closed
        handleStartRoom(roomName)
        return
      }

      // 5. SHOW HISTORY
      if (/(show|view|open|get|see).*(history|past)/i.test(lower) || lower.trim() === 'history') {
        fetchTeacherHistory()
        setActiveTeacherTool('history')
        setCommandMessages(prev => [...prev, { type: 'system', text: '📖 Opening your session history...' }])
        return
      }

      // 6. CLOSE HISTORY
      if (/(close|hide|remove).*(history|past)/i.test(lower) || (activeTeacherTool === 'history' && /(close|back|exit)/i.test(lower))) {
        setActiveTeacherTool(null)
        setCommandMessages(prev => [...prev, { type: 'system', text: '🔙 Closed history view.' }])
        return
      }

      // 7. GENERATE POLL (Fallback)
      setActiveTeacherTool(null) // Close any tools so they can see the poll
      setIsLoading(true)
      setCommandMessages(prev => [...prev, { type: 'bot', text: '🤖 Generating a question for you...' }])
      try {
        const res = await fetch(`${API_URL}/spandangpt/generate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, difficulty: pollDifficulty })
        })
        const data = await res.json()
        if (data.success) {
          // Inject custom timer if parsed from natural language
          if (timerMatch) {
             data.question.timeToAnswer = customTimer
          }
          if (autoLaunch && activeRoom) {
            setCommandMessages(prev => [...prev, { type: 'system', text: '⚡ Auto-launch is ON. Deploying immediately...' }])
            launchPoll(data.question, customTimer)
          } else {
            setCommandMessages(prev => [...prev, { type: 'poll_preview', question: data.question }])
          }
        } else {
          throw new Error(data.error || 'Failed to generate')
        }
      } catch (err) {
        setCommandMessages(prev => [...prev, { type: 'system', text: `❌ ${err.message}` }])
      } finally {
        setIsLoading(false)
      }
    }
  }

  const clearHistory = () => {
    setAssistantMessages([{ type: 'system', text: "🧹 History cleared." }])
    setCommandMessages([{ type: 'system', text: "🧹 History cleared." }])
    setActiveTab(defaultTab)
  }

  // ── Theme ──
  const colors = {
    bg: isDark ? 'rgba(15, 23, 42, 0.97)' : 'rgba(255, 255, 255, 0.97)',
    text: isDark ? '#f8fafc' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    border: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    inputBg: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
    headerBg: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    systemBg: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)',
    systemText: isDark ? '#bfdbfe' : '#1e40af',
    botBg: isDark ? '#334155' : '#f1f5f9',
    botText: isDark ? '#f8fafc' : '#1e293b',
    actionBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    cardBg: isDark ? 'rgba(30, 41, 59, 0.8)' : '#ffffff',
    activeTabBg: isDark ? '#4f46e5' : '#e0e7ff',
    activeTabColor: isDark ? '#ffffff' : '#4338ca',
    settingSectionBg: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.8)',
    buttonBg: isDark ? 'linear-gradient(135deg, #6366f1, #3b82f6)' : 'linear-gradient(135deg, #4f46e5, #2563eb)',
  }

  const EXPANDED_MARGIN = 16
  const GAP = 12
  const PANEL_W = 320
  const PANEL_H = 460

  // In companion mode, position within the small Electron window
  // In browser mode, position as floating fixed element
  let orbX, orbY, calculatedPanelX, calculatedPanelY
  
  if (isCompanionMode) {
    if (isChatOpen) {
      if (layoutCache.panelOnRight) {
        orbX = EXPANDED_MARGIN
        calculatedPanelX = orbX + 64 + GAP
      } else {
        calculatedPanelX = EXPANDED_MARGIN
        orbX = calculatedPanelX + PANEL_W + GAP
      }

      if (layoutCache.panelGoesUp) {
        orbY = EXPANDED_MARGIN + PANEL_H - 64
        calculatedPanelY = EXPANDED_MARGIN
      } else {
        calculatedPanelY = EXPANDED_MARGIN
        orbY = EXPANDED_MARGIN
      }
    } else {
      // Chat is closed, window is ORB_SIZE x ORB_SIZE (140x140)
      // Center the 64x64 orb in the 140x140 window: (140 - 64) / 2 = 38
      // This guarantees 38 pixels of padding on all sides for the shadow to fade smoothly!
      orbX = 38
      orbY = 38
    }
  } else {
    orbX = position.x
    orbY = position.y
    calculatedPanelX = position.x - PANEL_W - GAP
    if (calculatedPanelX < 0) calculatedPanelX = position.x + 64 + GAP
    calculatedPanelY = position.y - (PANEL_H - 64)
    calculatedPanelY = Math.max(GAP, Math.min(calculatedPanelY, window.innerHeight - PANEL_H - GAP))
  }

  const activeMessages = activeTab === 'assistant' ? assistantMessages : commandMessages

  return (
    <>
      {/* ── ORB ── */}
      {/* Orb is now ALWAYS rendered so user can click it to close the chat */}
      <div
          onMouseEnter={isCompanionMode ? enableMouseEvents : undefined}
          onMouseLeave={isCompanionMode ? disableMouseEvents : undefined}
          onMouseDown={handleMouseDown} onClick={toggleChat}
          style={{
            position: 'fixed', left: `${orbX}px`, top: `${orbY}px`,
            width: '64px', height: '64px', borderRadius: '50%',
            background: 'radial-gradient(circle at 30% 30%, #6366f1, #3b82f6, #1e40af, #0f172a)',
            border: '2px solid rgba(99, 102, 241, 0.6)',
            boxShadow: '0 0 30px rgba(99, 102, 241, 0.4), 0 8px 32px rgba(0,0,0,0.5), inset 0 0 20px rgba(99,102,241,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: isDragging ? 'grabbing' : 'pointer', color: '#fff',
            zIndex: 99999, userSelect: 'none', transition: isDragging ? 'none' : 'box-shadow 0.3s ease',
          }}
        >
          <span style={{ fontStyle: 'italic', fontWeight: '700', fontSize: '13px', letterSpacing: '0.5px', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
            Spandan
          </span>
        </div>

      {isChatOpen && (
        <div
          onMouseEnter={isCompanionMode ? enableMouseEvents : undefined}
          onMouseLeave={isCompanionMode ? disableMouseEvents : undefined}
          style={{
            position: 'fixed', left: `${calculatedPanelX}px`, top: `${calculatedPanelY}px`,
            width: `${PANEL_W}px`, height: `${PANEL_H}px`, 
            borderRadius: '16px',
            background: colors.bg, border: `1px solid ${colors.border}`,
            display: 'flex', flexDirection: 'column',
            boxShadow: isDark ? '0 15px 40px -8px rgba(0,0,0,0.7), 0 0 30px rgba(99,102,241,0.15)' : '0 15px 40px -8px rgba(0,0,0,0.2)',
            overflow: 'hidden', zIndex: 99998, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
          }}
        >
          <div onMouseDown={handleMouseDown} style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${colors.border}`, cursor: isDragging ? 'grabbing' : 'grab', background: colors.headerBg, userSelect: 'none', borderRadius: '16px 16px 0 0' }}>
            
            {!isAuthenticated ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'white', fontStyle: 'italic', fontWeight: '700', fontSize: '8px' }}>S</span>
                </div>
                <span style={{ fontWeight: 700, fontSize: '13px', background: 'linear-gradient(135deg, #818cf8, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  SpandanGPT
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', background: colors.inputBg, borderRadius: '8px', padding: '2px', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }}>
                  <button onClick={() => setActiveTab('assistant')} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', background: activeTab === 'assistant' ? colors.activeTabBg : 'transparent', color: activeTab === 'assistant' ? colors.activeTabColor : colors.textMuted, cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', transition: '0.2s', boxShadow: activeTab === 'assistant' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none' }}>
                    🤖 Copilot
                  </button>
                  <button onClick={() => { setActiveTab('command'); if (user?.role === 'teacher') fetchTeacherHistory(); else fetchStudentHistory(); }} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', background: activeTab === 'command' ? colors.activeTabBg : 'transparent', color: activeTab === 'command' ? colors.activeTabColor : colors.textMuted, cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', transition: '0.2s', boxShadow: activeTab === 'command' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none' }}>
                    {user?.role === 'student' ? '📜 History' : '🚀 Director'}
                  </button>
                </div>
                <span style={{ fontSize: '9px', fontWeight: '800', padding: '3px 6px', borderRadius: '6px', background: user?.role === 'student' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)', color: user?.role === 'student' ? '#60a5fa' : '#c084fc', border: `1px solid ${user?.role === 'student' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(168, 85, 247, 0.3)'}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {user?.role === 'student' ? 'Student' : 'Teacher'}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {isAuthenticated && (
                  <button onClick={() => setActiveTab(activeTab === 'settings' ? defaultTab : 'settings')} style={{ background: 'transparent', border: 'none', color: activeTab === 'settings' ? '#818cf8' : colors.textMuted, cursor: 'pointer', fontSize: '13px', padding: '0', transition: 'color 0.2s' }}>⚙️</button>
                )}
                <button onClick={() => setIsDark(!isDark)} style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: '13px', padding: '0' }}>{isDark ? '☀️' : '🌙'}</button>
                <button onClick={toggleChat} style={{ background: 'transparent', border: 'none', color: colors.textMuted, cursor: 'pointer', fontSize: '13px', padding: '0', marginLeft: '4px' }}>✕</button>
              </div>
            </div>
          </div>

          {!isAuthenticated ? (
            /* ── AUTH WALL ── */
            <div style={{ flex: 1, padding: '32px 24px', display: 'flex', flexDirection: 'column', color: colors.text, overflowY: 'auto' }}>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '800', background: 'linear-gradient(135deg, #818cf8, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {isLoginView ? 'Welcome Back' : `Create ${authRole === 'teacher' ? 'Teacher' : 'Student'} Account`}
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: colors.textMuted }}>
                  {isLoginView ? 'Log in to command your classroom.' : authRole === 'teacher' ? 'Sign up to launch live polls instantly.' : 'Sign up to participate in live classes.'}
                </p>
              </div>

              <div style={{ display: 'flex', background: colors.inputBg, borderRadius: '8px', padding: '4px', marginBottom: '24px', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }}>
                <button onClick={() => { setIsLoginView(true); setAuthError('') }} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: isLoginView ? colors.activeTabBg : 'transparent', color: isLoginView ? colors.activeTabColor : colors.textMuted, cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: '0.2s' }}>
                  Log In
                </button>
                <button onClick={() => { setIsLoginView(false); setAuthError('') }} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: !isLoginView ? colors.activeTabBg : 'transparent', color: !isLoginView ? colors.activeTabColor : colors.textMuted, cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: '0.2s' }}>
                  Sign Up
                </button>
              </div>

              {authError && (
                <div style={{ padding: '10px', marginBottom: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '12px', textAlign: 'center', fontWeight: '500' }}>
                  {authError}
                </div>
              )}

              <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {!isLoginView && (
                  <>
                    <div style={{ display: 'flex', background: colors.inputBg, borderRadius: '8px', padding: '4px', marginBottom: '2px', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }}>
                      <button type="button" onClick={() => setAuthRole('teacher')} style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', background: authRole === 'teacher' ? colors.activeTabBg : 'transparent', color: authRole === 'teacher' ? colors.activeTabColor : colors.textMuted, cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: '0.2s' }}>👨‍🏫 Teacher</button>
                      <button type="button" onClick={() => setAuthRole('student')} style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', background: authRole === 'student' ? colors.activeTabBg : 'transparent', color: authRole === 'student' ? colors.activeTabColor : colors.textMuted, cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: '0.2s' }}>👨‍🎓 Student</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 'bold', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Full Name</label>
                      <input type="text" value={authName} onChange={e => setAuthName(e.target.value)} required style={{ padding: '12px 14px', borderRadius: '8px', background: colors.inputBg, border: `1px solid ${colors.border}`, color: colors.text, outline: 'none', fontSize: '14px' }} placeholder={authRole === 'teacher' ? "Dr. John Doe" : "Jane Smith"} />
                    </div>
                  </>
                )}
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Address</label>
                  <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required style={{ padding: '12px 14px', borderRadius: '8px', background: colors.inputBg, border: `1px solid ${colors.border}`, color: colors.text, outline: 'none', fontSize: '14px' }} placeholder="teacher@university.edu" />
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password</label>
                  <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required style={{ padding: '12px 14px', borderRadius: '8px', background: colors.inputBg, border: `1px solid ${colors.border}`, color: colors.text, outline: 'none', fontSize: '14px' }} placeholder="••••••••" />
                </div>

                <button type="submit" disabled={isAuthLoading} style={{ marginTop: '8px', padding: '14px', borderRadius: '8px', background: colors.buttonBg, color: 'white', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: isAuthLoading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', transition: 'transform 0.1s, box-shadow 0.1s' }} onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'} onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}>
                  {isAuthLoading ? 'Authenticating...' : isLoginView ? 'Access Command Center' : `Create ${authRole === 'teacher' ? 'Teacher' : 'Student'} Account`}
                </button>
              </form>
            </div>
          ) : activeTab === 'settings' ? (
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px', color: colors.text }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', background: 'linear-gradient(135deg, #818cf8, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Preferences</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: colors.settingSectionBg, padding: '16px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
                <h4 style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', color: colors.textMuted, letterSpacing: '0.5px', fontWeight: 'bold' }}>Teaching Controls</h4>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>AI Poll Difficulty</label>
                  <select value={pollDifficulty} onChange={e => setPollDifficulty(e.target.value)} style={{ padding: '6px 12px', borderRadius: '6px', background: colors.inputBg, color: colors.text, border: `1px solid ${colors.border}`, outline: 'none', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                    <option value="Easy">🟢 Easy</option>
                    <option value="Normal">🟡 Normal</option>
                    <option value="Hard">🔴 Hard</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Default Timer (Sec)</label>
                  <div style={{ display: 'flex', background: colors.inputBg, borderRadius: '6px', padding: '2px' }}>
                    {[15, 30, 60].map(time => (
                      <button key={time} onClick={() => setPollTimer(time)} style={{ padding: '4px 10px', borderRadius: '4px', border: 'none', background: pollTimer === time ? colors.activeTabBg : 'transparent', color: pollTimer === time ? colors.activeTabColor : colors.textMuted, cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                        {time}s
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600 }}>One-Click Auto-Launch</label>
                    <span style={{ fontSize: '10px', color: colors.textMuted }}>Instantly send generated polls to class</span>
                  </div>
                  <button onClick={() => setAutoLaunch(!autoLaunch)} style={{ width: '40px', height: '22px', borderRadius: '11px', background: autoLaunch ? '#34d399' : colors.inputBg, border: `1px solid ${autoLaunch ? '#34d399' : colors.border}`, position: 'relative', cursor: 'pointer', transition: '0.2s' }}>
                    <div style={{ position: 'absolute', top: '2px', left: autoLaunch ? '20px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: '0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: colors.settingSectionBg, padding: '16px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
                <h4 style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', color: colors.textMuted, letterSpacing: '0.5px', fontWeight: 'bold' }}>General</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Default Startup Tab</label>
                  <div style={{ display: 'flex', background: colors.inputBg, borderRadius: '8px', padding: '4px' }}>
                    <button onClick={() => setDefaultTab('assistant')} style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', background: defaultTab === 'assistant' ? colors.activeTabBg : 'transparent', color: defaultTab === 'assistant' ? colors.activeTabColor : colors.textMuted, cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>🤖 Copilot</button>
                    <button onClick={() => setDefaultTab('command')} style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', background: defaultTab === 'command' ? colors.activeTabBg : 'transparent', color: defaultTab === 'command' ? colors.activeTabColor : colors.textMuted, cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>🚀 Director</button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', borderTop: `1px solid ${colors.border}`, paddingTop: '16px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Clear Chat History</label>
                  <button onClick={clearHistory} style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: '0.2s' }}>
                    Clear Now
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600 }}>Account Access</label>
                    <span style={{ fontSize: '10px', color: colors.textMuted }}>Signed in as {user?.email}</span>
                  </div>
                  <button onClick={() => { logout(); setActiveRoom(null) }} style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid rgba(239, 68, 68, 0.3)`, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: '0.2s' }}>
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ── DYNAMIC CONTENT AREA ── */}
              <div ref={chatBodyRef} style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
                
                {/* ── ACTIVE POLL (STUDENT) ── */}
                {user?.role === 'student' && activePoll && (
                  <div style={{ position: 'sticky', top: 0, zIndex: 10, background: colors.cardBg, borderRadius: '12px', padding: '16px', border: `2px solid ${colors.activeTabBg}`, boxShadow: '0 8px 30px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '16px' }}>📝</span>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: colors.activeTabBg, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Live Poll</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: pollTimerLeft <= 5 ? 'rgba(239,68,68,0.1)' : colors.inputBg, padding: '4px 10px', borderRadius: '12px', color: pollTimerLeft <= 5 ? '#ef4444' : colors.text, fontWeight: 'bold', fontSize: '13px' }}>
                        ⏱️ {pollTimerLeft}s
                      </div>
                    </div>
                    
                    {pollSubmitSuccess ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#10b981', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '24px' }}>✅</span>
                        Answer submitted successfully!
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '14px', color: colors.text, fontWeight: '600', lineHeight: 1.5 }}>
                          {activePoll.text}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {activePoll.options?.map((opt, i) => (
                            <button
                              key={i}
                              onClick={() => setSelectedOption(i)}
                              disabled={isSubmittingAnswer}
                              style={{
                                padding: '12px', borderRadius: '8px', border: `1px solid ${selectedOption === i ? colors.activeTabBg : colors.border}`,
                                background: selectedOption === i ? colors.systemBg : colors.inputBg,
                                color: colors.text, textAlign: 'left', cursor: isSubmittingAnswer ? 'not-allowed' : 'pointer',
                                fontSize: '13px', display: 'flex', gap: '10px', alignItems: 'flex-start',
                                transition: '0.2s', opacity: isSubmittingAnswer && selectedOption !== i ? 0.5 : 1
                              }}
                            >
                              <div style={{ width: '20px', height: '20px', borderRadius: '4px', background: selectedOption === i ? colors.activeTabBg : colors.actionBg, color: selectedOption === i ? '#fff' : colors.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', flexShrink: 0 }}>
                                {String.fromCharCode(65 + i)}
                              </div>
                              <span style={{ paddingTop: '2px', lineHeight: 1.4 }}>{opt.text}</span>
                            </button>
                          ))}
                        </div>
                        
                        <button
                          onClick={handleStudentSubmitAnswer}
                          disabled={selectedOption === null || isSubmittingAnswer}
                          style={{ marginTop: '4px', padding: '12px', borderRadius: '8px', background: colors.buttonBg, color: 'white', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: selectedOption === null || isSubmittingAnswer ? 'not-allowed' : 'pointer', opacity: selectedOption === null ? 0.5 : 1, transition: '0.2s' }}
                        >
                          {isSubmittingAnswer ? 'Submitting...' : 'Submit Answer'}
                        </button>
                      </>
                    )}
                    
                    <div style={{ height: '4px', background: colors.inputBg, borderRadius: '2px', overflow: 'hidden', marginTop: '4px' }}>
                      <div style={{ height: '100%', background: colors.activeTabBg, width: `${(pollTimerLeft / (activePoll.timeToAnswer || 30)) * 100}%`, transition: 'width 1s linear' }} />
                    </div>
                  </div>
                )}

                {user?.role === 'teacher' && activeTab === 'command' && activeTeacherTool === 'history' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', color: colors.text }}>Session History</h4>
                    {isHistoryLoading ? <div style={{ color: colors.textMuted, fontSize: '12px' }}>Loading...</div> : 
                      teacherHistory.length === 0 ? <div style={{ color: colors.textMuted, fontSize: '12px' }}>No past rooms.</div> :
                      teacherHistory.map(h => (
                        <div key={h._id} style={{ background: colors.inputBg, padding: '12px', borderRadius: '8px', border: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 'bold', color: colors.text }}>Room {h.code}</div>
                            <div style={{ fontSize: '11px', color: colors.textMuted }}>{new Date(h.date).toLocaleDateString()}</div>
                          </div>
                          <div style={{ fontSize: '12px', color: '#818cf8', fontWeight: 'bold' }}>{h.pollCount} Polls</div>
                        </div>
                      ))
                    }
                  </div>
                )}

                {user?.role === 'student' && activeTab === 'command' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', color: colors.text }}>Your Learning Journey</h4>
                    {isHistoryLoading ? <div style={{ color: colors.textMuted, fontSize: '12px' }}>Loading...</div> : 
                      studentHistory.length === 0 ? <div style={{ color: colors.textMuted, fontSize: '12px' }}>You haven't answered any polls yet.</div> :
                      studentHistory.map(h => (
                        <div key={h._id} style={{ background: colors.inputBg, padding: '12px', borderRadius: '8px', border: `1px solid ${h.isCorrect ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ fontSize: '13px', color: colors.text, fontWeight: '500' }}>{h.question}</div>
                          <div style={{ fontSize: '11px', color: colors.textMuted }}>You answered: <span style={{ color: h.isCorrect ? '#34d399' : '#ef4444', fontWeight: 'bold' }}>{h.selectedOption}</span></div>
                          {!h.isCorrect && (
                            <button onClick={() => getStudentInsight(h)} style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: '11px', background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>💡 Get Insight</button>
                          )}
                        </div>
                      ))
                    }
                  </div>
                )}

                {/* Show Chat Messages when not in a full-screen tool */}
                {(!(activeTab === 'command' && activeTeacherTool === 'history') && !(user?.role === 'student' && activeTab === 'command')) && activeMessages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                    {m.type === 'poll_preview' ? (
                      <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '16px', alignSelf: 'flex-start', maxWidth: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontSize: '11px', color: '#818cf8', fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
                          <span>✨ AI Generated Poll</span>
                          <span style={{ color: colors.textMuted }}>{pollDifficulty} Mode</span>
                        </div>
                        <div style={{ fontSize: '14px', color: colors.text, marginBottom: '16px', fontWeight: 500, lineHeight: 1.4 }}>{m.question.question}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                          {m.question.options.map((opt, idx) => (
                            <div key={idx} style={{ padding: '10px 12px', borderRadius: '8px', background: colors.inputBg, border: `1px solid ${opt.isCorrect ? '#34d399' : colors.border}`, fontSize: '13px', color: colors.text, display: 'flex', justifyContent: 'space-between' }}>
                              <span>{opt.text}</span>
                              {opt.isCorrect && <span>✅</span>}
                            </div>
                          ))}
                        </div>
                        <button onClick={() => launchPoll(m.question)} disabled={!activeRoom} style={{ width: '100%', padding: '10px', background: activeRoom ? 'linear-gradient(135deg, #6366f1, #3b82f6)' : colors.actionBg, color: activeRoom ? 'white' : colors.textMuted, border: 'none', borderRadius: '8px', cursor: activeRoom ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '13px', boxShadow: activeRoom ? '0 4px 10px rgba(99,102,241,0.3)' : 'none', transition: '0.2s' }}>
                          {activeRoom ? `🚀 Launch (${pollTimer}s Timer)` : '⚠️ Start a Room First'}
                        </button>
                      </div>
                    ) : (
                      <div style={{
                        padding: '10px 14px', borderRadius: '12px', maxWidth: '85%', fontSize: '13px', lineHeight: '1.5', wordWrap: 'break-word', whiteSpace: 'pre-wrap',
                        ...(m.type === 'system' ? { background: colors.systemBg, color: colors.systemText, alignSelf: 'center', textAlign: 'center', border: `1px solid ${isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.2)'}`, fontSize: '12px' }
                          : m.type === 'user' ? { background: 'linear-gradient(135deg, #6366f1, #3b82f6)', color: 'white', alignSelf: 'flex-end', borderBottomRightRadius: '4px', boxShadow: '0 2px 8px rgba(99,102,241,0.2)' }
                          : { background: colors.botBg, color: colors.botText, alignSelf: 'flex-start', borderBottomLeftRadius: '4px', border: `1px solid ${colors.border}` })
                      }}>
                        {m.text}
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div style={{ background: colors.botBg, color: colors.botText, padding: '10px 14px', borderRadius: '12px', alignSelf: 'flex-start', fontSize: '13px', border: `1px solid ${colors.border}` }}>Typing...</div>
                )}
              </div>

              {!(user?.role === 'student' && activeTab === 'command') && (
                <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: '10px', background: colors.bg }}>
                  
                  {user?.role === 'teacher' && activeRoom && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(52, 211, 153, 0.1)', padding: '4px 6px 4px 10px', borderRadius: '12px', border: '1px solid rgba(52, 211, 153, 0.2)' }}>
                        <span style={{width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 4px #34d399'}}/>
                        Live Room: {activeRoom.code} • 👥 {activeRoom.activeParticipants || 0}
                        <button onClick={handleEndRoom} style={{ marginLeft: '4px', padding: '2px 8px', fontSize: '9px', fontWeight: 'bold', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.15)', color: '#ef4444', cursor: 'pointer', textTransform: 'uppercase', transition: '0.2s' }}>End</button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder={activeTab === 'assistant' ? (user?.role === 'student' ? "Ask study assistant..." : "Ask about website stats...") : "E.g. Create a poll on React..."}
                      disabled={isLoading}
                      style={{ flex: 1, background: colors.inputBg, border: `1px solid ${colors.border}`, borderRadius: '24px', padding: '10px 16px', color: colors.text, outline: 'none', fontSize: '13px', transition: '0.2s', userSelect: 'auto', pointerEvents: 'auto' }}
                    />
                    <button onClick={handleSend} disabled={isLoading} style={{ background: 'linear-gradient(135deg, #6366f1, #3b82f6)', color: 'white', border: 'none', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(99,102,241,0.3)', transition: '0.2s' }}>
                      ➤
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
