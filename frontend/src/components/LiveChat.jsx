import React, { useState, useEffect, useRef, useMemo } from 'react'
import useSocketStore from '../stores/socketStore'
import useAuthStore from '../stores/authStore'
import { API_URL } from '../config.js'

export default function LiveChat({
  roomId,
  roomCode,
  isTeacher = false,
  isCoHost = false,
  isCollapsed = false,
  onToggleCollapse = null
}) {
  const { user, token } = useAuthStore()
  const { socket } = useSocketStore()

  const isPrivileged = isTeacher || isCoHost

  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [isChatEnabled, setIsChatEnabled] = useState(true)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [errorBanner, setErrorBanner] = useState('')
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  // File Attachment State
  const [attachedFile, setAttachedFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [previewModalUrl, setPreviewModalUrl] = useState(null)

  // Thread Reply State
  const [replyingTo, setReplyingTo] = useState(null) // { messageId, senderName, senderRole, text, hasAttachment }
  const [collapsedThreads, setCollapsedThreads] = useState({}) // messageId -> boolean

  const textInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const chatContainerRef = useRef(null)
  const cooldownIntervalRef = useRef(null)
  const isScrolledToBottomRef = useRef(true)

  // Auto-scroll helper
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
    }
  }

  // Load chat history & status on mount
  useEffect(() => {
    if (!roomId || !token) return

    let isMounted = true
    const fetchHistory = async () => {
      try {
        setIsLoadingHistory(true)
        const res = await fetch(`${API_URL}/chat/${roomId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
        if (res.ok && isMounted) {
          const data = await res.json()
          setMessages(data.messages || [])
          setIsChatEnabled(data.enabled ?? true)
          setTimeout(() => scrollToBottom(false), 50)
        }
      } catch (err) {
        console.error('Failed to load chat history:', err)
      } finally {
        if (isMounted) setIsLoadingHistory(false)
      }
    }

    fetchHistory()
    return () => {
      isMounted = false
    }
  }, [roomId, token])

  // Socket listeners for batched broadcast and toggle events
  useEffect(() => {
    if (!socket) return

    const handleChatMessages = (data) => {
      if (Array.isArray(data?.messages) && data.messages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => String(m._id || m.id)))
          const newUnique = data.messages.filter((m) => !existingIds.has(String(m._id || m.id)))
          return [...prev, ...newUnique]
        })

        if (isCollapsed) {
          setUnreadCount((c) => c + data.messages.length)
        }

        if (isScrolledToBottomRef.current) {
          setTimeout(() => scrollToBottom(true), 50)
        }
      }
    }

    const handleChatEnabled = () => {
      setIsChatEnabled(true)
      setErrorBanner('')
    }

    const handleChatDisabled = () => {
      setIsChatEnabled(false)
    }

    const handleChatStatus = (data) => {
      if (data?.enabled !== undefined) {
        setIsChatEnabled(data.enabled)
      }
    }

    const handleChatError = (data) => {
      if (data?.error) {
        setErrorBanner(data.error)
        if (data.retryAfter && typeof data.retryAfter === 'number') {
          startCooldown(data.retryAfter)
        }
        setTimeout(() => setErrorBanner(''), 4000)
      }
    }

    socket.on('chat:messages', handleChatMessages)
    socket.on('chat_enabled', handleChatEnabled)
    socket.on('chat_disabled', handleChatDisabled)
    socket.on('chat:status', handleChatStatus)
    socket.on('chat:error', handleChatError)

    return () => {
      socket.off('chat:messages', handleChatMessages)
      socket.off('chat_enabled', handleChatEnabled)
      socket.off('chat_disabled', handleChatDisabled)
      socket.off('chat:status', handleChatStatus)
      socket.off('chat:error', handleChatError)
    }
  }, [socket, isCollapsed])

  // Reset unread count on expand
  useEffect(() => {
    if (!isCollapsed) {
      setUnreadCount(0)
      setTimeout(() => scrollToBottom(false), 50)
    }
  }, [isCollapsed])

  // Cooldown countdown timer
  const startCooldown = (seconds) => {
    if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current)
    setCooldownSeconds(seconds)

    cooldownIntervalRef.current = setInterval(() => {
      setCooldownSeconds((sec) => {
        if (sec <= 1) {
          clearInterval(cooldownIntervalRef.current)
          return 0
        }
        return sec - 1
      })
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current)
    }
  }, [])

  // File selection handler
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      setErrorBanner('File size exceeds 10MB limit')
      return
    }

    const isImg = file.type.startsWith('image/')
    const isPdf = file.type === 'application/pdf'
    const localPreview = isImg ? URL.createObjectURL(file) : null

    setAttachedFile({
      file,
      localPreview,
      fileName: file.name,
      fileSize: file.size,
      fileType: isImg ? 'image' : isPdf ? 'pdf' : 'file',
      uploadedData: null
    })

    try {
      setIsUploading(true)
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API_URL}/chat/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Upload failed')
      }

      const uploadedData = await res.json()
      setAttachedFile((prev) => (prev ? { ...prev, uploadedData } : null))
    } catch (err) {
      console.error('File upload error:', err)
      setErrorBanner(err.message || 'Failed to upload file')
      setAttachedFile(null)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeAttachedFile = () => {
    if (attachedFile?.localPreview) {
      URL.revokeObjectURL(attachedFile.localPreview)
    }
    setAttachedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Set reply target
  const handleStartReply = (msg) => {
    setReplyingTo({
      messageId: msg._id || msg.id,
      senderName: msg.senderName || 'User',
      senderRole: msg.senderRole || 'student',
      text: msg.text || (msg.attachment ? `[${msg.attachment.fileType || 'File'}] ${msg.attachment.fileName || ''}` : ''),
      hasAttachment: Boolean(msg.attachment)
    })
    setTimeout(() => {
      textInputRef.current?.focus()
    }, 50)
  }

  const cancelReply = () => {
    setReplyingTo(null)
  }

  const toggleThreadCollapse = (msgId) => {
    setCollapsedThreads((prev) => ({
      ...prev,
      [msgId]: !prev[msgId]
    }))
  }

  // Send message
  const handleSendMessage = (e) => {
    e?.preventDefault()
    const text = inputText.trim()
    const attachment = attachedFile?.uploadedData || null
    const reply = replyingTo || null

    if (!text && !attachment) return
    if (!socket || !roomCode) return

    if (!isPrivileged) {
      if (!isChatEnabled) {
        setErrorBanner('Chat is currently disabled by host')
        return
      }
      if (cooldownSeconds > 0) {
        setErrorBanner(`Please wait ${cooldownSeconds}s before sending again`)
        return
      }
    }

    if (isUploading) {
      setErrorBanner('File is still uploading, please wait a moment...')
      return
    }

    socket.emit('chat:send', {
      roomCode,
      text,
      attachment,
      replyTo: reply
    })

    if (!isPrivileged) {
      startCooldown(10)
    }

    setInputText('')
    removeAttachedFile()
    setReplyingTo(null)
    setErrorBanner('')
  }

  const handleToggleChatState = () => {
    if (!isPrivileged || !socket || !roomCode) return
    const newState = !isChatEnabled
    socket.emit('chat:toggle', {
      roomCode,
      enabled: newState
    })
  }

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    isScrolledToBottomRef.current = scrollHeight - scrollTop - clientHeight < 40
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  const resolveFileUrl = (url) => {
    if (!url) return ''
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    const base = import.meta.env.VITE_BASE_PATH || ''
    const cleanBase = base ? '/' + base.replace(/^\/|\/$/g, '') : ''

    // Normalize any legacy /uploads/chat/ paths to authenticated /api/chat/attachments/
    let cleanUrl = url.startsWith('/') ? url : '/' + url
    if (cleanUrl.startsWith('/uploads/chat/')) {
      const filename = cleanUrl.replace('/uploads/chat/', '')
      cleanUrl = `/api/chat/attachments/${filename}`
    }

    const fullUrl = cleanBase + cleanUrl
    const separator = fullUrl.includes('?') ? '&' : '?'
    return `${fullUrl}${separator}token=${encodeURIComponent(token || '')}&roomId=${encodeURIComponent(roomId || '')}`
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Generate deterministic color for avatar
  const getAvatarBg = (name = '') => {
    const colors = [
      'bg-indigo-600',
      'bg-purple-600',
      'bg-pink-600',
      'bg-sky-600',
      'bg-emerald-600',
      'bg-amber-600',
      'bg-teal-600'
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  const getInitials = (name = '') => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }

  // Group messages into Threads (Root messages + their nested replies)
  // Ordered by latest activity (replying to a thread bumps the entire main message + replies to the bottom)
  const threadList = useMemo(() => {
    const threadMap = new Map() // messageId -> { message, replies: [], lastActivityAt: number }
    const roots = []

    // 1. Initialize Map
    messages.forEach((msg) => {
      const id = String(msg._id || msg.id)
      const msgTime = new Date(msg.createdAt || Date.now()).getTime()
      threadMap.set(id, { message: msg, replies: [], lastActivityAt: msgTime })
    })

    // 2. Nest replies under root messages & bump thread activity timestamp
    messages.forEach((msg) => {
      const id = String(msg._id || msg.id)
      const parentId = msg.replyTo?.messageId ? String(msg.replyTo.messageId) : null
      const msgTime = new Date(msg.createdAt || Date.now()).getTime()

      if (parentId && threadMap.has(parentId)) {
        const parentThread = threadMap.get(parentId)
        parentThread.replies.push(msg)
        if (msgTime > parentThread.lastActivityAt) {
          parentThread.lastActivityAt = msgTime
        }
      } else {
        roots.push(threadMap.get(id))
      }
    })

    // 3. Sort threads by lastActivityAt ascending (latest active thread appears at the bottom)
    roots.sort((a, b) => a.lastActivityAt - b.lastActivityAt)

    return roots
  }, [messages])

  // Sub-component to render single message bubble
  const renderMessageBubble = (msg, isReply = false) => {
    const msgId = String(msg._id || msg.id)
    const isMe = String(msg.senderId) === String(user?._id)
    const role = msg.senderRole || 'student'
    const att = msg.attachment
    const name = msg.senderName || 'User'

    return (
      <div
        key={msgId}
        id={`chat-msg-${msgId}`}
        className={`group relative flex items-start gap-2.5 ${isReply ? 'mt-2.5' : 'mt-4 first:mt-0'}`}
      >
        {/* Avatar */}
        <div
          className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold shadow-sm ${
            role === 'teacher'
              ? 'bg-purple-600 ring-2 ring-purple-400/40'
              : role === 'cohost'
              ? 'bg-indigo-600 ring-2 ring-indigo-400/40'
              : getAvatarBg(name)
          }`}
        >
          {getInitials(name)}
        </div>

        {/* Content Column */}
        <div className="flex-1 min-w-0">
          {/* Sender Header */}
          <div className="flex items-center gap-1.5 mb-1 text-xs">
            <span
              className={`font-semibold ${
                role === 'teacher'
                  ? 'text-purple-600 dark:text-purple-400'
                  : role === 'cohost'
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-sky-600 dark:text-sky-400'
              }`}
            >
              {name}
            </span>
            {isMe && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                (You)
              </span>
            )}
            {role === 'teacher' && (
              <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                Host
              </span>
            )}
            {role === 'cohost' && (
              <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Co-Host
              </span>
            )}
            <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-1">
              {formatTime(msg.createdAt)}
            </span>
          </div>

          {/* Bubble */}
          <div className="inline-block max-w-[95%] bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 px-3.5 py-2 rounded-2xl rounded-tl-sm text-sm break-words shadow-xs border border-slate-200/60 dark:border-slate-700/60">
            {msg.text && <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>}

            {/* Attachment */}
            {att && att.url && (
              <div className="mt-2">
                {att.fileType === 'image' ? (
                  <div
                    onClick={() => setPreviewModalUrl(resolveFileUrl(att.url))}
                    className="cursor-pointer group/img relative overflow-hidden rounded-xl border border-black/10 dark:border-white/10 max-w-[260px]"
                  >
                    <img
                      src={resolveFileUrl(att.url)}
                      alt={att.fileName || 'Image attachment'}
                      className="w-full h-auto max-h-[200px] object-cover transition-transform group-hover/img:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium">
                      🔍 Click to expand
                    </div>
                  </div>
                ) : (
                  <a
                    href={resolveFileUrl(att.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={att.fileName || true}
                    className="flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-750 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 transition-all"
                  >
                    <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {att.fileType === 'pdf' ? '📄' : '📁'}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-semibold truncate">{att.fileName || 'Document'}</p>
                      {att.fileSize > 0 && (
                        <p className="text-[10px] opacity-75">{formatFileSize(att.fileSize)}</p>
                      )}
                    </div>
                    <div className="text-xs font-medium opacity-80 flex-shrink-0">⬇</div>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Action Row: Reply Button */}
          <div className="flex items-center gap-3 mt-1 text-xs">
            <button
              type="button"
              onClick={() => handleStartReply(msg)}
              className="text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 font-medium flex items-center gap-1 transition-colors"
            >
              <span>↩</span> Reply
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-all">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
            💬
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
              Live Session Chat
              {isPrivileged && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    isChatEnabled
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {isChatEnabled ? 'ON' : 'MUTED'}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isChatEnabled ? 'All students can message' : 'Student messaging paused'}
            </p>
          </div>
        </div>

        {/* Host/Co-host Enable/Disable Toggle */}
        <div className="flex items-center gap-2">
          {isPrivileged && (
            <button
              onClick={handleToggleChatState}
              title={isChatEnabled ? 'Disable student chat' : 'Enable student chat'}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                isChatEnabled
                  ? 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
              }`}
            >
              {isChatEnabled ? 'Pause Chat' : 'Enable Chat'}
            </button>
          )}

          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Disabled Banner for students */}
      {!isChatEnabled && !isPrivileged && (
        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.366zM4.05 4.05a8 8 0 1111.314 11.314A8 8 0 014.05 4.05z"
              clipRule="evenodd"
            />
          </svg>
          <span>Chat has been paused by the host. Only hosts can post.</span>
        </div>
      )}

      {/* Error / Cooldown Banner */}
      {errorBanner && (
        <div className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
          <span>{errorBanner}</span>
          <button onClick={() => setErrorBanner('')} className="text-rose-500 font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {/* Messages Scroll Area with Nested Threading */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[220px] max-h-[520px] bg-slate-50/50 dark:bg-slate-900/50"
      >
        {isLoadingHistory ? (
          <div className="flex items-center justify-center h-32 text-xs text-slate-400">
            <div className="animate-spin w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full mr-2" />
            Loading messages...
          </div>
        ) : threadList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-36 text-center text-slate-400 dark:text-slate-500 text-xs">
            <span className="text-2xl mb-1">💬</span>
            <p className="font-medium text-slate-600 dark:text-slate-400">No messages yet</p>
            <p className="text-[11px]">Say hello or attach a file to start!</p>
          </div>
        ) : (
          threadList.map((thread) => {
            const rootMsg = thread.message
            const rootId = String(rootMsg._id || rootMsg.id)
            const replies = thread.replies || []
            const isThreadCollapsed = Boolean(collapsedThreads[rootId])

            return (
              <div key={rootId} className="flex flex-col">
                {/* Main Message */}
                {renderMessageBubble(rootMsg, false)}

                {/* Nested Thread Section directly under the main message */}
                {replies.length > 0 && (
                  <div className="relative ml-4 pl-4 mt-2 border-l-2 border-pink-400 dark:border-pink-500/70 space-y-3">
                    {/* Thread Collapse / Expand toggle */}
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => toggleThreadCollapse(rootId)}
                        className="text-sky-600 dark:text-sky-400 hover:underline font-medium flex items-center gap-1"
                      >
                        {isThreadCollapsed ? (
                          <>
                            <span>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
                            <span>▾</span>
                          </>
                        ) : (
                          <>
                            <span>Collapse all</span>
                            <span>▴</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Replies List */}
                    {!isThreadCollapsed && (
                      <div className="space-y-3">
                        {replies.map((replyMsg) => renderMessageBubble(replyMsg, true))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Attachment Preview Bar */}
      {attachedFile && (
        <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {attachedFile.localPreview ? (
              <img
                src={attachedFile.localPreview}
                alt="Preview"
                className="w-10 h-10 object-cover rounded-lg border border-slate-300 dark:border-slate-600 flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center text-lg flex-shrink-0">
                {attachedFile.fileType === 'pdf' ? '📄' : '📁'}
              </div>
            )}
            <div className="min-w-0 text-left">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                {attachedFile.fileName}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {formatFileSize(attachedFile.fileSize)}{' '}
                {isUploading && (
                  <span className="text-indigo-600 dark:text-indigo-400 font-medium ml-1">
                    (Uploading...)
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={removeAttachedFile}
            className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 flex items-center justify-center font-bold text-xs"
          >
            ×
          </button>
        </div>
      )}

      {/* Reply Context Bar */}
      {replyingTo && (
        <div className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950/40 border-t border-indigo-200 dark:border-indigo-900/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 text-xs">
            <span className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">↩</span>
            <div className="min-w-0 text-left">
              <span className="font-semibold text-indigo-800 dark:text-indigo-300">
                Replying to {replyingTo.senderName}:
              </span>{' '}
              <span className="text-slate-600 dark:text-slate-300 truncate inline-block max-w-[280px] align-bottom">
                {replyingTo.text}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={cancelReply}
            className="w-5 h-5 rounded-full bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900 dark:hover:bg-indigo-800 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs"
          >
            ×
          </button>
        </div>
      )}

      {/* Input Footer */}
      <form onSubmit={handleSendMessage} className="p-2.5 bg-white dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*,application/pdf,.doc,.docx,.txt"
            className="hidden"
          />

          {/* Plus (+) Button for Files/Images */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={(!isChatEnabled && !isPrivileged) || cooldownSeconds > 0 || isUploading}
            title="Attach image or PDF"
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            +
          </button>

          {/* Message Text Input */}
          <input
            type="text"
            ref={textInputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={(!isChatEnabled && !isPrivileged) || cooldownSeconds > 0}
            maxLength={1000}
            placeholder={
              !isChatEnabled && !isPrivileged
                ? 'Chat paused by host...'
                : cooldownSeconds > 0
                ? `Cooldown active (${cooldownSeconds}s)...`
                : replyingTo
                ? `Reply to ${replyingTo.senderName}...`
                : 'Type a message...'
            }
            className="flex-1 px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={
              (!inputText.trim() && !attachedFile?.uploadedData) ||
              (!isChatEnabled && !isPrivileged) ||
              cooldownSeconds > 0 ||
              isUploading
            }
            className={`px-3.5 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1 transition-all ${
              cooldownSeconds > 0
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {cooldownSeconds > 0 ? (
              <span className="text-xs font-mono">{cooldownSeconds}s</span>
            ) : isUploading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            )}
          </button>
        </div>
      </form>

      {/* Image Preview Modal (Light-box) */}
      {previewModalUrl && (
        <div
          onClick={() => setPreviewModalUrl(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={previewModalUrl}
              alt="Expanded preview"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
            />
            <button
              onClick={() => setPreviewModalUrl(null)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white font-bold text-sm flex items-center justify-center"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
