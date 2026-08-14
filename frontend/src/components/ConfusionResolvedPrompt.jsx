import React, { useEffect, useState, useCallback } from 'react'
import { useSocketStore } from '../stores/socketStore.js'
import { confusionApi } from '../lib/api.js'
import sounds from '../lib/sounds.js'

/**
 * ConfusionResolvedPrompt -- student-side popup shown after the teacher
 * marks a confusion event as resolved.
 *
 * Listens on the global socket for 'confusion:resolved' and surfaces a
 * minimal "Has your doubt been resolved?" card with two buttons:
 *   ✅ Understood       -> POST /api/confusion/event/:id/feedback { answer: 'understood' }
 *   ❌ Still Confused   -> POST /api/confusion/event/:id/feedback { answer: 'still_confused' }
 *                         (also reopens the event server-side)
 *
 * Disappears after either response, or after 90s of inactivity.
 */
export default function ConfusionResolvedPrompt ({ roomId }) {
  const socket = useSocketStore(s => s.socket)
  const [prompt, setPrompt] = useState(null) // { eventId, topic, receivedAt }
  const [submitting, setSubmitting] = useState(false)
  const [responded, setResponded] = useState(null) // 'understood' | 'still_confused' | null

  // Subscribe to the socket event
  useEffect(() => {
    if (!socket) return
    const onResolved = (data) => {
      if (!data) return
      if (roomId && String(data.roomId) !== String(roomId)) return
      setPrompt({
        eventId: data.eventId,
        topic: data.topic,
        closedAt: data.closedAt,
        receivedAt: Date.now()
      })
      setResponded(null)
      // BUG FIX (recovery poll, second iteration): the success path of
      // respond() never resets `submitting`, so it stays true forever
      // and disables the buttons on every subsequent "Are you clear now?"
      // prompt. Force-reset here so a new prompt is always interactive.
      setSubmitting(false)
      try { sounds.tap() } catch {}
    }
    socket.on('confusion:resolved', onResolved)
    return () => { socket.off('confusion:resolved', onResolved) }
  }, [socket, roomId])

  // Auto-dismiss after 90s of no interaction
  useEffect(() => {
    if (!prompt) return
    if (responded) return
    const t = setTimeout(() => setPrompt(null), 90000)
    return () => clearTimeout(t)
  }, [prompt, responded])

  const respond = useCallback(async (answer) => {
    if (!prompt || submitting) return
    setSubmitting(true)
    try {
      await confusionApi.submitFeedback(prompt.eventId, answer)
      setResponded(answer)
      try { sounds.tap() } catch {}
      // Fade out after a short pause so the user sees their pick.
      // BUG FIX (recovery poll, second iteration): `submitting` must be
      // reset on the success path too -- otherwise it stays true forever
      // and the buttons on every subsequent prompt stay disabled, even
      // though the popup technically re-appears for a new event.
      setSubmitting(false)
      setTimeout(() => setPrompt(null), 1400)
    } catch (e) {
      console.error('[ConfusionResolvedPrompt] feedback failed:', e?.message)
      setSubmitting(false)
    }
  }, [prompt, submitting])

  if (!prompt) return null

  const topicLabel = (typeof prompt.topic === 'string' ? prompt.topic : (prompt.topic?.label || '')) || 'this topic'

  if (responded) {
    return (
      <div className="crp-shell crp-shell--done" role="status" aria-live="polite">
        <span aria-hidden="true">{responded === 'understood' ? '✅' : '❌'}</span>
        <span className="crp-text">
          {responded === 'understood'
            ? `Glad it clicked. Teacher has been notified.`
            : `Got it — teacher will revisit ${topicLabel}.`}
        </span>
      </div>
    )
  }

  return (
    <div className="crp-shell" role="dialog" aria-live="polite" aria-label="Has your doubt been resolved?">
      <div className="crp-head">
        <span className="crp-icon" aria-hidden="true">💡</span>
        <div className="crp-title">Did this explanation help?</div>
      </div>
      <div className="crp-sub">
        Teacher closed the confusion alert on <strong>{topicLabel}</strong>.
      </div>
      <div className="crp-actions">
        <button
          type="button"
          className="crp-btn crp-btn--yes"
          disabled={submitting}
          onClick={() => respond('understood')}
        >
          ✅ Understood
        </button>
        <button
          type="button"
          className="crp-btn crp-btn--no"
          disabled={submitting}
          onClick={() => respond('still_confused')}
        >
          ❌ Still Confused
        </button>
      </div>
    </div>
  )
}