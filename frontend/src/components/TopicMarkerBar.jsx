import React, { useState, useEffect, useCallback, useRef } from 'react'
import { topicApi } from '../lib/api.js'
import { useTeacherPositionStore, formatMs } from '../stores/teacherPositionStore.js'
import { useSocketStore } from '../stores/socketStore.js'

/**
 * TopicMarkerBar — teacher-only inline editor for topic markers.
 *
 * Shows the current topic (based on recordingOffsetMs) plus a button to
 * "Mark now" or edit the label. Teachers can drop markers at any time
 * during the lecture; they'll show up on the confusion-spike dashboard.
 *
 * Late markers (after a spike happened) still apply retroactively to any
 * doubt signal in the same time window.
 *
 * Props:
 *   - roomId, roomCode
 *   - editable (default true) -- teacher mode
 */
export default function TopicMarkerBar ({ roomId, roomCode, editable = true }) {
  const teacherPos = useTeacherPositionStore(s => s.lastPosition)
  const roomStartedAt = useTeacherPositionStore(s => s.roomStartedAt)
  const sessionActive = useTeacherPositionStore(s => s.sessionActive)
  const socket = useSocketStore(s => s.socket)

  const [topics, setTopics] = useState([])
  const [editing, setEditing] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftNote, setDraftNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const inputRef = useRef(null)

  const fetchTopics = useCallback(async () => {
    if (!roomId) return
    try {
      const r = await topicApi.list(roomId)
      setTopics(r.topics || [])
    } catch (e) {
      // Non-fatal -- teacher can still type a marker
    }
  }, [roomId])

  useEffect(() => { fetchTopics() }, [fetchTopics])

  // Socket updates
  useEffect(() => {
    if (!socket) return
    const onSet = (data) => {
      if (data?.marker) fetchTopics()
    }
    const onDelete = () => fetchTopics()
    socket.on('teacher:topic-set', onSet)
    socket.on('teacher:topic-delete', onDelete)
    return () => {
      socket.off('teacher:topic-set', onSet)
      socket.off('teacher:topic-delete', onDelete)
    }
  }, [socket, fetchTopics])

  // Find current topic based on recording offset
  const currentOffsetMs = teacherPos?.recordingOffsetMs ?? null
  const currentTopic = (() => {
    if (currentOffsetMs == null) return null
    return topics.find(t =>
      t.startMs <= currentOffsetMs && (t.endMs == null || t.endMs > currentOffsetMs)
    ) || null
  })()
  const nextTopic = (() => {
    if (currentOffsetMs == null) return null
    return topics.find(t => t.startMs > currentOffsetMs) || null
  })()

  const handleMarkNow = async () => {
    if (currentOffsetMs == null) {
      setError('No recording clock yet -- start the session first')
      return
    }
    setError('')
    setEditing(true)
    setDraftLabel('')
    setDraftNote('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleSave = async () => {
    if (!draftLabel.trim()) {
      setError('Label required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const r = await topicApi.set(roomId, {
        startMs: editingId
          ? topics.find(t => t._id === editingId)?.startMs ?? currentOffsetMs
          : currentOffsetMs,
        label: draftLabel.trim(),
        note: draftNote.trim()
      })
      if (r.success) {
        setEditing(false)
        setDraftLabel('')
        setDraftNote('')
        setEditingId(null)
        // Broadcast to other clients (incl. students)
        socket?.emit('teacher:topic-set', {
          roomId, roomCode,
          markerId: r.marker._id,
          startMs: r.marker.startMs,
          label: r.marker.label,
          note: r.marker.note
        })
        fetchTopics()
      } else {
        setError(r.error || 'Failed to save')
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (markerId) => {
    try {
      await topicApi.remove(roomId, markerId)
      socket?.emit('teacher:topic-delete', { roomId, roomCode, markerId })
      fetchTopics()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleConfirm = async (markerId) => {
    // Reuse setTopic semantics: posting same startMs replaces the marker.
    // We don't have the original label here without the topics state; fetch fresh list.
    const marker = topics.find(t => t._id === markerId)
    if (!marker) return
    try {
      // Force-confirm by sending same startMs + same label; backend replaces. We
      // mark confirmed=true via a dedicated path -- simpler: emit a socket patch.
      // For now use setTopic which replaces -- but we want confirmed=true not 'manual'.
      // Lightweight: rely on a backend PATCH. Since we don't have one, do this via setTopic
      // and accept that it flips source to 'manual'. (Honest UX tradeoff -- see notes.)
      const r = await topicApi.set(roomId, {
        startMs: marker.startMs,
        label: marker.label,
        note: marker.note
      })
      if (r.success) {
        socket?.emit('teacher:topic-set', { roomId, roomCode, marker: r.marker })
        fetchTopics()
      }
    } catch (e) {
      setError(e.message)
    }
  }

  const handleEditExisting = (marker) => {
    setEditing(true)
    setDraftLabel(marker.label)
    setDraftNote(marker.note || '')
    setEditingId(marker._id)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleCancel = () => {
    setEditing(false)
    setDraftLabel('')
    setDraftNote('')
    setEditingId(null)
    setError('')
  }

  return (
    <div className="tmb-bar">
      <div className="tmb-header">
        <div className="tmb-title">
          <span className="tmb-icon">📚</span>
          <span>Topics</span>
          <span className="tmb-count">{topics.length}</span>
        </div>
        {editable && sessionActive && currentOffsetMs != null && !editing && (
          <button type="button" className="tmb-mark-btn" onClick={handleMarkNow}>
            + Mark this moment
          </button>
        )}
      </div>

      {editing && (
        <div className="tmb-editor">
          <div className="tmb-editor-time">
            <span className="tmb-time-icon">🕐</span>
            <span className="tmb-time-label">{formatMs(currentOffsetMs)}</span>
            <span className="tmb-editor-hint">Recording clock</span>
          </div>
          <input
            ref={inputRef}
            type="text"
            placeholder="Topic label (e.g. Glycolysis — Investment Phase)"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            className="tmb-input"
            maxLength={120}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') handleCancel()
            }}
          />
          <input
            type="text"
            placeholder="Note (optional)"
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            className="tmb-input tmb-input--note"
            maxLength={240}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') handleCancel()
            }}
          />
          {error && <div className="tmb-error">{error}</div>}
          <div className="tmb-editor-actions">
            <button type="button" className="tmb-btn tmb-btn--ghost" onClick={handleCancel} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="tmb-btn tmb-btn--primary" onClick={handleSave} disabled={saving || !draftLabel.trim()}>
              {saving ? 'Saving…' : 'Save marker'}
            </button>
          </div>
        </div>
      )}

      {!editing && currentTopic && (
        <div className="tmb-current">
          <span className="tmb-current-label">📍 Now teaching:</span>
          <span className="tmb-current-name">{currentTopic.label}</span>
          {currentTopic.note && <span className="tmb-current-note">— {currentTopic.note}</span>}
        </div>
      )}

      {!editing && topics.length > 0 && (
        <ol className="tmb-timeline">
          {topics.map((t) => {
            const isCurrent = currentTopic && currentTopic._id === t._id
            const isAuto = t.source === 'auto'
            const confirmed = t.confirmed === true
            return (
              <li key={t._id} className={`tmb-topic${isCurrent ? ' tmb-topic--current' : ''}${isAuto && !confirmed ? ' tmb-topic--auto' : ''}`}>
                <span className="tmb-topic-time">
                  🕐 {formatMs(t.startMs)}{t.endMs != null ? `–${formatMs(t.endMs)}` : '–…'}
                </span>
                <span className="tmb-topic-label">
                  {t.label}
                  {isAuto && !confirmed && (
                    <span className="tmb-topic-source" title={`AI-extracted from live transcript (confidence ${Math.round((t.confidence || 0) * 100)}%)`}>auto · {Math.round((t.confidence || 0) * 100)}%</span>
                  )}
                  {isAuto && confirmed && (
                    <span className="tmb-topic-source tmb-topic-source--confirmed">✓ confirmed</span>
                  )}
                </span>
                {t.note && <span className="tmb-topic-note">— {t.note}</span>}
                {editable && (
                  <span className="tmb-topic-actions">
                    {isAuto && !confirmed && (
                      <button
                        type="button"
                        className="tmb-topic-action tmb-topic-action--confirm"
                        onClick={() => handleConfirm(t._id)}
                        aria-label="Confirm auto topic"
                        title="Mark as confirmed (this topic label is correct)"
                      >✓</button>
                    )}
                    {editable && (
                      <button
                        type="button"
                        className="tmb-topic-action tmb-topic-action--edit"
                        onClick={() => handleEditExisting(t)}
                        aria-label="Edit topic"
                        title="Edit topic"
                      >✎</button>
                    )}
                    <button
                      type="button"
                      className="tmb-topic-action tmb-topic-action--del"
                      onClick={() => handleDelete(t._id)}
                      aria-label="Delete topic"
                      title="Delete topic"
                    >×</button>
                  </span>
                )}
              </li>
            )
          })}
          {nextTopic && (
            <li className="tmb-topic tmb-topic--upcoming">
              <span className="tmb-topic-time">
                🕐 {formatMs(nextTopic.startMs)}
              </span>
              <span className="tmb-topic-label">{nextTopic.label}</span>
              <span className="tmb-topic-note">(upcoming)</span>
            </li>
          )}
        </ol>
      )}

      {!editing && topics.length === 0 && editable && sessionActive && (
        <div className="tmb-empty">
          No topics yet. Hit <strong>+ Mark this moment</strong> when you start a new section — students will see it instantly on the spike dashboard.
        </div>
      )}

      {!editing && topics.length === 0 && !editable && (
        <div className="tmb-empty">The teacher hasn't marked any topics yet for this lecture.</div>
      )}
    </div>
  )
}