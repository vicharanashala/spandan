import React, { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useIsMobile from '../hooks/useIsMobile'
import { API_URL } from '../config.js'
import { classApi } from '../lib/api'

const formatDate = (date) => {
  if (!date) return '—'
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
}

const formatRank = (rank) => rank == null ? '—' : `#${rank}`

// Distinct colours for the three journey charts + the speed/accuracy quadrants,
// so every graph is easy to tell apart at a glance.
const JOURNEY_COLORS = {
  score: '#2563eb',     // blue
  accuracy: '#8b5cf6',  // violet
  rank: '#f97316'       // orange
}

const QUADRANT_COLORS = {
  fastAccurate: '#0d9488', // teal
  slowAccurate: '#6366f1', // indigo
  fastWrong: '#f59e0b',    // amber
  slowWrong: '#e11d48'     // rose
}

function getSessionLabel(point, index, maxLength = 20) {
  const name = String(point?.name || `Session ${index + 1}`)
  return name.length > maxLength ? `${name.slice(0, maxLength - 1)}…` : name
}

function getSessionLabelLines(name) {
  const words = String(name || 'Session').split(/\s+/)
  if (words.length <= 1) return [String(name || 'Session')]
  const midpoint = Math.ceil(words.length / 2)
  return [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')].filter(Boolean)
}

// Wraps a session name into up to `maxLines` short lines so the whole name stays readable
// under each chart column instead of being cut to a few characters.
function wrapSessionLabel(name, maxChars = 12, maxLines = 3) {
  const words = String(name || 'Session').trim().split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  for (let word of words) {
    while (word.length > maxChars) {
      if (current) { lines.push(current); current = '' }
      lines.push(word.slice(0, maxChars))
      word = word.slice(maxChars)
    }
    if (!word) continue
    if (!current) current = word
    else if ((`${current} ${word}`).length <= maxChars) current = `${current} ${word}`
    else { lines.push(current); current = word }
  }
  if (current) lines.push(current)
  if (!lines.length) lines.push('Session')
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    const last = kept[maxLines - 1]
    kept[maxLines - 1] = `${last.length >= maxChars ? last.slice(0, maxChars - 1) : last}…`
    return kept
  }
  return lines
}

function SessionAxisLabel({ x, y, point, index, slotWidth }) {
  const maxChars = Math.max(7, Math.floor(slotWidth / 6.4))
  const lines = wrapSessionLabel(point?.name || `Session ${index + 1}`, maxChars, 3)
  return (
    <text x={x} y={y} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-primary)" opacity="0.88">
      {lines.map((line, lineIndex) => <tspan key={lineIndex} x={x} dy={lineIndex === 0 ? 0 : 13}>{line}</tspan>)}
      <title>{point?.name || `Session ${index + 1}`}</title>
    </text>
  )
}


function TrendLine({ points, unit = '%', yLabel = 'Score (%)', color = '#2563eb' }) {
  const cleanPoints = (points || []).filter(point => Number.isFinite(Number(point.value))).slice(-5)
  if (!cleanPoints.length) {
    return <div style={{ minHeight: 280, display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Complete a session to start your journey.</div>
  }

  // Fit the latest five sessions inside the card; labels wrap like Session-to-Session Score Change.
  const width = Math.max(520, cleanPoints.length * 48 + 100)
  const height = 320
  const left = 64
  const right = 10
  const top = 22
  const bottom = 72
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const xAt = index => left + ((index + 0.5) / cleanPoints.length) * plotWidth
  const yAt = value => top + (100 - Math.max(0, Math.min(100, Number(value) || 0))) / 100 * plotHeight
  const path = cleanPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index).toFixed(1)} ${yAt(point.value).toFixed(1)}`).join(' ')
  const area = `${path} L ${xAt(cleanPoints.length - 1).toFixed(1)} ${top + plotHeight} L ${xAt(0).toFixed(1)} ${top + plotHeight} Z`

  return (
    <div style={{ minWidth: 0, width: '100%', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${yLabel} by session`} style={{ width: '100%', minWidth: 0, height: 'auto', display: 'block' }}>
        {[0, 20, 40, 60, 80, 100].map(tick => {
          const y = yAt(tick)
          return <g key={tick}>
            <line x1={left} y1={y} x2={width - right} y2={y} stroke="var(--border-color)" strokeDasharray="4 5" />
            <text x={left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="var(--text-secondary)">{tick}</text>
          </g>
        })}
        <path d={area} fill={color} opacity="0.12" />
        <path className="trend-line" pathLength="1" d={path} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {cleanPoints.map((point, index) => (
          <g key={`${point.roomId || point.date || point.name}-${index}`}>
            <circle className="trend-point" cx={xAt(index)} cy={yAt(point.value)} r="5" fill="var(--bg-card)" stroke={color} strokeWidth="3">
              <title>{`${point.name || `Session ${index + 1}`}: ${point.value}${unit}`}</title>
            </circle>
            <text x={xAt(index)} y={top + plotHeight + 18} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">{getSessionLabelLines(getSessionLabel(point, index, 24)).map((line, lineIndex) => <tspan key={lineIndex} x={xAt(index)} dy={lineIndex === 0 ? 0 : 12}>{line}</tspan>)}<title>{point.name || `Session ${index + 1}`}</title></text>
          </g>
        ))}
        <line x1={left} y1={top} x2={left} y2={top + plotHeight} stroke="var(--border-color)" />
        <line x1={left} y1={top + plotHeight} x2={width - right} y2={top + plotHeight} stroke="var(--border-color)" />
        <text x={left + plotWidth / 2} y={height - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-secondary)">Session name</text>
      </svg>
    </div>
  )
}

function AccuracyBarChart({ points, color = '#8b5cf6' }) {
  const cleanPoints = (points || []).filter(point => Number.isFinite(Number(point.value)))
  if (!cleanPoints.length) {
    return <div style={{ minHeight: 280, display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Accuracy data will appear after a completed session.</div>
  }
  const width = Math.max(520, cleanPoints.length * 48 + 100)
  const height = 330
  const left = 64
  const right = 22
  const top = 22
  const bottom = 82
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const slotWidth = plotWidth / cleanPoints.length
  const average = cleanPoints.reduce((sum, point) => sum + Number(point.value), 0) / cleanPoints.length
  const xAt = index => left + ((index + 0.5) / cleanPoints.length) * plotWidth
  const yAt = value => top + (100 - Math.max(0, Math.min(100, Number(value) || 0))) / 100 * plotHeight
  return (
    <div style={{ minWidth: 0, width: '100%', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Accuracy percentage by session, shown as bars with an average accuracy line" style={{ width: '100%', minWidth: 0, height: 'auto', display: 'block' }}>
        <defs>
          <linearGradient id="accuracy-bar-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {[0, 20, 40, 60, 80, 100].map(tick => {
          const y = yAt(tick)
          return <g key={tick}>
            <line x1={left} y1={y} x2={width - right} y2={y} stroke="var(--border-color)" strokeDasharray="4 5" />
            <text x={left - 10} y={y + 4} textAnchor="end" fontSize="12" fill="var(--text-secondary)">{tick}</text>
          </g>
        })}
        {cleanPoints.map((point, index) => {
          const value = Math.max(0, Math.min(100, Number(point.value) || 0))
          const barWidth = Math.min(42, slotWidth * 0.58)
          const y = yAt(value)
          return <g key={`${point.roomId || point.date || point.name}-${index}`}>
            <rect x={xAt(index) - barWidth / 2} y={y} width={barWidth} height={Math.max(1, top + plotHeight - y)} rx="5" fill="url(#accuracy-bar-gradient)">
              <title>{`${point.name || `Session ${index + 1}`}: ${value}% accuracy`}</title>
            </rect>
            <text x={xAt(index)} y={Math.max(12, y - 6)} textAnchor="middle" fontSize="11" fontWeight="800" fill={color}>{Math.round(value)}%</text>
            <SessionAxisLabel x={xAt(index)} y={top + plotHeight + 18} point={point} index={index} slotWidth={slotWidth} />
          </g>
        })}
        <line x1={left} y1={yAt(average)} x2={width - right} y2={yAt(average)} stroke="#6d28d9" strokeWidth="2.5" strokeDasharray="7 5" />
        <text x={width - right - 3} y={Math.max(14, yAt(average) - 9)} textAnchor="end" fontSize="12" fontWeight="800" fill="#6d28d9">Average {Math.round(average)}%</text>
        <line x1={left} y1={top} x2={left} y2={top + plotHeight} stroke="var(--border-color)" />
        <line x1={left} y1={top + plotHeight} x2={width - right} y2={top + plotHeight} stroke="var(--border-color)" />
        <text x="17" y={top + plotHeight / 2} transform={`rotate(-90 17 ${top + plotHeight / 2})`} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-secondary)">Accuracy (%)</text>
        <text x={left + plotWidth / 2} y={height - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-secondary)">Session name</text>
      </svg>
    </div>
  )
}

function RankJourneyChart({ points, color = '#ea580c' }) {
  const cleanPoints = (points || []).filter(point => Number.isFinite(Number(point.value)) && Number(point.value) > 0)
  if (!cleanPoints.length) {
    return <div style={{ minHeight: 280, display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Rank data will appear when session rankings are available.</div>
  }
  const width = Math.max(520, cleanPoints.length * 48 + 100)
  const height = 330
  const left = 64
  const right = 22
  const top = 22
  const bottom = 82
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const slotWidth = plotWidth / cleanPoints.length
  const highestRank = Math.max(1, ...cleanPoints.map(point => Number(point.value)))
  const axisMax = Math.max(5, Math.ceil(highestRank / 5) * 5)
  const yAt = value => top + ((Math.max(1, Math.min(axisMax, Number(value) || 1)) - 1) / Math.max(axisMax - 1, 1)) * plotHeight
  const xAt = index => left + ((index + 0.5) / cleanPoints.length) * plotWidth
  const tickValues = Array.from({ length: 6 }, (_, index) => Math.round(1 + ((axisMax - 1) / 5) * index))
  let stepPath = ''
  cleanPoints.forEach((point, index) => {
    const x = xAt(index)
    const y = yAt(point.value)
    if (index === 0) stepPath = `M ${x} ${y}`
    else stepPath += ` H ${x} V ${y}`
  })
  const areaPath = `${stepPath} L ${xAt(cleanPoints.length - 1)} ${top + plotHeight} L ${xAt(0)} ${top + plotHeight} Z`
  return (
    <div style={{ minWidth: 0, width: '100%', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Rank by session. A lower rank number means a better position." style={{ width: '100%', minWidth: 0, height: 'auto', display: 'block' }}>
        {tickValues.map((tick, index) => {
          const y = yAt(tick)
          return <g key={`${tick}-${index}`}>
            <line x1={left} y1={y} x2={width - right} y2={y} stroke="var(--border-color)" strokeDasharray="4 5" />
            <text x={left - 10} y={y + 4} textAnchor="end" fontSize="12" fill="var(--text-secondary)">{tick}</text>
          </g>
        })}
        <path d={areaPath} fill={color} opacity="0.10" />
        <path d={stepPath} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="7 4" />
        {cleanPoints.map((point, index) => (
          <g key={`${point.roomId || point.date || point.name}-${index}`}>
            <circle cx={xAt(index)} cy={yAt(point.value)} r="5.5" fill={color} stroke="var(--bg-card)" strokeWidth="2.5">
              <title>{`${point.name || `Session ${index + 1}`}: rank ${point.value} (lower is better)`}</title>
            </circle>
            <text x={xAt(index)} y={Math.max(12, yAt(point.value) - 10)} textAnchor="middle" fontSize="11" fontWeight="800" fill={color}>#{point.value}</text>
            <SessionAxisLabel x={xAt(index)} y={top + plotHeight + 18} point={point} index={index} slotWidth={slotWidth} />
          </g>
        ))}
        <line x1={left} y1={top} x2={left} y2={top + plotHeight} stroke="var(--border-color)" />
        <line x1={left} y1={top + plotHeight} x2={width - right} y2={top + plotHeight} stroke="var(--border-color)" />
        <text x="17" y={top + plotHeight / 2} transform={`rotate(-90 17 ${top + plotHeight / 2})`} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-secondary)">Rank (lower is better)</text>
        <text x={left + plotWidth / 2} y={height - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-secondary)">Session name</text>
      </svg>
    </div>
  )
}

function getAttendanceActivity(history) {
  const sessionsByDay = new Map()
  for (const session of (history || []).filter(item => item.attended && item.date)) {
    const date = new Date(session.date)
    if (Number.isNaN(date.getTime())) continue
    date.setHours(0, 0, 0, 0)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    sessionsByDay.set(key, (sessionsByDay.get(key) || 0) + 1)
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = []
  for (let offset = 27; offset >= 0; offset--) {
    const date = new Date(today)
    date.setDate(today.getDate() - offset)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const count = sessionsByDay.get(key) || 0
    days.push({ date, count, key, level: count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3 })
  }
  let longestStreak = 0
  let streak = 0
  for (const day of days) {
    streak = day.count ? streak + 1 : 0
    longestStreak = Math.max(longestStreak, streak)
  }
  let currentStreak = 0
  let index = days.length - 1
  // Keep a streak alive through today if the last attendance was yesterday.
  if (index >= 0 && days[index].count === 0) index -= 1
  while (index >= 0 && days[index].count > 0) {
    currentStreak += 1
    index -= 1
  }
  const activeDays = days.filter(day => day.count > 0).length
  return { days, currentStreak, longestStreak, activeDays }
}

function AttendanceStreak({ history, isMobile }) {
  const activity = getAttendanceActivity(history)
  const cellColors = ['var(--bg-secondary, #eef2f7)', '#d9f99d', '#86efac', '#16a34a']
  return (
    <section className="chart-card attendance-streak" style={{ padding: isMobile ? 16 : 22, marginBottom: 18, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22 }} aria-label="Session attendance streak">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 180 }}>
          <div style={{ width: 54, height: 54, display: 'grid', placeItems: 'center', borderRadius: 17, background: 'linear-gradient(135deg, rgba(249,115,22,.16), rgba(234,88,12,.06))', fontSize: 30 }} aria-hidden="true">🔥</div>
          <div>
            <div style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 800 }}>Session Streak</div>
            <div style={{ color: '#ea580c', fontSize: 25, lineHeight: 1.2, fontWeight: 900, letterSpacing: '-0.03em' }}>{activity.currentStreak} {activity.currentStreak === 1 ? 'day' : 'days'}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 3 }}>{activity.currentStreak ? 'Great consistency—keep your streak going!' : 'Attend sessions regularly to start building your streak.'}</div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Last 28 Days</div>
          <div className="streak-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(28, minmax(5px, 1fr))', gap: 4, alignItems: 'center' }}>
            {activity.days.map(day => (
              <span key={day.key} title={`${formatDate(day.date)}: ${day.count} attended ${day.count === 1 ? 'session' : 'sessions'}`} aria-label={`${formatDate(day.date)}: ${day.count} sessions`} style={{ display: 'block', aspectRatio: '1', minWidth: 5, borderRadius: 3, background: cellColors[day.level], outline: day.count ? '1px solid rgba(22,163,74,.12)' : '1px solid var(--border-color)' }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--text-secondary)', fontSize: 10, marginTop: 6 }}><span>28 days ago</span><span>Today</span></div>
        </div>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', paddingLeft: isMobile ? 0 : 18, borderLeft: isMobile ? 'none' : '1px solid var(--border-color)' }}>
          <div><div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Longest in 28 days</div><strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: 21, marginTop: 4 }}>{activity.longestStreak} days</strong></div>
          <div><div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Active days</div><strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: 21, marginTop: 4 }}>{activity.activeDays}/28</strong></div>
        </div>
      </div>
    </section>
  )
}

function PerformanceMetric({ label, value, caption, icon }) {
  return (
    <div className="performance-metric" style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: '18px',
      padding: '20px',
      boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))',
      minWidth: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span className="metric-icon" style={{ fontSize: 19 }}>{icon}</span>
      </div>
      <div style={{ marginTop: 10, fontSize: 30, lineHeight: 1.1, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>{caption}</div>
    </div>
  )
}

