// Live risk-score widget shown to students in StudentRoomPage.
// Subscribes to `risk-score:self-update` events via useRiskScoreSocket.
// Also hydrates from the DB on mount (when roomId+token are passed) so the
// score is correct immediately after a page refresh, not just after a socket
// event arrives.
//
// Color-coded badge:
//   safe    -> green
//   warning -> amber
//   risk    -> red
//
// Server is the source of truth: a student socket will only ever receive
// `risk-score:self-update` for THEIR OWN userId.

import React, { useEffect } from 'react'
import { useRiskScoreStore } from '../stores/riskScoreStore'
import { useRiskScoreSocket } from '../hooks/useRiskScoreSocket'
import { API_URL } from '../config.js'

const ZONE_STYLES = {
  safe: {
    bg: 'bg-emerald-500/15 dark:bg-emerald-400/10',
    border: 'border-emerald-500/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-500/30',
    label: 'Safe'
  },
  warning: {
    bg: 'bg-amber-500/15 dark:bg-amber-400/10',
    border: 'border-amber-500/40',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-500/30',
    label: 'Watch'
  },
  risk: {
    bg: 'bg-rose-500/15 dark:bg-rose-400/10',
    border: 'border-rose-500/40',
    text: 'text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-500/30',
    label: 'At Risk'
  }
}

export default function RiskScoreWidget({ roomId, token }) {
  useRiskScoreSocket()
  const { currentScore, zone, correctStreakNeeded } = useRiskScoreStore((s) => s.self)
  const setSelf = useRiskScoreStore((s) => s.setSelf)

  // ── Hydration from DB ────────────────────────────────────────────────────
  // On mount (and whenever roomId changes), fetch the persisted score so the
  // widget shows the correct value immediately after a page refresh instead
  // of starting at 100 and waiting for the next socket event.
  useEffect(() => {
    if (!roomId || !token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/risk-scores/me/room/${roomId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        if (cancelled) return
        if (data?.success) {
          setSelf({
            currentScore:        data.currentScore,
            zone:                data.zone,
            correctStreakNeeded: data.correctStreakNeeded
          })
        }
      } catch (e) {
        console.warn('[RiskScoreWidget] hydration failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [roomId, token])
  // ────────────────────────────────────────────────────────────────────────

  const z = ZONE_STYLES[zone] || ZONE_STYLES.safe

  return (
    <div
      data-testid="risk-score-widget"
      data-zone={zone}
      className={`fixed top-4 right-4 z-40 w-64 rounded-2xl border ${z.border} ${z.bg} backdrop-blur shadow-lg p-4 transition-colors`}
    >
      <div className="flex items-baseline justify-between">
        <span className={`text-xs uppercase tracking-wider font-semibold ${z.text}`}>
          Engagement
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ring-1 ${z.ring} ${z.text}`}>
          {z.label}
        </span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className={`text-4xl font-bold tabular-nums ${z.text}`}>
          {Math.round(currentScore)}
        </span>
        <span className={`text-sm pb-1.5 ${z.text}`}>/ 100</span>
      </div>
      {/* Score bar */}
      <div className="mt-3 h-1.5 w-full bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            zone === 'safe' ? 'bg-emerald-500' : zone === 'warning' ? 'bg-amber-500' : 'bg-rose-500'
          }`}
          style={{ width: `${Math.max(0, Math.min(100, currentScore))}%` }}
        />
      </div>
      {zone !== 'safe' && correctStreakNeeded > 0 && (
        <p className={`mt-3 text-xs ${z.text}`}>
          {correctStreakNeeded} more correct answer{correctStreakNeeded === 1 ? '' : 's'} to reach Safe.
        </p>
      )}
      {zone === 'safe' && (
        <p className={`mt-3 text-xs ${z.text}`}>
          You're tracking well. Keep it up.
        </p>
      )}
    </div>
  )
}