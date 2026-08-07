import React, { useState, useEffect, useCallback, useRef } from 'react'
import { doubtApi } from '../lib/api.js'
import { useSocketStore } from '../stores/socketStore.js'
import { useTeacherPositionStore } from '../stores/teacherPositionStore.js'
import sounds from '../lib/sounds.js'

/**
 * ImLostButton -- squishy floating flag for students to mark confusion.
 *
 * Always anchored to the top-right of the room view so it's never blocked
 * by question UI at the bottom.
 *
 * Props:
 *   - roomId: MongoDB ObjectId of the room (required)
 *   - roomCode: socket room code (required for socket emission)
 *   - getCurrentSegment: function returning { segmentIndex, transcriptOffsetMs }
 *                         (called at click time so we capture the live position)
 *   - disabled: when true the button is greyed out (e.g. room not active)
 */
export default function ImLostButton ({ roomId, roomCode, getCurrentSegment, disabled = false }) {
  const [status, setStatus] = useState('idle') // idle | sending | confirmed | cooldown | error
  const [cooldownMs, setCooldownMs] = useState(0)
  const cooldownRef = useRef(null)
  const socket = useSocketStore(s => s.socket)
  const teacherPos = useTeacherPositionStore(s => s.lastPosition)
  const sessionActive = useTeacherPositionStore(s => s.sessionActive)

  const startCooldown = useCallback((ms) => {
    setCooldownMs(ms)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setCooldownMs(prev => {
        if (prev <= 100) {
          clearInterval(cooldownRef.current)
          cooldownRef.current = null
          setStatus('idle')
          return 0
        }
        return prev - 100
      })
    }, 100)
  }, [])

  useEffect(() => () => {
    if (cooldownRef.current) clearInterval(cooldownRef.current)
  }, [])

  // Listen for socket confirmations to update UI without a refetch
  useEffect(() => {
    if (!socket) return
    const onConfirmed = () => {
      setStatus('confirmed')
      sounds.send()
      startCooldown(30000)
      setTimeout(() => setStatus(prev => prev === 'confirmed' ? 'idle' : prev), 1500)
    }
    const onIgnored = (data) => {
      if (data?.reason === 'anti_spam') {
        startCooldown(data.retryAfterMs || 30000)
        setStatus('cooldown')
        sounds.deny()
      } else {
        setStatus('error')
        sounds.deny()
      }
    }
    // New poll → reset cooldown so the button is immediately clickable.
    // Without this, a student who pressed Confused on Poll #1 would still
    // be locked out for up to 30s when Poll #2 starts. The server has
    // already cleared its anti-spam window via markPollStarted() in the
    // 'new_question'/'question:start' handlers, so clearing the client
    // cooldown keeps the two layers in sync.
    const onPollReset = () => {
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current)
        cooldownRef.current = null
      }
      setCooldownMs(0)
      setStatus('idle')
    }
    socket.on('doubt:confirmed', onConfirmed)
    socket.on('doubt:ignored', onIgnored)
    socket.on('new_question', onPollReset)
    socket.on('question:started', onPollReset)
    socket.on('poll:reset', onPollReset)
    return () => {
      socket.off('doubt:confirmed', onConfirmed)
      socket.off('doubt:ignored', onIgnored)
      socket.off('new_question', onPollReset)
      socket.off('question:started', onPollReset)
      socket.off('poll:reset', onPollReset)
    }
  }, [socket, startCooldown])

  const handleClick = async () => {
    if (status === 'sending' || cooldownMs > 0 || disabled) return
    sounds.tap()
    const pos = (typeof getCurrentSegment === 'function' ? getCurrentSegment() : null) || { segmentIndex: 0, transcriptOffsetMs: 0 }
    // NEW: live teacher position broadcast — students see real recordingOffsetMs
    // and the utterance the teacher was saying when they tapped.
    const livePos = sessionActive && teacherPos
      ? {
          recordingOffsetMs: teacherPos.recordingOffsetMs,
          utteranceSnapshot: teacherPos.utteranceSnapshot || '',
          clientSentAt: Date.now()
        }
      : null
    setStatus('sending')

    try {
      if (socket && socket.connected) {
        socket.emit('doubt:signal', {
          roomId: String(roomId),
          roomCode,
          segmentIndex: pos.segmentIndex,
          transcriptOffsetMs: pos.transcriptOffsetMs,
          ...(livePos || {})
        })
        // Optimistic; the 'doubt:confirmed' handler will adjust if needed.
        setStatus('confirmed')
        setTimeout(() => setStatus(prev => prev === 'confirmed' ? 'idle' : prev), 1500)
      } else {
        const res = await doubtApi.recordWithContext({
          roomId,
          segmentIndex: pos.segmentIndex,
          transcriptOffsetMs: pos.transcriptOffsetMs,
          recordingOffsetMs: livePos?.recordingOffsetMs,
          utteranceSnapshot: livePos?.utteranceSnapshot,
          clientSentAt: livePos?.clientSentAt
        })
        if (res?.success) {
          setStatus('confirmed')
          sounds.send()
          setTimeout(() => setStatus('idle'), 1500)
        } else if (res?.error === 'anti_spam') {
          startCooldown(res.retryAfterMs || 30000)
          setStatus('cooldown')
          sounds.deny()
        } else {
          setStatus('error')
          sounds.deny()
        }
      }
    } catch (err) {
      console.warn('[ImLostButton] record failed:', err?.message)
      setStatus('error')
      sounds.deny()
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  const icon = () => {
    if (status === 'confirmed') return '✓'
    if (status === 'sending') return '⏳'
    if (status === 'cooldown') return '⏱'
    if (status === 'error') return '!'
    return '🚩'
  }

  const label = () => {
    if (disabled) return 'Room ended'
    if (status === 'sending') return 'Sending...'
    if (status === 'confirmed') return 'Marked'
    if (status === 'error') return 'Try again'
    if (status === 'cooldown') return `Wait ${Math.ceil(cooldownMs / 1000)}s`
    return "I'm lost"
  }

  const className = `imlost-btn imlost-btn--${status}${disabled ? ' imlost-btn--disabled' : ''}`

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      disabled={disabled || cooldownMs > 0 || status === 'sending'}
      aria-label="Mark that I am lost"
      title="Mark this moment -- the teacher sees an anonymous 'I'm lost' signal tied to the current segment"
    >
      <span className="imlost-btn-icon" aria-hidden="true">{icon()}</span>
      <span className="imlost-btn-label">{label()}</span>
    </button>
  )
}