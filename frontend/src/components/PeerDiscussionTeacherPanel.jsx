import React, { useState, useEffect, useCallback } from 'react'
import useSocketStore from '../stores/socketStore'
import { API_URL } from '../config.js'

const STATUS_LABEL = {
  pending: { text: 'Requested', color: '#f59e0b' },
  active: { text: 'Discussing', color: '#059669' },
  declined: { text: 'Declined', color: '#6b7280' },
  expired: { text: 'No response', color: '#6b7280' },
  ended: { text: 'Ended', color: '#6b7280' }
}

function PeerDiscussionTeacherPanel({ roomId, token }) {
  const { socket } = useSocketStore()
  const [discussions, setDiscussions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/peer/discussions/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) setDiscussions(data.discussions || [])
    } catch (err) {
      console.error('Failed to load peer discussions:', err)
    } finally {
      setLoading(false)
    }
  }, [roomId, token])

  useEffect(() => { if (roomId && token) load() }, [roomId, token, load])

  // Live-refresh whenever a request/match/decline/end happens anywhere in this room.
  useEffect(() => {
    if (!socket || !roomId) return
    socket.emit('peer:teacher:subscribe', { roomId })
    const onRefresh = () => load()
    socket.on('peer:teacher:refresh', onRefresh)
    return () => socket.off('peer:teacher:refresh', onRefresh)
  }, [socket, roomId, load])

  if (!loading && discussions.length === 0) return null

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '16px',
      padding: '24px',
      boxShadow: 'var(--card-shadow)',
      border: '1px solid var(--border-color)',
      marginBottom: '24px'
    }}>
      <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
        🤝 Peer Discussions
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
        Live view of students pairing up to discuss questions the class found tricky.
      </p>

      {loading ? (
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {discussions.map((d) => {
            const label = STATUS_LABEL[d.status] || { text: d.status, color: '#6b7280' }
            return (
              <div key={d._id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)'
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)' }}>
                    {d.requesterName} ↔ {d.partnerName}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {d.questionId?.question || 'Question'}
                  </p>
                </div>
                <span style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: label.color,
                  background: `${label.color}1a`,
                  padding: '4px 10px',
                  borderRadius: '999px',
                  whiteSpace: 'nowrap'
                }}>
                  {label.text}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PeerDiscussionTeacherPanel
