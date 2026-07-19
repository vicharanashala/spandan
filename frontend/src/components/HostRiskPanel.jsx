// Live risk-score panel shown to teachers/co-hosts in RoomDetailPage (host's
// view of the live session) and similar teacher-facing surfaces.
//
// Server is the source of truth: the backend only emits `risk-score:all-update`
// to sockets whose userId is in the room's `teacher` or `coHosts` list.
// The defensive guard in useRiskScoreSocket also refuses to populate
// `allInRoom` for non-teacher sockets.

import React, { useEffect } from 'react'
import { useRiskScoreStore } from '../stores/riskScoreStore'
import { useAuthStore } from '../stores/authStore'
import { useRiskScoreSocket } from '../hooks/useRiskScoreSocket'
import { API_URL } from '../config.js'

const ZONE_BADGE = {
  safe:    'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
  warning: 'bg-amber-500/20  text-amber-700  dark:text-amber-300  border-amber-500/40',
  risk:    'bg-rose-500/20   text-rose-700   dark:text-rose-300   border-rose-500/40'
}

export default function HostRiskPanel({ roomId, token }) {
  const user = useAuthStore((s) => s.user)
  useRiskScoreSocket()
  const allInRoom = useRiskScoreStore((s) => s.allInRoom)
  const [hydrated, setHydrated] = React.useState(false)

  // One-shot hydration: when the room page first mounts, fetch the current
  // snapshot from the API so we don't have to wait for a question event.
  useEffect(() => {
    if (!roomId || !token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/risk-scores/room/${roomId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        if (cancelled) return
        if (data?.success && Array.isArray(data.snapshot)) {
          useRiskScoreStore.getState().setAllInRoom(data.snapshot)
        }
      } catch (e) {
        console.warn('risk-score hydration failed:', e)
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => { cancelled = true }
  }, [roomId, token])

  // Defensive: students MUST NOT see this panel even if the component is
  // somehow rendered with their token.
  if (user?.role !== 'teacher') return null

  const sorted = [...allInRoom].sort((a, b) => (b.currentScore ?? 0) - (a.currentScore ?? 0))

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/60 backdrop-blur p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Live Risk Scores
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {sorted.length} student{sorted.length === 1 ? '' : 's'}
        </span>
      </div>
      {!hydrated && sorted.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Loading…</p>
      )}
      {hydrated && sorted.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No risk data yet — students' scores will appear after their first answer.
        </p>
      )}
      <ul className="space-y-2 max-h-96 overflow-y-auto">
        {sorted.map((s) => {
          const cls = ZONE_BADGE[s.zone] || ZONE_BADGE.safe
          return (
            <li
              key={s.studentId}
              data-testid="host-risk-row"
              data-zone={s.zone}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-200/60 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-800/40"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                  {s.studentName || 'Student'}
                </p>
                {s.zone !== 'safe' && s.correctStreakNeeded > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {s.correctStreakNeeded} correct to safe
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm tabular-nums font-semibold text-gray-800 dark:text-gray-100">
                  {Math.round(s.currentScore ?? 0)}
                </span>
                <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
                  {s.zone}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}