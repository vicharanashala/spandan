import React, { useEffect, useState, useCallback, useRef } from 'react'
import { confusionApi } from '../lib/api.js'
import { useSocketStore } from '../stores/socketStore.js'
import { useAuthStore } from '../stores/authStore.js'
import sounds from '../lib/sounds.js'

/**
 * ConfusionAlertCard -- THE single live confusion card per room.
 *
 * Milestone 3 redesign:
 *   - Tier-styled shell (green/yellow/red) based on backend `tier.name`
 *   - Animated count-up when the student count rises
 *   - Status pill (Live / Resolved) + pulsing dot when active
 *   - Topic source badge (AI / Teacher / Snippet)
 *   - Subtopic line, latest transcript snippet
 *   - Priority score badge with tier emoji
 *
 * History is owned by <ConfusionTimeline /> -- this card only shows the live
 * card (or the most recent if no active event exists).
 *
 * Empty states:
 *   - loading
 *   - "No students have reported confusion yet."
 *   - "Start recording to enable topic-aware confusion detection."
 */
export default function ConfusionAlertCard ({ roomId, hasTranscript = true }) {
  const socket = useSocketStore(s => s.socket)
  const userRole = useAuthStore(s => s.user?.role)
  const isTeacher = userRole === 'teacher' || userRole === 'admin'
  const [event, setEvent] = useState(null)
  const [latest, setLatest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [displayCount, setDisplayCount] = useState(0)
  const [pulseKey, setPulseKey] = useState(0)
  const prevCountRef = useRef(0)
  // RESOLVED PROMPT: feedback tally for the teacher dashboard
  const [feedbackTally, setFeedbackTally] = useState({ understood: 0, stillConfused: 0, expectedRespondents: 0, needsMoreExplanation: false, autoClosed: false, reopenedCount: 0 })
  const [resolving, setResolving] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!roomId) return
    try {
      const [active, latestRes] = await Promise.all([
        confusionApi.getActive(roomId).catch(() => ({ event: null })),
        confusionApi.getLatest(roomId).catch(() => ({ event: null }))
      ])
      setEvent(active.event || null)
      setLatest(latestRes.event || null)
      setError('')
    } catch (e) {
      setError(e?.message || 'Failed to fetch confusion data')
    } finally {
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 8000)
    // Also refresh when the tab becomes visible again (handles the case
    // where the teacher switched tabs and missed several socket events).
    const onVisibility = () => { if (!document.hidden) fetchAll() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchAll])

  useEffect(() => {
    if (!socket) return
    const onUpdate = (data) => {
      if (String(data.roomId) !== String(roomId)) return
      setEvent(data.event)
      setLatest(data.event)
    }
    const onClosed = (data) => {
      if (String(data.roomId) !== String(roomId)) return
      setEvent(null)
      if (data.event) setLatest(data.event)
    }
    // RESOLVED PROMPT: teacher-initiated close -> flash a brief banner on
    // the card (the popup for students is rendered by ConfusionResolvedPrompt).
    const onResolved = (data) => {
      if (String(data.roomId) !== String(roomId)) return
      if (data.event) setLatest(data.event)
      setEvent(null)
      // Reset tally for the next event (the resolved one is done).
      setFeedbackTally({
      understood: 0,
      stillConfused: 0,
      expectedRespondents: data.expectedRespondents || 0,
      needsMoreExplanation: false,
      autoClosed: false,
      reopenedCount: 0
    })
      try { sounds.tap() } catch {}
    }
    // RESOLVED PROMPT: student responded -> update running tally on this card.
    const onFeedback = (data) => {
      if (String(data.roomId) !== String(roomId)) return
      setFeedbackTally({
        understood: data.understood || 0,
        stillConfused: data.stillConfused || 0,
        expectedRespondents: data.expectedRespondents || 0,
        needsMoreExplanation: !!data.needsMoreExplanation,
        autoClosed: !!data.autoClosed,
        reopenedCount: data.reopenedCount || 0
      })
      // If a student said still_confused, the event is reopened -- bring
      // it back into the active state on the dashboard.
      if (data.reopened && data.eventId) {
        // Re-fetch so we get the reopened snapshot with up-to-date count.
        confusionApi.getActive(roomId).then(r => {
          if (r?.event) setEvent(r.event)
        }).catch(() => {})
      }
    }
    socket.on('confusion:update', onUpdate)
    socket.on('confusion:closed', onClosed)
    socket.on('confusion:resolved', onResolved)
    socket.on('confusion:feedback', onFeedback)
    // Poll boundary: when the teacher starts a new poll, clear all
    // dashboard state so the new poll starts fresh. The backend has
    // already closed any active ConfusionEvent and cleared its feedback
    // tally -- this listener just mirrors that on the UI immediately,
    // so we don't have to wait for the next poll interval (8s) to re-render.
    const onPollReset = (data) => {
      if (data && String(data.roomId) !== String(roomId)) return
      setEvent(null)
      setLatest(null)
      setFeedbackTally({
        understood: 0,
        stillConfused: 0,
        expectedRespondents: 0,
        needsMoreExplanation: false,
        autoClosed: false,
        reopenedCount: 0
      })
      prevCountRef.current = 0
      setDisplayCount(0)
    }
    socket.on('new_question', onPollReset)
    socket.on('question:started', onPollReset)
    socket.on('poll:reset', onPollReset)
    return () => {
      socket.off('confusion:update', onUpdate)
      socket.off('confusion:closed', onClosed)
      socket.off('confusion:resolved', onResolved)
      socket.off('confusion:feedback', onFeedback)
      socket.off('new_question', onPollReset)
      socket.off('question:started', onPollReset)
      socket.off('poll:reset', onPollReset)
    }
  }, [socket, roomId])

  // Animated count-up: when target count increases, tween 0 -> target over ~600ms
  const card = event || latest
  const targetCount = card?.confusedStudentCount || 0
  useEffect(() => {
    const from = prevCountRef.current
    const to = targetCount
    if (from === to) return
    prevCountRef.current = to
    setPulseKey(k => k + 1)
    if (from === 0) { setDisplayCount(to); return }
    const duration = 600
    const start = performance.now()
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setDisplayCount(Math.round(from + (to - from) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
      else setDisplayCount(to)
    }
    raf = requestAnimationFrame(tick)
    return () => raf && cancelAnimationFrame(raf)
  }, [targetCount])

  if (loading) {
    return (
      <div className="cac-shell cac-shell--idle" data-loading="true">
        <div className="cac-header">
          <h3>⚠ Live Confusion Alert</h3>
        </div>
        <div className="cac-body cac-body--loading">Loading…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="cac-shell cac-shell--idle">
        <div className="cac-header">
          <h3>⚠ Live Confusion Alert</h3>
        </div>
        <div className="cac-body cac-body--error">{error}</div>
      </div>
    )
  }

  if (!card) {
    return (
      <div className="cac-shell cac-shell--idle cac-shell--empty">
        <div className="cac-header">
          <h3>⚠ Live Confusion Alert</h3>
          <span className="cac-status cac-status--idle">No events</span>
        </div>
        <div className="cac-body cac-body--empty">
          <div className="cac-empty-icon">✅</div>
          <div>
            {hasTranscript
              ? 'No students have reported confusion yet.'
              : 'Start recording to enable topic-aware confusion detection.'}
          </div>
        </div>
      </div>
    )
  }

  const isActive = !!event
  const tierClass = tierToClass(card.tier?.name)
  const tierLabel = card.tier?.label || 'Info'
  const tierEmoji = card.tier?.emoji || '🟢'
  const sourceLabel = sourceToLabel(card.topic?.source)
  const sourceClass = sourceToClass(card.topic?.source)

  return (
    <div
      className={`cac-shell cac-shell--${tierClass}${isActive ? ' cac-shell--live' : ' cac-shell--resolved'}`}
      role="region"
      aria-label={isActive ? 'Active confusion alert' : 'Recent resolved confusion event'}
      data-tier={tierClass}
      data-status={isActive ? 'live' : 'resolved'}
    >
      <div className="cac-header">
        <h3>
          ⚠ Live Confusion Alert
          {isActive && (
            <span className="cac-live-dot" aria-label="live" key={`pulse-${pulseKey}`} />
          )}
        </h3>
        <div className="cac-header-right">
          <span className={`cac-source-badge ${sourceClass}`}>{sourceLabel}</span>
          <span className={`cac-status cac-status--${isActive ? 'live' : 'resolved'}`}>
            {isActive ? 'Live' : 'Resolved'}
          </span>
        </div>
      </div>

      <div className="cac-body">
        <div className="cac-row cac-row--topic">
          <div className="cac-row-label">Topic</div>
          <div className="cac-row-value cac-row-value--topic">
            {card.topic?.label || <em className="cac-muted">(no topic detected)</em>}
          </div>
        </div>

        {card.topic?.subtopic && (
          <div className="cac-row cac-row--subtopic">
            <div className="cac-row-label">Subtopic</div>
            <div className="cac-row-value">{card.topic.subtopic}</div>
          </div>
        )}

        <div className="cac-row cac-row--count">
          <div className="cac-row-label">Students Confused</div>
          <div className="cac-row-value cac-row-value--count">
            <span className="cac-count-num" key={`n-${displayCount}-${pulseKey}`}>{displayCount}</span>
            <span className="cac-count-suffix">
              {displayCount === 1 ? 'student' : 'students'}
            </span>
          </div>
        </div>

        <div className="cac-row cac-row--timestamps">
          <div>
            <div className="cac-row-label cac-row-label--small">Started</div>
            <div className="cac-row-value cac-row-value--small">{card.startedAtLabel || '—'}</div>
          </div>
          <div>
            <div className="cac-row-label cac-row-label--small">Last Updated</div>
            <div className="cac-row-value cac-row-value--small">{card.lastUpdateLabel || '—'}</div>
          </div>
          <div>
            <div className="cac-row-label cac-row-label--small">Duration</div>
            <div className="cac-row-value cac-row-value--small">
              {formatDuration(card.durationMs || 0)}
            </div>
          </div>
        </div>

        {card.latestTranscriptSnippet && (
          <div className="cac-row cac-row--snippet">
            <div className="cac-row-label">Latest Transcript</div>
            <div className="cac-row-snippet">
              “{card.latestTranscriptSnippet.slice(0, 220)}{card.latestTranscriptSnippet.length > 220 ? '…' : ''}”
            </div>
          </div>
        )}

        <div className="cac-row cac-row--meta">
          <div className="cac-meta-block">
            <div className="cac-row-label cac-row-label--small">Topic Source</div>
            <div className="cac-row-value cac-row-value--small">
              <span className={`cac-source-badge ${sourceClass}`}>{sourceLabel}</span>
            </div>
          </div>
          <div className="cac-meta-block">
            <div className="cac-row-label cac-row-label--small">Priority Tier</div>
            <div className="cac-row-value cac-row-value--small">
              <span className={`cac-tier-badge cac-tier-badge--${tierClass}`}>
                {tierEmoji} {tierLabel}
                {card.score != null ? ` · ${card.score.toFixed ? card.score.toFixed(1) : card.score}` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* RESOLVED PROMPT: teacher-only action area */}
        {isTeacher && (
          <div className="cac-row cac-row--actions">
            {isActive && (
              <button
                type="button"
                className="cac-btn cac-btn--resolve"
                disabled={resolving}
                onClick={async () => {
                  // card.id (not card._id) -- formatForClient returns { id, ... }
                  // and confusionApi.requestFeedback expects the string id.
                  if (!card?.id || resolving) return
                  setResolving(true)
                  try {
                    await confusionApi.requestFeedback(card.id)
                  } catch (e) {
                    console.error('[ConfusionAlertCard] request-feedback failed:', e?.message)
                  } finally {
                    setResolving(false)
                  }
                }}
              >
                {resolving ? 'Requesting…' : '📣 Ask Students: Did this help?'}
              </button>
            )}
            {(feedbackTally.expectedRespondents > 0 || feedbackTally.understood > 0 || feedbackTally.stillConfused > 0) && (() => {
              const u = feedbackTally.understood || 0
              const sc = feedbackTally.stillConfused || 0
              // Total confused students for THIS event: fixed for the event's
              // lifetime. Backend emits `expectedRespondents` =
              // `evt.confusedStudentCount` (the count when the event was
              // first recorded). We latch it once we see it so the total
              // does not move even as the live count changes.
              const total = Math.max(feedbackTally.expectedRespondents || 0, u + sc)
              const score = total > 0 ? Math.round((u / total) * 100) : 0
              const atFullRecovery = total > 0 && u >= total && sc === 0
              return (
                <div className="cac-recovery" aria-live="polite">
                  <div className="cac-recovery-title">Recovery</div>
                  <div className="cac-recovery-row cac-recovery-row--totals">
                    <span className="cac-recovery-pill cac-recovery-pill--total" data-testid="cac-recovery-total">
                      👥 Confused: {total}
                    </span>
                    <span className="cac-recovery-pill cac-recovery-pill--yes" data-testid="cac-recovery-understood">
                      ✅ Understood: {u}
                    </span>
                    <span className="cac-recovery-pill cac-recovery-pill--no" data-testid="cac-recovery-still">
                      ❌ Still Confused: {sc}
                    </span>
                  </div>
                  <div className="cac-recovery-row cac-recovery-row--score">
                    <span className="cac-recovery-score" data-score={score >= 70 ? 'good' : score >= 40 ? 'mid' : 'low'} data-testid="cac-recovery-score">
                      📊 Recovery: {u} / {total} ({score}%)
                    </span>
                    {/* Needs More Explanation badge: shown when ANY student
                        clicked Still Confused. Event stays active. */}
                    {feedbackTally.needsMoreExplanation && !atFullRecovery && (
                      <span className="cac-recovery-badge cac-recovery-badge--warn" data-testid="cac-recovery-needs-more" role="status">
                        ⚠ Needs More Explanation
                      </span>
                    )}
                    {atFullRecovery && (
                      <span className="cac-recovery-badge cac-recovery-badge--ok" data-testid="cac-recovery-resolved" role="status">
                        ✅ Fully Resolved
                      </span>
                    )}
                  </div>
                  {feedbackTally.needsMoreExplanation && (
                    <div className="cac-recovery-banner" role="status">
                      ⚠️ Needs More Explanation — {sc} {sc === 1 ? 'student is' : 'students are'} still confused.
                    </div>
                  )}
                  {feedbackTally.autoClosed && (
                    <div className="cac-recovery-banner cac-recovery-banner--ok">
                      ✅ Event closed — all {u} students understood.
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

function tierToClass (name) {
  switch (name) {
    case 'green': return 'green'
    case 'yellow': return 'yellow'
    case 'red': return 'red'
    default: return 'idle'
  }
}

function sourceToLabel (source) {
  switch (source) {
    case 'marker': return 'Teacher'
    case 'auto': return 'AI'
    case 'transcript': return 'Snippet'
    case 'latest_marker': return 'Recent'
    case 'latest_transcript': return 'Snippet'
    case 'student_utterance': return 'Student'
    case 'fallback': return 'General'
    case 'none': return 'No topic'
    default: return ''
  }
}

function sourceToClass (source) {
  switch (source) {
    case 'marker': return 'cac-source-badge--marker'
    case 'auto': return 'cac-source-badge--auto'
    case 'transcript': return 'cac-source-badge--transcript'
    case 'latest_marker': return 'cac-source-badge--marker'
    case 'latest_transcript': return 'cac-source-badge--transcript'
    case 'student_utterance': return 'cac-source-badge--student'
    case 'fallback': return 'cac-source-badge--fallback'
    case 'none': return 'cac-source-badge--none'
    default: return ''
  }
}

function formatDuration (ms) {
  if (!ms || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const s = sec % 60
  return `${min}:${String(s).padStart(2, '0')}`
}