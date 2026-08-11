// Student-only: two views.
//   • My Daily Trend (default) — last 7/30 days as a bar chart.
//   • Per-Day Detail — pick a single date, view per-room history entries.
// Uses:
//   GET /api/risk-scores/me/trend?range=7d|30d|today   (own data only)
//   GET /api/risk-scores/me?date=YYYY-MM-DD            (own data only)

import React, { useEffect, useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import RiskScoreDailyChart from '../components/RiskScoreDailyChart'
import { API_URL } from '../config.js'
import { useAuthStore } from '../stores/authStore'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function StudentRiskHistory() {
  const { user, token } = useAuthStore()
  const [tab, setTab] = useState('daily')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <Sidebar role="student" />
      <div className="ml-0 md:ml-64 p-6">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">My Engagement History</h1>
          <div className="flex gap-2"><ThemeToggle /><ProfileDropdown /></div>
        </header>

        <div className="flex gap-1 rounded-lg border border-gray-300 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800 w-full max-w-sm mb-6">
          <button
            onClick={() => setTab('daily')}
            className={`flex-1 text-sm px-3 py-1.5 rounded-md transition ${tab === 'daily' ? 'bg-indigo-600 text-white' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          >
            Daily Trend
          </button>
          <button
            onClick={() => setTab('detail')}
            className={`flex-1 text-sm px-3 py-1.5 rounded-md transition ${tab === 'detail' ? 'bg-indigo-600 text-white' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          >
            Pick a Day
          </button>
        </div>

        {tab === 'daily' && <DailyTrendView token={token} />}
        {tab === 'detail' && <DayDetailView user={user} token={token} onSelectDay={(iso) => {
          // User clicked a bar — switch to detail tab with that date.
          setTab('detail')
        }} />}
      </div>
    </div>
  )
}

function DailyTrendView({ token }) {
  const [range, setRange] = useState('7d')
  const [trend, setTrend] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/risk-scores/me/trend?range=${range}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const j = await res.json()
        if (!res.ok || !j.success) {
          setError(j.error || 'Could not load trend.')
          setTrend(null)
        } else {
          setTrend(j)
        }
      } catch (e) {
        setError('Network error.')
        setTrend(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [token, range])

  const points = trend?.points || []
  const last = points[points.length - 1]
  const activeDays = points.filter((p) => p.totalEvents > 0).length

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="font-semibold">Your engagement over the last {range === 'today' ? 'day' : range}</h2>
        <div className="flex gap-1 rounded-lg border border-gray-300 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800">
          {[
            { v: 'today', l: 'Today' },
            { v: '7d',    l: '7 days' },
            { v: '30d',   l: '30 days' }
          ].map((r) => (
            <button key={r.v} onClick={() => setRange(r.v)}
                    className={`text-xs px-3 py-1 rounded-md transition ${range === r.v ? 'bg-indigo-600 text-white' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              {r.l}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-rose-600 mb-2">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {!loading && !error && trend && (
        <>
          <div className="flex flex-wrap gap-4 text-sm text-gray-700 dark:text-gray-200 mb-3">
            <span>
              <strong>{activeDays}</strong> active day{activeDays === 1 ? '' : 's'} in this window
            </span>
            {last?.hasData && (
              <span>
                Most recent: <strong>{Math.round(last.endingScore)}</strong> ({last.worstZone})
              </span>
            )}
            {activeDays === 0 && (
              <span className="text-gray-500">
                You haven't engaged in any session in this window. Join a room to start building your trend.
              </span>
            )}
          </div>
          {points.length > 0 && <RiskScoreDailyChart points={points} />}
        </>
      )}
    </div>
  )
}

function DayDetailView({ user, token, onSelectDay }) {
  const [date, setDate] = useState(todayISO())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  const load = async (isoDate) => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/risk-scores/me?date=${isoDate}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not load history.')
        setData(null)
      } else {
        setData(json)
      }
    } catch (e) {
      setError('Network error.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(date) }, [date, token])

  return (
    <>
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 mb-6">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Pick a date
        </label>
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
        />
        {user?.name && (
          <p className="text-xs text-gray-500 mt-2">Showing data for <strong>{user.name}</strong></p>
        )}
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {!loading && !error && data && (
        <div className="space-y-4">
          {(!data.entries || data.entries.length === 0) && (
            <p className="text-sm text-gray-500">No risk-score events for {date}. Start a session and respond to some questions.</p>
          )}
          {(data.entries || []).map((entry) => {
            const zoneCls = entry.zone === 'safe'
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : entry.zone === 'warning'
              ? 'border-amber-500/40 bg-amber-500/10'
              : 'border-rose-500/40 bg-rose-500/10'
            return (
              <div key={entry._id} className={`rounded-2xl border ${zoneCls} p-4`}>
                <div className="flex justify-between items-baseline mb-2">
                  <h2 className="font-semibold text-sm">Room {entry.roomCode || entry.roomId}</h2>
                  <span className="text-xs text-gray-500">{entry.lastUpdated ? new Date(entry.lastUpdated).toLocaleTimeString() : ''}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums">{Math.round(entry.currentScore)}</span>
                  <span className="text-sm text-gray-500">/ 100</span>
                  <span className="ml-auto text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border">{entry.zone}</span>
                </div>
                {Array.isArray(entry.history) && entry.history.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer">
                      {entry.history.length} event{entry.history.length === 1 ? '' : 's'}
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {entry.history.slice(-20).map((h, i) => (
                        <li key={i} className="text-xs text-gray-600 dark:text-gray-300 font-mono">
                          {new Date(h.timestamp).toLocaleTimeString()} — {h.skipped ? 'SKIP' : h.answeredCorrectly ? 'CORRECT' : 'WRONG'} (score {Math.round(h.scoreAfter)})
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}