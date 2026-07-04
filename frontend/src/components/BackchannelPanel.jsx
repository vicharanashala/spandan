import React, { useEffect, useMemo, useState } from 'react'
import { API_URL } from '../config.js'

function BackchannelPanel({ roomId, token, socket, mode = 'student', disabled = false }) {
  const [questions, setQuestions] = useState([])
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const openQuestions = useMemo(
    () => questions.filter(question => question.status !== 'resolved'),
    [questions]
  )

  const resolvedQuestions = useMemo(
    () => questions.filter(question => question.status === 'resolved'),
    [questions]
  )

  const fetchQuestions = async () => {
    if (!roomId || !token) return

    setIsLoading(true)
    try {
      const response = await fetch(`${API_URL}/backchannel?roomId=${roomId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load backchannel')
      }

      setQuestions(data.questions || [])
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchQuestions()
  }, [roomId, token])

  useEffect(() => {
    if (!socket || !roomId) return

    const handleBackchannelUpdated = (data) => {
      if (!data?.roomId || String(data.roomId) === String(roomId)) {
        fetchQuestions()
      }
    }

    socket.on('backchannel:updated', handleBackchannelUpdated)
    return () => socket.off('backchannel:updated', handleBackchannelUpdated)
  }, [socket, roomId, token])

  const submitQuestion = async () => {
    const trimmedText = text.trim()
    if (!trimmedText || isSubmitting || disabled) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`${API_URL}/backchannel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ roomId, text: trimmedText })
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit question')
      }

      setText('')
      setError('')
      await fetchQuestions()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleUpvote = async (questionId) => {
    if (disabled) return

    try {
      const response = await fetch(`${API_URL}/backchannel/${questionId}/upvote`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update upvote')
      }

      setError('')
      await fetchQuestions()
    } catch (err) {
      setError(err.message)
    }
  }

  const resolveQuestion = async (questionId) => {
    try {
      const response = await fetch(`${API_URL}/backchannel/${questionId}/resolve`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resolve question')
      }

      setError('')
      await fetchQuestions()
    } catch (err) {
      setError(err.message)
    }
  }

  const renderQuestion = (question, index) => {
    const isResolved = question.status === 'resolved'

    return (
      <div key={question._id} style={{
        padding: '14px',
        background: 'var(--bg-primary)',
        border: `1px solid ${isResolved ? 'var(--border-color)' : '#bfdbfe'}`,
        borderRadius: '10px',
        opacity: isResolved ? 0.72 : 1
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{
            minWidth: '32px',
            height: '32px',
            borderRadius: '8px',
            background: isResolved ? 'var(--border-color)' : '#dbeafe',
            color: isResolved ? 'var(--text-secondary)' : '#1d4ed8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '700',
            fontSize: '13px'
          }}>
            {index + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              margin: 0,
              color: 'var(--text-primary)',
              fontSize: '14px',
              lineHeight: '1.45',
              wordBreak: 'break-word'
            }}>
              {question.text}
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
              <span style={{
                padding: '3px 8px',
                borderRadius: '999px',
                background: isResolved ? '#e5e7eb' : '#dcfce7',
                color: isResolved ? '#4b5563' : '#166534',
                fontSize: '11px',
                fontWeight: '700'
              }}>
                {isResolved ? 'Resolved' : 'Open'}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                {question.upvotes} upvote{question.upvotes === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          {mode === 'student' && !isResolved && (
            <button
              onClick={() => toggleUpvote(question._id)}
              disabled={disabled}
              style={{
                padding: '8px 10px',
                background: question.hasUpvoted ? '#2563eb' : 'var(--bg-card)',
                color: question.hasUpvoted ? 'white' : '#2563eb',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontWeight: '700',
                fontSize: '12px',
                whiteSpace: 'nowrap'
              }}
            >
              Upvote
            </button>
          )}
          {mode === 'teacher' && !isResolved && (
            <button
              onClick={() => resolveQuestion(question._id)}
              style={{
                padding: '8px 10px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '12px',
                whiteSpace: 'nowrap'
              }}
            >
              Resolved
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '16px',
      padding: '20px',
      border: '1px solid var(--border-color)',
      boxShadow: 'var(--card-shadow)',
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>Q</span>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '17px', fontWeight: '700' }}>
              Backchannel
            </h3>
          </div>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Anonymous live student questions
          </p>
        </div>
        <span style={{
          padding: '4px 10px',
          borderRadius: '999px',
          background: '#eff6ff',
          color: '#1d4ed8',
          fontSize: '12px',
          fontWeight: '700',
          whiteSpace: 'nowrap'
        }}>
          {openQuestions.length} open
        </span>
      </div>

      {mode === 'student' && (
        <div style={{ marginBottom: '16px' }}>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={disabled || isSubmitting}
            maxLength={500}
            placeholder="Ask an anonymous question..."
            style={{
              width: '100%',
              minHeight: '84px',
              resize: 'vertical',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              padding: '12px',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              fontSize: '14px',
              outline: 'none'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', gap: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              {text.length}/500
            </span>
            <button
              onClick={submitQuestion}
              disabled={disabled || isSubmitting || !text.trim()}
              style={{
                padding: '9px 14px',
                background: disabled || isSubmitting || !text.trim() ? 'var(--border-color)' : '#2563eb',
                color: disabled || isSubmitting || !text.trim() ? 'var(--text-secondary)' : 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: disabled || isSubmitting || !text.trim() ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: '700'
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: '12px', padding: '10px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {isLoading && questions.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
          Loading backchannel...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: mode === 'teacher' ? '520px' : '420px', overflowY: 'auto', paddingRight: '2px' }}>
          {openQuestions.length === 0 && (
            <div style={{ padding: '22px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', background: 'var(--bg-primary)', borderRadius: '10px' }}>
              No open backchannel questions yet.
            </div>
          )}
          {openQuestions.map(renderQuestion)}
          {resolvedQuestions.length > 0 && (
            <div style={{ paddingTop: '8px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700' }}>
              Resolved
            </div>
          )}
          {resolvedQuestions.map(renderQuestion)}
        </div>
      )}
    </div>
  )
}

export default BackchannelPanel