function NextAccuracyMilestone({ history, isMobile }) {
  const attended = (history || []).filter(session => session?.attended)
  const previousSessions = attended.slice(-6, -3)
  const recentSessions = attended.slice(-3)

  const calculateAccuracy = (sessions) => {
    const attempted = sessions.reduce((total, session) => total + (Number(session.attemptedQuestions) || 0), 0)
    const correct = sessions.reduce((total, session) => total + (Number(session.correctAnswers) || 0), 0)
    return attempted > 0 ? Math.round((correct / attempted) * 100) : null
  }

  const baselineAccuracy = calculateAccuracy(previousSessions)
  const recentAccuracy = calculateAccuracy(recentSessions)

  if (recentAccuracy == null) {
    return (
      <section className="chart-card" style={{ padding: isMobile ? 16 : 22, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, boxShadow: 'var(--shadow-md)', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} aria-label="Next accuracy milestone">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span aria-hidden="true" style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 13, display: 'grid', placeItems: 'center', background: 'rgba(22,163,74,.10)', fontSize: 22 }}>🎯</span>
          <div><h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Next Accuracy Milestone</h2><p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>Your next accuracy target</p></div>
        </div>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>Your accuracy goal will appear after you answer questions in a completed live session.</p>
      </section>
    )
  }

  const hasComparison = baselineAccuracy != null
  const targetBase = hasComparison ? baselineAccuracy : recentAccuracy
  const targetAccuracy = Math.min(100, targetBase + 5)
  const goalRange = targetAccuracy - targetBase
  const progress = hasComparison
    ? (goalRange <= 0
        ? (recentAccuracy >= targetAccuracy ? 100 : 0)
        : Math.max(0, Math.min(100, Math.round(((recentAccuracy - targetBase) / goalRange) * 100))))
    : null
  const goalReached = hasComparison && recentAccuracy >= targetAccuracy
  const difference = recentAccuracy - (baselineAccuracy ?? recentAccuracy)

  return (
    <section className="chart-card" style={{ padding: isMobile ? 16 : 22, background: 'linear-gradient(145deg, rgba(22,163,74,.07), var(--bg-card) 66%)', border: '1px solid var(--border-color)', borderRadius: 22, boxShadow: 'var(--shadow-md)', minWidth: 0, display: 'flex', flexDirection: 'column' }} aria-label="Next accuracy milestone">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span aria-hidden="true" style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 13, display: 'grid', placeItems: 'center', background: 'rgba(22,163,74,.12)', fontSize: 22 }}>🎯</span>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Next Accuracy Milestone</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>A personal target calculated from session data</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>Next target</div>
          <div style={{ color: '#15803d', fontSize: 38, lineHeight: 1, fontWeight: 900, letterSpacing: '-0.04em' }}>{targetAccuracy}%</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>Recent accuracy</div>
          <div style={{ color: 'var(--text-primary)', fontSize: 24, fontWeight: 850 }}>{recentAccuracy}%</div>
        </div>
      </div>

      {hasComparison ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Progress toward target</span>
            <strong style={{ color: goalReached ? '#15803d' : 'var(--text-primary)', fontSize: 12 }}>{goalReached ? 'Goal reached 🎉' : `${progress}%`}</strong>
          </div>
          <div role="progressbar" aria-label="Progress toward next accuracy milestone" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} style={{ height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--bg-secondary, #e5e7eb)' }}>
            <div style={{ height: '100%', width: `${progress}%`, borderRadius: 999, background: goalReached ? '#16a34a' : 'linear-gradient(90deg, #22c55e, #0d9488)', transition: 'width .3s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, color: 'var(--text-secondary)', fontSize: 11 }}>
            <span>Baseline: {baselineAccuracy}%</span>
            <span>Target: {targetAccuracy}%</span>
          </div>
          <div style={{ marginTop: 14, borderRadius: 12, padding: 11, background: 'rgba(22,163,74,.08)', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.55 }}>
            {goalReached
              ? `You have reached the target based on the previous ${previousSessions.length} attended ${previousSessions.length === 1 ? 'session' : 'sessions'}. Keep up the consistency in your next live sessions.`
              : difference > 0
                ? `Your latest ${recentSessions.length} attended sessions are ${difference} percentage point${difference === 1 ? '' : 's'} above the previous baseline. Keep checking each option carefully to reach the target.`
                : `Aim to improve by up to 5 percentage points from the previous-session baseline. Read each question and its options carefully before submitting.`}
          </div>
        </>
      ) : (
        <>
          <div style={{ height: 10, borderRadius: 999, background: 'var(--bg-secondary, #e5e7eb)', overflow: 'hidden' }}>
            <div style={{ width: '0%', height: '100%', borderRadius: 999, background: '#16a34a' }} />
          </div>
          <div style={{ marginTop: 12, borderRadius: 12, padding: 11, background: 'rgba(22,163,74,.08)', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.55 }}>
            Your starting accuracy is based on your latest {recentSessions.length} attended {recentSessions.length === 1 ? 'session' : 'sessions'}. The target is set 5 percentage points higher (up to 100%). Complete more sessions to compare against a previous baseline and calculate meaningful progress.
          </div>
        </>
      )}
    </section>
  )
}

function EmptyState({ onJoin }) {
  return (
    <div className="journey-empty" style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22,
      padding: 36, textAlign: 'center', boxShadow: 'var(--shadow-md)'
    }}>
      <div className="empty-icon" style={{ fontSize: 46, marginBottom: 12 }}>📈</div>
      <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 22 }}>Your performance journey starts here</h2>
      <p style={{ margin: '10px auto 20px', maxWidth: 520, color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: 14 }}>
        Finish a Spandan live session and this page will automatically build your long-term performance history.
      </p>
      <button className="empty-join-btn" onClick={onJoin} style={{
        border: 'none', borderRadius: 12, padding: '11px 18px', background: 'var(--accent-gradient)', color: '#fff',
        fontWeight: 700, cursor: 'pointer', fontSize: 14
      }}>Join a Session</button>
    </div>
  )
}

function buildAnsweringInsights(summary, sessions, questionTypes) {
  const strengths = []
  const improvements = []
  const keyInsights = []
  const validTypes = questionTypes
    .filter(item => Number(item.attempted) >= 5 && Number.isFinite(Number(item.accuracy)))
    .map(item => ({ ...item, attempted: Number(item.attempted), accuracy: Number(item.accuracy) }))
  const overallAccuracy = Number(summary?.overallAccuracy) || 0
  const totalQuestions = Number(summary?.totalQuestions) || 0
  const missedQuestions = Number(summary?.missedQuestions) || 0
  const attemptedQuestions = Number(summary?.attemptedQuestions) || 0
  const missedRate = totalQuestions > 0 ? missedQuestions / totalQuestions * 100 : 0

  // Prefer a well-supported question type that performs above the student's overall accuracy.
  const strongestType = [...validTypes].sort((a, b) => b.accuracy - a.accuracy || b.attempted - a.attempted)[0]
  if (strongestType && (strongestType.accuracy >= 70 || strongestType.accuracy >= overallAccuracy + 5)) {
    strengths.push({
      title: 'Strong question type',
      text: `Keep up your ${strongestType.label} performance.`
    })
  }

  // Use overall accuracy as a second evidence-based strength when type-level data isn't decisive.
  if (overallAccuracy >= 70 && attemptedQuestions >= 5 && strengths.length < 2) {
    strengths.push({
      title: 'Good overall accuracy',
      text: 'Keep checking answers before submitting.'
    })
  }
  if (missedRate < 5 && totalQuestions >= 10 && strengths.length < 2) {
    strengths.push({
      title: 'Consistent participation',
      text: 'Keep participating in every poll.'
    })
  }

  const weakestType = [...validTypes].sort((a, b) => a.accuracy - b.accuracy || b.attempted - a.attempted)[0]
  if (weakestType && (weakestType.accuracy < 65 || weakestType.accuracy <= overallAccuracy - 10)) {
    improvements.push({
      title: 'Question type to practise',
      text: `Practise ${weakestType.label} questions more carefully.`
    })
  }
  if (totalQuestions > 0 && missedRate >= 10) {
    improvements.push({
      title: 'Unanswered questions',
      text: 'Answer every question before time ends.'
    })
  }
  if (!improvements.length && attemptedQuestions >= 5 && overallAccuracy < 60) {
    improvements.push({
      title: 'Overall accuracy to improve',
      text: 'Read carefully before choosing answers.'
    })
  }

  // Avoid duplicating the latest-session change as both a Strength and a Key Insight.
  if (sessions.length >= 4) {
    const windowSize = Math.min(3, Math.floor(sessions.length / 2))
    const previousWindow = sessions.slice(-2 * windowSize, -windowSize)
    const recentWindow = sessions.slice(-windowSize)
    const weightedAccuracy = items => {
      const attempted = items.reduce((sum, item) => sum + (Number(item.attemptedQuestions) || 0), 0)
      const correct = items.reduce((sum, item) => sum + (Number(item.correctAnswers) || 0), 0)
      return attempted > 0 ? Math.round(correct / attempted * 100) : null
    }
    const before = weightedAccuracy(previousWindow)
    const now = weightedAccuracy(recentWindow)
    if (before != null && now != null) {
      const change = now - before
      keyInsights.push({
        title: change >= 5 ? 'Long-term progress' : change <= -5 ? 'Long-term trend to review' : 'Long-term accuracy is steady',
        text: change >= 5 ? 'Recent sessions show clear progress.' : change <= -5 ? 'Recent accuracy needs attention.' : 'Your accuracy remains consistent.'
      })
    }
  }

  if (keyInsights.length < 2 && sessions.length >= 2) {
    const latest = sessions[sessions.length - 1]
    const previous = sessions[sessions.length - 2]
    const change = Number(latest.accuracy) - Number(previous.accuracy)
    keyInsights.push({
      title: change >= 5 ? 'Recent accuracy improved' : change <= -5 ? 'Recent accuracy declined' : 'Recent accuracy is steady',
      text: change >= 5 ? 'Your latest session improved.' : change <= -5 ? 'Your latest session declined.' : 'Your latest session stayed steady.'
    })
  }

  if (!strengths.length) strengths.push({
    title: 'Strengths still emerging',
    text: validTypes.length
      ? `Keep practising ${strongestType.label} questions.`
      : 'Complete more sessions to find strengths.'
  })
  if (!improvements.length) improvements.push({
    title: 'No major concern detected',
    text: validTypes.length || attemptedQuestions >= 5
      ? 'Keep checking questions carefully.'
      : 'Answer more questions to identify focus areas.'
  })
  if (!keyInsights.length) keyInsights.push({
    title: 'More sessions needed for trends',
    text: 'Complete more sessions to reveal trends.'
  })

  return { strengths: strengths.slice(0, 2), improvements: improvements.slice(0, 2), keyInsights: keyInsights.slice(0, 2) }
}

