import React, { useEffect, useState } from 'react'
import { LogIn, LogOut, RotateCcw, ShieldCheck } from 'lucide-react'

// Seconds -> compact duration ("45s", "2m 10s"). Shared by the live console and the per-lecture
// breakdown so both sides describe the absence budget the same way.
export const formatSpan = (sec) => {
  if (sec === null || sec === undefined || !Number.isFinite(Number(sec))) return '—'
  const total = Math.max(0, Math.round(Number(sec)))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const clock = (value) => {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return '—'
  }
}

const barTone = (percent) => {
  if (percent >= 100) return '#dc2626'
  if (percent >= 60) return '#d97706'
  if (percent > 0) return '#0ea5e9'
  return '#10b981'
}

// Presence intervals record WHY they closed. The teacher sees a plain-language reason next to each
// gap so "switched tabs" is distinguishable from a reload or an intentional leave.
export const gapReasonLabel = (reason) => {
  switch (reason) {
    case 'tab-hidden': return 'Switched tab'
    case 'window-blur': return 'Window unfocused'
    case 'frozen': return 'Tab stopped responding'
    case 'untracked': return 'Could not confirm tab activity'
    case 'leave': return 'Left the room'
    case 'disconnect': return 'Disconnected'
    case 'attention': return 'Lost focus'
    default: return null
  }
}

/**
 * Absence-budget meter. Used live (teacher console, updates on every leave/rejoin) and in the
 * per-lecture student breakdown (history + timeline).
 *
 * - usedSeconds is the cumulative time written off from the student's single allowance. It includes
 *   the still-open absence, so the bar drains while the student is disconnected.
 * - gaps are every away period that consumes it: reloads, network drops, explicit leaves, and a
 *   final departure with no return. A gap beyond the remaining budget is billed instead of forgiven.
 * - events is the raw join / left / rejoin history recorded by the presence tracker.
 */
export function ReconnectMeter({
  allowanceSeconds,
  usedSeconds,
  remainingSeconds,
  rejoins = 0,
  gaps = [],
  events = [],
  compact = false,
  showEvents = false,
  showGaps = false,
  live = false
}) {
  const allowance = Math.max(0, Math.round(Number(allowanceSeconds) || 0))
  const openGap = gaps.find((g) => g && g.open)
  const openStart = openGap?.start ? new Date(openGap.start).getTime() : null
  // Tick only while someone is away so a live meter drains second by second; idle meters stay still.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!openStart) return undefined
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [openStart])

  if (!allowance && !usedSeconds) return null

  // Budget already spent on CLOSED away periods. The open gap is recomputed from its start time so
  // the snapshot's value is replaced by live elapsed time instead of being counted twice.
  const closedForgiven = gaps.reduce(
    (sum, g) => (g && !g.open ? sum + (Number(g.forgivenSeconds) || 0) : sum),
    0
  )
  const openElapsed = openStart ? Math.max(0, Math.floor((now - openStart) / 1000)) : 0
  const openForgiven = openStart
    ? Math.min(Math.max(0, allowance - closedForgiven), openElapsed)
    : 0

  const rawUsed = openStart
    ? closedForgiven + openForgiven
    : Math.round(Number(usedSeconds) || 0)
  const used = Math.max(0, Math.min(allowance, rawUsed))
  const remaining = Math.max(0, Math.round(Number(openStart ? allowance - used : (remainingSeconds ?? allowance - used)) || 0))
  const percent = allowance > 0 ? Math.min(100, Math.round((used / allowance) * 100)) : 0
  const tone = barTone(percent)
  const exhausted = allowance > 0 && remaining <= 0
  const joinedCount = events.filter((e) => e.type === 'joined').length

  return (
    <div style={{ minWidth: 0, width: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: compact ? 4 : 6,
        fontSize: compact ? 11 : 12,
        color: 'var(--text-secondary)'
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <ShieldCheck size={compact ? 11 : 13} color={tone} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{formatSpan(used)}</strong>
            <span> of {formatSpan(allowance)}{compact ? ' used' : ' absence budget used'}</span>
            {live && <span style={{ color: tone, fontWeight: 700 }}> · live</span>}
          </span>
        </span>
        <span style={{ color: exhausted ? '#b91c1c' : 'var(--text-secondary)', fontWeight: 650, whiteSpace: 'nowrap' }}>
          {exhausted ? 'budget used' : `${formatSpan(remaining)} left`}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Absence budget used"
        aria-valuemin={0}
        aria-valuemax={allowance}
        aria-valuenow={used}
        style={{
          height: compact ? 5 : 7,
          borderRadius: 999,
          background: 'color-mix(in srgb, var(--text-secondary) 14%, transparent)',
          overflow: 'hidden'
        }}
      >
        <div style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: 999,
          background: tone,
          transition: 'width 0.35s ease, background 0.35s ease'
        }} />
      </div>

      {!compact && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
          Reloads, disconnects and leaves all draw from this one budget.
        </div>
      )}

      {rejoins > 0 && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
          {rejoins} rejoin{rejoins === 1 ? '' : 's'} this session
        </div>
      )}

      {showEvents && events.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 5 }}>
            Join / leave log
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {events.map((event, index) => {
              const isLeave = event.type === 'left'
              const rejoin = !isLeave && joinedCount > 1 && index > 0
              const label = isLeave ? 'Left' : rejoin ? 'Rejoined' : 'Joined'
              const Icon = isLeave ? LogOut : rejoin ? RotateCcw : LogIn
              const color = isLeave ? '#b45309' : '#047857'
              return (
                <div key={`${event.type}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  <Icon size={11} color={color} style={{ flexShrink: 0 }} />
                  <span style={{ color, fontWeight: 650, width: 58, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{clock(event.at)}</span>
                  {isLeave && gapReasonLabel(event.reason) && (
                    <span> · {gapReasonLabel(event.reason)}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showGaps && gaps.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 5 }}>
            Time away
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {gaps.map((gap, index) => {
              const isOpen = !!gap.open
              const awaySeconds = isOpen ? openElapsed : (Number(gap.seconds) || 0)
              const forgivenSeconds = isOpen ? openForgiven : (Number(gap.forgivenSeconds) || 0)
              const billedSeconds = Math.max(0, awaySeconds - forgivenSeconds)
              return (
                <div key={`gap-${index}`} style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {clock(gap.start)} – {isOpen ? 'now' : clock(gap.end)}
                  </span>
                  <span> · {formatSpan(awaySeconds)} away</span>
                  {gapReasonLabel(gap.reason) && (
                    <span style={{ color: '#475569' }}> · {gapReasonLabel(gap.reason)}</span>
                  )}
                  {isOpen && <span style={{ color: '#0ea5e9', fontWeight: 650 }}> · still away</span>}
                  {gap.final && <span style={{ color: '#b45309', fontWeight: 650 }}> · did not return</span>}
                  {forgivenSeconds > 0 && <span style={{ color: '#047857', fontWeight: 650 }}> · {formatSpan(forgivenSeconds)} forgiven</span>}
                  {billedSeconds > 0 && <span style={{ color: '#b45309', fontWeight: 650 }}> · {formatSpan(billedSeconds)} billed</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default ReconnectMeter
