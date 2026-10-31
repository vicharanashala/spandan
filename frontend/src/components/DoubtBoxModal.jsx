import React, { useState, useEffect } from 'react'
import { API_URL } from '../config.js'
import { Check, Flame, MessageSquare, Send, ThumbsUp, Trash2, X } from 'lucide-react'
import { Ico } from './icons'

export default function DoubtBoxModal({ roomId, token, socket, isTeacher, onClose }) {
  const [doubts, setDoubts] = useState([])
  const [text, setText] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'popular' | 'unresolved'
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchDoubts()
  }, [roomId])

  useEffect(() => {
    if (!socket) return

    const handleNewDoubt = (newDoubt) => {
      setDoubts(prev => [newDoubt, ...prev.filter(d => d._id !== newDoubt._id)])
    }

    const handleUpvoted = ({ doubtId, upvoteCount }) => {
      setDoubts(prev => prev.map(d => d._id === doubtId ? { ...d, upvoteCount } : d))
    }

    const handleResolved = ({ doubtId, isResolved }) => {
      setDoubts(prev => prev.map(d => d._id === doubtId ? { ...d, isResolved } : d))
    }

    const handleDeleted = ({ doubtId }) => {
      setDoubts(prev => prev.filter(d => d._id !== doubtId))
    }

    socket.on('doubt:new', handleNewDoubt)
    socket.on('doubt:upvoted', handleUpvoted)
    socket.on('doubt:resolved', handleResolved)
    socket.on('doubt:deleted', handleDeleted)

    return () => {
      socket.off('doubt:new', handleNewDoubt)
      socket.off('doubt:upvoted', handleUpvoted)
      socket.off('doubt:resolved', handleResolved)
      socket.off('doubt:deleted', handleDeleted)
    }
  }, [socket, isTeacher])

  const fetchDoubts = async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`${API_URL}/doubts/${roomId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success && data.doubts) {
        setDoubts(data.doubts)
      }
    } catch (err) {
      console.error('Failed to fetch doubts:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePostDoubt = async (e) => {
    e.preventDefault()
    if (!text.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/doubts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ roomId, text: text.trim() })
      })
      const data = await res.json()
      if (res.ok && data.doubt) {
        setText('')
        setDoubts(prev => [data.doubt, ...prev.filter(d => d._id !== data.doubt._id)])
      }
    } catch (err) {
      console.error('Failed to post doubt:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleUpvote = async (doubtId) => {
    try {
      // Optimistic update
      setDoubts(prev => prev.map(d => {
        if (d._id === doubtId) {
          const nextUpvoted = !d.hasUpvoted
          return {
            ...d,
            hasUpvoted: nextUpvoted,
            upvoteCount: Math.max(0, d.upvoteCount + (nextUpvoted ? 1 : -1))
          }
        }
        return d
      }))

      const res = await fetch(`${API_URL}/doubts/${doubtId}/upvote`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        setDoubts(prev => prev.map(d => d._id === doubtId ? {
          ...d,
          upvoteCount: data.upvoteCount,
          hasUpvoted: data.hasUpvoted
        } : d))
      }
    } catch (err) {
      console.error('Failed to upvote doubt:', err)
      fetchDoubts()
    }
  }

  const handleToggleResolve = async (doubtId) => {
    try {
      const res = await fetch(`${API_URL}/doubts/${doubtId}/resolve`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        setDoubts(prev => prev.map(d => d._id === doubtId ? { ...d, isResolved: data.isResolved } : d))
      }
    } catch (err) {
      console.error('Failed to resolve doubt:', err)
    }
  }

  const handleDeleteDoubtItem = async (doubtId) => {
    if (!window.confirm('Delete this doubt? It will be removed immediately for everyone.')) return
    try {
      const res = await fetch(`${API_URL}/doubts/${doubtId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        setDoubts(prev => prev.filter(d => d._id !== doubtId))
      }
    } catch (err) {
      console.error('Failed to delete doubt:', err)
    }
  }

  const filteredDoubts = doubts.filter(d => {
    if (filter === 'unresolved') return !d.isResolved
    return true
  }).sort((a, b) => {
    if (filter === 'popular') return b.upvoteCount - a.upvoteCount
    return 0 // default server sort
  })

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(3px)',
      padding: '16px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        position: 'relative',
        width: 'min(580px, 100%)',
        maxHeight: '90vh',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-primary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(31, 75, 165, 0.12)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px'
            }}>
              <Ico as={MessageSquare} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Anonymous Doubt Box</h3>
              <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                {isTeacher ? 'Popular student doubts and questions' : 'Ask questions anonymously • Upvote doubts you share'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              borderRadius: '6px'
            }}
          >
            <Ico as={X} size={18} />
          </button>
        </div>

        {/* Anonymous Doubt Box Banner */}
        {!isTeacher ? (
          <div style={{
            padding: '9px 20px',
            background: 'rgba(37, 99, 235, 0.08)',
            borderBottom: '1px solid rgba(37, 99, 235, 0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: 'var(--text-primary)'
          }}>
            <span style={{ fontSize: '14px' }}>🔒</span>
            <span style={{ lineHeight: 1.4 }}>
              <strong>100% Anonymous to Everyone:</strong> Ask your doubts freely. Your name and email are completely hidden from classmates and the teacher.
            </span>
          </div>
        ) : (
          <div style={{
            padding: '9px 20px',
            background: 'rgba(16, 185, 129, 0.08)',
            borderBottom: '1px solid rgba(16, 185, 129, 0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: 'var(--text-primary)'
          }}>
            <span style={{ fontSize: '14px' }}>🛡️</span>
            <span style={{ lineHeight: 1.4 }}>
              <strong>Teacher Moderation Mode:</strong> Review questions live. You can mark doubts as addressed (✓) or delete (🗑️) any off-topic posts.
            </span>
          </div>
        )}

        {/* Filter Bar */}
        <div style={{
          padding: '10px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          gap: '8px',
          background: 'var(--bg-card)'
        }}>
          {[
            { id: 'all', label: `All (${doubts.length})` },
            { id: 'popular', label: '🔥 Most Upvoted' },
            { id: 'unresolved', label: `Unresolved (${doubts.filter(d => !d.isResolved).length})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              style={{
                padding: '5px 12px',
                borderRadius: '20px',
                border: filter === tab.id ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                background: filter === tab.id ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--bg-primary)',
                color: filter === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Doubts List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          minHeight: '220px'
        }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading doubts...</div>
          ) : filteredDoubts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>💭</div>
              <p style={{ margin: 0, fontWeight: 600 }}>No doubts yet!</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                {isTeacher ? 'Student doubts will appear here live during the lecture.' : 'Have a question? Type it anonymously below.'}
              </p>
            </div>
          ) : (
            filteredDoubts.map(doubt => (
              <div
                key={doubt._id}
                style={{
                  padding: '14px 16px',
                  background: doubt.isResolved ? 'color-mix(in srgb, #10b981 8%, transparent)' : 'var(--bg-primary)',
                  border: `1px solid ${doubt.isResolved ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-color)'}`,
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      color: 'var(--text-secondary)',
                      fontWeight: 600
                    }}>
                      Anonymous Student
                    </span>
                    {doubt.isResolved && (
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#059669',
                        borderRadius: '12px',
                        fontWeight: 700
                      }}>
                        ✓ Addressed by Teacher
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                    {doubt.text}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  {/* Upvote Button */}
                  <button
                    onClick={() => handleToggleUpvote(doubt._id)}
                    title="Upvote this doubt"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 10px',
                      background: doubt.hasUpvoted ? 'rgba(31, 75, 165, 0.15)' : 'var(--bg-card)',
                      color: doubt.hasUpvoted ? 'var(--accent)' : 'var(--text-secondary)',
                      border: `1px solid ${doubt.hasUpvoted ? 'var(--accent)' : 'var(--border-color)'}`,
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <Ico as={ThumbsUp} size={14} />
                    <span>{doubt.upvoteCount || 0}</span>
                  </button>

                  {/* Teacher Moderation Actions: Resolve and Delete */}
                  {isTeacher && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => handleToggleResolve(doubt._id)}
                        title={doubt.isResolved ? 'Mark as unresolved' : 'Mark as addressed'}
                        style={{
                          padding: '4px 8px',
                          background: doubt.isResolved ? '#10b981' : 'var(--bg-card)',
                          color: doubt.isResolved ? '#ffffff' : 'var(--text-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          cursor: 'pointer'
                        }}
                      >
                        <Ico as={Check} size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteDoubtItem(doubt._id)}
                        title="Delete this post (removes for everyone)"
                        style={{
                          padding: '4px 8px',
                          background: 'rgba(239, 68, 68, 0.12)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          cursor: 'pointer'
                        }}
                      >
                        <Ico as={Trash2} size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input Bar (Students can submit doubts) */}
        {!isTeacher && (
          <form onSubmit={handlePostDoubt} style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
            display: 'flex',
            gap: '10px'
          }}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your question anonymously (max 500 chars)..."
              maxLength={500}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              disabled={!text.trim() || isSubmitting}
              style={{
                padding: '10px 18px',
                background: text.trim() ? 'var(--accent)' : 'var(--border-color)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '13.5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: text.trim() ? 'pointer' : 'default'
              }}
            >
              <Ico as={Send} size={14} /> Post
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
