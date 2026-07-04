import React, { useEffect, useMemo, useState } from 'react'
import { API_URL } from '../config.js'

function BackchannelPanel({ roomId, token, socket, mode = 'student', disabled = false }) {
  const [questions, setQuestions] = useState([])
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [warning, setWarning] = useState('')

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
      setWarning(data.warning || '')
      setNotice(data.warning ? '' : (data.message || 'Question submitted.'))
      await fetchQuestions()
    } catch (err) {
      setError(err.message)
      setNotice('')
      setWarning('')
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
      setWarning('')
      await fetchQuestions()
    } catch (err) {
      setError(err.message)
    }
  }

  const reportQuestion = async (questionId) => {
    try {
      const response = await fetch(`${API_URL}/backchannel/${questionId}/report`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resolve question')
      }

      setError('')
      setWarning('')
      setNotice('Question reported for teacher review.')
      await fetchQuestions()
    } catch (err) {
      setError(err.message)
      setNotice('')
      setWarning('')
    }
  }

  const teacherAction = async (questionId, action) => {
    const options = action === 'delete'
      ? { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      : { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }

    try {
      const response = await fetch(`${API_URL}/backchannel/${questionId}${action === 'delete' ? '' : `/${action}`}`, options)
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} question`)
      }

      setError('')
      setNotice('')
      setWarning('')
      await fetchQuestions()
    } catch (err) {
      setError(err.message)
    }
  }

  const renderQuestion = (question, index) => {
    const isResolved = question.status === 'resolved'
    const isFlagged = question.moderationStatus === 'flagged'
    const isBlocked = question.moderationStatus === 'blocked'
    const isHidden = question.isHidden || isFlagged || isBlocked

    return (
      <div key={question._id} style={{
        padding: '14px',
        background: 'var(--bg-primary)',
        border: `1px solid ${isHidden ? '#fbbf24' : (isResolved ? 'var(--border-color)' : '#bfdbfe')}`,
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
                background: isBlocked ? '#fee2e2' : (isFlagged ? '#fef3c7' : (isResolved ? '#e5e7eb' : '#dcfce7')),
                color: isBlocked ? '#b91c1c' : (isFlagged ? '#92400e' : (isResolved ? '#4b5563' : '#166534')),
                fontSize: '11px',
                fontWeight: '700'
              }}>
                {isBlocked ? 'Blocked' : (isFlagged ? 'Flagged' : (isResolved ? 'Resolved' : 'Open'))}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                {question.upvotes} upvote{question.upvotes === 1 ? '' : 's'}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                {question.reports || 0} report{question.reports === 1 ? '' : 's'}
              </span>
              {mode === 'teacher' && question.moderationReasons?.length > 0 && (
                <span style={{ color: '#92400e', fontSize: '12px', fontWeight: '600' }}>
                  {question.moderationReasons.join(', ')}
                </span>
              )}
            </div>
          </div>
          {mode === 'student' && !isResolved && (
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
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
              <button
                onClick={() => reportQuestion(question._id)}
                disabled={disabled || question.hasReported}
                style={{
                  padding: '8px 10px',
                  background: question.hasReported ? '#e5e7eb' : '#fff7ed',
                  color: question.hasReported ? '#6b7280' : '#c2410c',
                  border: '1px solid #fed7aa',
                  borderRadius: '8px',
                  cursor: disabled || question.hasReported ? 'not-allowed' : 'pointer',
                  fontWeight: '700',
                  fontSize: '12px',
                  whiteSpace: 'nowrap'
                }}
              >
                {question.hasReported ? 'Reported' : 'Report'}
              </button>
            </div>
          )}
          {mode === 'teacher' && !isResolved && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
              {isHidden && (
                <button
                  onClick={() => teacherAction(question._id, 'approve')}
                  style={{
                    padding: '8px 10px',
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '700',
                    fontSize: '12px'
                  }}
                >
                  Approve
                </button>
              )}
              {!isHidden && (
                <button
                  onClick={() => teacherAction(question._id, 'resolve')}
                  style={{
                    padding: '8px 10px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '700',
                    fontSize: '12px'
                  }}
                >
                  Resolved
                </button>
              )}
              <button
                onClick={() => teacherAction(question._id, 'flag')}
                style={{
                  padding: '8px 10px',
                  background: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '12px'
                }}
              >
                Flag
              </button>
              <button
                onClick={() => teacherAction(question._id, 'delete')}
                style={{
                  padding: '8px 10px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '12px'
                }}
              >
                Delete
              </button>
            </div>
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
            minLength={8}
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
              {text.length}/500, minimum 8
            </span>
            <button
              onClick={submitQuestion}
              disabled={disabled || isSubmitting || text.trim().length < 8}
              style={{
                padding: '9px 14px',
                background: disabled || isSubmitting || text.trim().length < 8 ? 'var(--border-color)' : '#2563eb',
                color: disabled || isSubmitting || text.trim().length < 8 ? 'var(--text-secondary)' : 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: disabled || isSubmitting || text.trim().length < 8 ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: '700'
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div style={{ marginBottom: '12px', padding: '10px', borderRadius: '8px', background: '#ecfdf5', color: '#047857', fontSize: '13px' }}>
          {notice}
        </div>
      )}

      {warning && (
        <div style={{ marginBottom: '12px', padding: '10px', borderRadius: '8px', background: '#fffbeb', color: '#92400e', fontSize: '13px', whiteSpace: 'pre-line' }}>
          {warning}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: '12px', padding: '10px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', fontSize: '13px', whiteSpace: 'pre-line' }}>
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