function AnsweringPatternSection({ summary, history, answeringPattern, isMobile }) {
  const attended = history.filter(item => item.attended)
  const recentSessions = attended.slice(-5)
  const typeLabels = { TF: 'True / False', MCQ: 'Single Answer (MCQ)', MSQ: 'Multiple Select (MSQ)' }
  const shortTypeLabels = { TF: 'True / False', MCQ: 'MCQ', MSQ: 'MSQ' }
  const questionTypes = ['MCQ', 'MSQ', 'TF'].map(type => {
    const existing = (answeringPattern?.questionTypes || []).find(item => String(item.type).toUpperCase() === type)
    return {
      type,
      label: typeLabels[type],
      shortLabel: shortTypeLabels[type],
      attempted: Number(existing?.attempted) || 0,
      correct: Number(existing?.correct) || 0,
      incorrect: Number(existing?.incorrect) || Math.max(0, (Number(existing?.attempted) || 0) - (Number(existing?.correct) || 0)),
      accuracy: Number(existing?.accuracy) || 0,
      available: Boolean(existing && Number(existing.attempted) > 0)
    }
  })
  const insights = buildAnsweringInsights(summary, attended, questionTypes)
  const correct = Number(summary?.correctAnswers) || 0
  const incorrect = Number(summary?.incorrectAnswers) || 0
  const unanswered = Number(summary?.missedQuestions) || 0
  const attemptedQuestions = Number(summary?.attemptedQuestions) || 0
  const totalQuestions = Number(summary?.totalQuestions) || 0
  const totalAnswers = correct + incorrect + unanswered
  const percent = value => totalAnswers > 0 ? Math.round((value / totalAnswers) * 100) : 0
  const averageResponseTime = answeringPattern?.averageResponseTime != null && Number.isFinite(Number(answeringPattern.averageResponseTime))
    ? Number(answeringPattern.averageResponseTime)
    : null
  const cardStyle = {
    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
    borderRadius: 22, padding: isMobile ? 16 : 22, minWidth: 0, boxShadow: 'var(--shadow-md)'
  }
  const miniStatStyle = { borderRadius: 13, padding: 12, background: 'var(--bg-secondary, rgba(127,127,127,0.06))', minWidth: 0 }
  const InsightList = ({ title, icon, color, items }) => (
    <div className="chart-card insight-list-card" style={{ ...cardStyle, background: `linear-gradient(145deg, color-mix(in srgb, ${color} 5%, var(--bg-card)), var(--bg-card))` }}>
      <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8, color, fontSize: 16, fontWeight: 800 }}><span aria-hidden="true">{icon}</span>{title}</h3>
      <div style={{ display: 'grid', gap: 7 }}>
        {items.map((item, index) => (
          <div className="insight-item" key={`${item.title}-${index}`} title={`${item.title}: ${item.text}`} tabIndex={0} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', borderRadius: 12, padding: 9, margin: '-2px -8px', outlineOffset: 2 }}>
            <span style={{ flex: '0 0 23px', height: 23, display: 'grid', placeItems: 'center', borderRadius: 8, background: `${color}18`, color, fontSize: 12, fontWeight: 800 }}>{index + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 13 }}>{item.title}</div>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.55 }}>{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, margin: '24px 0 14px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: isMobile ? 21 : 25, fontWeight: 850, letterSpacing: '-0.03em' }}><span aria-hidden="true" style={{ color: '#d97706', display: 'inline-flex', alignItems: 'center', marginRight: 9, verticalAlign: 'middle' }}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8h6M9 12h3M9 16l2 2 4-4"/></svg></span><span id="answering-pattern" style={{ scrollMarginTop: 100 }}>Answering Pattern</span></h2>
          <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}></p>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Last {Math.min(5, attended.length)} attended sessions shown in the chart</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
        <div className="chart-card" style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <div><h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 17, fontWeight: 800 }}>Answers per Session</h3><p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}></p></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: 'var(--text-secondary)' }}>{[['Correct', '#0d9488'], ['Incorrect','#f97316'], ['Unanswered', '#6366f1']].map(([label, color]) => <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />{label}</span>)}</div>
          </div>
          {recentSessions.length === 0 ? <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 20 }}>Attend a completed session to see this graph.</p> : (() => {
            const maxCount = Math.max(1, ...recentSessions.map(session => Number(session.totalQuestions) || ((Number(session.correctAnswers) || 0) + (Number(session.incorrectAnswers) || 0) + (Number(session.missedQuestions) || 0))))
            const axisMax = Math.max(5, Math.ceil(maxCount / 5) * 5)
            const ticks = 5
            return <div style={{ display: 'flex', gap: 7, alignItems: 'stretch', marginTop: 16 }}>
              <div aria-label="Y-axis: questions" style={{ width: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: 'var(--text-secondary)', fontSize: 10, fontWeight: 700 }}>Questions</div>
              <div style={{ width: 25, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingBottom: 4, color: 'var(--text-secondary)', fontSize: 10, textAlign: 'right' }}>
                {Array.from({ length: ticks + 1 }, (_, i) => Math.round(axisMax - (axisMax / ticks) * i)).map((value, i) => <span key={`${value}-${i}`}>{value}</span>)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ position: 'relative', height: 220, borderBottom: '1px solid var(--border-color)', borderLeft: '1px solid var(--border-color)', background: `repeating-linear-gradient(to bottom, transparent 0, transparent calc(20% - 1px), var(--border-color) calc(20% - 1px), var(--border-color) 20%)`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 8, padding: '0 7px', boxSizing: 'border-box' }}>
                  {recentSessions.map((session, index) => {
                    const correctCount = Number(session.correctAnswers) || 0
                    const incorrectCount = Number(session.incorrectAnswers) || 0
                    const unansweredCount = Number(session.missedQuestions) || 0
                    const total = correctCount + incorrectCount + unansweredCount
                    const partHeight = value => `${(value / axisMax) * 100}%`
                    const title = `${session.name}: ${correctCount} correct, ${incorrectCount} incorrect, ${unansweredCount} unanswered (${total} total)`
                    return <div key={session.roomId || `${session.name}-${index}`} title={title} style={{ height: '100%', flex: '1 1 0', minWidth: 0, maxWidth: 68, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <div style={{ height: `${Math.min(100, (total / axisMax) * 100)}%`, width: 'min(100%, 42px)', minHeight: total > 0 ? 2 : 0, display: 'flex', flexDirection: 'column-reverse', overflow: 'hidden', borderRadius: '5px 5px 0 0', alignSelf: 'center' }}>
                        <div style={{ height: partHeight(correctCount), background: '#0d9488' }} />
                        <div style={{ height: partHeight(incorrectCount), background: '#f97316' }} />
                        <div style={{ height: partHeight(unansweredCount), background: '#6366f1' }} />
                      </div>
                    </div>
                  })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${recentSessions.length}, minmax(0, 1fr))`, gap: 6, paddingTop: 7 }}>
                  {recentSessions.map((session, index) => <div key={session.roomId || `${session.name}-label-${index}`} title={session.name || 'Unnamed session'} style={{ minWidth: 0, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name || `Session ${index + 1}`}</div>)}
                </div>
                <div style={{ textAlign: 'center', paddingTop: 7, color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }}>Sessions</div>
              </div>
            </div>
          })()}
        </div>
        <div className="chart-card" style={cardStyle}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 17, fontWeight: 800 }}>Question Type Performance</h3>
          <p style={{ margin: '5px 0 18px', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5 }}></p>
          <div style={{ display: 'grid', gap: 16 }}>
            {questionTypes.map(item => {
              const typeColor = item.type === 'MCQ' ? '#6366f1' : item.type === 'MSQ' ? '#0d9488' : '#d97706'
              return <div key={item.type}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 7, fontSize: 12 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{item.shortLabel}</strong>
                  <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>
                    {item.available ? `${item.accuracy}% accuracy · ${item.attempted} attempted` : 'No data yet'}
                  </span>
                </div>
                <div style={{ height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--bg-secondary, #e5e7eb)' }}>
                  <div aria-label={item.available ? `${item.shortLabel}: ${item.accuracy}% accuracy` : `${item.shortLabel}: no data yet`} style={{ width: `${item.available ? Math.max(0, Math.min(100, item.accuracy)) : 0}%`, height: '100%', borderRadius: 999, background: typeColor, transition: 'width .3s ease' }} />
                </div>
              </div>
            })}
          </div>
        </div>
      </div>

      <div style={{ margin: '24px 0 14px' }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: isMobile ? 21 : 25, fontWeight: 850, letterSpacing: '-0.03em' }}><span aria-hidden="true" style={{ color: '#d97706', display: 'inline-flex', alignItems: 'center', marginRight: 9, verticalAlign: 'middle' }}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M8.2 14.5A7 7 0 1 1 15.8 14.5c-.9.7-1.3 1.5-1.4 2.5h-5c-.1-1-.5-1.8-1.2-2.5Z"/><path d="M12 3v2M5.6 5.6 7 7M18.4 5.6 17 7"/></svg></span><span id="performance-insights" style={{ scrollMarginTop: 100 }}>Performance Insights</span></h2>
        <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}></p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
        <InsightList title="Strengths / Areas to Gain" icon="↗" color="#15803d" items={insights.strengths} />
        <InsightList title="Areas to Improve" icon="🎯" color="#b91c1c" items={insights.improvements} />
        <InsightList title="Key Insights" icon="✦" color="#6d28d9" items={insights.keyInsights} />
      </div>
    </div>
  )
}

function PerformanceHighlights({ best, weakest, history, isMobile, navigate, embedded, selectedClassId, embeddedClassId }) {
  // These were previously referenced without being defined in this component, which would throw on click.
  const location = useLocation()
  const routeClassId = location.pathname.match(/^\/student\/classes\/([^/]+)/)?.[1]
  const queryClassId = new URLSearchParams(location.search).get('classId')
  const highlightItems = [
    { label: 'Best Performance', description: 'Your highest-scoring attended session', item: best, icon: '🏅', color: '#15803d', background: 'rgba(22,163,74,.08)' },
    { label: 'Weakest Performance', description: 'A session worth reviewing', item: weakest, icon: '🔎', color: '#b45309', background: 'rgba(245,158,11,.09)' }
  ]
  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ marginBottom: 13 }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: isMobile ? 21 : 24, fontWeight: 850, letterSpacing: '-0.025em' }}><span aria-hidden="true" style={{ color: '#d97706', display: 'inline-flex', alignItems: 'center', marginRight: 9, verticalAlign: 'middle' }}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 12v5M8 21h8M10 17h4"/></svg></span><span id="best-weakest-performance" style={{ scrollMarginTop: 100 }}>Best & Weakest Performance</span></h2>
        <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}></p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
        {highlightItems.map(({ label, description, item, icon, color, background }) => {
          const relatedSession = item?.roomId ? history.find(session => String(session.roomId) === String(item.roomId)) : null
          return (
            <div className="chart-card highlight-card" key={label} style={{ position: 'relative', padding: isMobile ? 17 : 22, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 20, minWidth: 0, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: color }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, flexShrink: 0, borderRadius: 14, background, fontSize: 23 }}>{icon}</span>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, color, fontSize: 16, fontWeight: 850 }}>{label}</h3>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>{description}</p>
                </div>
              </div>
              {item ? <>
                <div style={{ color: 'var(--text-primary)', fontSize: 17, fontWeight: 850, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{item.name || 'Untitled session'}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{relatedSession?.date ? formatDate(relatedSession.date) : 'Completed session'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 17 }}>
                  <div style={{ borderRadius: 12, padding: 11, background: 'var(--bg-secondary, rgba(127,127,127,.06))' }}><div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Score</div><strong style={{ display: 'block', color, fontSize: 20, marginTop: 3 }}>{Number(item.score) || 0}%</strong></div>
                  <div style={{ borderRadius: 12, padding: 11, background: 'var(--bg-secondary, rgba(127,127,127,.06))' }}><div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Accuracy</div><strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: 20, marginTop: 3 }}>{Number(item.accuracy) || 0}%</strong></div>
                  <div style={{ borderRadius: 12, padding: 11, background: 'var(--bg-secondary, rgba(127,127,127,.06))' }}><div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Rank</div><strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: 20, marginTop: 3 }}>{formatRank(item.rank)}</strong></div>
                </div>
                {item.roomId && <button type="button" className="session-view-button" style={{ marginTop: 14 }} onClick={() => {
                  const currentClassId = embeddedClassId || routeClassId || queryClassId || location.state?.classId || (selectedClassId !== 'all' ? selectedClassId : null)
                  const returnTo = currentClassId && currentClassId !== 'all'
                    ? `/student/classes/${currentClassId}`
                    : location.pathname
                  navigate(`/student/room/${item.roomId}/results`, { state: { from: 'performance', classId: currentClassId, returnTo } })
                }}>◉ View session details</button>}
              </> : <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>This insight will appear when enough completed-session data is available.</p>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RecentChangeIcon({ type }) {
  const paths = {
    score: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 14 4-4 3 2 5-6" /></>,
    accuracy: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    correct: <><path d="m5 12 4 4L19 6" /></>,
    rank: <><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" /></>
  }
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg>
}

function RecentChangesSection({ history, recent, isMobile }) {
  const latest = history[history.length - 1] || null
  const previous = history[history.length - 2] || null
  const correctChange = latest && previous ? Number(latest.correctAnswers || 0) - Number(previous.correctAnswers || 0) : null
  const metrics = [
    { label: 'Score', value: recent?.scoreChange ?? (latest && previous ? latest.score - previous.score : null), unit: ' pts', detail: latest && previous ? `${previous.score}% → ${latest.score}%` : 'Need two sessions', icon: 'score', tone: (recent?.scoreChange ?? (latest && previous ? latest.score - previous.score : 0)) >= 0 ? 'positive' : 'negative' },
    { label: 'Accuracy', value: recent?.accuracyChange ?? (latest && previous ? latest.accuracy - previous.accuracy : null), unit: ' pp', detail: latest && previous ? `${previous.accuracy}% → ${latest.accuracy}%` : 'Need two sessions', icon: 'accuracy', tone: (recent?.accuracyChange ?? (latest && previous ? latest.accuracy - previous.accuracy : 0)) >= 0 ? 'positive' : 'negative' },
    { label: 'Correct Answers', value: correctChange, unit: ' answers', detail: latest && previous ? `${previous.correctAnswers || 0} → ${latest.correctAnswers || 0}` : 'Need two sessions', icon: 'correct', tone: (correctChange ?? 0) >= 0 ? 'positive' : 'negative' },
    { label: 'Rank Improvement', value: recent?.rankChange ?? (latest && previous && latest.rank != null && previous.rank != null ? previous.rank - latest.rank : null), unit: ' places', detail: latest && previous ? `${formatRank(previous.rank)} → ${formatRank(latest.rank)}` : 'Need two sessions', icon: 'rank', tone: (recent?.rankChange ?? (latest && previous && latest.rank != null && previous.rank != null ? previous.rank - latest.rank : 0)) >= 0 ? 'positive' : 'negative' }
  ]
  return (
    <section style={{ marginTop: 22,marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div><h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: isMobile ? 21 : 24, fontWeight: 850, letterSpacing: '-0.025em' }}><span aria-hidden="true" style={{ color: '#d97706', display: 'inline-flex', alignItems: 'center', marginRight: 9, verticalAlign: 'middle' }}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg></span><span id="recent-changes" style={{ scrollMarginTop: 100 }}>Recent Changes</span></h2><p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>What changed between your two latest attended sessions.</p></div>
        <span style={{ borderRadius: 999, padding: '6px 10px', background: 'var(--bg-secondary, rgba(127,127,127,.06),)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 750 }}>Latest vs previous</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 13 }}>
        {metrics.map(metric => {
          const positive = metric.tone === 'positive'
          const neutral = metric.value === 0
          const statusLabel = metric.value == null ? 'Not enough data' : neutral ? 'No change' : positive ? 'Improved' : 'Decreased'
          const accent = metric.value == null || neutral ? '#64748b' : positive ? '#15803d' : '#b91c1c'
          const valueText = metric.value == null ? '—' : `${metric.value > 0 ? '+' : ''}${metric.value}${metric.unit}`
          return <div className="change-card" key={metric.label} style={{ padding: isMobile ? 14 : 18, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 19, minWidth: 0, boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,.05))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 15 }}>
              <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 13, background: `${accent}14`, fontSize: 21 }}><RecentChangeIcon type={metric.icon} /></span>
              <span style={{ fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '5px 7px', color: accent, background: `${accent}12`, whiteSpace: 'nowrap' }}>{statusLabel}</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 750 }}>{metric.label}</div>
            <div style={{ color: accent, fontSize: isMobile ? 19 : 23, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.2, marginTop: 5, overflowWrap: 'anywhere' }}>{valueText}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--border-color)' }}>{metric.detail}</div>
          </div>
        })}
      </div>
    </section>
  )
}



// Added analytics: kept separate from existing dashboard sections so the original
// charts, data calculations, navigation and session history remain untouched.
function AddedAnalyticsCard({ title, description, children, isMobile, accent = '#4f46e5', compact = false }) {
  return (
    <section className="chart-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: compact ? 18 : 22, padding: compact ? (isMobile ? 12 : 15) : (isMobile ? 16 : 22), boxShadow: 'var(--shadow-md)', minWidth: 0, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: compact ? 8 : 10, marginBottom: compact ? 9 : 14 }}>
        <span aria-hidden="true" style={{ width: compact ? 5 : 7, alignSelf: 'stretch', minHeight: compact ? 32 : 40, borderRadius: 999, background: accent, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: compact ? 16 : 18, fontWeight: 850 }}>{title}</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: compact ? 11 : 12, lineHeight: 1.5 }}>{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function getSessionAccuracyValue(session) {
  const attempted = Number(session?.attemptedQuestions) || (Number(session?.correctAnswers || 0) + Number(session?.incorrectAnswers || 0))
  const correct = Number(session?.correctAnswers) || 0
  if (attempted > 0) return (correct / attempted) * 100
  if (session?.accuracy == null || session.accuracy === '') return null
  const accuracy = Number(session.accuracy)
  return Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100 ? accuracy : null
}

function getSessionAverageResponseSeconds(session) {
  const secondsCandidates = [
    session?.averageResponseTimeSeconds,
    session?.avgResponseTimeSeconds,
    session?.meanResponseTimeSeconds,
    session?.averageResponseTime,
    session?.avgResponseTime,
    session?.responseStats?.averageResponseTimeSeconds,
    session?.responseStats?.averageResponseTime,
    session?.answeringPattern?.averageResponseTimeSeconds,
    session?.answeringPattern?.averageResponseTime,
    session?.timing?.averageResponseTimeSeconds,
    session?.timing?.averageResponseTime
  ]
  for (const candidate of secondsCandidates) {
    if (candidate != null && candidate !== '' && Number.isFinite(Number(candidate)) && Number(candidate) >= 0) return Number(candidate)
  }
  const milliseconds = Number(session?.averageResponseTimeMs ?? session?.avgResponseTimeMs)
  if (Number.isFinite(milliseconds) && milliseconds >= 0) return milliseconds / 1000
  return null
}

function getParticipantCount(session) {
  const candidates = [
    session?.participantCount,
    session?.totalParticipants,
    session?.participantsCount,
    session?.rankedParticipants,
    session?.rankedParticipantCount,
    session?.totalStudents,
    session?.attendeeCount,
    session?.participantTotal,
    session?.leaderboardCount,
    session?.participantStats?.total,
    session?.ranking?.participantCount,
    session?.ranking?.totalParticipants
  ]
  for (const candidate of candidates) {
    const number = Number(candidate)
    if (candidate != null && candidate !== '' && Number.isFinite(number) && number > 1) return Math.floor(number)
  }
  if (Array.isArray(session?.participants) && session.participants.length > 1) return session.participants.length
  return null
}

function AdvancedChartEmpty({ children }) {
  return <div style={{ minHeight: 150, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 16, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.65 }}>{children}</div>
}

// Speed vs Accuracy: one numbered dot per session, positioned by average response time (x) and accuracy (y).
// Quadrant lines are the student's own averages, so the chart answers "does answering faster help or hurt me?".
function SpeedAccuracyChart({ history }) {
  const points = (history || [])
    .map((session, index) => ({ session, index, seconds: getSessionAverageResponseSeconds(session), accuracy: getSessionAccuracyValue(session) }))
    .filter(point => point.seconds != null && point.accuracy != null && Number.isFinite(point.accuracy))
    .slice(-5)
    .map((point, i) => ({ ...point, n: i + 1 }))

  if (!points.length) {
    return <div style={{ minHeight: 280, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 16, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.65 }}>Speed vs Accuracy needs an average response time for each session. Once the performance history includes it, every session will appear here as a dot.</div>
  }

  const width = 520
  const height = 330
  const left = 56
  const right = 20
  const top = 22
  const bottom = 56
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const maxSeconds = Math.max(1, ...points.map(point => point.seconds))
  const rawMax = maxSeconds * 1.2
  const step = rawMax <= 10 ? 2 : rawMax <= 30 ? 5 : rawMax <= 60 ? 10 : 20
  const xMax = Math.max(step * 2, Math.ceil(rawMax / step) * step)
  const xTicks = Array.from({ length: Math.floor(xMax / step) + 1 }, (_, i) => i * step)
  const xAt = seconds => left + (Math.max(0, Math.min(xMax, seconds)) / xMax) * plotWidth
  const yAt = value => top + (100 - Math.max(0, Math.min(100, value))) / 100 * plotHeight

  const hasQuadrants = points.length >= 2
  const avgSeconds = points.reduce((sum, point) => sum + point.seconds, 0) / points.length
  const avgAccuracy = points.reduce((sum, point) => sum + point.accuracy, 0) / points.length
  const classify = point => {
    if (!hasQuadrants) return { key: 'single', label: 'Session', color: QUADRANT_COLORS.fastAccurate }
    const fast = point.seconds <= avgSeconds
    const accurate = point.accuracy >= avgAccuracy
    if (fast && accurate) return { key: 'fastAccurate', label: 'Fast & accurate', color: QUADRANT_COLORS.fastAccurate }
    if (!fast && accurate) return { key: 'slowAccurate', label: 'Slow & accurate', color: QUADRANT_COLORS.slowAccurate }
    if (fast && !accurate) return { key: 'fastWrong', label: 'Fast but less accurate', color: QUADRANT_COLORS.fastWrong }
    return { key: 'slowWrong', label: 'Slow & less accurate', color: QUADRANT_COLORS.slowWrong }
  }
  const classified = points.map(point => ({ ...point, quadrant: classify(point) }))
  const fastAccurateCount = classified.filter(point => point.quadrant.key === 'fastAccurate').length
  const splitX = xAt(avgSeconds)
  const splitY = yAt(avgAccuracy)

  return (
    <div style={{ minWidth: 0, width: '100%' }}>
      <div style={{ width: '100%', overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Speed versus accuracy scatter plot. Each numbered dot is a session, placed by average response time and accuracy." style={{ width: '100%', minWidth: 0, height: 'auto', display: 'block' }}>
          {hasQuadrants && <g>
            <rect x={left} y={top} width={splitX - left} height={splitY - top} fill={QUADRANT_COLORS.fastAccurate} opacity="0.08" />
            <rect x={splitX} y={top} width={left + plotWidth - splitX} height={splitY - top} fill={QUADRANT_COLORS.slowAccurate} opacity="0.08" />
            <rect x={left} y={splitY} width={splitX - left} height={top + plotHeight - splitY} fill={QUADRANT_COLORS.fastWrong} opacity="0.08" />
            <rect x={splitX} y={splitY} width={left + plotWidth - splitX} height={top + plotHeight - splitY} fill={QUADRANT_COLORS.slowWrong} opacity="0.08" />
          </g>}
          {[0, 25, 50, 75, 100].map(tick => <g key={tick}>
            <line x1={left} y1={yAt(tick)} x2={left + plotWidth} y2={yAt(tick)} stroke="var(--border-color)" strokeDasharray="4 5" />
            <text x={left - 9} y={yAt(tick) + 4} textAnchor="end" fontSize="11" fill="var(--text-secondary)">{tick}</text>
          </g>)}
          {xTicks.map(tick => <g key={tick}>
            <line x1={xAt(tick)} y1={top + plotHeight} x2={xAt(tick)} y2={top + plotHeight + 4} stroke="var(--border-color)" />
            <text x={xAt(tick)} y={top + plotHeight + 17} textAnchor="middle" fontSize="11" fill="var(--text-secondary)">{tick}s</text>
          </g>)}
          {hasQuadrants && <g>
            <line x1={splitX} y1={top} x2={splitX} y2={top + plotHeight} stroke="var(--text-secondary)" strokeWidth="1.5" strokeDasharray="6 5" opacity="0.55" />
            <line x1={left} y1={splitY} x2={left + plotWidth} y2={splitY} stroke="var(--text-secondary)" strokeWidth="1.5" strokeDasharray="6 5" opacity="0.55" />
            <text x={left + 7} y={top + 14} fontSize="10" fontWeight="800" fill={QUADRANT_COLORS.fastAccurate} opacity="0.9">Fast &amp; accurate</text>
            <text x={left + plotWidth - 7} y={top + 14} textAnchor="end" fontSize="10" fontWeight="800" fill={QUADRANT_COLORS.slowAccurate} opacity="0.9">Slow &amp; accurate</text>
            <text x={left + 7} y={top + plotHeight - 8} fontSize="10" fontWeight="800" fill={QUADRANT_COLORS.fastWrong} opacity="0.95">Fast, less accurate</text>
            <text x={left + plotWidth - 7} y={top + plotHeight - 8} textAnchor="end" fontSize="10" fontWeight="800" fill={QUADRANT_COLORS.slowWrong} opacity="0.9">Slow, less accurate</text>
          </g>}
          <line x1={left} y1={top} x2={left} y2={top + plotHeight} stroke="var(--border-color)" />
          <line x1={left} y1={top + plotHeight} x2={left + plotWidth} y2={top + plotHeight} stroke="var(--border-color)" />
          {classified.map(point => (
            <g key={`${point.session.roomId || point.session.name || point.index}-${point.n}`}>
              <circle cx={xAt(point.seconds)} cy={yAt(point.accuracy)} r="11" fill={point.quadrant.color} stroke="var(--bg-card)" strokeWidth="2.5" opacity="0.95">
                <title>{`${point.session.name || `Session ${point.index + 1}`}: ${point.seconds.toFixed(1)}s average response, ${point.accuracy.toFixed(1)}% accuracy (${point.quadrant.label})`}</title>
              </circle>
              <text x={xAt(point.seconds)} y={yAt(point.accuracy) + 4} textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" pointerEvents="none">{point.n}</text>
            </g>
          ))}
          <text x="15" y={top + plotHeight / 2} transform={`rotate(-90 15 ${top + plotHeight / 2})`} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-secondary)">Accuracy (%)</text>
          <text x={left + plotWidth / 2} y={height - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-secondary)">Average response time per question (seconds)</text>
        </svg>
      </div>
      {hasQuadrants && <div style={{ marginTop: 6, padding: '9px 11px', borderRadius: 12, background: 'var(--bg-secondary, rgba(127,127,127,.06))', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.55 }}>
        {fastAccurateCount} of {classified.length} sessions were <strong style={{ color: QUADRANT_COLORS.fastAccurate }}>fast &amp; accurate</strong>. Dashed lines mark your own averages ({avgSeconds.toFixed(1)}s · {avgAccuracy.toFixed(0)}% accuracy).
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '6px 12px', marginTop: 10 }}>
        {classified.map(point => (
          <div key={`legend-${point.n}`} title={point.session.name || `Session ${point.index + 1}`} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
            <span style={{ flex: '0 0 18px', height: 18, borderRadius: 99, display: 'grid', placeItems: 'center', background: point.quadrant.color, color: '#fff', fontSize: 10, fontWeight: 900 }}>{point.n}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{point.session.name || `Session ${point.index + 1}`}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AverageResponseTimeChart({ history }) {
  const values = (history || []).map((session, index) => ({
    session,
    index,
    seconds: getSessionAverageResponseSeconds(session)
  })).filter(point => point.seconds != null)
  if (!values.length) return <AdvancedChartEmpty>Per-session response times are not included in the current performance history. The backend must return an average response-time value for each session to plot this accurately; an overall average cannot be split into invented session values.</AdvancedChartEmpty>

  // Show only the latest five sessions with recorded response-time data.
  const sorted = values.slice(-5)
  const maxTime = Math.max(1, ...sorted.map(point => point.seconds))
  const minTime = Math.min(...sorted.map(point => point.seconds))
  const range = Math.max(1, maxTime - minTime)
  const tileColor = seconds => {
    const ratio = (seconds - minTime) / range
    return ratio < .34 ? '#0d9488' : ratio < .67 ? '#6366f1' : '#f97316'
  }
  return <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
    <div style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.5, marginBottom: 12 }}>Latest five sessions with recorded response-time data · teal is faster, orange is slower within this set.</div>
    <div role="img" aria-label="Response time heatmap by session. Each tile shows the recorded average response time in seconds; color compares speed within the displayed sessions." style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, sorted.length)}, minmax(0, 1fr))`, gridAutoRows: 'minmax(84px, 1fr)', gap: 9, flex: 1, alignContent: 'stretch' }}>
      {sorted.map((point, index) => {
        const color = tileColor(point.seconds)
        return <div key={`${point.session.roomId || point.session.name || point.index}-${index}`} title={`${point.session.name || `Session ${point.index + 1}`}: ${point.seconds.toFixed(2)} seconds average response time`} style={{ minWidth: 0, minHeight: 84, padding: '12px 7px', borderRadius: 13, background: `${color}16`, border: `1px solid ${color}55`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', textAlign: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 10.5, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getSessionLabel(point.session, point.index, 12)}</span>
          <strong style={{ color, fontSize: 20, lineHeight: 1.1, fontWeight: 900 }}>{point.seconds.toFixed(1)}s</strong>
          <span style={{ color: 'var(--text-secondary)', fontSize: 9.5 }}>{point.seconds === minTime ? 'Fastest' : point.seconds === maxTime ? 'Slowest' : 'Avg. time'}</span>
        </div>
      })}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 14, marginTop: 14, color: 'var(--text-secondary)', fontSize: 10.5 }}>
      {[['#0d9488', 'Faster'], ['#6366f1', 'Mid-range'], ['#f97316', 'Slower']].map(([color, label]) => <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: color }} />{label}</span>)}
    </div>
    <div style={{ color: 'var(--text-secondary)', fontSize: 10.5, lineHeight: 1.5, marginTop: 8 }}></div>
  </div>
}

