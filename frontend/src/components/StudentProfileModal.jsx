import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useIsMobile from '../hooks/useIsMobile'
import { API_URL } from '../config.js'

export default function StudentProfileModal({ studentId, onClose }) {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { token } = useAuthStore()

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [narrative, setNarrative] = useState('')
  const [narrativeLoading, setNarrativeLoading] = useState(false)
  const [narrativeError, setNarrativeError] = useState('')

  // Fetch student profile on mount
  useEffect(() => {
    if (!studentId) return
    const fetchProfile = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_URL}/analytics/student/${studentId}/sessions`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.message || 'Failed to fetch student data')
        setProfile(data.profile)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [studentId, token])

  // Prevent background scrolling and handle escape key
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const handleGenerateNarrative = async () => {
    setNarrativeLoading(true)
    setNarrativeError('')
    try {
      const res = await fetch(`${API_URL}/analytics/student/${studentId}/narrative`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await res.json()
      if (data.success) {
        setNarrative(data.narrative)
      } else {
        setNarrativeError(data.message || 'Failed to generate narrative')
      }
    } catch (err) {
      setNarrativeError('Network error. Please try again.')
    } finally {
      setNarrativeLoading(false)
    }
  }

  if (loading) {
    return (
      <div 
        onClick={onClose} 
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div 
          style={{
            width: '40px',
            height: '40px',
            border: '3px solid var(--border-color)',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} 
        />
      </div>
    )
  }

  if (error) {
    return (
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            maxWidth: '400px',
            width: '90vw',
            textAlign: 'center',
            boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
            boxSizing: 'border-box'
          }}
        >
          <p style={{ color: '#dc2626', margin: '0 0 16px', fontWeight: 600 }}>⚠️ Failed to load student data</p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>{error}</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => {
                // Trigger re-fetch by resetting state and re-calling useEffect
                setLoading(true)
                setError(null)
                fetch(`${API_URL}/analytics/student/${studentId}/sessions`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                })
                  .then(res => res.json())
                  .then(data => {
                    if (!data.success) throw new Error(data.message)
                    setProfile(data.profile)
                  })
                  .catch(err => setError(err.message))
                  .finally(() => setLoading(false))
              }}
              style={{
                padding: '8px 16px',
                background: 'var(--accent-gradient)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Retry
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { studentInfo, overall, sessions = [], trendData = [], weakTopics = [], personalBest } = profile || {}

  const statCards = [
    { icon: '📚', value: overall?.totalSessions || 0, label: 'Sessions', tint: '#3b82f6' },
    { icon: '✅', value: `${overall?.overallAccuracy || 0}%`, label: 'Overall Accuracy', tint: '#10b981' },
    { icon: '🏆', value: overall?.totalPoints || 0, label: 'Total Points', tint: '#f59e0b' }
  ]

  if (personalBest) {
    statCards.push({
      icon: '🌟',
      value: `${personalBest.accuracy}%`,
      label: `Best: ${personalBest.roomName}`,
      tint: '#8b5cf6'
    })
  }

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '700px',
          width: '90vw',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          boxSizing: 'border-box'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {studentInfo?.name || 'Student Profile'} | Analytics
          </h2>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: 'bold',
              padding: '4px 8px'
            }}
          >
            &times;
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '24px', flex: 1, overflowY: 'auto', boxSizing: 'border-box' }}>
          {sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
              📭 No session data available yet.
            </div>
          ) : (
            <>
              {/* Overview Stats Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '16px',
                marginBottom: '24px',
                boxSizing: 'border-box'
              }}>
                {statCards.map((card, idx) => (
                  <div 
                    key={idx} 
                    style={{
                      background: 'var(--bg-card)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '16px',
                      boxShadow: 'var(--shadow-md)',
                      border: '1px solid var(--border-color)',
                      minWidth: 0,
                      boxSizing: 'border-box'
                    }}
                  >
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '36px',
                      height: '36px',
                      borderRadius: 'var(--radius)',
                      fontSize: '18px',
                      marginBottom: '8px',
                      background: `${card.tint}1a`
                    }}>{card.icon}</div>
                    <div style={{
                      fontSize: '20px',
                      fontWeight: '700',
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.02em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>{card.value}</div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: 'var(--text-secondary)', 
                      marginTop: '4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }} title={card.label}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* AI Narrative Section */}
              <div style={{
                background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px',
                marginBottom: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxSizing: 'border-box'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🤖 AI Learning Narrative
                  </span>
                  <button
                    onClick={handleGenerateNarrative}
                    disabled={narrativeLoading}
                    style={{
                      padding: '6px 12px',
                      background: 'var(--accent-gradient)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: narrativeLoading ? 'not-allowed' : 'pointer',
                      transition: 'transform 0.15s ease'
                    }}
                  >
                    {narrativeLoading ? 'Generating...' : (narrative ? 'Regenerate Narrative' : 'Generate Narrative')}
                  </button>
                </div>
                {narrative && (
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', color: 'var(--text-primary)', fontStyle: 'italic' }}>
                    "{narrative}"
                  </p>
                )}
                {narrativeError && (
                  <p style={{ margin: 0, fontSize: '12px', color: '#dc2626' }}>
                    {narrativeError}
                  </p>
                )}
              </div>

              {/* Trend Chart */}
              {trendData.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Performance Trend
                  </h3>
                  <div style={{ background: 'var(--bg-primary)', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                    {trendData.map((s, i) => (
                      <div key={i} style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{s.roomName}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{s.accuracy}%</span>
                        </div>
                        <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${s.accuracy}%`,
                            height: '100%',
                            background: s.accuracy >= 70 ? '#10b981' : s.accuracy >= 40 ? '#f59e0b' : '#ef4444',
                            borderRadius: '4px',
                            transition: 'width 0.5s ease'
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sessions Table */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Session Breakdown
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', boxSizing: 'border-box' }}>
                  {sessions.map((s) => (
                    <div
                      key={s.roomId}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: 'var(--bg-card)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border-color)',
                        boxShadow: 'var(--shadow-md)',
                        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                        fontSize: '13px',
                        flexWrap: 'wrap',
                        gap: '12px',
                        boxSizing: 'border-box'
                      }}
                    >
                      <span
                        onClick={() => {
                          onClose()
                          navigate(`/teacher/room/${s.roomId}/results`)
                        }}
                        style={{
                          fontWeight: 600,
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          flex: '1 1 150px',
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {s.roomName}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', flex: '0 0 100px' }}>
                        {s.correctCount}/{s.questionsAttempted} questions
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 120px', minWidth: '100px' }}>
                        <div style={{ flex: 1, height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${s.accuracy}%`,
                            height: '100%',
                            background: s.accuracy >= 70 ? '#10b981' : s.accuracy >= 40 ? '#f59e0b' : '#ef4444',
                            borderRadius: '4px'
                          }} />
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', width: '36px', textAlign: 'right' }}>
                          {s.accuracy}%
                        </span>
                      </div>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)', flex: '0 0 70px', textAlign: 'right' }}>
                        {s.totalPoints} pts
                      </span>
                      <span style={{ color: 'var(--text-secondary)', flex: '0 0 90px', textAlign: 'right' }}>
                        {s.avgResponseTime}s avg
                      </span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '16px', flexShrink: 0 }}>›</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weak Topics */}
              {weakTopics.length > 0 && (
                <div>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Areas to Focus
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {weakTopics.map((topic, i) => (
                      <span 
                        key={i} 
                        style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          background: 'color-mix(in srgb, #f59e0b 18%, transparent)',
                          color: '#d97706',
                          fontSize: '12px',
                          fontWeight: 500,
                          boxSizing: 'border-box'
                        }}
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
