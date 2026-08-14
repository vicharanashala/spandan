import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { doubtApi } from '../lib/api.js'
import { useSocketStore } from '../stores/socketStore.js'
import { useTeacherPositionStore, formatMs } from '../stores/teacherPositionStore.js'

/**
 * ConfusionSpikePanel — live view for teachers during a room session.
 *
 * Three layers of detail (most → least):
 *   1. **Per-spike cards** — one per 5s bucket where ≥3 students got lost.
 *      Each card shows MM:SS, count, and the *exact utterance* students were
 *      hearing when they tapped "I'm lost".
 *   2. **Per-signal timeline** — every individual tap, in order. Lets the
 *      teacher replay "at 02:34 one student lost it; at 02:38 three more
 *      did; at 02:45 one retracted."
 *   3. **Bar chart** — segment-level overview, kept for the gestalt view.
 *
 * Props:
 *   - roomId
 *   - roomCode
 *   - refreshIntervalMs (default 5000)
 */
export default function ConfusionSpikePanel ({ roomId, roomCode, refreshIntervalMs = 5000 }) {
  const socket = useSocketStore(s => s.socket)
  const teacherPos = useTeacherPositionStore(s => s.lastPosition)
  const sessionActive = useTeacherPositionStore(s => s.sessionActive)
  const roomStartedAt = useTeacherPositionStore(s => s.roomStartedAt)

  const [segments, setSegments] = useState([])
  const [spikes, setSpikes] = useState([])
  const [signals, setSignals] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState(Date.now())
  const [view, setView] = useState('spikes') // 'spikes' | 'timeline' | 'chart'
  const [selectedSpike, setSelectedSpike] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!roomId) return
    try {
      const [agg, spike, tl, sig] = await Promise.all([
        doubtApi.getForRoom(roomId).catch(() => ({ segments: [] })),
        doubtApi.getSpikes(roomId).catch(() => ({ spikes: [], stats: null })),
        doubtApi.getTimelineSpikes(roomId, { bucketMs: 5000, minMarkCount: 3 }).catch(() => ({ spikes: [] })),
        doubtApi.getSignals(roomId, 200).catch(() => ({ signals: [] }))
      ])
      setSegments(agg.segments || [])
      setSpikes(spike.spikes || [])
      setStats(spike.stats || null)
      setSignals(sig.signals || [])
      setLastUpdate(Date.now())
      setError('')
    } catch (e) {
      setError(e?.message || 'Failed to fetch doubt data')
    } finally {
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, refreshIntervalMs)
    return () => clearInterval(t)
  }, [fetchAll, refreshIntervalMs])

  // Live updates from socket
  useEffect(() => {
    if (!socket) return
    const onNew = (data) => {
      if (String(data.roomId) !== String(roomId)) return
      setSegments(prev => {
        const idx = prev.findIndex(s => s.segmentIndex === data.segmentIndex)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = { ...next[idx], count: data.count }
          return next
        }
        return [...prev, { segmentIndex: data.segmentIndex, count: data.count }].sort((a, b) => a.segmentIndex - b.segmentIndex)
      })
      setLastUpdate(Date.now())
      // Refresh timeline + signals so the new tap shows up immediately
      Promise.all([
        doubtApi.getTimelineSpikes(roomId, { bucketMs: 5000, minMarkCount: 3 }).catch(() => ({ spikes: [] })),
        doubtApi.getSignals(roomId, 200).catch(() => ({ signals: [] }))
      ]).then(([tl, sig]) => {
        setSpikes(prev => [...prev]) // no-op to trigger render
        setSignals(sig.signals || [])
      }).catch(() => {})
    }
    socket.on('doubt:new', onNew)
    return () => socket.off('doubt:new', onNew)
  }, [socket, roomId])

  const maxCount = Math.max(1, ...segments.map(s => s.count))
  const totalSignals = signals.filter(s => !s.retracted).length
  const retractedCount = signals.filter(s => s.retracted).length
  const nowMs = teacherPos?.recordingOffsetMs ?? null

  // Group signals into per-spike buckets (same 5s bucket as backend)
  const signalsByBucket = useMemo(() => {
    const map = new Map()
    for (const sig of signals) {
      if (sig.retracted) continue
      const bucketKey = Math.floor((sig.recordingOffsetMs || 0) / 5000) * 5000
      if (!map.has(bucketKey)) map.set(bucketKey, [])
      map.get(bucketKey).push(sig)
    }
    return Array.from(map.entries())
      .map(([bucketMs, sigs]) => ({ bucketMs, signals: sigs, count: sigs.length }))
      .filter(b => b.count >= 3)
      .sort((a, b) => a.bucketMs - b.bucketMs)
  }, [signals])

  // Unique students lost
  const uniqueStudents = useMemo(() => {
    const set = new Set()
    for (const sig of signals) {
      if (!sig.retracted) set.add(sig.studentHashShort)
    }
    return set.size
  }, [signals])

  return (
    <div className="csp-panel" role="region" aria-label="Live confusion signals">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="csp-header">
        <div className="csp-header-title">
          <h3>🚩 Confusion signals</h3>
          <span className="csp-meta" title={`Last update ${new Date(lastUpdate).toLocaleTimeString()}`}>
            {loading
              ? 'Loading…'
              : `${uniqueStudents} student${uniqueStudents === 1 ? '' : 's'} lost · ${totalSignals} tap${totalSignals === 1 ? '' : 's'}${retractedCount > 0 ? ` · ${retractedCount} retracted` : ''}`}
          </span>
        </div>
        {nowMs != null && sessionActive && (
          <div className="csp-now">
            <span className="csp-now-dot" />
            <span className="csp-now-time">{formatMs(nowMs)}</span>
          </div>
        )}
        {!sessionActive && (
          <div className="csp-idle">⏸ No active session</div>
        )}
      </div>

      {/* ─── Tab bar ──────────────────────────────────────────────────── */}
      <div className="csp-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={view === 'spikes'}
          className={`csp-tab${view === 'spikes' ? ' csp-tab--active' : ''}`}
          onClick={() => setView('spikes')}
        >
          Spikes <span className="csp-tab-count">{signalsByBucket.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={view === 'timeline'}
          className={`csp-tab${view === 'timeline' ? ' csp-tab--active' : ''}`}
          onClick={() => setView('timeline')}
        >
          Timeline <span className="csp-tab-count">{signals.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={view === 'chart'}
          className={`csp-tab${view === 'chart' ? ' csp-tab--active' : ''}`}
          onClick={() => setView('chart')}
        >
          Chart
        </button>
      </div>

      {error && <div className="csp-error">{error}</div>}

      {/* ─── Empty state ──────────────────────────────────────────────── */}
      {!loading && signals.length === 0 && (
        <div className="csp-empty">
          <div className="csp-empty-icon">🟢</div>
          <div className="csp-empty-text">
            {sessionActive
              ? 'No signals yet — students are following along. The board will populate when someone taps "I\'m lost".'
              : 'No signals yet for this room. Start a recording session, then students can tap "I\'m lost" during the lecture.'}
          </div>
        </div>
      )}

      {/* ─── Tab: Spikes (default, most actionable) ───────────────────── */}
      {view === 'spikes' && signalsByBucket.length > 0 && (
        <div className="csp-spikes" role="tabpanel">
          <div className="csp-section-title">
            <span>⚠ Confusion spikes</span>
            <span className="csp-section-meta">≥3 students in a 5-second window</span>
          </div>
          <div className="csp-spike-grid">
            {signalsByBucket.map(bucket => {
              const isSelected = selectedSpike === bucket.bucketMs
              // Group by utterance to find the dominant thing being said
              const utteranceCounts = new Map()
              for (const sig of bucket.signals) {
                const u = (sig.utteranceSnapshot || '').trim() || '(no transcript)'
                utteranceCounts.set(u, (utteranceCounts.get(u) || 0) + 1)
              }
              const sortedUtterances = Array.from(utteranceCounts.entries())
                .sort((a, b) => b[1] - a[1])
              const dominantUtterance = sortedUtterances[0]?.[0] || '(no transcript)'
              const dominantCount = sortedUtterances[0]?.[1] || 0
              return (
                <button
                  key={bucket.bucketMs}
                  type="button"
                  className={`csp-spike${isSelected ? ' csp-spike--selected' : ''}`}
                  onClick={() => setSelectedSpike(isSelected ? null : bucket.bucketMs)}
                  aria-expanded={isSelected}
                >
                  <div className="csp-spike-top">
                    <span className="csp-spike-time">🕐 {formatMs(bucket.bucketMs)}</span>
                    <span className="csp-spike-count">{bucket.count} lost</span>
                  </div>
                  {(() => {
                    // Find a topic for any signal in this bucket (all share the same window)
                    const withTopic = bucket.signals.find(s => s.topic && s.topic.label)
                    const topicLabel = withTopic?.topic?.label
                    const topicSource = withTopic?.topic?.source
                    if (topicLabel) {
                      return (
                        <div className="csp-spike-topic">
                          <span className="csp-topic-icon">📚</span>
                          <span className="csp-topic-label">{topicLabel}</span>
                          {topicSource === 'auto' && (
                            <span className="csp-topic-badge csp-topic-badge--auto" title="AI-generated from live transcript">auto</span>
                          )}
                          {topicSource === 'transcript' && (
                            <span className="csp-topic-badge" title="Auto-detected from transcript (no teacher marker set)">snippet</span>
                          )}
                        </div>
                      )
                    }
                    return (
                      <div className="csp-spike-topic csp-spike-topic--empty">
                        <span className="csp-topic-icon">📚</span>
                        <span className="csp-topic-label">No topic marked</span>
                      </div>
                    )
                  })()}
                  <div className="csp-spike-utterance">
                    <span className="csp-utterance-label">You were saying:</span>
                    <span className="csp-utterance-text">{dominantUtterance.slice(0, 140)}{dominantUtterance.length > 140 ? '…' : ''}</span>
                    {sortedUtterances.length > 1 && (
                      <span className="csp-utterance-meta">+{sortedUtterances.length - 1} other phrase{sortedUtterances.length - 1 === 1 ? '' : 's'}</span>
                    )}
                  </div>
                  <div className="csp-spike-meta">
                    <span>{bucket.signals.length} tap{bucket.signals.length === 1 ? '' : 's'}</span>
                    <span>·</span>
                    <span>{new Set(bucket.signals.map(s => s.studentHashShort)).size} unique</span>
                    {sortedUtterances.length > 1 && (
                      <>
                        <span>·</span>
                        <span>{dominantCount}/{bucket.count} same phrase</span>
                      </>
                    )}
                  </div>
                  {isSelected && (
                    <div className="csp-spike-detail">
                      <div className="csp-detail-title">All signals at this moment</div>
                      <ul className="csp-detail-list">
                        {bucket.signals.map(sig => (
                          <li key={sig._id} className="csp-detail-item">
                            <span className="csp-detail-time">+{formatMs((sig.recordingOffsetMs || 0) - bucket.bucketMs).replace(/^00:/, '')}</span>
                            <span className="csp-detail-anon">anon #{sig.studentHashShort}</span>
                            <span className="csp-detail-text">{(sig.utteranceSnapshot || '(no transcript)').slice(0, 100)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── Tab: Timeline (every individual signal) ──────────────────── */}
      {view === 'timeline' && signals.length > 0 && (
        <div className="csp-timeline" role="tabpanel">
          <div className="csp-section-title">
            <span>📜 All signals in order</span>
            <span className="csp-section-meta">{signals.length} total</span>
          </div>
          <ol className="csp-timeline-list">
            {signals.map(sig => (
              <li key={sig._id} className={`csp-timeline-item${sig.retracted ? ' csp-timeline-item--retracted' : ''}`}>
                <div className="csp-timeline-time">
                  <span className="csp-timeline-time-label">{sig.recordingOffsetLabel}</span>
                  {nowMs != null && !sig.retracted && (
                    <span className="csp-timeline-time-rel">
                      {Math.max(0, Math.floor((nowMs - (sig.recordingOffsetMs || 0)) / 1000))}s ago
                    </span>
                  )}
                </div>
                <div className="csp-timeline-content">
                  <div className="csp-timeline-anon">
                    {sig.retracted ? '↩ retracted' : `anon #${sig.studentHashShort}`}
                  </div>
                  {sig.topic?.label && (
                    <div className="csp-timeline-topic">
                      📚 {sig.topic.label}
                      {sig.topic.source === 'auto' && <span className="csp-topic-badge csp-topic-badge--auto">auto</span>}
                      {sig.topic.source === 'transcript' && <span className="csp-topic-badge">snippet</span>}
                    </div>
                  )}
                  {sig.utteranceSnapshot && (
                    <div className="csp-timeline-utterance">"{sig.utteranceSnapshot.slice(0, 200)}{sig.utteranceSnapshot.length > 200 ? '…' : ''}"</div>
                  )}
                  {!sig.utteranceSnapshot && (
                    <div className="csp-timeline-utterance csp-timeline-utterance--empty">(no transcript captured for this moment)</div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ─── Tab: Chart (original gestalt view) ───────────────────────── */}
      {view === 'chart' && segments.length > 0 && (
        <div className="csp-chart-wrap" role="tabpanel">
          <div className="csp-chart" aria-label="Doubt count per segment">
            {segments.map(s => {
              const isSpike = spikes.some(sp => sp.segmentIndex === s.segmentIndex)
              const heightPct = (s.count / maxCount) * 100
              return (
                <div key={s.segmentIndex} className={`csp-bar-wrap${isSpike ? ' csp-bar-wrap--spike' : ''}`}>
                  <div className="csp-bar" style={{ height: `${heightPct}%` }}>
                    <span className="csp-bar-count">{s.count}</span>
                  </div>
                  <div className="csp-bar-label">S{s.segmentIndex}</div>
                </div>
              )
            })}
          </div>
          {stats && (
            <div className="csp-stats">
              mean {stats.mean.toFixed(1)} · σ {stats.stddev.toFixed(1)} · threshold {stats.threshold.toFixed(1)}
            </div>
          )}
        </div>
      )}

      {view === 'spikes' && signalsByBucket.length === 0 && signals.length > 0 && (
        <div className="csp-empty">
          <div className="csp-empty-icon">👍</div>
          <div className="csp-empty-text">
            No spikes — students are tapping, but never 3+ at the same moment. Check the Timeline tab to see individual signals.
          </div>
        </div>
      )}
    </div>
  )
}