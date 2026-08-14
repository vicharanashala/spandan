import React, { useState, useEffect, useCallback } from 'react'
import { confusionApi } from '../lib/api.js'
import { useSocketStore } from '../stores/socketStore.js'

/**
 * ConfusionTimeline -- history view of all confusion events for a room.
 *
 * Reads from GET /api/confusion/room/:roomId (newest first). Each row is
 * expandable to see topic/subtopic/source/score/started/duration.
 *
 * History-only -- the live alert is owned by <ConfusionAlertCard />.
 *
 * Empty states:
 *   - "No students have reported confusion yet."
 *   - "Start recording to enable topic-aware confusion detection."
 */
export default function ConfusionTimeline ({ roomId }) {
  const socket = useSocketStore(s => s.socket)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const fetchHistory = useCallback(async () => {
    if (!roomId) return
    try {
      const r = await confusionApi.getHistory(roomId, 50)
      setEvents(Array.isArray(r.events) ? r.events : [])
      setError('')
    } catch (e) {
      setError(e?.message || 'Failed to fetch history')
    } finally {
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => {
    fetchHistory()
    const t = setInterval(fetchHistory, 12000)
    return () => clearInterval(t)
  }, [fetchHistory])

  useEffect(() => {
    if (!socket) return
    const onUpdate = (data) => {
      if (String(data.roomId) !== String(roomId)) return
      fetchHistory()
    }
    const onClosed = (data) => {
      if (String(data.roomId) !== String(roomId)) return
      fetchHistory()
    }
    socket.on('confusion:update', onUpdate)
    socket.on('confusion:closed', onClosed)
    return () => {
      socket.off('confusion:update', onUpdate)
      socket.off('confusion:closed', onClosed)
    }
  }, [socket, roomId, fetchHistory])

  if (loading) {
    return (
      <div className="ctl-shell">
        <div className="ctl-header"><h3>📜 Timeline</h3></div>
        <div className="ctl-loading">Loading history…</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="ctl-shell">
        <div className="ctl-header"><h3>📜 Timeline</h3></div>
        <div className="ctl-error">{error}</div>
      </div>
    )
  }

  return (
    <div className="ctl-shell">
      <div className="ctl-header">
        <h3>📜 Timeline</h3>
        <span className="ctl-subtitle">
          {events.length} event{events.length === 1 ? '' : 's'}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="ctl-empty">
          No students have reported confusion yet.
        </div>
      ) : (
        <ol className="ctl-list">
          {events.map((e) => {
            const isOpen = expandedId === e.id
            const tierClass = e.tier?.name && ['green', 'yellow', 'red'].includes(e.tier.name)
              ? `ctl-row--${e.tier.name}` : ''
            return (
              <li
                key={e.id}
                className={`ctl-row ${tierClass}${isOpen ? ' ctl-row--open' : ''}`}
              >
                <button
                  type="button"
                  className="ctl-row-head"
                  onClick={() => setExpandedId(isOpen ? null : e.id)}
                  aria-expanded={isOpen}
                >
                  <div className="ctl-row-main">
                    <div className="ctl-row-topic">
                      {e.topic?.label || <em className="cac-muted">(no topic)</em>}
                    </div>
                    <div className="ctl-row-meta">
                      <span className="ctl-row-count">{e.confusedStudentCount || 0}</span>
                      <span className="ctl-row-dot">·</span>
                      <span>{formatDuration(e.durationMs || 0)}</span>
                      <span className="ctl-row-dot">·</span>
                      <time>{e.startedAtLabel || '—'}</time>
                    </div>
                  </div>
                  <div className="ctl-row-status">
                    {e.status === 'active'
                      ? <span className="ctl-row-live">live</span>
                      : <span className="ctl-row-closed">closed</span>}
                    <span className="ctl-row-arrow">{isOpen ? '▾' : '▸'}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="ctl-row-body">
                    <div className="ctl-row-grid">
                      <div>
                        <div className="ctl-row-key">Topic</div>
                        <div className="ctl-row-val">{e.topic?.label || '—'}</div>
                      </div>
                      {e.topic?.subtopic && (
                        <div>
                          <div className="ctl-row-key">Subtopic</div>
                          <div className="ctl-row-val">{e.topic.subtopic}</div>
                        </div>
                      )}
                      <div>
                        <div className="ctl-row-key">Source</div>
                        <div className="ctl-row-val">{sourceToLabel(e.topic?.source)}</div>
                      </div>
                      <div>
                        <div className="ctl-row-key">Score</div>
                        <div className="ctl-row-val">
                          {e.score != null ? `${e.score.toFixed ? e.score.toFixed(1) : e.score}/100` : '—'}
                          {e.tier ? ` · ${e.tier.emoji || ''} ${e.tier.label || ''}` : ''}
                        </div>
                      </div>
                      <div>
                        <div className="ctl-row-key">Started</div>
                        <div className="ctl-row-val">{e.startedAtLabel || '—'}</div>
                      </div>
                      <div>
                        <div className="ctl-row-key">Last Update</div>
                        <div className="ctl-row-val">{e.lastUpdateLabel || '—'}</div>
                      </div>
                      <div>
                        <div className="ctl-row-key">Duration</div>
                        <div className="ctl-row-val">{formatDuration(e.durationMs || 0)}</div>
                      </div>
                      <div>
                        <div className="ctl-row-key">Signals</div>
                        <div className="ctl-row-val">{e.signalCount || 0}</div>
                      </div>
                    </div>
                    {e.latestTranscriptSnippet && (
                      <div className="ctl-row-snippet">
                        <div className="ctl-row-key">Latest Transcript</div>
                        <div className="ctl-snippet-text">
                          “{e.latestTranscriptSnippet.slice(0, 220)}{e.latestTranscriptSnippet.length > 220 ? '…' : ''}”
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function formatDuration (ms) {
  if (!ms || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const s = sec % 60
  if (min < 60) return `${min}:${String(s).padStart(2, '0')}`
  const h = Math.floor(min / 60)
  return `${h}:${String(min % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function sourceToLabel (source) {
  switch (source) {
    case 'marker': return 'Teacher'
    case 'auto': return 'AI'
    case 'transcript': return 'Snippet'
    case 'none': return 'No topic'
    default: return ''
  }
}