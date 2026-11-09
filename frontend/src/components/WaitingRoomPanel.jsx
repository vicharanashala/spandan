import React, { useEffect, useMemo, useState } from 'react'
import { API_URL } from '../config.js'
import { CircleCheck, Clock, EyeOff, Filter, Hourglass, ShieldCheck, UserCheck, UserX, Users, X } from 'lucide-react'
import { ReconnectMeter, formatSpan, gapReasonLabel } from './ReconnectMeter'

const badgeStyle = (onTime) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  background: onTime ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.16)',
  color: onTime ? '#059669' : '#b45309'
})

const chipStyle = (active) => ({
  padding: '5px 11px',
  borderRadius: 999,
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border-color)'}`,
  background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
  color: active ? 'var(--accent)' : 'var(--text-secondary)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer'
})

const actionButton = (variant = 'primary', disabled = false) => {
  const palette = {
    primary: { background: 'var(--accent-solid)', color: 'white', border: 'none' },
    success: { background: 'rgba(16,185,129,0.14)', color: '#047857', border: '1px solid rgba(16,185,129,0.35)' },
    danger: { background: 'rgba(220,38,38,0.08)', color: '#b91c1c', border: '1px solid rgba(220,38,38,0.3)' },
    ghost: { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }
  }[variant]
  return {
    ...palette,
    padding: '6px 11px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 650,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap'
  }
}

const formatJoinTime = (value) => {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return '—'
  }
}

/**
 * Teacher's waiting-room console. Controlled by RoomDetailPage: `snapshot` comes from
 * GET /rooms/:id and is kept live by the `waiting:updated` host-channel event.
 */
