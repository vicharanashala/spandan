// Teacher-only: pick a student from one of your rooms, see their risk-score
// trend over consecutive days as a daily-bucket bar chart.
// Uses:
//   GET /api/rooms/                         -> list my rooms
//   GET /api/risk-scores/room/:id           -> roster (host-or-co-host)
//   GET /api/risk-scores/student/:id/trend?range=today|7d|30d

import React, { useEffect, useMemo, useState } from 'react'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import RiskScoreDailyChart from '../components/RiskScoreDailyChart'
import RiskScoreSparkline from '../components/RiskScoreSparkline'
import { API_URL } from '../config.js'
import { useAuthStore } from '../stores/authStore'

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d',    label: '7 days' },
  { value: '30d',   label: '30 days' },
  { value: 'session', label: 'In-session events' }
]

export default function StudentRiskTrend() {
  const { token } = useAuthStore()
  const [rooms, setRooms] = useState([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [students, setStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [range, setRange] = useState('7d')
  const [trend, setTrend] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load teacher's rooms.
  useEffect(() => {
    if (!token) return
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/rooms`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const j = await res.json()
        if (Array.isArray(j.rooms)) {
          setRooms(j.rooms)
          if (j.rooms[0]?._id) setSelectedRoomId(j.rooms[0]._id)
        }
      } catch (e) { /* ignore */ }
    })()
  }, [token])

  // Load student roster for the selected room.
  useEffect(() => {
    if (!token || !selectedRoomId) return
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/risk-scores/room/${selectedRoomId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const j = await res.json()
        if (j?.success) {
          setStudents(j.roster || [])
          if (j.roster?.[0]?._id) setSelectedStudentId(j.roster[0]._id)
        } else {
          setStudents([])
        }
      } catch (e) { setStudents([]) }
    })()
  }, [token, selectedRoomId])

  // Load trend for the selected student + range.
  useEffect(() => {
    if (!token || !selectedStudentId) return
    ;(async () => {
      setLoading(true)
      setError('')
      setTrend(null)
      try {
        const qs = new URLSearchParams({ range, ...(selectedRoomId ? { roomId: selectedRoomId } : {}) }).toString()
        const res = await fetch(`${API_URL}/risk-scores/student/${selectedStudentId}/trend?${qs}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const j = await res.json()
        if (!res.ok || !j.success) {
          setError(j.error || 'Could not load trend.')
        } else {
          setTrend(j)
        }
      } catch (e) {
        setError('Network error.')
      } finally {
        setLoading(false)
      }
    })()
  }, [token, selectedStudentId, selectedRoomId, range])

  const points = useMemo(() => trend?.points || [], [trend])
  const isDaily = range === 'today' || range === '7d' || range === '30d'
  const currentScore = trend?.currentScore
  const currentZone = trend?.currentZone || points[points.length - 1]?.worstZone

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <Sidebar role="teacher" />
      <div className="ml-0 md:ml-64 p-6">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Student Engagement Trends</h1>
          <div className="flex gap-2"><ThemeToggle /><ProfileDropdown /></div>
        </header>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Room</label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
            >
              <option value="">— all rooms —</option>
              {rooms.map((r) => (
                <option key={r._id} value={r._id}>{r.name || r.code} ({r.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Student</label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              disabled={students.length === 0}
              className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
            >
              <option value="">— pick a student —</option>
              {students.map((s) => (
                <option key={s._id} value={s._id}>{s.name || s.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Range</label>
            <div className="flex gap-1 rounded-lg border border-gray-300 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-800">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`flex-1 text-xs px-2 py-1 rounded-md transition ${range === r.value ? 'bg-indigo-600 text-white' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
        {loading && <p className="text-sm text-gray-500">Loading…</p>}

        {!loading && !error && trend && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-semibold">{trend.studentName || 'Student'}</h2>
              <span className="text-xs text-gray-500">
                Current: {currentScore != null ? Math.round(currentScore) : '–'} ({currentZone || 'n/a'})
                {isDaily && points.length > 0 && (
                  <> · {points.filter((p) => p.totalEvents > 0).length} active day{points.filter((p) => p.totalEvents > 0).length === 1 ? '' : 's'} in window</>
                )}
              </span>
            </div>

            {points.length === 0 && (
              <p className="text-sm text-gray-500">No risk events yet for this student.</p>
            )}

            {points.length > 0 && isDaily && (
              <RiskScoreDailyChart points={points} />
            )}

            {points.length > 0 && !isDaily && (
              <RiskScoreSparkline points={points} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}