import React from 'react'
import { Coins, Flame, ShieldCheck, Timer, TriangleAlert } from 'lucide-react'
import { cardStyle, SectionHeader } from './InsightUI'

const fmt = (n) => {
  const value = Number(n)
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : '0'
}

// Live 0-3 late-arrival meter plus the student's spendable standing. The backend summary merges
// completed ledger rows with attendance already stamped on in-progress rooms, and settles the
// real SP / attendance-minute balances when a room ends.
export default function AttendanceStreakCard({ attendance, isMobile }) {
  const streak = Math.max(0, Number(attendance?.currentLateStreak) || 0)
  const strikeEvery = Math.max(1, Number(attendance?.strikeEvery) || 3)
  const filled = Math.min(streak, strikeEvery)
  const struck = streak >= strikeEvery
  const remaining = Math.max(0, strikeEvery - streak)
  const tint = struck ? '#ef4444' : filled > 0 ? '#f59e0b' : '#10b981'

  const spBalance = Math.max(0, Number(attendance?.spBalance) || 0)
  const attendanceMinutes = Math.max(0, Number(attendance?.attendanceMinutes) || 0)
  const attendanceTarget = Math.max(1, Number(attendance?.attendanceTargetMinutes) || 3600)
  const mirrored = attendance?.source === 'spurti'
  const attendancePct = Math.min(100, Math.round((attendanceMinutes / attendanceTarget) * 100))

  const title = struck
    ? `${streak} consecutive late arrival${streak === 1 ? '' : 's'} — strike`
    : filled > 0
      ? `${filled} of ${strikeEvery} late arrivals in a row`
      : 'No late arrivals in a row'

  const hint = struck
    ? mirrored
      ? 'You reached the strike threshold. The strike is logged on your Spandan late-streak record; your Spurti SP and attendance stay read-only.'
      : 'You reached the strike threshold. When this session ends, your average SP and one day of attendance minutes are forfeited; an on-time arrival starts a fresh run.'
    : filled > 0
      ? `${remaining} more consecutive late arrival${remaining === 1 ? '' : 's'} triggers a strike: you lose your average SP and one day of attendance minutes. An on-time arrival resets this streak.`
      : 'Three late arrivals in a row trigger a strike: you lose your average SP and one day of attendance minutes. An on-time arrival keeps this at zero.'

  const tile = (icon, label, value, suffix, hintText, tone) => (
    <div style={{
      flex: 1, minWidth: 0, padding: '12px 14px', borderRadius: 14,
      background: 'color-mix(in srgb, var(--text-secondary) 5%, transparent)',
      border: '1px solid color-mix(in srgb, var(--text-secondary) 14%, transparent)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 7,
          color: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)`
        }}>
          {React.createElement(icon, { size: 13, strokeWidth: 2.4 })}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          {label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          {value}
        </span>
        {suffix && (
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{suffix}</span>
        )}
      </div>
      {hintText && (
        <div style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.4, color: 'var(--text-secondary)' }}>
          {hintText}
        </div>
      )}
      {label === 'Attendance' && (
        <div
          role="progressbar"
          aria-label="Attendance minutes"
          aria-valuemin={0}
          aria-valuemax={attendanceTarget}
          aria-valuenow={Math.min(attendanceMinutes, attendanceTarget)}
          style={{ marginTop: 8, height: 6, borderRadius: 999, background: 'color-mix(in srgb, var(--text-secondary) 16%, transparent)', overflow: 'hidden' }}
        >
          <div style={{ width: `${attendancePct}%`, height: '100%', borderRadius: 999, background: '#0ea5e9' }} />
        </div>
      )}
    </div>
  )

  return (
    <div className="insight-card" style={cardStyle(isMobile)}>
      <SectionHeader
        icon={struck ? TriangleAlert : filled > 0 ? Flame : ShieldCheck}
        title="Late streak"
        hint="Live count of your consecutive late arrivals."
        tint={tint}
        actions={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {mirrored ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
                fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                color: '#6366f1', background: 'color-mix(in srgb, #6366f1 12%, transparent)',
                border: '1px solid color-mix(in srgb, #6366f1 30%, transparent)'
              }}>
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: '#6366f1' }} />
                Live from Spurti
              </span>
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
                fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                color: 'var(--text-secondary)', background: 'color-mix(in srgb, var(--text-secondary) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--text-secondary) 26%, transparent)'
              }}>
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--text-secondary)' }} />
                Local data
              </span>
            )}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
              fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
              color: tint, background: `color-mix(in srgb, ${tint} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${tint} 30%, transparent)`
            }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: tint }} />
              {struck ? 'Strike' : filled > 0 ? 'At risk' : 'Clear'}
            </span>
          </span>
        }
      />

      <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 12 : 20, flexDirection: isMobile ? 'column' : 'row' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: isMobile ? 34 : 40, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: tint }}>
            {filled}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)' }}>/ {strikeEvery}</span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            role="progressbar"
            aria-label="Consecutive late arrivals"
            aria-valuemin={0}
            aria-valuemax={strikeEvery}
            aria-valuenow={filled}
            style={{ display: 'flex', gap: 8, marginBottom: 10 }}
          >
            {Array.from({ length: strikeEvery }, (_, i) => {
              const on = i < filled
              return (
                <span key={i} style={{
                  flex: 1, height: 12, borderRadius: 999,
                  background: on ? tint : 'color-mix(in srgb, var(--text-secondary) 16%, transparent)',
                  boxShadow: on ? `0 0 0 3px color-mix(in srgb, ${tint} 12%, transparent)` : 'none',
                  transition: 'background 0.2s ease, box-shadow 0.2s ease'
                }} />
              )
            })}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: struck ? tint : 'var(--text-primary)', marginBottom: 3 }}>
            {title}
          </div>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
            {hint}
          </p>
          {attendance?.live && (
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-secondary)' }}>
              Includes a late arrival from a room that is still in progress.
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexDirection: isMobile ? 'column' : 'row' }}>
        {tile(
          Coins,
          'SP balance',
          `${fmt(spBalance)} SP`,
          null,
          null,
          '#6366f1'
        )}
        {tile(
          Timer,
          'Attendance',
          `${fmt(attendanceMinutes)} / ${fmt(attendanceTarget)}`,
          'min',
          null,
          '#0ea5e9'
        )}
      </div>

      {mirrored && (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          SP and attendance are mirrored live from Spurti. Your late-streak record stays local to Spandan.
        </p>
      )}
    </div>
  )
}
