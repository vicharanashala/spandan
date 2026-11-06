import React from 'react'
import { Hourglass, ShieldCheck, UserCheck } from 'lucide-react'

const card = {
  border: '1px solid var(--border-color)',
  borderRadius: 14,
  background: 'var(--bg-card)',
  padding: '14px 16px'
}

const numberInput = {
  width: 74,
  padding: '8px 10px',
  borderRadius: 9,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontWeight: 600,
  boxSizing: 'border-box'
}

const dateInput = {
  ...numberInput,
  width: 'auto',
  minWidth: 138
}

const pad = (n) => String(n).padStart(2, '0')

// ISO (UTC) -> the local values a native date/time input expects.
const toDateInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const toTimeInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const modeButton = (active) => ({
  flex: 1,
  minWidth: 0,
  padding: '10px 10px',
  borderRadius: 10,
  border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border-color)'}`,
  background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
  color: active ? 'var(--accent)' : 'var(--text-primary)',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit'
})

/**
 * Waiting-room configuration shared by the standalone Create Room form and the class "Start
 * session" modal. Value shape matches room.settings.waitingRoom:
 *   { enabled, mode: 'automatic' | 'manual', graceSeconds, scheduledAt, reconnectAllowanceSeconds }
 */
export default function WaitingRoomSetup({ value, onChange, disabled = false }) {
  const config = {
    enabled: value?.enabled !== false,
    mode: value?.mode === 'manual' ? 'manual' : 'automatic',
    graceSeconds: Number.isFinite(Number(value?.graceSeconds)) ? Number(value.graceSeconds) : 120,
    scheduledAt: value?.scheduledAt || null,
    reconnectAllowanceSeconds: Number.isFinite(Number(value?.reconnectAllowanceSeconds))
      ? Math.max(0, Number(value.reconnectAllowanceSeconds))
      : 60
  }
  const minutes = Math.floor(config.graceSeconds / 60)
  const seconds = config.graceSeconds % 60
  const reconnectMinutes = Math.floor(config.reconnectAllowanceSeconds / 60)
  const reconnectSeconds = config.reconnectAllowanceSeconds % 60

  // Date and time are held locally while the teacher fills them in, so picking one field before the
  // other does not collapse the input back to empty. The parent only gets a value once both exist.
  const [scheduleDate, setScheduleDate] = React.useState(() => toDateInput(config.scheduledAt))
  const [scheduleTime, setScheduleTime] = React.useState(() => toTimeInput(config.scheduledAt))

  const update = (patch) => onChange?.({ ...config, ...patch })
  const updateGrace = (nextMinutes, nextSeconds) => {
    const m = Math.max(0, Math.min(60, Number(nextMinutes) || 0))
    const s = Math.max(0, Math.min(59, Number(nextSeconds) || 0))
    update({ graceSeconds: m * 60 + s })
  }

  // One cumulative budget per student: every drop in the session draws from it, so the protection
  // cannot be farmed by reconnecting repeatedly.
  const updateReconnect = (nextMinutes, nextSeconds) => {
    const m = Math.max(0, Math.min(60, Number(nextMinutes) || 0))
    const s = Math.max(0, Math.min(59, Number(nextSeconds) || 0))
    update({ reconnectAllowanceSeconds: m * 60 + s })
  }

  const updateSchedule = (nextDate, nextTime) => {
    setScheduleDate(nextDate)
    setScheduleTime(nextTime)
    // One field alone is not a valid schedule; clear the committed value so the form can never
    // submit a stale date/time while the teacher is halfway through editing it.
    if (!nextDate || !nextTime) {
      update({ scheduledAt: null })
      return
    }
    const parsed = new Date(`${nextDate}T${nextTime}`)
    if (Number.isNaN(parsed.getTime())) return
    update({ scheduledAt: parsed.toISOString() })
  }

  const clearSchedule = () => updateSchedule('', '')

  const today = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`
  const scheduleInPast = !!config.scheduledAt && new Date(config.scheduledAt).getTime() <= Date.now()
  const scheduleLabel = config.scheduledAt
    ? new Date(config.scheduledAt).toLocaleString([], {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
    : ''

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
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
          <Hourglass size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 750, color: 'var(--text-primary)' }}>Waiting room</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Hold students outside the live session until you admit them.
              </div>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-secondary)' }}>
                {config.enabled ? 'On' : 'Off'}
              </span>
              <input
                type="checkbox"
                checked={config.enabled}
                disabled={disabled}
                onChange={(e) => update({ enabled: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'inherit' }}
              />
            </label>
          </div>
        </div>
      </div>

      {config.enabled && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 7 }}>
              Admission mode
            </div>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => update({ mode: 'automatic' })}
                disabled={disabled}
                style={modeButton(config.mode === 'automatic')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
                  <ShieldCheck size={14} /> Automatic
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>
                  First admit releases everyone inside the grace window, then switches to manual.
                </span>
              </button>
              <button
                type="button"
                onClick={() => update({ mode: 'manual' })}
                disabled={disabled}
                style={modeButton(config.mode === 'manual')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
                  <UserCheck size={14} /> Manual
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>
                  You admit or reject each student individually (Admit all is always available).
                </span>
              </button>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 7 }}>
              On-time grace window
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={minutes}
                  disabled={disabled}
                  onChange={(e) => updateGrace(e.target.value, seconds)}
                  style={numberInput}
                  aria-label="Grace minutes"
                />
                min
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={seconds}
                  disabled={disabled}
                  onChange={(e) => updateGrace(minutes, e.target.value)}
                  style={numberInput}
                  aria-label="Grace seconds"
                />
                sec
              </label>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Students who join within this window are tagged <strong style={{ color: '#059669' }}>on time</strong> and late joiners are tagged <strong style={{ color: '#b45309' }}>late</strong>.
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 7 }}>
              Reconnect allowance
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={reconnectMinutes}
                  disabled={disabled}
                  onChange={(e) => updateReconnect(e.target.value, reconnectSeconds)}
                  style={numberInput}
                  aria-label="Reconnect allowance minutes"
                />
                min
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={reconnectSeconds}
                  disabled={disabled}
                  onChange={(e) => updateReconnect(reconnectMinutes, e.target.value)}
                  style={numberInput}
                  aria-label="Reconnect allowance seconds"
                />
                sec
              </label>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Total disconnection time written off per student. Every drop shares this one budget.
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 7, lineHeight: 1.5 }}>
              Students are never charged for the first <strong style={{ color: 'var(--text-primary)' }}>60 seconds</strong> of dropped connection, even if you set this to 0. Only gaps after a student has joined count; a late join is still missed time.
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 7 }}>
              Class schedule <span style={{ fontWeight: 500 }}>(optional)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="date"
                value={scheduleDate}
                min={today}
                disabled={disabled}
                onChange={(e) => updateSchedule(e.target.value, scheduleTime)}
                style={dateInput}
                aria-label="Scheduled class date"
              />
              <input
                type="time"
                value={scheduleTime}
                disabled={disabled}
                onChange={(e) => updateSchedule(scheduleDate, e.target.value)}
                style={dateInput}
                aria-label="Scheduled class time"
              />
              {(scheduleDate || scheduleTime || config.scheduledAt) && (
                <button
                  type="button"
                  onClick={clearSchedule}
                  disabled={disabled}
                  style={{
                    padding: '7px 11px',
                    borderRadius: 9,
                    border: '1px solid var(--border-color)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: 650,
                    cursor: disabled ? 'not-allowed' : 'pointer'
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 7, lineHeight: 1.5 }}>
              The grace timer starts at this time, not when you open the room. Open the room early and every student who joins at the scheduled time (or within the grace window) is still on time.
            </div>
            {scheduleLabel && !scheduleInPast && (
              <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-primary)', marginTop: 6 }}>
                Scheduled: {scheduleLabel}
              </div>
            )}
            {scheduleInPast && (
              <div role="alert" style={{ fontSize: 12, fontWeight: 650, color: '#b91c1c', marginTop: 6 }}>
                This scheduled time is already in the past. Pick a future date and time before starting the class.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
