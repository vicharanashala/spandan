import React, { useState, useEffect, useCallback } from 'react'
import { confusionApi } from '../lib/api.js'
import { useSocketStore } from '../stores/socketStore.js'

/**
 * TopicHeatmap -- ranked list of topics by aggregated confusion score.
 *
 * Pulls topic-heat buckets from GET /api/confusion/room/:roomId/topic-heat.
 * On socket events (confusion:update / confusion:closed) the list refreshes.
 *
 * Each row:
 *   [topic label]  [████ bar ░░░░░]  [score/100]
 *
 * Color of the bar matches the bucket's tier band (green/yellow/red).
 * Empty state: "No topic heat yet -- start recording or open a marker."
 */
export default function TopicHeatmap ({ roomId }) {
  const socket = useSocketStore(s => s.socket)
  const [buckets, setBuckets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchHeat = useCallback(async () => {
    if (!roomId) return
    try {
      const r = await confusionApi.getTopicHeat(roomId)
      setBuckets(Array.isArray(r.buckets) ? r.buckets : [])
      setError('')
    } catch (e) {
      setError(e?.message || 'Failed to fetch topic heat')
    } finally {
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => {
    fetchHeat()
    const t = setInterval(fetchHeat, 15000)
    return () => clearInterval(t)
  }, [fetchHeat])

  useEffect(() => {
    if (!socket) return
    const onUpdate = (data) => {
      if (String(data.roomId) !== String(roomId)) return
      fetchHeat()
    }
    const onClosed = (data) => {
      if (String(data.roomId) !== String(roomId)) return
      fetchHeat()
    }
    socket.on('confusion:update', onUpdate)
    socket.on('confusion:closed', onClosed)
    return () => {
      socket.off('confusion:update', onUpdate)
      socket.off('confusion:closed', onClosed)
    }
  }, [socket, roomId, fetchHeat])

  if (loading) {
    return (
      <div className="cth-shell">
        <div className="cth-header"><h3>🔥 Topic Heat</h3></div>
        <div className="cth-loading">Loading heatmap…</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="cth-shell">
        <div className="cth-header"><h3>🔥 Topic Heat</h3></div>
        <div className="cth-error">{error}</div>
      </div>
    )
  }

  const maxScore = buckets.reduce((m, b) => Math.max(m, b.score || 0), 1)

  return (
    <div className="cth-shell">
      <div className="cth-header">
        <h3>🔥 Topic Heat</h3>
        <span className="cth-subtitle">
          {buckets.length} topic{buckets.length === 1 ? '' : 's'}
        </span>
      </div>

      {buckets.length === 0 ? (
        <div className="cth-empty">
          No topic heat yet — start recording or open a marker.
        </div>
      ) : (
        <ol className="cth-list">
          {buckets.map((b, i) => {
            const tierClass = ['green', 'yellow', 'red'].includes(b.tier) ? b.tier : 'idle'
            const widthPct = maxScore > 0 ? Math.min(100, ((b.score || 0) / maxScore) * 100) : 0
            return (
              <li key={`${b.topicLabel}-${i}`} className={`cth-row cth-row--${tierClass}`}>
                <div className="cth-row-label">
                  <span className="cth-rank">#{i + 1}</span>
                  <span className="cth-topic">{b.topicLabel}</span>
                  <span className="cth-source">{sourceToLabel(b.topicSource)}</span>
                </div>
                <div className="cth-row-bar-wrap">
                  <div className="cth-row-bar">
                    <div
                      className={`cth-row-fill cth-row-fill--${tierClass}`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <span className="cth-row-score">
                    {b.score != null ? (b.score.toFixed ? b.score.toFixed(1) : b.score) : '—'}
                    {b.eventCount != null ? ` · ${b.eventCount}` : ''}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function sourceToLabel (source) {
  switch (source) {
    case 'marker': return 'teacher'
    case 'auto': return 'AI'
    case 'transcript': return 'snippet'
    default: return ''
  }
}