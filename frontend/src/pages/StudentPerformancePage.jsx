import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useIsMobile from '../hooks/useIsMobile'
import { API_URL } from '../config.js'

const formatDate = (date) => {
  if (!date) return '—'
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
}

const formatRank = (rank) => rank == null ? '—' : `#${rank}`
const signed = (value, suffix = '') => value == null ? '—' : `${value > 0 ? '+' : ''}${value}${suffix}`

function TrendLine({ points, invert = false, unit = '%' }) {
  if (!points?.length) {
    return <div style={{ minHeight: 180, display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Complete a session to start your journey.</div>
  }

  const width = 760
  const height = 210
  const padX = 18
  const padY = 20
  const raw = points.map(p => Number(p.value) || 0)
  const min = Math.min(...raw)
  const max = Math.max(...raw)
  const range = Math.max(max - min, 1)
  const yFor = (value) => {
    const normalized = (value - min) / range
    return invert
      ? padY + normalized * (height - padY * 2)
      : height - padY - normalized * (height - padY * 2)
  }
  const xFor = (index) => padX + (index / Math.max(points.length - 1, 1)) * (width - padX * 2)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(Number(p.value) || 0).toFixed(1)}`).join(' ')
  const area = `${path} L ${xFor(points.length - 1).toFixed(1)} ${height - padY} L ${xFor(0).toFixed(1)} ${height - padY} Z`
  const latest = points[points.length - 1]

  return (
    <div>
      <div style={{ position: 'relative', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Performance trend" style={{ width: '100%', minWidth: 520, height: 210, display: 'block' }}>
          <path d={area} fill="currentColor" opacity="0.07" />
          <path className="trend-line" pathLength="1" d={path} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => (
            <circle className="trend-point" key={`${p.date}-${i}`} cx={xFor(i)} cy={yFor(Number(p.value) || 0)} r="4.5" fill="var(--bg-card)" stroke="currentColor" strokeWidth="3" />
          ))}
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: 'var(--text-secondary)', fontSize: 12 }}>
        <span>{formatDate(points[0].date)}</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{latest.value}{unit}</span>
        <span>{formatDate(points[points.length - 1].date)}</span>
      </div>
    </div>
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

function StudentPerformancePage() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchPerformance = useCallback(async (silent = false) => {
    if (!token || !user?._id) return
    if (!silent) setIsLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/responses/performance/student/${user._id}`, {
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
  }, [token, user?._id])

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
  const chartTrends = data?.trends || { score: [], accuracy: [], rank: [] }
  const chartHistoryCount = history.length
  const tableHistory = history

  const recent = summary?.recentComparison
  const scoreChangeTone = recent?.scoreChange > 0 ? 'positive' : recent?.scoreChange < 0 ? 'negative' : 'neutral'
  const accuracyChangeTone = recent?.accuracyChange > 0 ? 'positive' : recent?.accuracyChange < 0 ? 'negative' : 'neutral'

  const rankText = summary?.currentRank != null ? formatRank(summary.currentRank) : '—'
  //const avgRankText = summary?.averageRank != null ? `#${summary.averageRank}` : '—'

  const attendanceRate = useMemo(() => {
    if (!summary?.totalQuestions) return 0
    const sessions = summary.totalSessions || 0
    return sessions ? Math.round((history.filter(h => h.attended).length / sessions) * 100) : 0
  }, [summary, history])

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
          background:
            radial-gradient(circle at 86% 18%, rgba(255,255,255,.16), transparent 24%),
            linear-gradient(135deg, #0b1220 0%, #253bce 48%, #6d28d9 100%) !important;
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
          min-height: 150px;
          padding: 21px !important;
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
          font-size: 34px !important;
          letter-spacing: -.045em !important;
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
      `}</style>

      <div className="performance-shell" style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
      <Sidebar user={user} />
      <main style={{ flex: 1, minWidth: 0, marginLeft: 'var(--sidebar-width, 240px)' }}>
        <header className="performance-header" style={{ background: 'var(--header-bg)', color: '#fff', padding: isMobile ? '20px 16px 22px' : '28px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ paddingLeft: isMobile ? 48 : 0, minWidth: 0 }}>
              <div style={{ fontSize: 12, opacity: 0.78, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Student Analytics</div>
              <h1 style={{ margin: '7px 0 0', fontSize: isMobile ? 23 : 30, lineHeight: 1.15, letterSpacing: '-0.035em' }}>Performance Journey</h1>
              <p style={{ margin: '8px 0 0', opacity: 0.86, fontSize: 14 }}>Your progress across completed Spandan sessions.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="header-action-btn" onClick={() => fetchPerformance()} disabled={isLoading} style={{
                border: '1px solid rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.1)', color: '#fff',
                borderRadius: 10, padding: '9px 12px', fontWeight: 700, cursor: isLoading ? 'wait' : 'pointer'
              }}>{isLoading ? 'Refreshing…' : '↻ Refresh'}</button>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <section className="performance-content" style={{ padding: isMobile ? '16px 16px 0' : '32px 32px 0', maxWidth: 1400, margin: '0 auto' }}>
          {lastUpdated && !error && (
            <div className="updated-label" style={{ marginBottom: 14, display: 'flex', justifyContent: 'flex-end', color: 'var(--text-secondary)', fontSize: 12 }}>
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          {error && (
            <div style={{ marginBottom: 16, padding: '13px 15px', borderRadius: 14, border: '1px solid rgba(239,68,68,0.28)', background: 'rgba(239,68,68,0.08)', color: 'var(--text-primary)', fontSize: 14 }}>
              <strong>Couldn’t load your performance.</strong> {error}
              <button onClick={() => fetchPerformance()} style={{ marginLeft: 10, border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>Try again</button>
            </div>
          )}

          {isLoading && !data ? (
            <div className="performance-loading" aria-live="polite">
              <div className="loading-orbit" aria-hidden="true" />
              <div>Loading your performance journey…</div>
            </div>
          ) : !hasHistory ? (
            <div className="journey-empty-wrap">
              <EmptyState onJoin={() => navigate('/student/join-room')} />
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0,1fr))', gap: 14, marginBottom: 18 }}>
                <PerformanceMetric label="Overall Accuracy" value={`${summary.overallAccuracy}%`} caption={`${summary.correctAnswers} correct of ${summary.attemptedQuestions} attempted`} icon="🎯" />
                <PerformanceMetric label="Average Score" value={`${summary.averageScore}%`} caption={`Across ${summary.totalSessions} completed sessions`} icon="⭐" />
                <PerformanceMetric label="Current Rank" value={rankText} caption="Current leaderboard position"icon="🏆" />
                <PerformanceMetric label="Sessions Attended" value={summary.totalSessions} caption={`${attendanceRate}% of recorded journey sessions`} icon="📚" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr', gap: 18, marginBottom: 18 }}>
                <div className="chart-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, padding: isMobile ? 18 : 24, boxShadow: 'var(--shadow-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
                    <div>
                      <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Score Journey</h2>
                      <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Session score including unanswered questions as zero points.</p>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{chartHistoryCount} sessions</span>
                  </div>
                  <div style={{ color: 'var(--accent, #3b82f6)' }}><TrendLine points={chartTrends.score} /></div>
                </div>

                <div className="change-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, padding: isMobile ? 18 : 24, boxShadow: 'var(--shadow-md)' }}>
                  <div style={{ marginBottom: 18 }}>
                    <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Recent Change</h2>
                    <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Latest completed session vs the one before it.</p>
                  </div>
                  {hasHistory && recent ? (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {[['Score', recent.scoreChange, '%', scoreChangeTone], ['Accuracy', recent.accuracyChange, '%', accuracyChangeTone], ['Rank', recent.rankChange, ' places', recent.rankChange > 0 ? 'positive' : recent.rankChange < 0 ? 'negative' : 'neutral']].map(([label, value, suffix, tone]) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 14px', borderRadius: 14, background: 'var(--bg-secondary, rgba(127,127,127,0.08))' }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>{label}</span>
                          <span style={{ color: tone === 'positive' ? '#16a34a' : tone === 'negative' ? '#dc2626' : 'var(--text-primary)', fontWeight: 800 }}>{signed(value, suffix)}</span>
                        </div>
                      ))}
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Latest: <strong style={{ color: 'var(--text-primary)' }}>{recent.current.name}</strong></div>
                      {recent.previous && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Previous: <strong style={{ color: 'var(--text-primary)' }}>{recent.previous.name}</strong></div>}
                    </div>
                  ) : <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Complete another session to see a comparison.</div>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18, marginBottom: 18 }}>
                <div className="chart-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, padding: isMobile ? 18 : 24, boxShadow: 'var(--shadow-md)' }}>
                  <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Accuracy Trend</h2>
                  <p style={{ margin: '5px 0 18px', color: 'var(--text-secondary)', fontSize: 13 }}>Correct answers divided by questions you attempted.</p>
                  <div style={{ color: 'var(--accent, #3b82f6)' }}><TrendLine points={chartTrends.accuracy} /></div>
                </div>
                <div className="chart-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, padding: isMobile ? 18 : 24, boxShadow: 'var(--shadow-md)' }}>
                  <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Rank Journey</h2>
                  <p style={{ margin: '5px 0 18px', color: 'var(--text-secondary)', fontSize: 13 }}>Rank within each completed session. Lower is better.</p>
                  <div style={{ color: 'var(--accent, #3b82f6)' }}><TrendLine points={chartTrends.rank} invert unit="" /></div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0,1fr))', gap: 14, marginBottom: 18 }}>
                {[['Attempted', summary.attemptedQuestions, 'questions'], ['Missed', summary.missedQuestions, 'questions'], ['Correct', summary.correctAnswers, 'answers'], ['Incorrect', summary.incorrectAnswers, 'answers']].map(([label, value, sub]) => (
                  <div key={label} style={{ padding: 18, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 18 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</div>
                    <div style={{ marginTop: 8, fontSize: 25, fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
                    <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18, marginBottom: 22 }}>
                {[['Best Performance', summary.bestPerformance, 'var(--accent, #3b82f6)'], ['Weakest Performance', summary.weakestPerformance, '#8b5cf6']].map(([label, item, accent]) => (
                  <div key={label} className="highlight-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, padding: isMobile ? 18 : 22, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 4, background: accent }} />
                    <div style={{ paddingLeft: 4 }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                      <div style={{ marginTop: 8, color: 'var(--text-primary)', fontSize: 18, fontWeight: 800 }}>{item?.name || '—'}</div>
                      {item && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}><span style={{ padding: '6px 9px', background: 'var(--bg-secondary, rgba(127,127,127,0.08))', borderRadius: 9, fontSize: 12 }}>Score {item.score}%</span><span style={{ padding: '6px 9px', background: 'var(--bg-secondary, rgba(127,127,127,0.08))', borderRadius: 9, fontSize: 12 }}>Accuracy {item.accuracy}%</span><span style={{ padding: '6px 9px', background: 'var(--bg-secondary, rgba(127,127,127,0.08))', borderRadius: 9, fontSize: 12 }}>Rank {formatRank(item.rank)}</span></div>}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 22, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
                <div style={{ padding: isMobile ? 18 : 24, borderBottom: '1px solid var(--border-color)' }}>
                  <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Session History</h2>
                  <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>Every completed session contributing to your journey.</p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary, rgba(127,127,127,0.06))' }}>
                        {['Session', 'Date', 'Score', 'Accuracy', 'Rank', 'Questions', 'Attempted', 'Missed'].map(head => <th key={head} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{head}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[...tableHistory].reverse().map((session) => (
                        <tr
                          key={session.roomId}
                          onClick={() => {
                            if (session.roomId) {
                              navigate(`/student/room/${session.roomId}/results`)
                            }
                          }}
                          className="session-row"
                          style={{
                            borderTop: '1px solid var(--border-color)',
                            cursor: session.roomId ? 'pointer' : 'default'
                          }}
                        >
                          <td style={{ padding: '14px', color: 'var(--text-primary)', fontWeight: 700 }}>{session.name}</td>
                          <td style={{ padding: '14px', color: 'var(--text-secondary)', fontSize: 13 }}>{formatDate(session.date)}</td>
                          <td style={{ padding: '14px', color: 'var(--text-primary)', fontWeight: 800 }}>{session.score}%</td>
                          <td style={{ padding: '14px', color: 'var(--text-primary)' }}>{session.accuracy}%</td>
                          <td style={{ padding: '14px', color: 'var(--text-primary)', fontWeight: 700 }}>{formatRank(session.rank)}{session.participantCount ? <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}> / {session.participantCount}</span> : ''}</td>
                          <td style={{ padding: '14px', color: 'var(--text-secondary)' }}>{session.totalQuestions}</td>
                          <td style={{ padding: '14px', color: 'var(--text-secondary)' }}>{session.attemptedQuestions}</td>
                          <td style={{ padding: '14px', color: session.missedQuestions ? '#dc2626' : 'var(--text-secondary)', fontWeight: session.missedQuestions ? 700 : 400 }}>{session.missedQuestions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
    </>
  )
}

export default StudentPerformancePage