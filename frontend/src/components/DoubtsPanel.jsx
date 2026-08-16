import React, { useState, useEffect, useCallback } from 'react'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'

// Live "raise a doubt" queue: students post short questions during a session,
// upvote ones they share, and the teacher resolves them as they're addressed.
// Works for both roles — pass isTeacher to switch controls.
function DoubtsPanel({ roomId, socket, isTeacher = false }) {
  const { token } = useAuthStore()
  const [doubts, setDoubts] = useState([])
  const [text, setText] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showResolved, setShowResolved] = useState(false)

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token])

  const fetchDoubts = useCallback(async () => {
    if (!roomId) return
    try {
      const res = await fetch(`${API_URL}/doubts/room/${roomId}`, { headers: authHeaders() })
      if (!res.ok) return
      const data = await res.json()
      setDoubts(data.doubts || [])
    } catch {
      // Non-fatal — the panel just stays on its last known state until the next poll/socket event.
    }
  }, [roomId, authHeaders])

  useEffect(() => { fetchDoubts() }, [fetchDoubts])

  // Live updates. The fetch above establishes the initial/authoritative list; sockets keep it fresh
  // without re-fetching the whole queue on every event.
  useEffect(() => {
    if (!socket) return
    const onNew = (doubt) => setDoubts(prev => [doubt, ...prev])
    const onUpvoted = ({ doubtId, upvoteCount }) =>
      setDoubts(prev => prev.map(d => d._id === doubtId ? { ...d, upvoteCount } : d))
    const onResolved = ({ doubtId }) =>
      setDoubts(prev => prev.map(d => d._id === doubtId ? { ...d, status: 'resolved' } : d))
    const onDeleted = ({ doubtId }) =>
      setDoubts(prev => prev.filter(d => d._id !== doubtId))

    socket.on('doubt:new', onNew)
    socket.on('doubt:upvoted', onUpvoted)
    socket.on('doubt:resolved', onResolved)
    socket.on('doubt:deleted', onDeleted)
    return () => {
      socket.off('doubt:new', onNew)
      socket.off('doubt:upvoted', onUpvoted)
      socket.off('doubt:resolved', onResolved)
      socket.off('doubt:deleted', onDeleted)
    }
  }, [socket])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!text.trim() || isSubmitting) return
    setIsSubmitting(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/doubts/room/${roomId}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ text: text.trim(), isAnonymous })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not post your doubt')
      setDoubts(prev => [data.doubt, ...prev])
      setText('')
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpvote = async (doubtId) => {
    // Optimistic toggle so it feels instant; the socket broadcast reconciles the real count.
    setDoubts(prev => prev.map(d => d._id === doubtId
      ? { ...d, hasUpvoted: !d.hasUpvoted, upvoteCount: d.upvoteCount + (d.hasUpvoted ? -1 : 1) }
      : d))
    try {
      await fetch(`${API_URL}/doubts/${doubtId}/upvote`, { method: 'POST', headers: authHeaders() })
    } catch {
      fetchDoubts() // out of sync — resync from the server
    }
  }

  const handleResolve = async (doubtId) => {
    setDoubts(prev => prev.map(d => d._id === doubtId ? { ...d, status: 'resolved' } : d))
    try {
      await fetch(`${API_URL}/doubts/${doubtId}/resolve`, { method: 'PATCH', headers: authHeaders() })
    } catch {
      fetchDoubts()
    }
  }

  const handleDelete = async (doubtId) => {
    setDoubts(prev => prev.filter(d => d._id !== doubtId))
    try {
      await fetch(`${API_URL}/doubts/${doubtId}`, { method: 'DELETE', headers: authHeaders() })
    } catch {
      fetchDoubts()
    }
  }

  const openDoubts = doubts.filter(d => d.status === 'open')
  const resolvedDoubts = doubts.filter(d => d.status === 'resolved')
  const visible = showResolved ? doubts : openDoubts

  return (
    <div style={{
      background: 'var(--card-bg, #fff)',
      borderRadius: '16px',
      padding: '20px',
      border: '1px solid var(--border-color, #e5e7eb)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          🙋 Doubts {openDoubts.length > 0 && (
            <span style={{
              background: '#3b82f6', color: 'white', borderRadius: '999px',
              padding: '2px 9px', fontSize: '12px', fontWeight: 700
            }}>{openDoubts.length}</span>
          )}
        </h3>
        {resolvedDoubts.length > 0 && (
          <button
            onClick={() => setShowResolved(s => !s)}
            style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
          >
            {showResolved ? 'Hide resolved' : `Show resolved (${resolvedDoubts.length})`}
          </button>
        )}
      </div>

      {!isTeacher && (
        <form onSubmit={handleSubmit} style={{ marginBottom: '16px' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask a doubt — the teacher and class will see it live…"
            maxLength={500}
            rows={2}
            style={{
              width: '100%', borderRadius: '10px', border: '1px solid #e5e7eb',
              padding: '10px 12px', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6b7280', cursor: 'pointer' }}>
              <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
              Post anonymously
            </label>
            <button
              type="submit"
              disabled={!text.trim() || isSubmitting}
              style={{
                background: !text.trim() || isSubmitting ? '#9ca3af' : 'linear-gradient(135deg, #1e40af, #3b82f6)',
                color: 'white', border: 'none', borderRadius: '10px', padding: '8px 18px',
                fontSize: '13px', fontWeight: 600, cursor: !text.trim() || isSubmitting ? 'not-allowed' : 'pointer'
              }}
            >
              {isSubmitting ? 'Posting…' : 'Raise doubt'}
            </button>
          </div>
          {error && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '6px' }}>{error}</div>}
        </form>
      )}

      {visible.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: '14px', textAlign: 'center', padding: '16px 0' }}>
          {isTeacher ? 'No doubts yet — this is where student questions will show up live.' : 'No open doubts. Be the first to ask!'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto' }}>
          {visible.map(d => (
            <div key={d._id} style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              padding: '10px 12px', borderRadius: '10px',
              background: d.status === 'resolved' ? '#f9fafb' : '#f3f4f6',
              opacity: d.status === 'resolved' ? 0.6 : 1
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '14px', color: '#111827', textDecoration: d.status === 'resolved' ? 'line-through' : 'none' }}>
                  {d.text}
                </p>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                  {d.author ? d.author : 'Anonymous'}{d.status === 'resolved' ? ' · resolved' : ''}
                </span>
              </div>
              {d.status === 'open' && !isTeacher && (
                <button
                  onClick={() => handleUpvote(d._id)}
                  title="I have this doubt too"
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                    background: d.hasUpvoted ? '#dbeafe' : 'white', border: '1px solid #e5e7eb',
                    borderRadius: '8px', padding: '4px 8px', cursor: 'pointer',
                    color: d.hasUpvoted ? '#1e40af' : '#6b7280', fontSize: '12px', fontWeight: 700
                  }}
                >
                  ▲ {d.upvoteCount}
                </button>
              )}
              {isTeacher && d.upvoteCount > 0 && (
                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 700, alignSelf: 'center' }}>▲ {d.upvoteCount}</span>
              )}
              {isTeacher && d.status === 'open' && (
                <button
                  onClick={() => handleResolve(d._id)}
                  style={{
                    background: '#059669', color: 'white', border: 'none', borderRadius: '8px',
                    padding: '6px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', alignSelf: 'center'
                  }}
                >
                  ✓ Resolve
                </button>
              )}
              {(isTeacher || d.isOwner) && (
                <button
                  onClick={() => handleDelete(d._id)}
                  title="Delete"
                  style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '14px', alignSelf: 'center' }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DoubtsPanel
