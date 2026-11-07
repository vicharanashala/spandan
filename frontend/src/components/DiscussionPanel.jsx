import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Clock3, Hand, Mic, MicOff, Play, Square, Users, X } from 'lucide-react'
import { ghostButton, Pill, primaryButton } from './AppUI'
import { createRecordingPipeline } from '../services/recordingPipelineService'
import { mergeTranscriptEntries } from '../lib/speakerTranscript'

export default function DiscussionPanel({ room, socket, user, teacher = false, isMobile = false, onStudentTranscript, onTranscriptUpdate }) {
  const [state, setState] = useState(null)
  const [connected, setConnected] = useState(!!socket?.connected)
  const [error, setError] = useState('')
  const [recording, setRecording] = useState(false)
  const [starting, setStarting] = useState(false)
  const [speakingStatus, setSpeakingStatus] = useState('Ready')
  const [ownTranscript, setOwnTranscript] = useState('')
  const pipeline = useRef(null)
  const stateRef = useRef(null)
  const seen = useRef(new Set())
  const transcriptCallback = useRef(onStudentTranscript)
  transcriptCallback.current = onStudentTranscript
  const transcriptUpdateCallback = useRef(onTranscriptUpdate)
  transcriptUpdateCallback.current = onTranscriptUpdate

  const stop = useCallback(() => {
    pipeline.current?.dispose()
    pipeline.current = null
    setStarting(false)
    setRecording(false)
    setSpeakingStatus('Ready')
  }, [])

  useEffect(() => {
    if (!socket || !room?.code) return
    stateRef.current = null
    seen.current.clear()
    setState(null)
    const sync = () => {
      setConnected(!!socket.connected)
      socket.emit('discussion:sync', { roomCode: room.code })
    }
    const update = next => {
      if (next.roomCode !== room.code) return
      const previous = stateRef.current
      if (previous && next.version < previous.version) return
      const studentId = String(user?._id)
      const previousSpeaker = previous?.speaker?.studentId === studentId
      const currentSpeaker = next.speaker?.studentId === studentId
      const grantChanged = previousSpeaker && currentSpeaker && previous.speaker.grant !== next.speaker.grant
      if (previous?.session !== next.session) seen.current.clear()

      let entries = [...(next.entries || [])]
      // Keep newer live entries when a delayed snapshot arrives after a reconnect.
      if (previous?.session === next.session) {
        entries = mergeTranscriptEntries(previous.entries || [], entries)
      }
      const merged = { ...next, entries: mergeTranscriptEntries([], entries) }
      for (const entry of merged.entries) {
        if (previous && !seen.current.has(entry.id) && entry.speakerRole === 'student') transcriptCallback.current?.(entry)
        seen.current.add(entry.id)
      }

      if (!merged.active || previousSpeaker && (!currentSpeaker || grantChanged) || previous?.session !== merged.session) {
        stop()
        if (!currentSpeaker || grantChanged) setOwnTranscript('')
      }
      setState(merged)
      setError('')
      setConnected(!!socket.connected)
      stateRef.current = merged
      transcriptUpdateCallback.current?.({ session: merged.session, active: merged.active, entries: merged.entries })
    }
    const transcript = data => {
      const previous = stateRef.current
      if (data.roomCode !== room.code || !previous || data.session !== previous.session || seen.current.has(data.entry.id)) return
      seen.current.add(data.entry.id)
      const next = { ...previous, entries: mergeTranscriptEntries(previous.entries, [data.entry]) }
      stateRef.current = next
      setState(next)
      if (data.entry.speakerRole === 'student') transcriptCallback.current?.(data.entry)
      transcriptUpdateCallback.current?.({ session: next.session, active: next.active, entries: next.entries })
    }
    const failure = data => { if (data.roomCode === room.code) setError(data.message) }
    const disconnected = () => { setConnected(false); stop() }
    const authenticated = data => { if (!data.success) disconnected() }
    const ended = () => {
      stop()
      setOwnTranscript('')
      setState(current => current ? { ...current, active: false, speaker: null } : current)
    }

    socket.on('discussion:update', update)
    socket.on('discussion:transcript', transcript)
    socket.on('discussion:error', failure)
    socket.on('disconnect', disconnected)
    socket.on('authenticated', authenticated)
    socket.on('room:ended', ended)
    if (socket.connected) sync()
    return () => {
      stop()
      socket.off('discussion:update', update)
      socket.off('discussion:transcript', transcript)
      socket.off('discussion:error', failure)
      socket.off('authenticated', authenticated)
      socket.off('disconnect', disconnected)
      socket.off('room:ended', ended)
    }
  }, [socket, room?.code, user?._id, stop])

  useEffect(() => {
    if (room?.endedAt) {
      stop()
      setOwnTranscript('')
      setState(current => current ? { ...current, active: false, speaker: null } : current)
    }
  }, [room?.endedAt, stop])

  const action = (name, studentId) => {
    setError('')
    socket?.emit(`discussion:${name}`, { roomCode: room.code, studentId })
  }
  const startSpeaking = async () => {
    if (pipeline.current || !state?.active || state.speaker?.studentId !== String(user?._id)) return
    setOwnTranscript('')
    setError('')
    const recorder = createRecordingPipeline({
      metadata: { roomId: room._id, session: state.session, grant: state.speaker.grant },
      onTranscription: (_sequence, text) => {
        const cleanText = text?.trim()
        if (cleanText && pipeline.current === recorder) setOwnTranscript(current => current ? `${current} ${cleanText}` : cleanText)
      },
      onRecordingStateChange: value => {
        if (pipeline.current === recorder) {
          setRecording(value)
          if (value) setSpeakingStatus('Listening...')
        }
      },
      onError: recordingError => {
        if (pipeline.current === recorder) {
          setError(recordingError.message)
          setSpeakingStatus('Recording error')
        }
      }
    })
    pipeline.current = recorder
    setStarting(true)
    setSpeakingStatus('Starting...')
    await recorder.startRecording()
    if (pipeline.current === recorder) {
      setStarting(false)
      if (!recorder.isRecording()) {
        pipeline.current = null
      }
    }
  }
  const stopSpeaking = async () => {
    const recorder = pipeline.current
    if (!recorder) return
    setStarting(true)
    try {
      await recorder.stopRecording()
    } finally {
      if (pipeline.current === recorder) {
        pipeline.current = null
        setStarting(false)
        setRecording(false)
        setSpeakingStatus('Ready')
      }
    }
  }

  const approved = state?.active && state.speaker?.studentId === String(user?._id)
  const waiting = state?.pendingHands?.some(hand => hand.studentId === String(user?._id))
  const compactButton = { padding: '9px 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }
  const disabledGhost = disabled => disabled ? { cursor: 'not-allowed', opacity: 0.55 } : {}

  if (teacher) {
    const hands = state?.pendingHands || []
    const speaker = state?.speaker
    return <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={!connected || !!room.endedAt || !state || state.active} onClick={() => action('start')} style={primaryButton(!connected || !!room.endedAt || !state || state.active, compactButton)}>
          <Play size={15} aria-hidden="true" /> Start Discussion
        </button>
        <button type="button" disabled={!connected || !!room.endedAt || !state?.active} onClick={() => action('end')} style={ghostButton({ ...compactButton, ...disabledGhost(!connected || !!room.endedAt || !state?.active), color: 'var(--tint-danger-fg)', borderColor: 'var(--tint-danger-border)' })}>
          <Square size={15} aria-hidden="true" /> End Discussion
        </button>
      </div>

      {error && <div role="alert" style={{ flex: '1 1 100%', padding: '10px 12px', borderRadius: 10, background: 'var(--tint-danger-bg)', color: 'var(--tint-danger-fg)', fontSize: 13 }}>{error}</div>}
      {state?.active && <div style={{ flex: '1 1 100%', width: '100%', display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 4 }}>
        <section aria-label="Pending raised hands" style={{ minWidth: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}><Hand size={17} aria-hidden="true" /> Pending Raised Hands <Pill tone="#f59e0b">{hands.length}</Pill></div>
          {hands.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>No students have raised their hand yet.</p> : hands.map(hand => <div key={hand.studentId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '9px 0', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{hand.name} wants to speak</div>
              <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-secondary)' }}>Waiting for approval</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" disabled={!!speaker || !connected} onClick={() => action('approve', hand.studentId)} style={primaryButton(!!speaker || !connected, { padding: '7px 11px', fontSize: 12 })}><Check size={14} aria-hidden="true" /> Approve</button>
              <button type="button" disabled={!connected} onClick={() => action('reject', hand.studentId)} style={ghostButton({ padding: '7px 11px', fontSize: 12, ...disabledGhost(!connected), color: 'var(--tint-danger-fg)', borderColor: 'var(--tint-danger-border)' })}><X size={14} aria-hidden="true" /> Reject</button>
            </div>
          </div>)}
        </section>

        <section aria-label="Approved speakers" style={{ minWidth: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}><Users size={17} aria-hidden="true" /> Approved Speakers <Pill tone="#10b981">{speaker ? 1 : 0}</Pill></div>
          {!speaker ? <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>No approved speakers yet.</p> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', paddingTop: 9, borderTop: '1px solid var(--border-color)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{speaker.name}</div>
              <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-secondary)' }}>Approved to speak</div>
            </div>
            <button type="button" disabled={!connected} onClick={() => action('remove-speaker', speaker.studentId)} style={ghostButton({ padding: '7px 11px', fontSize: 12, ...disabledGhost(!connected), color: 'var(--tint-warn-fg)', borderColor: 'var(--tint-warn-border)' })}><X size={14} aria-hidden="true" /> Remove</button>
          </div>}
        </section>
      </div>}
    </>
  }

  if (!state?.active) return null
  return <section aria-label="Discussion controls" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, marginBottom: 18 }}>
    {!connected && <div role="status" style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--tint-warn-bg)', color: 'var(--tint-warn-fg)', fontSize: 13 }}>Reconnecting to discussion...</div>}
    {error && <div role="alert" style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--tint-danger-bg)', color: 'var(--tint-danger-fg)', fontSize: 13 }}>{error}</div>}
    {!approved && !waiting && <button type="button" disabled={!connected} onClick={() => action('raise-hand')} style={primaryButton(!connected, { padding: '10px 16px', fontSize: 14 })}><Hand size={16} aria-hidden="true" /> Raise Hand</button>}
    {waiting && <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--tint-info-bg)', borderRadius: 10, border: '1px solid var(--tint-info-border)', color: 'var(--tint-info-fg)', fontWeight: 600, fontSize: 13 }}><Clock3 size={15} aria-hidden="true" /> Waiting for approval...</div>}
    {approved && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--tint-success-fg)', fontWeight: 600, fontSize: 13 }}>Approved by teacher</span>
      {!recording ? <button type="button" disabled={!connected || starting} onClick={startSpeaking} style={primaryButton(!connected || starting, { padding: '10px 16px', fontSize: 14 })}><Mic size={16} aria-hidden="true" /> {starting ? 'Starting...' : 'Start Speaking'}</button> : <button type="button" disabled={!connected || starting} onClick={stopSpeaking} style={ghostButton({ padding: '10px 16px', fontSize: 14, ...disabledGhost(!connected || starting), color: 'var(--tint-danger-fg)', borderColor: 'var(--tint-danger-border)' })}><MicOff size={16} aria-hidden="true" /> Stop Speaking</button>}
      <span role="status" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{speakingStatus}</span>
    </div>}
    {ownTranscript && <div style={{ maxWidth: '100%', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-color)', fontSize: 14, color: 'var(--text-primary)' }}><strong>Your transcription:</strong> {ownTranscript}</div>}
  </section>
}
