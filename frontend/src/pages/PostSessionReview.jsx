import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import { API_URL } from '../config.js'
import ConfettiEffect from '../components/ConfettiEffect'

const BADGE_DEFS = {
  streak3:    { icon: '🔥', title: 'On Fire!',        subtitle: '3 correct in a row' },
  streak5:    { icon: '🌟', title: 'Unstoppable!',    subtitle: '5 correct in a row' },
  fastest:    { icon: '⚡', title: 'Lightning Fast!', subtitle: 'Fastest answerer in room' },
  perfect:    { icon: '🎯', title: 'Perfect Round!',  subtitle: '100% accuracy' },
  firstBlood: { icon: '🥇', title: 'First Responder!',subtitle: 'First to answer' },
}

function AccuracyRing({ pct }) {
  const r = 52, circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const color = pct >= 70 ? '#059669' : pct >= 40 ? '#d97706' : '#dc2626'
  return (
    <svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r={r} fill="none" stroke="var(--border-color)" strokeWidth="10"/>
      <circle cx="65" cy="65" r={r} fill="none"
        stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 65 65)"
        style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)' }}
      />
      <text x="65" y="60" textAnchor="middle" fontSize="22" fontWeight="900" fill={color}>{pct}%</text>
      <text x="65" y="78" textAnchor="middle" fontSize="11" fill="var(--text-secondary)" fontWeight="600">accuracy</text>
    </svg>
  )
}

