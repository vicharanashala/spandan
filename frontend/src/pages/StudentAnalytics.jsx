import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import PerformanceChart from '../components/PerformanceChart'

export default function StudentAnalytics() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const [analytics, setAnalytics] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (token) {
      fetchAnalytics()
    } else {
      navigate('/')
    }
  }, [token])

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${API_URL}/responses/student/analytics`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        setAnalytics(data.analytics)
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Sidebar user={user} />
        <div style={{ flex: 1, marginLeft: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
      <Sidebar user={user} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        <header style={{ background: 'var(--header-bg)', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: 'white' }}>📈 Advanced Analytics</h1>
              <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}>Deep dive into your performance</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <div style={{ flex: 1, padding: '32px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
            <div className="stat-card fade-in" style={{ padding: '24px', background: 'var(--bg-card)', borderRadius: '16px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎯</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)' }}>{analytics?.totalResponses || 0}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Total Responses</div>
            </div>
            <div className="stat-card fade-in" style={{ padding: '24px', background: 'var(--bg-card)', borderRadius: '16px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>⭐</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#8b5cf6' }}>{analytics?.totalPoints || 0}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Total XP Earned</div>
            </div>
            <div className="stat-card fade-in" style={{ padding: '24px', background: 'var(--bg-card)', borderRadius: '16px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🚀</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#10b981' }}>{analytics?.strengths?.length || 0}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Strong Subjects</div>
            </div>
            <div className="stat-card fade-in" style={{ padding: '24px', background: 'var(--bg-card)', borderRadius: '16px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#f59e0b' }}>{analytics?.weaknesses?.length || 0}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}>Areas to Improve</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
            
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Subject Performance</h2>
              <div style={{ minHeight: '200px' }}>
                <PerformanceChart 
                  data={(analytics?.subjectPerformance || []).map(s => ({
                    label: s.subject.slice(0, 8),
                    value: s.accuracy,
                    color: s.accuracy >= 70 ? '#10b981' : s.accuracy >= 50 ? '#f59e0b' : '#ef4444'
                  }))} 
                  height={200} 
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border-color)' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px', color: '#10b981' }}>💪 Top Strengths</h2>
                {analytics?.strengths?.length > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {analytics.strengths.slice(0, 3).map((s, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                        <span>{s.subject}</span>
                        <span style={{ fontWeight: '700', color: '#10b981' }}>{s.accuracy}%</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No clear strengths identified yet.</p>
                )}
              </div>

              <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border-color)' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px', color: '#ef4444' }}>🎯 Needs Focus</h2>
                {analytics?.weaknesses?.length > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {analytics.weaknesses.slice(0, 3).map((s, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                        <span>{s.subject}</span>
                        <span style={{ fontWeight: '700', color: '#ef4444' }}>{s.accuracy}%</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Great job! No major weaknesses.</p>
                )}
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  )
}