export function WaitingRoomPanel({ room, token, snapshot, onSnapshot, onAdmittedCount }) {
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const waiting = snapshot?.waiting || []
  const counts = snapshot?.counts || { waiting: waiting.length, onTime: 0, late: 0 }
  const mode = snapshot?.mode || 'automatic'

  // Live countdown to the end of the on-time window (which is anchored to the scheduled class time
  // when one is set).
  useEffect(() => {
    if (!snapshot?.graceEndsAt) return undefined
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [snapshot?.graceEndsAt])

  const visible = useMemo(() => waiting.filter((student) => {
    if (filter === 'on-time') return student.onTime
    if (filter === 'late') return !student.onTime
    return true
  }), [waiting, filter])

  if (!snapshot?.enabled || !room || !token) return null

  const scheduledAt = snapshot.scheduledAt ? new Date(snapshot.scheduledAt) : null
  const graceEndsAt = snapshot.graceEndsAt ? new Date(snapshot.graceEndsAt) : null
  const graceLeftMs = graceEndsAt ? graceEndsAt.getTime() - now : 0
  const graceOpen = graceLeftMs > 0
  const graceCountdown = (() => {
    const total = Math.max(0, Math.ceil(graceLeftMs / 1000))
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  })()
  const scheduleLabel = scheduledAt
    ? scheduledAt.toLocaleString([], {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
    : ''

  const post = async (action, body = {}) => {
    setBusy(action)
    setError('')
    try {
      const response = await fetch(`${API_URL}/rooms/${room._id}/waiting-room/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Waiting-room action failed')
      if (data.waitingRoom) onSnapshot?.(data.waitingRoom)
      if (typeof data.participants === 'number') onAdmittedCount?.(data.participants)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const admitOne = (studentId) => post('admit', { studentIds: [studentId] })
  const rejectOne = (studentId) => post('reject', { studentIds: [studentId] })

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-lg, 14px)',
      boxShadow: 'var(--shadow-md)',
      padding: '16px 18px',
      marginBottom: 20
    }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            color: 'var(--accent)',
            flexShrink: 0
          }}>
            <Hourglass size={19} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--text-primary)' }}>
                Waiting room
              </h3>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                background: mode === 'automatic' ? 'rgba(59,130,246,0.12)' : 'rgba(139,92,246,0.12)',
                color: mode === 'automatic' ? '#2563eb' : '#7c3aed'
              }}>
                {mode === 'automatic' ? 'Automatic' : 'Manual'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {counts.waiting} waiting · {counts.onTime} on time · {counts.late} late
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              {mode === 'automatic'
                ? `Students joining are held here. Your first admit releases everyone who joined within the ${Math.round((snapshot.graceSeconds || 0) / 60 * 10) / 10}-minute grace window, in join order, then switches to manual.`
                : 'Review each student. Admitted students enter the live session instantly; rejected students stay out.'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <ShieldCheck size={13} />
              <span>
                Absence allowance <strong style={{ color: 'var(--text-primary)' }}>{formatSpan(snapshot.reconnectAllowanceSeconds)}</strong> per student
                <span style={{ color: 'var(--border-color)' }}> · </span>
                every reload, drop and leave shares this one budget
              </span>
            </div>
            {scheduledAt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                <Clock size={13} />
                <span>Class scheduled <strong style={{ color: 'var(--text-primary)' }}>{scheduleLabel}</strong></span>
                <span style={{ color: 'var(--border-color)' }}>·</span>
                <span style={{ color: graceOpen ? '#047857' : 'var(--text-secondary)', fontWeight: 650 }}>
                  {graceOpen ? `Grace closes in ${graceCountdown}` : 'Grace window closed'}
                </span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {mode === 'automatic' ? (
            <>
              <button
                onClick={() => post('admit', {})}
                disabled={!!busy || counts.onTime === 0}
                style={actionButton('primary', !!busy || counts.onTime === 0)}
                title="Release every on-time student in join order and switch to manual"
              >
                {busy === 'admit' ? 'Admitting…' : `Admit on time (${counts.onTime})`}
              </button>
              <button
                onClick={() => post('admit', { all: true })}
                disabled={!!busy || counts.waiting === 0}
                style={actionButton('success', !!busy || counts.waiting === 0)}
                title="Release every waiting student, including late arrivals"
              >
                Admit all ({counts.waiting})
              </button>
              <button
                onClick={() => post('mode', { mode: 'manual' })}
                disabled={!!busy}
                style={actionButton('ghost', !!busy)}
                title="Skip the bulk release and review students individually"
              >
                Switch to manual
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => post('admit', { all: true })}
                disabled={!!busy || counts.waiting === 0}
                style={actionButton('primary', !!busy || counts.waiting === 0)}
              >
                {busy === 'admit' ? 'Admitting…' : `Admit all (${counts.waiting})`}
              </button>
              <button
                onClick={() => post('reject', { all: true })}
                disabled={!!busy || counts.waiting === 0}
                style={actionButton('danger', !!busy || counts.waiting === 0)}
              >
                Reject all
              </button>
              <button
                onClick={() => post('mode', { mode: 'automatic' })}
                disabled={!!busy}
                style={actionButton('ghost', !!busy)}
              >
                Switch to automatic
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" style={{
          marginTop: 12,
          padding: '8px 12px',
          borderRadius: 9,
          background: 'rgba(220,38,38,0.08)',
          border: '1px solid rgba(220,38,38,0.25)',
          color: '#b91c1c',
          fontSize: 12.5
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)', marginRight: 4 }}>
          <Filter size={13} /> Filter
        </span>
        <button onClick={() => setFilter('all')} style={chipStyle(filter === 'all')}>All ({counts.waiting})</button>
        <button onClick={() => setFilter('on-time')} style={chipStyle(filter === 'on-time')}>On time ({counts.onTime})</button>
        <button onClick={() => setFilter('late')} style={chipStyle(filter === 'late')}>Late ({counts.late})</button>
      </div>

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.length === 0 ? (
          <div style={{
            padding: '18px 14px',
            borderRadius: 12,
            border: '1px dashed var(--border-color)',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--text-secondary)'
          }}>
            {counts.waiting === 0
              ? 'No one is waiting right now. New students will appear here.'
              : `No ${filter === 'late' ? 'late' : 'on-time'} students in the waiting room.`}
          </div>
        ) : visible.map((student) => (
          <div key={student.studentId} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary, var(--nav-hover))',
            flexWrap: 'wrap'
          }}>
            <span style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
              color: 'var(--accent)',
              fontWeight: 800,
              fontSize: 14,
              flexShrink: 0
            }}>
              {(student.name || 'S').trim().charAt(0).toUpperCase()}
            </span>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {student.name}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <Clock size={11} /> joined {formatJoinTime(student.joinedAt)}
              </div>
            </div>
            <span style={badgeStyle(student.onTime)}>
              <CircleCheck size={11} /> {student.onTime ? 'On time' : 'Late'}
            </span>
            {mode === 'manual' && (
              <div style={{ display: 'flex', gap: 7 }}>
                <button
                  onClick={() => admitOne(student.studentId)}
                  disabled={!!busy}
                  style={actionButton('success', !!busy)}
                >
                  <UserCheck size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Admit
                </button>
                <button
                  onClick={() => rejectOne(student.studentId)}
                  disabled={!!busy}
                  style={actionButton('danger', !!busy)}
                >
                  <UserX size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Modal listing every ADMITTED participant in join order (waiting-room students excluded), with
 * their on-time/late tag and join time. Opened by clicking the participant counter.
 */
export function AdmittedParticipantsModal({ room, token, open, onClose, snapshot }) {
  const [participants, setParticipants] = useState(snapshot?.admitted || [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savingExcuse, setSavingExcuse] = useState('')

  useEffect(() => {
    if (!open || !room?._id || !token) return
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`${API_URL}/rooms/${room._id}/participants`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (!ok) throw new Error(data.error || 'Failed to load participants')
        setParticipants(data.participants || [])
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, room?._id, token])

  // Live updates from the waiting-room channel also carry the admitted list.
  useEffect(() => {
    if (open && Array.isArray(snapshot?.admitted)) setParticipants(snapshot.admitted)
  }, [open, snapshot])

  // A teacher can mark a valid, documented absence as excused: the end-of-session deduction for that
  // student is removed (and recomputed immediately if the session has already ended).
  const toggleExcuse = async (student) => {
    if (!room?._id || !token || savingExcuse) return
    setSavingExcuse(student.studentId)
    setError('')
    try {
      const res = await fetch(`${API_URL}/rooms/${room._id}/participants/${student.studentId}/excuse`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ excused: !student.excused })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update attendance')
      const summary = Array.isArray(data.attendance) ? data.attendance[0] : null
      setParticipants(prev => prev.map(p => p.studentId === student.studentId
        ? {
            ...p,
            excused: data.excused,
            ...(summary ? {
              penaltyPercent: summary.penaltyPercent,
              adjustedPoints: summary.adjustedPoints,
              presentSeconds: summary.presentSeconds,
              forgivenSeconds: summary.forgivenSeconds,
              missedSeconds: summary.missedSeconds,
              attendanceFinalized: true
            } : {})
          }
        : p))
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingExcuse('')
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Admitted participants"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        zIndex: 1200
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 18,
          boxShadow: '0 24px 60px rgba(15,23,42,0.28)',
          overflow: 'hidden'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{
            width: 34, height: 34, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)'
          }}>
            <Users size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 750, color: 'var(--text-primary)' }}>
              Participants in the session
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              {snapshot?.counts?.present ?? participants.length} present · {participants.length} admitted · in join order
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '12px 14px', overflowY: 'auto' }}>
          {loading && participants.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>Loading participants…</div>
          ) : error ? (
            <div style={{ padding: 14, borderRadius: 10, background: 'rgba(220,38,38,0.08)', color: '#b91c1c', fontSize: 13 }}>{error}</div>
          ) : participants.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
              No one has been admitted yet.
            </div>
          ) : participants.map((student, index) => (
            <div key={student.studentId} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '9px 8px',
              borderBottom: index === participants.length - 1 ? 'none' : '1px solid var(--border-color)'
            }}>
              <span style={{
                width: 24,
                textAlign: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text-secondary)',
                flexShrink: 0
              }}>
                {index + 1}
              </span>
              <span style={{
                width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', fontWeight: 800, fontSize: 12.5,
                flexShrink: 0
              }}>
                {(student.name || 'S').trim().charAt(0).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {student.name}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, flexWrap: 'wrap' }}>
                  <Clock size={10} /> {formatJoinTime(student.joinedAt)}
                  {student.rejoins > 0 && <span> · {student.rejoins} rejoin{student.rejoins === 1 ? '' : 's'}</span>}
                  {student.away && (
                    <span style={{ color: '#b45309', fontWeight: 650 }}>
                      · away{gapReasonLabel(student.awayReason) ? ` (${gapReasonLabel(student.awayReason).toLowerCase()})` : ''}
                    </span>
                  )}
                </div>
                {student.reconnectAllowanceSeconds != null && (
                  <div style={{ marginTop: 6, maxWidth: 320 }}>
                    <ReconnectMeter
                      allowanceSeconds={student.reconnectAllowanceSeconds}
                      usedSeconds={student.reconnectUsedSeconds}
                      remainingSeconds={student.reconnectRemainingSeconds}
                      rejoins={student.rejoins}
                      gaps={student.reconnectGaps}
                      compact
                      live={!student.attendanceFinalized}
                    />
                  </div>
                )}
                {student.attendanceFinalized && (
                  <div style={{ fontSize: 11.5, color: student.penaltyPercent > 0 ? '#b45309' : 'var(--text-secondary)', marginTop: 2 }}>
                    {formatSpan(student.presentSeconds)} present
                    {student.forgivenSeconds > 0 ? ` · ${formatSpan(student.forgivenSeconds)} covered` : ''}
                    {' · '}{formatSpan(student.missedSeconds)} missed
                    {student.excused
                      ? ' · excused'
                      : student.penaltyPercent > 0
                        ? ` · −${student.penaltyPercent}% of ${student.rawPoints} earned → ${student.adjustedPoints}`
                        : ' · no deduction'}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                {student.away && (
                  <span
                    title={`Away since ${student.awaySince ? new Date(student.awaySince).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'just now'}${gapReasonLabel(student.awayReason) ? ` · ${gapReasonLabel(student.awayReason)}` : ''}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      background: 'rgba(245,158,11,0.16)',
                      color: '#b45309'
                    }}
                  >
                    <EyeOff size={11} /> Away
                  </span>
                )}
                <span style={badgeStyle(student.onTime !== false)}>
                  {student.onTime !== false ? <CircleCheck size={11} /> : <ShieldCheck size={11} />}
                  {student.onTime !== false ? 'On time' : 'Late'}
                </span>
                {student.status !== 'waiting' && student.status !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => toggleExcuse(student)}
                    disabled={savingExcuse === student.studentId}
                    title={student.excused ? 'Remove the excused-absence override' : 'Mark this absence as valid so it costs no points'}
                    style={{
                      ...actionButton(student.excused ? 'ghost' : 'success', savingExcuse === student.studentId),
                      padding: '4px 9px',
                      fontSize: 11
                    }}
                  >
                    {savingExcuse === student.studentId ? 'Saving…' : student.excused ? 'Unexcuse' : 'Excuse'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