export default function PostSessionReview() {
  const { roomId } = useParams()
  const navigate   = useNavigate()
  const { user, token } = useAuthStore()

  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [showConfetti, setShowConfetti] = useState(false)

  useEffect(() => {
    if (!token || !roomId) return
    fetchReview()
  }, [token, roomId])

  const fetchReview = async () => {
    setLoading(true)
    try {
      // Fetch responses for this student in this room
      const [respRes, roomRes] = await Promise.all([
        fetch(`${API_URL}/responses?roomId=${roomId}&studentId=${user._id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/rooms/${roomId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      const respData = await respRes.json()
      const roomData = await roomRes.json()

      const responses = respData.responses || []
      const room      = roomData.room || {}

      // Build summary
      const totalQ    = responses.length
      const correct   = responses.filter(r => r.isCorrect).length
      const totalPts  = responses.reduce((s, r) => s + (r.points || 0), 0)
      const accuracy  = totalQ > 0 ? Math.round((correct / totalQ) * 100) : 0
      const avgTime   = totalQ > 0
        ? Math.round(responses.reduce((s, r) => s + (r.responseTime || 0), 0) / totalQ)
        : 0

      // Compute badges
      const badges = []
      if (accuracy === 100 && totalQ > 0) badges.push('perfect')
      let streak = 0, maxStreak = 0
      for (const r of responses) {
        streak = r.isCorrect ? streak + 1 : 0
        maxStreak = Math.max(maxStreak, streak)
      }
      if (maxStreak >= 5) badges.push('streak5')
      else if (maxStreak >= 3) badges.push('streak3')

      setData({ room, responses, totalQ, correct, wrong: totalQ - correct, totalPts, accuracy, avgTime, badges })

      // Trigger confetti for good scores
      if (accuracy >= 70) {
        setTimeout(() => setShowConfetti(true), 500)
        setTimeout(() => setShowConfetti(false), 3500)
      }
    } catch (e) {
      console.error(e)
      setError('Failed to load session review.')
    } finally {
      setLoading(false)
    }
  }

  const getGrade = (pct) => {
    if (pct >= 90) return { label: 'A+', color: '#059669' }
    if (pct >= 80) return { label: 'A',  color: '#10b981' }
    if (pct >= 70) return { label: 'B',  color: '#2563eb' }
    if (pct >= 60) return { label: 'C',  color: '#d97706' }
    if (pct >= 50) return { label: 'D',  color: '#f97316' }
    return             { label: 'F',  color: '#dc2626' }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Sidebar user={user} />
      <ConfettiEffect trigger={showConfetti} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        {/* Header */}
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '18px 32px', boxShadow: '0 4px 24px rgba(0,0,0,.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800', letterSpacing: '-.4px' }}>
                📋 Session Review
              </h1>
              <p style={{ margin: '3px 0 0', opacity: .75, fontSize: '13px' }}>{data?.room?.name || 'Loading…'}</p>
            </div>
            <button onClick={() => navigate('/student')} className="btn btn-ghost" style={{ color: 'rgba(255,255,255,.8)', border: '1px solid rgba(255,255,255,.25)' }}>
              ← Back to Dashboard
            </button>
          </div>
        </header>

        <div style={{ flex: 1, padding: '28px 32px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>

          {loading && (
            <div style={{ textAlign: 'center', padding: '80px' }}>
              <div style={{ width: '52px', height: '52px', border: '4px solid var(--border-color)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin .9s linear infinite', margin: '0 auto 18px' }} />
              <p style={{ color: 'var(--text-secondary)' }}>Loading your results…</p>
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          {data && !loading && (
            <>
              {/* ── Score Overview ── */}
              <div className="card pop-in" style={{ padding: '28px', marginBottom: '20px', display: 'grid', gridTemplateColumns: '130px 1fr', gap: '28px', alignItems: 'center' }}>
                <AccuracyRing pct={data.accuracy} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '36px', fontWeight: '900', color: getGrade(data.accuracy).color }}>
                      {getGrade(data.accuracy).label}
                    </div>
                    <div>
                      <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)' }}>{data.totalPts} pts</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>total score</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {[
                      { icon: '✅', label: 'Correct',   value: data.correct,   color: '#059669' },
                      { icon: '❌', label: 'Wrong',     value: data.wrong,     color: '#dc2626' },
                      { icon: '📝', label: 'Total Qs',  value: data.totalQ,    color: 'var(--accent)' },
                      { icon: '⏱️', label: 'Avg Time',  value: `${data.avgTime}s`, color: '#2563eb' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center', minWidth: '60px' }}>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '500' }}>{s.icon} {s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Badges ── */}
              {data.badges.length > 0 && (
                <div className="card fade-in" style={{ padding: '20px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>🏅 Badges Earned</h3>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {data.badges.map(key => {
                      const b = BADGE_DEFS[key]
                      if (!b) return null
                      return (
                        <div key={key} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '10px 16px', borderRadius: '12px',
                          background: 'var(--accent-light)', border: '1px solid var(--accent)',
                        }}>
                          <span style={{ fontSize: '22px' }}>{b.icon}</span>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent)' }}>{b.title}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{b.subtitle}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Per-Question Breakdown ── */}
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 14px' }}>
                📝 Question Breakdown
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {data.responses.map((resp, i) => {
                  const q = resp.questionId  // may be populated or just an id
                  const qText = typeof q === 'object' ? q?.question : `Question ${i + 1}`
                  const opts  = typeof q === 'object' ? (q?.options || []) : []
                  const selOpt = opts[resp.selectedOption]

                  return (
                    <div key={resp._id || i} className="card fade-in" style={{
                      padding: '16px 20px',
                      borderLeft: `4px solid ${resp.isCorrect ? '#059669' : '#dc2626'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span style={{
                              fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px',
                              background: resp.isCorrect ? '#d1fae5' : '#fee2e2',
                              color: resp.isCorrect ? '#059669' : '#dc2626',
                            }}>
                              {resp.isCorrect ? '✓ Correct' : '✗ Wrong'}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Q{i + 1}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                            {qText || `Question ${i + 1}`}
                          </p>
                          {selOpt && (
                            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                              Your answer: <strong style={{ color: resp.isCorrect ? '#059669' : '#dc2626' }}>{selOpt.text}</strong>
                            </p>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '18px', fontWeight: '800', color: resp.isCorrect ? '#059669' : '#dc2626' }}>
                            +{resp.points || 0}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {resp.responseTime ? `${resp.responseTime}s` : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {data.responses.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
                  <p style={{ color: 'var(--text-secondary)' }}>No responses recorded for this session.</p>
                </div>
              )}

              {/* ── Actions ── */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'center' }}>
                <button onClick={() => navigate('/student')} className="btn btn-primary">
                  🏠 Back to Dashboard
                </button>
                <button onClick={() => navigate('/student/room-history')} className="btn btn-ghost">
                  📜 View History
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