function getWeekStart(date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const daysSinceMonday = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - daysSinceMonday)
  return start
}

function summarizeAccuracy(sessions) {
  const attempted = sessions.reduce((sum, session) => sum + (Number(session.attemptedQuestions) || (Number(session.correctAnswers || 0) + Number(session.incorrectAnswers || 0))), 0)
  const correct = sessions.reduce((sum, session) => sum + (Number(session.correctAnswers) || 0), 0)
  if (attempted > 0) return correct / attempted * 100
  const valid = sessions.map(getSessionAccuracyValue).filter(value => value != null && Number.isFinite(value))
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

function getWeekKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatWeekRange(start) {
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const format = value => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(value)
  return `${format(start)}–${format(end)}`
}

function WeeklyPerformanceComparison({ history }) {
  // Compare the two latest calendar weeks that actually contain recorded accuracy data.
  // Anchoring this chart to available session records prevents it disappearing simply because
  // no session has happened yet in the current calendar week.
  const groupedWeeks = new Map()
  for (const session of history || []) {
    const rawDate = session?.date ?? session?.endedAt ?? session?.updatedAt ?? session?.createdAt
    if (!rawDate) continue
    const date = new Date(rawDate)
    if (Number.isNaN(date.getTime()) || getSessionAccuracyValue(session) == null) continue
    const start = getWeekStart(date)
    const key = getWeekKey(start)
    if (!groupedWeeks.has(key)) groupedWeeks.set(key, { start, sessions: [] })
    groupedWeeks.get(key).sessions.push(session)
  }

  const weeks = [...groupedWeeks.values()]
    .map(week => ({ ...week, accuracy: summarizeAccuracy(week.sessions) }))
    .filter(week => week.accuracy != null && Number.isFinite(week.accuracy))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  if (weeks.length < 2) {
    return <AdvancedChartEmpty>Week-by-week accuracy appears after your history contains sessions with valid accuracy data in at least two different calendar weeks. A missing week is not treated as 0%.</AdvancedChartEmpty>
  }

  const previous = weeks[weeks.length - 2]
  const current = weeks[weeks.length - 1]
  const todayWeek = getWeekStart(new Date())
  const latestWeekIsThisCalendarWeek = getWeekKey(current.start) === getWeekKey(todayWeek)
  const weeksAreAdjacent = (current.start.getTime() - previous.start.getTime()) <= (7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000)
  const previousLabel = latestWeekIsThisCalendarWeek && weeksAreAdjacent ? 'Previous week' : 'Previous recorded week'
  const currentLabel = latestWeekIsThisCalendarWeek ? 'Current week' : 'Latest recorded week'
  const delta = current.accuracy - previous.accuracy
  const changeColor = delta > 0 ? '#16a34a' : delta < 0 ? '#ea580c' : '#64748b'
  const changeLabel = `${delta > 0 ? '+' : ''}${delta.toFixed(1)} percentage points`

  // Compact, responsive chart: no horizontal scroll is needed for two bars.
  const width = 520, height = 285, left = 54, right = 18, top = 24, bottom = 62
  const plotH = height - top - bottom
  const plotW = width - left - right
  const y = value => top + (100 - Math.max(0, Math.min(100, value))) / 100 * plotH
  const centers = [left + plotW * 0.29, left + plotW * 0.73]
  const barW = 76
  const values = [previous.accuracy, current.accuracy]
  const fills = ['#94a3b8', delta >= 0 ? '#2563eb' : '#ea580c']
  const labels = [previousLabel, currentLabel]
  const ranges = [formatWeekRange(previous.start), formatWeekRange(current.start)]

  return <div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{previousLabel}</div>
        <div style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 900 }}>{previous.accuracy.toFixed(1)}%</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{ranges[0]}</div>
      </div>
      <div style={{ textAlign: 'center', color: changeColor, fontSize: 11, fontWeight: 850, maxWidth: 120 }}>
        <div style={{ fontSize: 21, lineHeight: 1.1 }}>{delta > 0 ? '↗' : delta < 0 ? '↘' : '→'}</div>
        <div>{changeLabel}</div>
      </div>
      <div style={{ minWidth: 0, textAlign: 'right' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{currentLabel}</div>
        <div style={{ color: changeColor, fontSize: 22, fontWeight: 900 }}>{current.accuracy.toFixed(1)}%</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{ranges[1]}</div>
      </div>
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Week-by-week accuracy comparison. X-axis: recorded week. Y-axis: accuracy percentage. ${previousLabel} ${previous.accuracy.toFixed(1)}%, latest week ${current.accuracy.toFixed(1)}%, change ${changeLabel}.`} style={{ width: '100%', height: 'auto', minWidth: 0, display: 'block' }}>
      {[0, 25, 50, 75, 100].map(tick => <g key={tick}>
        <line x1={left} y1={y(tick)} x2={width - right} y2={y(tick)} stroke="var(--border-color)" strokeDasharray="4 5" />
        <text x={left - 9} y={y(tick) + 4} textAnchor="end" fill="var(--text-secondary)" fontSize="10.5">{tick}%</text>
      </g>)}
      {values.map((value, index) => {
        const barY = y(value)
        return <g key={index}>
          <rect x={centers[index] - barW / 2} y={barY} width={barW} height={top + plotH - barY} rx="7" fill={fills[index]} opacity="0.93"><title>{`${labels[index]} (${ranges[index]}): ${value.toFixed(1)}% accuracy, ${[previous, current][index].sessions.length} attended sessions`}</title></rect>
          <text x={centers[index]} y={Math.max(14, barY - 7)} textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="850">{value.toFixed(1)}%</text>
          <text x={centers[index]} y={height - 32} textAnchor="middle" fill="var(--text-secondary)" fontSize="10.5">{index === 0 ? 'Previous' : 'Latest'}</text>
        </g>
      })}
      <line x1={left} y1={top} x2={left} y2={top + plotH} stroke="var(--border-color)" />
      <line x1={left} y1={top + plotH} x2={width - right} y2={top + plotH} stroke="var(--border-color)" />
      <text x="15" y={top + plotH / 2} transform={`rotate(-90 15 ${top + plotH / 2})`} textAnchor="middle" fill="var(--text-secondary)" fontSize="11" fontWeight="700">Accuracy (%)</text>
      <text x={left + plotW / 2} y={height - 7} textAnchor="middle" fill="var(--text-secondary)" fontSize="11" fontWeight="700">Recorded week</text>
    </svg>
    <div style={{ color: 'var(--text-secondary)', fontSize: 10.5, lineHeight: 1.5, marginTop: 5 }}>
      Compared {previous.sessions.length} session{previous.sessions.length === 1 ? '' : 's'} with {current.sessions.length} session{current.sessions.length === 1 ? '' : 's'}. {latestWeekIsThisCalendarWeek ? 'Current calendar week has data.' : 'No accuracy data exists in the current calendar week yet, so the chart uses the latest two recorded weeks.'}
    </div>
  </div>
}

function RankPercentileDistribution({ history }) {
  const points = (history || []).map((session, index) => {
    const rank = Number(session?.rank)
    const participants = getParticipantCount(session)
    if (!Number.isFinite(rank) || rank < 1 || participants == null || rank > participants) return null
    const standing = participants > 1 ? ((participants - rank) / (participants - 1)) * 100 : 100
    const topPercent = Math.max(1, Math.min(100, Math.ceil((rank / participants) * 100)))
    return { session, index, rank, participants, standing, topPercent }
  }).filter(Boolean).slice(-8)

  if (!points.length) return <AdvancedChartEmpty>Rank percentile needs a valid rank and participant count. The API's session history should include both values before this chart can calculate a real relative standing.</AdvancedChartEmpty>

  // Radial progress rings provide a different visual form from the dashboard's line, bar and scatter charts.
  const radius = 28
  const circumference = 2 * Math.PI * radius
  return <div style={{ minWidth: 0 }}>
    <div style={{ color: 'var(--text-secondary)', fontSize: 10.5, marginBottom: 12 }}>Latest {points.length} sessions with rank data · higher relative standing is better.</div>
    <div className="rank-percentile-grid" role="img" aria-label="Rank percentile radial chart. Each ring shows relative standing from zero to one hundred percent." style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
      {points.map((point, index) => {
        const color = point.standing >= 75 ? '#0d9488' : point.standing >= 50 ? '#6366f1' : '#f59e0b'
        const offset = circumference * (1 - point.standing / 100)
        return <div key={`${point.session.roomId || point.session.name || index}`} title={`${point.session.name || `Session ${point.index + 1}`}: rank ${point.rank} of ${point.participants}, top ${point.topPercent}%, relative standing ${point.standing.toFixed(1)}%`} style={{ minWidth: 0, padding: '12px 7px', border: '1px solid var(--border-color)', borderRadius: 14, background: 'var(--bg-secondary, rgba(127,127,127,.04))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
          <svg viewBox="0 0 76 76" style={{ width: 76, height: 76, display: 'block' }} aria-hidden="true">
            <circle cx="38" cy="38" r={radius} fill="none" stroke="var(--border-color)" strokeWidth="7" />
            <circle cx="38" cy="38" r={radius} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 38 38)" />
            <text x="38" y="42" textAnchor="middle" fill="var(--text-primary)" fontSize="14" fontWeight="800">{Math.round(point.standing)}%</text>
          </svg>
          <strong style={{ color: 'var(--text-primary)', fontSize: 11, textAlign: 'center', overflowWrap: 'anywhere' }}>{getSessionLabel(point.session, point.index, 12)}</strong>
          <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>Rank #{point.rank}/{point.participants}</span>
        </div>
      })}
    </div>
    <div style={{ color: 'var(--text-secondary)', fontSize: 10.5, lineHeight: 1.5, marginTop: 10 }}>Relative standing is calculated from recorded rank and participant count; 100% represents first place.</div>
  </div>
}

function WhatIfLab({ history }) {
  const [mode, setMode] = useState('missed')
  const [missedExtra, setMissedExtra] = useState(0)
  const [incorrectExtra, setIncorrectExtra] = useState(0)
  const eligibleHistory = (history || []).filter(session => session?.attended !== false)
  const datedHistory = eligibleHistory.filter(session => session?.date && Number.isFinite(Date.parse(session.date)))
  const latest = datedHistory.length
    ? datedHistory.reduce((current, session) => Date.parse(session.date) > Date.parse(current.date) ? session : current)
    : eligibleHistory[eligibleHistory.length - 1] || null
  const correct = Number(latest?.correctAnswers) || 0
  const incorrect = Number(latest?.incorrectAnswers) || 0
  const missed = Number(latest?.missedQuestions) || 0
  const attempted = Number(latest?.attemptedQuestions) || (correct + incorrect)
  const totalQuestionsRaw = Number(latest?.totalQuestions)
  const totalAvailable = Number.isFinite(totalQuestionsRaw) && totalQuestionsRaw > 0 ? totalQuestionsRaw : attempted + missed
  const actualAccuracy = attempted > 0 ? (correct / attempted) * 100 : null
  const maxExtra = mode === 'incorrect' ? Math.min(5, incorrect) : missed
  const storedExtra = mode === 'missed' ? missedExtra : incorrectExtra
  const extra = Math.min(Math.max(0, storedExtra), maxExtra)
  const hypotheticalCorrect = correct + extra
  const hypotheticalAttempted = mode === 'missed' ? attempted + extra : attempted
  const hypotheticalAccuracy = hypotheticalAttempted > 0 ? (hypotheticalCorrect / hypotheticalAttempted) * 100 : null
  const buttonStyle = active => ({
    border: `1px solid ${active ? '#7c3aed' : 'var(--border-color)'}`,
    background: active ? 'rgba(124,58,237,.09)' : 'var(--bg-secondary, rgba(127,127,127,.04))',
    color: active ? '#7c3aed' : 'var(--text-primary)',
    borderRadius: 10,
    padding: '8px 9px',
    fontSize: 11,
    lineHeight: 1.35,
    fontWeight: 800,
    cursor: 'pointer',
    textAlign: 'left',
    minWidth: 0
  })
  const statStyle = { borderRadius: 10, padding: '8px 10px', background: 'var(--bg-secondary, rgba(127,127,127,.06))', minWidth: 0 }

  if (!latest || actualAccuracy == null) return <AdvancedChartEmpty>Complete a session with recorded question counts to use the What-If Lab.</AdvancedChartEmpty>

  return <div style={{ minWidth: 0 }}>
    <div style={{ color: 'var(--text-secondary)', fontSize: 10.5, marginBottom: 8 }}>Based on: <strong style={{ color: 'var(--text-primary)' }}>{latest.name || 'Most recent session'}</strong></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
      <div style={statStyle}><div style={{ color: 'var(--text-secondary)', fontSize: 10.5 }}>Correct</div><div style={{ color: 'var(--text-primary)', fontSize: 21, fontWeight: 900, marginTop: 2 }}>{correct}</div></div>
      <div style={statStyle}><div style={{ color: 'var(--text-secondary)', fontSize: 10.5 }}>Attempted</div><div style={{ color: 'var(--text-primary)', fontSize: 21, fontWeight: 900, marginTop: 2 }}>{attempted}</div></div>
      <div style={statStyle}><div style={{ color: 'var(--text-secondary)', fontSize: 10.5 }}>Unanswered</div><div style={{ color: 'var(--text-primary)', fontSize: 21, fontWeight: 900, marginTop: 2 }}>{missed}</div></div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 6, color: 'var(--text-secondary)', fontSize: 10.5 }}>
      <span>{totalAvailable} questions available</span><span>{incorrect} incorrect answers</span>
    </div>

    <div style={{ borderTop: '1px solid var(--border-color)', margin: '12px 0 10px' }} />
    <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 850, marginBottom: 8 }}>Try a what-if scenario</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7, marginBottom: 10 }}>
      <button type="button" aria-pressed={mode === 'missed'} style={buttonStyle(mode === 'missed')} onClick={() => setMode('missed')}>
        Answer missed correctly<span style={{ display: 'block', marginTop: 3, fontWeight: 600, opacity: .8 }}>{missed} unanswered</span>
      </button>
      <button type="button" aria-pressed={mode === 'incorrect'} style={buttonStyle(mode === 'incorrect')} onClick={() => setMode('incorrect')}>
        Turn incorrect correct<span style={{ display: 'block', marginTop: 3, fontWeight: 600, opacity: .8 }}>{incorrect} incorrect · change up to 5</span>
      </button>
    </div>

    {maxExtra > 0 ? <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <label htmlFor="what-if-extra" style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, lineHeight: 1.4 }}>{mode === 'missed' ? 'Missed answers changed to correct' : 'Incorrect answers changed to correct'}</label>
        <strong style={{ color: 'var(--text-primary)', fontSize: 14, flexShrink: 0 }}>{extra}/{maxExtra}</strong>
      </div>
      <input
        id="what-if-extra"
        type="range"
        min="0"
        max={maxExtra}
        step="1"
        value={extra}
        onChange={event => mode === 'missed' ? setMissedExtra(Number(event.target.value)) : setIncorrectExtra(Number(event.target.value))}
        aria-label={mode === 'missed' ? 'Number of unanswered questions hypothetically answered correctly' : 'Number of incorrect answers hypothetically corrected, up to five'}
        style={{ display: 'block', width: '100%', accentColor: '#7c3aed', cursor: 'pointer', margin: '5px 0 0' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--text-secondary)', fontSize: 10, marginTop: 2 }}><span>0 changed</span><span>{mode === 'incorrect' ? `Maximum 5 (${incorrect} available)` : `${missed} available`}</span></div>
    </> : <div style={{ padding: 9, borderRadius: 9, background: 'var(--bg-secondary, rgba(127,127,127,.06))', color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.45 }}>
      {mode === 'missed' ? 'There are no unanswered questions in this session. Select the other scenario to explore incorrect answers.' : 'There are no incorrect answers in this session. Select the other scenario to explore unanswered questions.'}
    </div>}

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7, marginTop: 11 }}>
      <div style={{ padding: '9px 10px', border: '1px solid var(--border-color)', borderRadius: 10 }}><div style={{ color: 'var(--text-secondary)', fontSize: 10.5 }}>Actual accuracy</div><div style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 900, marginTop: 2 }}>{actualAccuracy.toFixed(1)}%</div></div>
      <div style={{ padding: '9px 10px', border: '1px solid rgba(22,163,74,.35)', borderRadius: 10, background: 'rgba(22,163,74,.045)' }}><div style={{ color: 'var(--text-secondary)', fontSize: 10.5 }}>What-if accuracy</div><div style={{ color: '#16a34a', fontSize: 22, fontWeight: 900, marginTop: 2 }}>{hypotheticalAccuracy == null ? '—' : `${hypotheticalAccuracy.toFixed(1)}%`}</div><div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{hypotheticalAccuracy != null ? `${hypotheticalAccuracy - actualAccuracy >= 0 ? '+' : ''}${(hypotheticalAccuracy - actualAccuracy).toFixed(1)} pp` : '—'}</div></div>
    </div>
    <div style={{ color: 'var(--text-secondary)', fontSize: 10, lineHeight: 1.45, marginTop: 7 }}>Simulation only. It does not change saved results or predict the official Spandan score or rank.</div>
  </div>
}

function SessionToSessionScoreChangeChart({ history }) {
  // Include every attended session with a valid recorded score; do not truncate the history.
  const sessions = (history || [])
    .filter(session => session?.score != null && session.score !== '' && Number.isFinite(Number(session.score)) && Number(session.score) >= 0 && Number(session.score) <= 100)
    .map((session, index) => ({
      name: session.name || `Session ${index + 1}`,
      score: Number(session.score)
    }))
  const changes = sessions.slice(1).map((session, index) => ({
    name: session.name,
    previousName: sessions[index].name,
    change: Math.round((session.score - sessions[index].score) * 10) / 10
  }))
  if (changes.length < 1) {
    return <AdvancedChartEmpty>Session-to-session changes need at least two recorded session scores. Complete more sessions to compare your results.</AdvancedChartEmpty>
  }
  const maxAbs = Math.max(5, Math.ceil(Math.max(...changes.map(point => Math.abs(point.change))) / 5) * 5)
  // Keep session labels readable on the chart; full names are also available on hover.
  const width = Math.max(520, changes.length * 55 + 110)
  const height = 250
  const left = 44
  const right = 14
  const top = 20
  const bottom = 52
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const zeroY = top + plotHeight / 2
  const xAt = index => left + ((index + 0.5) / changes.length) * plotWidth
  const yAt = value => zeroY - (value / maxAbs) * (plotHeight / 2)
  return <div style={{ minWidth: 0 }}>
    <div style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>Each bar compares the named session with the previous attended session. Hover over a bar for both session names and the exact change.</div>
    <div className="advanced-chart-scroll" style={{ minWidth: 0 }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Score change compared with the previous session; positive means an increase and negative means a decrease" style={{ width: `${width}px`, minWidth: `${width}px`, height: 'auto', display: 'block' }}>
        {[-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs].map((tick, index) => {
          const y = yAt(tick)
          return <g key={`${tick}-${index}`}>
            <line x1={left} y1={y} x2={width - right} y2={y} stroke="var(--border-color)" strokeDasharray={tick === 0 ? '0' : '4 4'} strokeWidth={tick === 0 ? 1.5 : 1} />
            <text x={left - 7} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-secondary)">{tick > 0 ? `+${tick}` : tick}</text>
          </g>
        })}
        {changes.map((point, index) => {
          const x = xAt(index)
          const y = yAt(point.change)
          const color = point.change > 0 ? '#16a34a' : point.change < 0 ? '#ef4444' : '#94a3b8'
          return <g key={`${point.name}-${index}`}>
            <rect x={x - Math.min(17, plotWidth / changes.length * 0.28)} y={Math.min(y, zeroY)} width={Math.min(34, plotWidth / changes.length * 0.56)} height={Math.max(2, Math.abs(zeroY - y))} rx="5" fill={color} opacity="0.82">
              <title>{`${point.name}: ${point.change > 0 ? '+' : ''}${point.change} points versus ${point.previousName}`}</title>
            </rect>
            <circle cx={x} cy={y} r="3.5" fill={color} stroke="var(--bg-card)" strokeWidth="1.5" />
            <text x={x} y={point.change >= 0 ? Math.max(top + 10, y - 8) : Math.min(top + plotHeight - 2, y + 14)} textAnchor="middle" fontSize="10" fontWeight="800" fill={color}>{point.change > 0 ? '+' : ''}{point.change}</text>
            <text x={x} y={height - 34} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">{getSessionLabelLines(point.name).map((line, lineIndex) => <tspan key={lineIndex} x={x} dy={lineIndex === 0 ? 0 : 12}>{line}</tspan>)}<title>{point.name}</title></text>
          </g>
        })}
        <text x={left + plotWidth / 2} y={height - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-secondary)">Attended session</text>
      </svg>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, color: 'var(--text-secondary)', fontSize: 11 }}>
      <span><span style={{ color: '#16a34a', fontWeight: 900 }}>●</span> Score increased</span>
      <span><span style={{ color: '#ef4444', fontWeight: 900 }}>●</span> Score decreased</span>
      <span><span style={{ color: '#94a3b8', fontWeight: 900 }}>●</span> No change</span>
    </div>
  </div>
}

function SessionConsistencyGauge({ history }) {
  const scores = (history || [])
    .map(session => session?.score)
    .filter(value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100)
    .map(Number)

  if (scores.length < 2) {
    return <AdvancedChartEmpty>Session consistency needs at least two recorded session scores. Complete more sessions to see how steadily your scores are performing.</AdvancedChartEmpty>
  }

  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length
  const variance = scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / scores.length
  const standardDeviation = Math.sqrt(variance)
  // Consistency index is 100 minus the population standard deviation in score percentage points.
  const consistency = Math.max(0, Math.min(100, 100 - standardDeviation))
  const status = standardDeviation <= 5
    ? { label: 'Very consistent', color: '#16a34a', detail: 'Your scores have varied only slightly across sessions.' }
    : standardDeviation <= 10
      ? { label: 'Fairly consistent', color: '#0d9488', detail: 'Your scores show some variation, but remain relatively steady.' }
      : { label: 'Scores vary', color: '#d97706', detail: 'Your scores have varied noticeably between sessions.' }

  return <div style={{ minWidth: 0 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, alignItems: 'center' }}>
      <div style={{ minWidth: 0, textAlign: 'center' }}>
        <svg viewBox="0 0 200 126" role="img" aria-label={`Session consistency ${consistency.toFixed(1)} out of 100, based on ${scores.length} session scores. Standard deviation ${standardDeviation.toFixed(1)} percentage points.`} style={{ width: '100%', maxWidth: 250, display: 'block', margin: '0 auto' }}>
          <path d="M 24 104 A 76 76 0 0 1 176 104" fill="none" stroke="var(--bg-secondary, #e5e7eb)" strokeWidth="15" strokeLinecap="round" pathLength="100" />
          <path d="M 24 104 A 76 76 0 0 1 176 104" fill="none" stroke={status.color} strokeWidth="15" strokeLinecap="round" pathLength="100" strokeDasharray={`${consistency} 100`} />
          <text x="100" y="76" textAnchor="middle" fontSize="29" fontWeight="900" fill="var(--text-primary)">{Math.round(consistency)}</text>
          <text x="100" y="94" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--text-secondary)">OUT OF 100</text>
          <text x="23" y="122" textAnchor="middle" fontSize="10" fill="var(--text-secondary)">0</text>
          <text x="177" y="122" textAnchor="middle" fontSize="10" fill="var(--text-secondary)">100</text>
        </svg>
        <div style={{ color: status.color, fontSize: 13, fontWeight: 850, marginTop: 0 }}>{status.label}</div>
      </div>
      <div style={{ display: 'grid', gap: 9, minWidth: 0 }}>
        <div style={{ borderRadius: 12, padding: 12, background: 'var(--bg-secondary, rgba(127,127,127,.06))' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Average score</div>
          <strong style={{ display: 'block', marginTop: 3, color: 'var(--text-primary)', fontSize: 23 }}>{average.toFixed(1)}%</strong>
        </div>
        <div style={{ borderRadius: 12, padding: 12, background: 'var(--bg-secondary, rgba(127,127,127,.06))' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Score variation (standard deviation)</div>
          <strong style={{ display: 'block', marginTop: 3, color: 'var(--text-primary)', fontSize: 23 }}>{standardDeviation.toFixed(1)} pp</strong>
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.5 }}>{scores.length} recorded session scores</div>
      </div>
    </div>
    <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.55 }}>
      {status.detail} Consistency index = 100 − score standard deviation (in percentage points).
    </p>
  </div>
}

function AddedAnalyticsSection({ history, isMobile }) {
  const attended = (history || []).filter(session => session?.attended)
  return <>
    <style>{`
      .advanced-chart-scroll { width: 100%; max-width: 100%; overflow-x: auto; overflow-y: hidden; padding-bottom: 8px; scrollbar-width: thin; scrollbar-color: rgba(100,116,139,.75) rgba(148,163,184,.12); -webkit-overflow-scrolling: touch; }
      .advanced-chart-scroll::-webkit-scrollbar { height: 9px; }
      .advanced-chart-scroll::-webkit-scrollbar-track { background: rgba(148,163,184,.12); border-radius: 999px; }
      .advanced-chart-scroll::-webkit-scrollbar-thumb { background: rgba(100,116,139,.75); border-radius: 999px; }
      .advanced-chart-scroll { scrollbar-gutter: stable; }
      /* Skip painting off-screen dashboard charts until they approach the viewport. */
      .performance-content .chart-card {
        content-visibility: auto;
        contain-intrinsic-size: auto 360px;
      }
      .rank-percentile-grid > div { height: 100%; box-sizing: border-box; }
      @media (max-width: 640px) {
        .rank-percentile-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      }
    `}</style>
    <section aria-label="Additional performance comparisons" style={{ marginTop: 24, marginBottom: 22 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: isMobile ? 21 : 24, fontWeight: 850, letterSpacing: '-0.03em' }}><span aria-hidden="true" style={{ color: '#d97706', display: 'inline-flex', alignItems: 'center', marginRight: 9, verticalAlign: 'middle' }}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M10 3v6l-5.2 8.4A2.4 2.4 0 0 0 6.8 21h10.4a2.4 2.4 0 0 0 2-3.6L14 9V3"/><path d="M7.5 15h9M10 12h4"/></svg></span><span id="advanced-performance-lab" style={{ scrollMarginTop: 100 }}>Performance Explorer</span></h2>
        <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.55 }}></p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16, alignItems: 'stretch' }}>
        <AddedAnalyticsCard title="Week-by-Week Accuracy Comparison" description="Two bars compare accuracy across equivalent periods of this week and last week, with an arrow showing the change." isMobile={isMobile} accent="#2563eb">
          <WeeklyPerformanceComparison history={attended} />
        </AddedAnalyticsCard>
        <AddedAnalyticsCard title="Average Response Time per Session" description="Response times for the latest five sessions with recorded data." isMobile={isMobile} accent="#0d9488">
          <AverageResponseTimeChart history={attended} />
        </AddedAnalyticsCard>
        <AddedAnalyticsCard title="Session-to-Session Score Change" description="See how your score rises or falls compared with the previous attended session." isMobile={isMobile} accent="#2563eb">
          <SessionToSessionScoreChangeChart history={attended} />
        </AddedAnalyticsCard>
      </div>
    </section>
  </>
}

const CLASS_PALETTE = [
  { main: '#3b65d9', soft: 'rgba(59,101,217,.10)', second: '#3b65d9' },
  { main: '#168a83', soft: 'rgba(22,138,131,.10)', second: '#168a83' },
  { main: '#6477a8', soft: 'rgba(100,119,168,.10)', second: '#6477a8' },
  { main: '#4c83b6', soft: 'rgba(76,131,182,.10)', second: '#4c83b6' },
  { main: '#527c78', soft: 'rgba(82,124,120,.10)', second: '#527c78' },
  { main: '#7584a0', soft: 'rgba(117,132,160,.10)', second: '#7584a0' }
]

function ClassComparisonAnalytics({ items, isMobile }) {
  const usable = (items || []).filter(item => item?.summary)
  const colors = usable.map((_, i) => CLASS_PALETTE[i % CLASS_PALETTE.length])
  const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, padding: isMobile ? 15 : 22, minWidth: 0, boxShadow: 'var(--shadow-md)', position: 'relative', overflow: 'hidden' }
  const labelStyle = { color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.55 }
  const titleStyle = { margin: 0, color: 'var(--text-primary)', fontSize: isMobile ? 17 : 19, fontWeight: 850, letterSpacing: '-.025em', lineHeight: 1.3 }
  const num = (item, key) => { const n = Number(item.summary?.[key]); return Number.isFinite(n) && item.summary?.[key] !== null && item.summary?.[key] !== '' ? n : null }
  const attendedHistory = item => (item.history || []).filter(s => s?.attended)
  const scoreOf = session => {
    const direct = Number(session?.accuracy ?? session?.score ?? session?.percentage)
    if (Number.isFinite(direct) && session?.accuracy !== null && session?.score !== null) return Math.max(0, Math.min(100, direct))
    const correct = Number(session?.correctAnswers ?? session?.correct ?? session?.questionsCorrect)
    const attempted = Number(session?.attemptedQuestions ?? session?.attempted ?? session?.totalQuestions)
    return Number.isFinite(correct) && Number.isFinite(attempted) && attempted > 0 ? Math.max(0, Math.min(100, correct / attempted * 100)) : null
  }
  const accuracy = usable.map((item, i) => ({ item, name: item.name, value: num(item, 'overallAccuracy') ?? num(item, 'averageScore'), color: colors[i].main, i })).filter(x => x.value !== null).map(x => ({ ...x, value: Math.max(0, Math.min(100, x.value)) }))
  const sessions = usable.map((item, i) => ({ item, name: item.name, count: attendedHistory(item).length, color: colors[i].main, i }))
  const sessionTotal = sessions.reduce((sum, x) => sum + x.count, 0)
  const overallAccuracy = accuracy.length ? accuracy.reduce((sum, x) => sum + x.value, 0) / accuracy.length : null
  const weeklyByClass = usable.map((item, index) => {
    const buckets = new Map()
    attendedHistory(item).forEach(session => {
      const rawDate = session.date || session.endedAt || session.updatedAt || session.createdAt
      if (!rawDate) return
      const date = new Date(rawDate)
      if (Number.isNaN(date.getTime())) return
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
      const week = date.toISOString().slice(0, 10)
      const value = scoreOf(session)
      if (value === null) return
      if (!buckets.has(week)) buckets.set(week, [])
      buckets.get(week).push(value)
    })
    return { name: item.name, color: colors[index].main, values: [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, vals]) => ({ week, value: vals.reduce((a, b) => a + b, 0) / vals.length })) }
  })
  const weeks = [...new Set(weeklyByClass.flatMap(row => row.values.map(v => v.week)))].sort().slice(-6)
  const improvements = usable.map((item, i) => {
    const points = attendedHistory(item).map(s => ({ session: s, value: scoreOf(s), date: new Date(s.date || s.endedAt || s.updatedAt || s.createdAt || 0).getTime() })).filter(x => x.value !== null).sort((a, b) => a.date - b.date)
    const previous = points.length > 1 ? points[points.length - 2].value : null
    const latest = points.length ? points[points.length - 1].value : null
    return { name: item.name, color: colors[i].main, previous, latest, delta: previous === null || latest === null ? null : latest - previous }
  }).filter(x => x.previous !== null && x.latest !== null)
  const scoreDistributions = usable.map((item, i) => ({ name: item.name, color: colors[i].main, scores: attendedHistory(item).map((session, index) => ({ label: String(session.name || session.sessionName || session.roomName || `Session ${index + 1}`), value: scoreOf(session) })).filter(point => point.value !== null).slice(-8) })).filter(x => x.scores.length)
  if (!usable.length) return <section style={{ ...cardStyle, marginTop: 26, marginBottom: 20 }}><h2 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Class-by-Class Analytics</h2><p style={labelStyle}>Class comparison data will appear once class performance has loaded.</p></section>
  const card = (title, description, content) => <div className="class-analytics-card" style={{ ...cardStyle, position: 'relative', overflow: 'hidden', transition: 'box-shadow .2s ease, border-color .2s ease, transform .2s ease' }} key={title}><div style={{ display: 'flex', alignItems: 'stretch', gap: 10, marginBottom: 16 }}><span aria-hidden="true" style={{ width: 5, minHeight: 38, borderRadius: 99, background: 'var(--accent, #3159b8)', flexShrink: 0 }} /><div style={{ minWidth: 0 }}><h3 style={titleStyle}>{title}</h3><p style={{ ...labelStyle, margin: '5px 0 0', fontSize: 12 }}>{description}</p></div></div>{content}</div>
  const noData = msg => <div style={{ minHeight: 68, display: 'grid', placeItems: 'center', textAlign: 'center', padding: '12px 14px', borderRadius: 12, background: 'var(--bg-secondary, rgba(100,116,139,.045))', color: 'var(--text-secondary)', fontSize: 12 }}>{msg}</div>
  const lollipop = accuracy.length ? <div style={{ display: 'grid', gap: 13 }}>{[...accuracy].sort((a, b) => b.value - a.value).map((x, idx) => <div key={x.name} title={`${x.name}: ${x.value.toFixed(1)}%`}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: 'var(--text-primary)', marginBottom: 3 }}><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{x.name}</span><strong>{x.value.toFixed(1)}%</strong></div><svg viewBox="0 0 320 24" role="img" aria-label={`${x.name} accuracy ${x.value.toFixed(1)} percent`} style={{ width: '100%', display: 'block', overflow: 'visible' }}><line x1="5" y1="12" x2="315" y2="12" stroke="var(--border-color)" strokeWidth="2"/><line x1="5" y1="12" x2={5 + 310 * x.value / 100} y2="12" stroke={x.color} strokeWidth="3" strokeLinecap="round" opacity=".75"/><circle cx={5 + 310 * x.value / 100} cy="12" r="7" fill={x.color} stroke="var(--bg-card)" strokeWidth="3"><title>{x.name}: {x.value.toFixed(1)}%</title></circle></svg></div>)}</div> : noData('No class accuracy data available yet.')
  const gauge = overallAccuracy === null ? noData('Overall accuracy will appear when class accuracy data is available.') : <div style={{ display: 'grid', placeItems: 'center', padding: '4px 0 8px' }}><svg viewBox="0 0 280 190" role="img" aria-label={`Mean class accuracy ${overallAccuracy.toFixed(1)} percent`} style={{ width: '100%', maxWidth: 340 }}><path d="M 38 142 A 102 102 0 0 1 242 142" fill="none" stroke="var(--border-color)" strokeWidth="18" strokeLinecap="round"/><path d="M 38 142 A 102 102 0 0 1 242 142" fill="none" stroke="var(--accent, #3159b8)" strokeWidth="18" strokeLinecap="round" pathLength="100" strokeDasharray={`${overallAccuracy} 100`}/><text x="140" y="112" textAnchor="middle" fontSize="39" fontWeight="800" fill="var(--text-primary)">{overallAccuracy.toFixed(1)}%</text><text x="140" y="137" textAnchor="middle" fontSize="12" fill="var(--text-secondary)">Mean class accuracy</text><text x="38" y="166" textAnchor="middle" fontSize="10" fill="var(--text-secondary)">0%</text><text x="242" y="166" textAnchor="middle" fontSize="10" fill="var(--text-secondary)">100%</text></svg><div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>{accuracy.map(x => <span key={x.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 99, background: x.color + '16', color: 'var(--text-primary)', fontSize: 11 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: x.color }}/>{x.name}</span>)}</div></div>
  const rankChart = weeks.length >= 2 ? <div style={{ overflowX: 'auto' }}><svg viewBox={`0 0 ${Math.max(390, weeks.length * 65 + 75)} 230`} role="img" aria-label="Class ranking movement by week" style={{ width: '100%', minWidth: Math.max(390, weeks.length * 65 + 75), display: 'block' }}>{[1, 2, 3, 4].map(rank => <g key={rank}><line x1="55" y1={28 + (rank - 1) * 52} x2={Math.max(390, weeks.length * 65 + 35) - 20} y2={28 + (rank - 1) * 52} stroke="var(--border-color)" strokeDasharray="3 5"/><text x="38" y={32 + (rank - 1) * 52} textAnchor="middle" fontSize="11" fill="var(--text-secondary)">#{rank}</text></g>)}{weeklyByClass.map(row => { const points = weeks.map((week, i) => ({ week, i, value: row.values.find(v => v.week === week)?.value })).filter(p => p.value !== undefined); const ranked = points.map(p => ({ ...p, rank: 1 + weeklyByClass.filter(other => { const val = other.values.find(v => v.week === p.week)?.value; return val !== undefined && val > p.value }).length })); const coords = ranked.map(p => `${55 + p.i * ((Math.max(390, weeks.length * 65 + 35) - 75) / Math.max(weeks.length - 1, 1))},${28 + (p.rank - 1) * 52}`).join(' '); return <g key={row.name}><polyline points={coords} fill="none" stroke={row.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity=".85"/>{ranked.map(p => <g key={p.week}><circle cx={55 + p.i * ((Math.max(390, weeks.length * 65 + 35) - 75) / Math.max(weeks.length - 1, 1))} cy={28 + (p.rank - 1) * 52} r="5" fill={row.color} stroke="var(--bg-card)" strokeWidth="2"><title>{`${row.name} — week ${p.week}: rank #${p.rank}`}</title></circle><text x={55 + p.i * ((Math.max(390, weeks.length * 65 + 35) - 75) / Math.max(weeks.length - 1, 1))} y="222" textAnchor="middle" fontSize="10" fill="var(--text-secondary)">{p.week.slice(5)}</text></g>)}</g>})}</svg><div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 8 }}>{weeklyByClass.map(row => <span key={row.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}><span style={{ width: 15, height: 3, background: row.color, borderRadius: 9 }}/>{row.name}</span>)}</div></div> : noData('Rank trends will appear after at least two weeks of scored sessions.')
  const treemap = sessionTotal ? <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, sessions.filter(s => s.count > 0).length || 1)}, minmax(0, 1fr))`, gridAutoRows: 88, gap: 7 }}>{sessions.filter(s => s.count > 0).map(s => <div key={s.name} title={`${s.name}: ${s.count} sessions (${(s.count / sessionTotal * 100).toFixed(1)}%)`} style={{ gridColumn: `span ${Math.max(1, Math.min(3, Math.ceil(s.count / Math.max(...sessions.map(x => x.count)) * 3)))}`, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: `linear-gradient(135deg, ${s.color}, ${s.color}bb)`, color: '#fff', minWidth: 0, boxShadow: `0 7px 18px ${s.color}24` }}><span style={{ fontSize: 12, fontWeight: 700, overflowWrap: 'anywhere' }}>{s.name}</span><span><strong style={{ fontSize: 22 }}>{s.count}</strong><span style={{ fontSize: 11, opacity: .88, marginLeft: 6 }}>{(s.count / sessionTotal * 100).toFixed(0)}%</span></span></div>)}</div> : noData('No attended sessions are available to compare activity.')
  const dumbbell = improvements.length ? <div style={{ display: 'grid', gap: 14 }}>{improvements.map(x => <div key={x.name}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--text-primary)', marginBottom: 3 }}><span>{x.name}</span><strong style={{ color: x.delta >= 0 ? '#16a34a' : '#ef4444' }}>{x.delta >= 0 ? '+' : ''}{x.delta.toFixed(1)} pp</strong></div><svg viewBox="0 0 320 34" style={{ width: '100%', display: 'block' }} role="img" aria-label={`${x.name} previous ${x.previous.toFixed(1)} percent, latest ${x.latest.toFixed(1)} percent`}><line x1={x.previous / 100 * 300 + 10} y1="17" x2={x.latest / 100 * 300 + 10} y2="17" stroke={x.color} strokeWidth="5" strokeLinecap="round" opacity=".45"/><circle cx={x.previous / 100 * 300 + 10} cy="17" r="6" fill="#94a3b8" stroke="var(--bg-card)" strokeWidth="2"><title>Previous: {x.previous.toFixed(1)}%</title></circle><circle cx={x.latest / 100 * 300 + 10} cy="17" r="7" fill={x.color} stroke="var(--bg-card)" strokeWidth="2"><title>Latest: {x.latest.toFixed(1)}%</title></circle></svg><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)' }}><span>Previous {x.previous.toFixed(1)}%</span><span>Latest {x.latest.toFixed(1)}%</span></div></div>)}</div> : noData('Improvement trends will appear after a class has two scored sessions.')
  const beeswarm = scoreDistributions.length ? <div style={{ display: 'grid', gap: 16 }}>{scoreDistributions.map(row => <div key={row.name}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 750, color: 'var(--text-primary)' }}>{row.name}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{row.scores.length} sessions</span></div><div style={{ display: 'grid', gridTemplateColumns: `repeat(${row.scores.length}, minmax(0, 1fr))`, gap: 7, alignItems: 'end' }}>{row.scores.map((point, i) => <div key={`${point.label}-${i}`} title={`${point.label}: ${point.value.toFixed(1)}%`} style={{ minWidth: 0, textAlign: 'center' }}><div style={{ fontSize: 10, fontWeight: 750, color: 'var(--text-primary)', marginBottom: 5 }}>{point.value.toFixed(0)}%</div><div style={{ height: 92, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary, rgba(100,116,139,.04))', borderRadius: '7px 7px 0 0', overflow: 'hidden' }}><div style={{ width: '58%', height: `${Math.max(4, point.value)}%`, background: 'var(--accent, #3159b8)', opacity: .82, borderRadius: '5px 5px 0 0' }} /></div><div style={{ marginTop: 6, fontSize: 9, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{point.label.length > 9 ? `${point.label.slice(0, 8)}…` : point.label}</div></div>)}</div></div>)}</div> : noData('Session score history will appear when scores are available.')
  return <section aria-label="All classes analytics" style={{ marginTop: 28, marginBottom: 22 }}>
    <style>{`@keyframes classChartRise { from { opacity: .35; transform: translateY(5px) } to { opacity: 1; transform: translateY(0) } } .class-analytics-card { border-radius: 26px !important; overflow: hidden; animation: classChartRise .42s ease both; transition: transform .36s cubic-bezier(.2,.75,.2,1), box-shadow .36s ease, border-color .3s ease; will-change: transform; } .class-analytics-card:hover { transform: translateY(-6px); border-color: color-mix(in srgb, var(--pj-brand) 20%, var(--pj-border)) !important; box-shadow: 0 22px 48px rgba(15,23,42,.11), 0 0 0 1px rgba(99,102,241,.03), inset 0 1px 0 var(--pj-edge) !important; } .class-analytics-card:focus-within { border-color: color-mix(in srgb, var(--accent, #3159b8) 30%, var(--border-color)) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #3159b8) 12%, transparent) !important; } @media (prefers-reduced-motion: reduce) { .class-analytics-card { animation: none; transition: none; } }`}</style>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}><div><div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}><span aria-hidden="true" style={{ color: '#d97706', display: 'inline-flex', width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V11M10 20V5M16 20v-7M22 20H2"/><path d="m3 8 6-4 6 5 6-6"/></svg></span><h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: isMobile ? 22 : 25, fontWeight: 850, letterSpacing: '-.03em' }}><span id="class-by-class-analytics" style={{ scrollMarginTop: 100 }}>Class-by-Class Analytics</span></h2></div><p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Four distinct visualizations · class comparisons · real session data</p></div><div style={{ padding: '7px 11px', borderRadius: 99, border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: 11, background: 'var(--bg-card)' }}>{usable.length} {usable.length === 1 ? 'class' : 'classes'} tracked</div></div>
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))', gap: 16, alignItems: 'stretch' }}>
      <div className="class-analytics-card">{card('Session Accuracy by Class', 'A clean stem-and-dot ranking makes small differences between classes easier to spot.', lollipop)}</div>
      <div className="class-analytics-card">{card('Average Accuracy Across Classes', 'The center shows mean accuracy across classes, with a smooth arc instead of another bar chart.', gauge)}</div>
      <div className="class-analytics-card">{card('Class Activity Treemap', 'Colorful proportional tiles show each class’s share of attended sessions.', treemap)}</div>
      <div className="class-analytics-card">{card('Session Accuracy Comparison', 'Paired dots compare each class’s previous and latest scored session.', dumbbell)}</div>
    </div>
  </section>
}
function StudentPerformancePage({ embedded = false, classId: embeddedClassId = null } = {}) {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, token } = useAuthStore()
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [classes, setClasses] = useState([])
  const routeClassId = location.pathname.match(/^\/student\/classes\/([^/]+)/)?.[1]
  const queryClassId = new URLSearchParams(location.search).get('classId')
  const [selectedClassId, setSelectedClassId] = useState(embeddedClassId || routeClassId || queryClassId || location.state?.classId || 'all')
  const [classComparisonData, setClassComparisonData] = useState([])

  useEffect(() => {
    const currentClassId = embeddedClassId || routeClassId || queryClassId || location.state?.classId
    if (currentClassId) setSelectedClassId(currentClassId)
  }, [embeddedClassId, routeClassId, queryClassId, location.state])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    classApi.getAll()
      .then(payload => {
        if (!cancelled) setClasses((payload?.classes || []).filter(cls => cls?.memberStatus !== 'pending'))
      })
      .catch(err => console.error('Failed to load classes for performance filter:', err))
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    if (!token || !user?._id || !classes.length) { setClassComparisonData([]); return }
    let cancelled = false
    const loadClassSummaries = async () => {
      const results = await Promise.all(classes.map(async (cls) => {
        try {
          const res = await fetch(`${API_URL}/responses/performance/student/${user._id}?classId=${encodeURIComponent(cls._id)}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          const payload = await res.json()
          if (!res.ok) return null
          return { id: cls._id, name: cls.name || 'Unnamed class', summary: payload?.summary || {}, history: payload?.history || [] }
        } catch (err) { console.error(`Failed to load comparison data for ${cls.name}:`, err); return null }
      }))
      if (!cancelled) setClassComparisonData(results.filter(Boolean))
    }
    loadClassSummaries()
    return () => { cancelled = true }
  }, [token, user?._id, classes])

  const fetchPerformance = useCallback(async (silent = false) => {
    if (!token || !user?._id) return
    if (!silent) setIsLoading(true)
    setError('')
    try {
      const query = selectedClassId !== 'all' ? `?classId=${encodeURIComponent(selectedClassId)}` : ''
      const res = await fetch(`${API_URL}/responses/performance/student/${user._id}${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload?.error || 'Failed to load performance')
      setData(payload)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Failed to fetch student performance:', err)
      setError(err.message || 'Failed to load performance')
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [token, user?._id, selectedClassId])

  useEffect(() => {
    fetchPerformance()
  }, [fetchPerformance])

  // A completed session changes the journey state only after it ends. A modest refresh interval lets
  // an already-open dashboard pick up a newly completed session without touching the live room flow.
  useEffect(() => {
    if (!token) return undefined
    const id = window.setInterval(() => fetchPerformance(true), 60000)
    return () => window.clearInterval(id)
  }, [token, fetchPerformance])

  const summary = data?.summary
  const history = data?.history || []
  const hasHistory = history.length > 0
  const chartTrends = {
    score: (data?.trends?.score || []).slice(-5),
    accuracy: (data?.trends?.accuracy || []).slice(-5),
    rank: (data?.trends?.rank || []).slice(-5)
  }
  const answeringPattern = data?.answeringPattern || { averageResponseTime: null, totalResponses: 0, questionTypes: [] }
  const attendedHistory = history.filter(item => item.attended)
  const chartHistoryCount = attendedHistory.length
  const recent = summary?.recentComparison
  const selectedClassIndex = classes.findIndex(cls => cls._id === selectedClassId)
  const chartTheme = selectedClassId === 'all' ? CLASS_PALETTE[0] : CLASS_PALETTE[(selectedClassIndex + 1) % CLASS_PALETTE.length]
  return (
    <>
      <style>{`
        /* ============================================================
           SPANDAN PERFORMANCE JOURNEY — VISUAL SYSTEM
           Presentation-only layer. No data, formulas, fetches or
           navigation logic are changed by this stylesheet.
           ============================================================ */
        @keyframes pjPageIn {
          from { opacity: 0; transform: translateY(18px) scale(.992); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes pjHeaderGlow {
          0%, 100% { transform: translate3d(-8%, -4%, 0) scale(1); opacity: .45; }
          50% { transform: translate3d(8%, 4%, 0) scale(1.08); opacity: .72; }
        }

        @keyframes pjHeaderShine {
          0%, 48% { transform: translateX(-130%) skewX(-18deg); opacity: 0; }
          55% { opacity: .55; }
          76%, 100% { transform: translateX(155%) skewX(-18deg); opacity: 0; }
        }

        @keyframes pjCardIn {
          from { opacity: 0; transform: translateY(22px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes pjMetricPop {
          0% { opacity: 0; transform: translateY(18px) scale(.96); }
          70% { transform: translateY(-2px) scale(1.005); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes pjFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-5px) rotate(1.5deg); }
        }

        @keyframes pjPulseRing {
          0% { box-shadow: 0 0 0 0 rgba(99,102,241,.25); }
          70% { box-shadow: 0 0 0 10px rgba(99,102,241,0); }
          100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
        }

        @keyframes pjDrawTrend {
          from { stroke-dashoffset: 1; opacity: .15; }
          to { stroke-dashoffset: 0; opacity: 1; }
        }

        @keyframes pjPointIn {
          0% { transform: scale(.35); opacity: 0; }
          65% { transform: scale(1.18); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes pjSpin { to { transform: rotate(360deg); } }

        @keyframes pjShimmer {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }

        @keyframes pjBadgePop {
          from { opacity: 0; transform: translateY(5px) scale(.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .performance-shell {
          --pj-brand: var(--accent, #4f46e5);
          --pj-brand-2: #7c3aed;
          --pj-cyan: #06b6d4;
          --pj-card: var(--bg-card, #ffffff);
          --pj-page: var(--bg-primary, #f6f8fc);
          --pj-soft: var(--bg-secondary, rgba(99,102,241,.055));
          --pj-border: var(--border-color, rgba(15,23,42,.08));
          --pj-muted: var(--text-secondary, #64748b);
          --pj-ink: var(--text-primary, #0f172a);
          /* glass surfaces derived from the app's card colour, so they follow light/dark automatically */
          --pj-glass-hi: color-mix(in srgb, var(--pj-card) 93%, transparent);
          --pj-glass-lo: color-mix(in srgb, var(--pj-card) 70%, transparent);
          --pj-glass-faint: color-mix(in srgb, var(--pj-card) 58%, transparent);
          --pj-edge: color-mix(in srgb, var(--pj-card), white 18%);
          position: relative;
          overflow-x: clip;
          background:
            radial-gradient(circle at 14% 10%, rgba(99,102,241,.08), transparent 26%),
            radial-gradient(circle at 90% 34%, rgba(6,182,212,.06), transparent 22%),
            var(--pj-page) !important;
          color: var(--pj-ink);
          animation: pjPageIn .7s cubic-bezier(.2,.75,.2,1) backwards;
        }

        .performance-shell::before,
        .performance-shell::after {
          content: '';
          position: fixed;
          width: 420px;
          height: 420px;
          border-radius: 50%;
          pointer-events: none;
          z-index: 0;
          filter: blur(70px);
          opacity: .12;
        }

        .performance-shell::before {
          top: 8%;
          right: -180px;
          background: #6366f1;
        }

        .performance-shell::after {
          bottom: -150px;
          left: 10%;
          background: #06b6d4;
        }

        .performance-shell > * { position: relative; z-index: 1; }

        .performance-header {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          border-bottom: 1px solid rgba(255,255,255,.14);
          background: #192f59 !important;
          box-shadow: 0 16px 44px rgba(15,23,42,.18) !important;
        }

        .performance-header::before {
          content: '';
          position: absolute;
          width: 360px;
          height: 360px;
          top: -220px;
          right: 4%;
          border-radius: 50%;
          background: rgba(255,255,255,.13);
          filter: blur(12px);
          animation: pjHeaderGlow 8s ease-in-out infinite;
          pointer-events: none;
          z-index: -1;
        }

        .performance-header::after {
          content: '';
          position: absolute;
          top: -35%;
          bottom: -35%;
          left: -20%;
          width: 18%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent);
          animation: pjHeaderShine 6.5s ease-in-out infinite;
          pointer-events: none;
          z-index: -1;
        }

        .performance-header h1 {
          text-shadow: 0 10px 28px rgba(0,0,0,.18);
          font-weight: 850 !important;
        }

        .performance-header p { letter-spacing: .01em; }

        .performance-header button,
        .performance-header [role='button'] {
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }

        .performance-content {
          position: relative;
          z-index: 2;
        }

        .performance-content > * {
          animation: pjCardIn .65s cubic-bezier(.2,.75,.2,1) both;
        }

        .performance-content > *:nth-child(2) { animation-delay: .04s; }
        .performance-content > *:nth-child(3) { animation-delay: .08s; }
        .performance-content > *:nth-child(4) { animation-delay: .12s; }
        .performance-content > *:nth-child(5) { animation-delay: .16s; }
        .performance-content > *:nth-child(6) { animation-delay: .20s; }
        .performance-content > *:nth-child(7) { animation-delay: .24s; }

        .updated-label {
          padding: 8px 11px;
          width: fit-content;
          margin-left: auto;
          border: 1px solid var(--pj-border);
          border-radius: 999px;
          background: var(--pj-glass-faint);
          box-shadow: 0 8px 24px rgba(15,23,42,.045);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          animation: pjBadgePop .4s ease both;
        }

        /* ---- metric cards ---- */
        .performance-metric {
          position: relative;
          overflow: hidden;
          min-height: 126px;
          padding: 16px !important;
          border: 1px solid color-mix(in srgb, var(--pj-brand) 9%, var(--pj-border)) !important;
          border-radius: 24px !important;
          background:
            linear-gradient(145deg, var(--pj-glass-hi), var(--pj-glass-lo)) !important;
          box-shadow:
            0 10px 24px rgba(15,23,42,.055),
            inset 0 1px 0 var(--pj-edge) !important;
          animation: pjMetricPop .65s cubic-bezier(.2,.75,.2,1) both;
          transition:
            transform .35s cubic-bezier(.2,.75,.2,1),
            box-shadow .35s ease,
            border-color .3s ease,
            background .3s ease;
        }

        .performance-metric::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--pj-brand), var(--pj-brand-2), var(--pj-cyan));
          opacity: .82;
        }

        .performance-metric::after {
          content: '';
          position: absolute;
          width: 110px;
          height: 110px;
          right: -48px;
          bottom: -55px;
          border-radius: 50%;
          background: radial-gradient(circle, color-mix(in srgb, var(--pj-brand) 12%, transparent), transparent 68%);
          pointer-events: none;
          transition: transform .45s ease;
        }

        .performance-metric:hover {
          transform: translateY(-8px) scale(1.015);
          border-color: color-mix(in srgb, var(--pj-brand) 34%, var(--pj-border)) !important;
          box-shadow:
            0 20px 44px rgba(15,23,42,.12),
            0 0 0 1px color-mix(in srgb, var(--pj-brand) 7%, transparent),
            inset 0 1px 0 var(--pj-edge) !important;
        }

        .performance-metric:hover::after { transform: scale(1.35); }

        .performance-metric > div:nth-child(2) {
          font-size: 27px !important;
          letter-spacing: -.04em !important;
        }

        .metric-icon {
          display: inline-grid;
          place-items: center;
          width: 42px;
          height: 42px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(99,102,241,.13), rgba(6,182,212,.10));
          border: 1px solid rgba(99,102,241,.12);
          box-shadow: 0 8px 18px rgba(99,102,241,.10);
          animation: pjFloat 4.2s ease-in-out infinite;
          transition: transform .3s ease, box-shadow .3s ease;
        }

        .performance-metric:hover .metric-icon {
          transform: translateY(-2px) rotate(5deg) scale(1.06);
          box-shadow: 0 12px 24px rgba(99,102,241,.16);
        }

        /* ---- chart / info cards ---- */
        .chart-card,
        .change-card,
        .highlight-card {
          position: relative;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--pj-brand) 7%, var(--pj-border)) !important;
          border-radius: 26px !important;
          background:
            linear-gradient(145deg, var(--pj-glass-hi), var(--pj-glass-lo)) !important;
          box-shadow:
            0 12px 30px rgba(15,23,42,.06),
            inset 0 1px 0 var(--pj-edge) !important;
          transition:
            transform .36s cubic-bezier(.2,.75,.2,1),
            box-shadow .36s ease,
            border-color .3s ease;
        }

        .chart-card::before,
        .change-card::before,
        .highlight-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 100% 0%, rgba(99,102,241,.08), transparent 34%);
          opacity: 0;
          transition: opacity .35s ease;
          pointer-events: none;
        }

        .chart-card:hover,
        .change-card:hover,
        .highlight-card:hover {
          transform: translateY(-6px);
          border-color: color-mix(in srgb, var(--pj-brand) 20%, var(--pj-border)) !important;
          box-shadow:
            0 22px 48px rgba(15,23,42,.11),
            0 0 0 1px rgba(99,102,241,.03),
            inset 0 1px 0 var(--pj-edge) !important;
        }

        .chart-card:hover::before,
        .change-card:hover::before,
        .highlight-card:hover::before { opacity: 1; }

        .chart-card h2,
        .change-card h2,
        .highlight-card h2 {
          position: relative;
          z-index: 1;
          font-weight: 820 !important;
          letter-spacing: -.025em;
        }

        .chart-card p,
        .change-card p { position: relative; z-index: 1; }

        .insight-list-card {
          cursor: default;
        }

        .insight-item {
          position: relative;
          transition: background .22s ease, transform .22s ease, box-shadow .22s ease;
        }

        .insight-item:hover,
        .insight-item:focus-visible {
          background: color-mix(in srgb, var(--pj-brand) 7%, transparent);
          transform: translateX(3px);
          box-shadow: inset 3px 0 0 var(--pj-brand);
        }

        .insight-item:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--pj-brand) 55%, transparent);
        }

        @media (prefers-reduced-motion: reduce) {
          .insight-item { transition: none !important; }
        }

        /* ---- trend visualization ---- */
        .chart-card > div > svg {
          border-radius: 18px;
          padding: 6px;
          background:
            linear-gradient(rgba(99,102,241,.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,.045) 1px, transparent 1px);
          background-size: 40px 40px;
          box-sizing: border-box;
          filter: drop-shadow(0 9px 18px rgba(79,70,229,.08));
        }

        .trend-line {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: pjDrawTrend 1.45s cubic-bezier(.22,.61,.36,1) .12s forwards;
          vector-effect: non-scaling-stroke;
          filter: drop-shadow(0 4px 7px rgba(79,70,229,.22));
        }

        .trend-point {
          transform-box: fill-box;
          transform-origin: center;
          animation: pjPointIn .5s cubic-bezier(.2,.8,.2,1) both;
          transition: r .25s ease, stroke-width .25s ease, filter .25s ease;
          cursor: crosshair;
        }

        .trend-point:hover {
          r: 7 !important;
          stroke-width: 4;
          filter: drop-shadow(0 0 9px rgba(79,70,229,.55));
        }

        /* ---- recent change rows ---- */
        .change-card > div:last-child > div {
          transition: transform .25s ease, background .25s ease, box-shadow .25s ease;
        }

        .change-card > div:last-child > div:hover {
          transform: translateX(5px);
          background: rgba(99,102,241,.075) !important;
          box-shadow: 0 8px 18px rgba(15,23,42,.055);
        }

        /* ---- highlight cards ---- */
        .highlight-card > div:first-child {
          width: 5px !important;
          border-radius: 999px;
          box-shadow: 0 0 18px rgba(99,102,241,.25);
        }

        .highlight-card span {
          transition: transform .2s ease, background .2s ease, box-shadow .2s ease;
        }

        .highlight-card span:hover {
          transform: translateY(-2px);
          background: rgba(99,102,241,.09) !important;
          box-shadow: 0 8px 16px rgba(15,23,42,.05);
        }

        /* ---- compact stat cards ---- */
        .performance-content > div > div > div[style*='borderRadius: 18px'] {
          transition: transform .3s cubic-bezier(.2,.75,.2,1), box-shadow .3s ease, border-color .3s ease;
        }

        .performance-content > div > div > div[style*='borderRadius: 18px']:hover {
          transform: translateY(-5px);
          box-shadow: 0 16px 32px rgba(15,23,42,.09) !important;
          border-color: rgba(99,102,241,.22) !important;
        }

        /* ---- table ---- */
        .performance-content table {
          border-spacing: 0;
        }

        .performance-content thead tr {
          background: linear-gradient(90deg, rgba(99,102,241,.07), rgba(6,182,212,.045)) !important;
        }

        .performance-content th {
          position: sticky;
          top: 0;
          z-index: 1;
          font-weight: 800 !important;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .session-row {
          position: relative;
          transition: background .25s ease, transform .25s ease, box-shadow .25s ease;
        }

        .session-row:hover {
          background: linear-gradient(90deg, rgba(99,102,241,.065), rgba(6,182,212,.035)) !important;
          box-shadow: inset 4px 0 0 var(--pj-brand), 0 8px 18px rgba(15,23,42,.035);
        }

        .session-row:active {
          transform: scale(.997);
        }

        .session-row td {
          transition: color .2s ease;
        }

        .session-row:hover td:first-child {
          color: var(--pj-brand) !important;
        }

        /* ---- controls ---- */
        .header-action-btn,
        .empty-join-btn,
        .performance-content button {
          position: relative;
          overflow: hidden;
          transform: translateZ(0);
        }

        .header-action-btn::before,
        .empty-join-btn::before,
        .performance-content button::before {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          left: -60%;
          width: 34%;
          transform: skewX(-18deg);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.30), transparent);
          transition: transform .6s ease;
          pointer-events: none;
        }

        .header-action-btn:hover::before,
        .empty-join-btn:hover::before,
        .performance-content button:hover::before {
          transform: translateX(390%) skewX(-18deg);
        }

        .header-action-btn {
          transition: transform .22s cubic-bezier(.2,.75,.2,1), background .22s ease, border-color .22s ease, box-shadow .22s ease;
        }

        .header-action-btn:not(:disabled):hover {
          transform: translateY(-3px) scale(1.02);
          background: rgba(255,255,255,.17) !important;
          border-color: rgba(255,255,255,.50) !important;
          box-shadow: 0 10px 26px rgba(0,0,0,.14);
        }

        .header-action-btn:not(:disabled):active {
          transform: translateY(0) scale(.98);
        }

        .empty-join-btn {
          box-shadow: 0 14px 30px rgba(79,70,229,.22);
          transition: transform .28s cubic-bezier(.2,.75,.2,1), box-shadow .28s ease, filter .28s ease;
          animation: pjPulseRing 2.8s infinite;
        }

        .empty-join-btn:hover {
          transform: translateY(-4px) scale(1.025);
          filter: saturate(1.07) brightness(1.04);
          box-shadow: 0 20px 36px rgba(79,70,229,.30);
        }

        .empty-join-btn:active {
          transform: translateY(-1px) scale(.985);
        }

        /* ---- empty state ---- */
        .journey-empty {
          position: relative;
          overflow: hidden;
          min-height: 380px;
          display: grid;
          place-items: center;
          align-content: center;
          background:
            radial-gradient(circle at 16% 20%, rgba(99,102,241,.12), transparent 25%),
            radial-gradient(circle at 82% 80%, rgba(6,182,212,.10), transparent 24%),
            linear-gradient(145deg, var(--pj-glass-hi), var(--pj-glass-lo)) !important;
          border: 1px solid rgba(99,102,241,.12) !important;
          box-shadow: 0 24px 54px rgba(15,23,42,.08), inset 0 1px 0 var(--pj-edge) !important;
        }

        .journey-empty::before,
        .journey-empty::after {
          content: '';
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(99,102,241,.10);
          pointer-events: none;
        }

        .journey-empty::before {
          width: 230px;
          height: 230px;
          top: -100px;
          left: -60px;
          box-shadow: 0 0 0 30px rgba(99,102,241,.025), 0 0 0 60px rgba(99,102,241,.018);
        }

        .journey-empty::after {
          width: 270px;
          height: 270px;
          right: -100px;
          bottom: -140px;
          box-shadow: 0 0 0 35px rgba(6,182,212,.022), 0 0 0 70px rgba(6,182,212,.015);
        }

        .empty-icon {
          position: relative;
          z-index: 1;
          display: grid;
          place-items: center;
          width: 78px;
          height: 78px;
          margin-bottom: 18px !important;
          border-radius: 24px;
          background: linear-gradient(145deg, rgba(99,102,241,.13), rgba(6,182,212,.10));
          border: 1px solid rgba(99,102,241,.12);
          box-shadow: 0 16px 32px rgba(99,102,241,.12);
          animation: pjFloat 4s ease-in-out infinite;
        }

        .journey-empty h2,
        .journey-empty p,
        .journey-empty button {
          position: relative;
          z-index: 1;
        }

        /* ---- loading ---- */
        .performance-loading {
          min-height: 320px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 14px;
          color: var(--pj-muted);
          font-size: 14px;
        }

        .loading-orbit {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          border: 3px solid rgba(99,102,241,.11);
          border-top-color: var(--pj-brand);
          border-right-color: #06b6d4;
          animation: pjSpin .9s linear infinite;
          box-shadow: 0 0 0 10px rgba(99,102,241,.035);
        }

        /* ---- responsive touch feedback ---- */
        @media (max-width: 760px) {
          .performance-metric:hover,
          .chart-card:hover,
          .change-card:hover,
          .highlight-card:hover {
            transform: translateY(-3px);
          }

          .updated-label { margin-bottom: 12px; }
          .journey-empty { min-height: 340px; padding: 28px !important; }
        }

        @media (hover: none) {
          .performance-metric,
          .chart-card,
          .change-card,
          .highlight-card,
          .session-row,
          .header-action-btn,
          .empty-join-btn {
            transition-duration: .15s;
          }

          .performance-metric:active { transform: scale(.985); }
          .chart-card:active,
          .change-card:active,
          .highlight-card:active { transform: scale(.992); }
        }

        @media (prefers-reduced-motion: reduce) {
          .performance-shell,
          .performance-content > *,
          .performance-metric,
          .metric-icon,
          .trend-line,
          .trend-point,
          .performance-header::before,
          .performance-header::after,
          .loading-orbit,
          .journey-empty,
          .empty-icon,
          .empty-join-btn,
          .updated-label {
            animation: none !important;
          }

          .performance-metric,
          .chart-card,
          .change-card,
          .highlight-card,
          .session-row,
          .header-action-btn,
          .empty-join-btn {
            transition: none !important;
          }
        }

        .session-row:hover { background: color-mix(in srgb, var(--pj-brand) 5%, var(--pj-card)); }
        .session-view-button {
          border: 1px solid color-mix(in srgb, var(--pj-brand) 22%, var(--pj-border));
          color: var(--pj-brand); background: color-mix(in srgb, var(--pj-brand) 7%, var(--pj-card));
          border-radius: 9px; padding: 7px 11px; font-weight: 750; font-size: 12px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px; transition: transform .2s ease, background .2s ease;
        }
        .session-view-button:hover { transform: translateY(-1px); background: color-mix(in srgb, var(--pj-brand) 13%, var(--pj-card)); }
        .pagination-button {
          border: 1px solid var(--pj-border); border-radius: 10px; padding: 8px 12px;
          background: var(--pj-glass-hi); color: var(--pj-ink); font-size: 12px; font-weight: 750; cursor: pointer;
        }
        .pagination-button:disabled { opacity: .42; cursor: not-allowed; }
        .streak-grid span { transition: transform .15s ease, outline-color .15s ease; }
        .streak-grid span:hover { transform: scale(1.2); outline: 1px solid var(--pj-brand); z-index: 2; }
        @media (max-width: 900px) {
          .streak-grid { grid-template-columns: repeat(14, minmax(7px, 1fr)) !important; }
        }
        @media (max-width: 520px) {
          .streak-grid { grid-template-columns: repeat(7, minmax(10px, 1fr)) !important; }
        }
      `}</style>

      <div className="performance-shell" style={{ '--selected-chart-color': chartTheme.main, '--selected-chart-soft': chartTheme.soft, display: 'flex', flexDirection: 'column', minHeight: embedded ? 'auto' : '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
        {!embedded && <Sidebar user={user} />}
        <main style={{ flex: 1, minWidth: 0, marginLeft: embedded ? 0 : 'var(--sidebar-width, 240px)' }}>
          {!embedded && (
          <header className="performance-header" style={{ background: 'var(--header-bg)', color: '#fff', padding: isMobile ? '20px 16px 22px' : '28px 32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ paddingLeft: isMobile ? 48 : 0, minWidth: 0 }}>
                <div style={{ fontSize: 12, opacity: 0.78, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Student Analytics</div>
                <h1 style={{ margin: '7px 0 0', fontSize: isMobile ? 23 : 30, lineHeight: 1.15, letterSpacing: '-0.035em' }}>My Growth</h1>
                <p style={{ margin: '8px 0 0', opacity: 0.86, fontSize: 14 }}>Track your progress and keep improving with every completed live session.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                  <label htmlFor="performance-class-filter" style={{ fontSize: 12, fontWeight: 750, color: 'rgba(255,255,255,.88)' }}>View performance for</label>
                  <select
                    id="performance-class-filter"
                    value={selectedClassId}
                    onChange={event => setSelectedClassId(event.target.value)}
                    style={{
                      minWidth: isMobile ? '100%' : 220,
                      maxWidth: '100%',
                      padding: '10px 13px',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,.32)',
                      background: 'rgba(255,255,255,.12)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 700,
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="all" style={{ color: '#111827', background: '#fff' }}>All Classes</option>
                    {classes.map(cls => (
                      <option key={cls._id} value={cls._id} style={{ color: '#111827', background: '#fff' }}>{cls.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="header-action-btn" onClick={() => fetchPerformance()} disabled={isLoading} style={{ border: '1px solid rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 10, padding: '9px 12px', fontWeight: 700, cursor: isLoading ? 'wait' : 'pointer' }}>{isLoading ? 'Refreshing…' : '↻ Refresh'}</button>
                <ThemeToggle />
                <ProfileDropdown />
              </div>
            </div>
          </header>
          )}

          <section className="performance-content" style={{ padding: embedded ? (isMobile ? '16px 12px 20px' : '20px 24px 28px') : (isMobile ? '16px 14px 24px' : '24px 24px 32px'), width: '100%', maxWidth: 1500, margin: '0 auto', boxSizing: 'border-box' }}>
            {lastUpdated && !error && <div className="updated-label" style={{ marginBottom: 14, display: 'flex', justifyContent: 'flex-end', color: 'var(--text-secondary)', fontSize: 12 }}>Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}

            {error && <div style={{ marginBottom: 16, padding: '13px 15px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.28)', background: 'rgba(239,68,68,0.08)', color: 'var(--text-primary)', fontSize: 14 }}><strong>Couldn’t load your performance.</strong> {error}<button onClick={() => fetchPerformance()} style={{ marginLeft: 10, border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>Try again</button></div>}

            {!isLoading && hasHistory && <nav aria-label="Performance section navigation" style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, overflowX: 'auto', padding: '8px 0 12px', marginBottom: 12, scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}>
              {[
                { id: 'recent-changes', label: 'Recent Changes', icon: '🕘', color: '#d97706' },
                { id: 'best-weakest-performance', label: 'Best & Weakest Performance', icon: '🏆', color: '#2563eb' },
                { id: 'answering-pattern', label: 'Answering Pattern', icon: '☑️', color: '#0d9488' },
                { id: 'performance-insights', label: 'Performance Insights', icon: '💡', color: '#7c3aed' },
                { id: 'advanced-performance-lab', label: 'Performance Explorer', icon: '🧪', color: '#64748b' },
                ...(selectedClassId === 'all' ? [{ id: 'class-by-class-analytics', label: 'Class-by-Class Analytics', icon: '📊', color: '#3159b8' }] : [])
              ].map(item => <a key={item.id} href={`#${item.id}`} onClick={event => { event.preventDefault(); document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} style={{ display: 'inline-flex', flex: '0 0 auto', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', textDecoration: 'none', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(15,23,42,.05))', transition: 'background .16s ease, border-color .16s ease, box-shadow .16s ease' }}><span aria-hidden="true" style={{ color: item.color, display: 'inline-flex' }}>{item.icon}</span>{item.label}<span aria-hidden="true" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>↗</span></a>)}
            </nav>}

            {isLoading && !data ? (
              <div className="performance-loading" aria-live="polite"><div className="loading-orbit" aria-hidden="true" /><div>Loading your performance journey…</div></div>
            ) : !hasHistory ? (
              <div className="journey-empty-wrap"><EmptyState onJoin={() => navigate('/student/join-room')} /></div>
            ) : (
              <>

                {/* Primary KPIs: the rank and session-attendance cards were replaced by question metrics. */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(6, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
                  <PerformanceMetric label="Overall Accuracy" value={`${summary?.overallAccuracy ?? 0}%`} caption="Correct answers out of attempted" icon="🎯" />
                  <PerformanceMetric label="Average Score" value={`${summary?.averageScore ?? 0}%`} caption={`Across ${summary?.totalSessions ?? chartHistoryCount} attended sessions`} icon="⭐" />
                  <PerformanceMetric label="Questions Attempted" value={summary?.attemptedQuestions ?? 0} caption="Answers submitted" icon="📝" />
                  <PerformanceMetric label="Correct Answers" value={summary?.correctAnswers ?? 0} caption="Correctly answered" icon="✅" />
                  <PerformanceMetric label="Incorrect Answers" value={summary?.incorrectAnswers ?? 0} caption="Answers to review" icon="❌" />
                  <PerformanceMetric label="Missed Questions" value={summary?.missedQuestions ?? 0} caption="Questions left unanswered" icon="⏭️" />
                </div>

                <RecentChangesSection history={attendedHistory} recent={recent} isMobile={isMobile} />

                <AttendanceStreak history={history} isMobile={isMobile} />


                {/* Journey charts: each uses its own colour (blue / violet / orange); Speed vs Accuracy sits beside Rank Journey. */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 18, marginBottom: 20, alignItems: 'stretch' }}>
                  <div className="chart-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, padding: isMobile ? 16 : 22, boxShadow: 'var(--shadow-md)', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', flexShrink: 0, width: 44, height: 44, borderRadius: 14, background: 'rgba(37,99,235,.10)', fontSize: 23 }}>📈</span>
                        <div><h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 19 }}>Score Journey</h2><p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Your score across each completed session.</p></div>
                      </div>
                    </div>
                    <div style={{ color: JOURNEY_COLORS.score }}><TrendLine points={chartTrends.score} yLabel="Score (%)" color={JOURNEY_COLORS.score} /></div>
                  </div>

                  <div className="chart-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, padding: isMobile ? 16 : 22, boxShadow: 'var(--shadow-md)', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                        <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', flexShrink: 0, width: 42, height: 42, borderRadius: 13, background: 'rgba(139,92,246,.12)', fontSize: 22 }}>🎯</span>
                        <div><h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Accuracy Trend</h2><p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>Session accuracy with an overall average reference.</p></div>
                      </div>
                    </div>
                    <AccuracyBarChart points={chartTrends.accuracy} color={JOURNEY_COLORS.accuracy} />
                  </div>

                  <div className="chart-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, padding: isMobile ? 16 : 22, boxShadow: 'var(--shadow-md)', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                        <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', flexShrink: 0, width: 42, height: 42, borderRadius: 13, background: 'rgba(249,115,22,.14)', fontSize: 22 }}>🏆</span>
                        <div><h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Rank Journey</h2><p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>Rank movement across sessions; a smaller rank number is better.</p></div>
                      </div>
                    </div>
                    <RankJourneyChart points={chartTrends.rank} color={JOURNEY_COLORS.rank} />
                  </div>

                  <div className="chart-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, padding: isMobile ? 16 : 22, boxShadow: 'var(--shadow-md)', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                        <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', flexShrink: 0, width: 42, height: 42, borderRadius: 13, background: 'rgba(13,148,136,.13)', fontSize: 22 }}>⚡</span>
                        <div><h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Speed vs Accuracy</h2><p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 12 }}>Does answering faster help or hurt? Each numbered dot is one session.</p></div>
                      </div>
                    </div>
                    <SpeedAccuracyChart history={attendedHistory} />
                  </div>
                </div>

                <PerformanceHighlights best={summary?.bestPerformance} weakest={summary?.weakestPerformance} history={attendedHistory} isMobile={isMobile} navigate={navigate} embedded={embedded} selectedClassId={selectedClassId} embeddedClassId={embeddedClassId} />

                <AnsweringPatternSection summary={summary} history={history} answeringPattern={answeringPattern} isMobile={isMobile} />

                <AddedAnalyticsSection history={attendedHistory} isMobile={isMobile} />

                {selectedClassId === 'all' && <ClassComparisonAnalytics items={classComparisonData} isMobile={isMobile} />}


              </>
            )}
          </section>
        </main>
      </div>
    </>
  )
}

export default StudentPerformancePage