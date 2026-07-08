import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import PerformanceChart from '../components/PerformanceChart'
import { API_URL } from '../config.js'

export default function TeacherAnalytics() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const [stats, setStats] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (token) {
      fetchAnalytics()
    }
  }, [token])

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${API_URL}/rooms/analytics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
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
          <div style={{ width: '48px', height: '48px', border: '4px solid var(--border-color)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Sidebar user={user} />
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '18px 32px', boxShadow: '0 4px 24px rgba(0,0,0,.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800' }}>📈 Global Analytics</h1>
              <p style={{ margin: '3px 0 0', opacity: .75, fontSize: '13px' }}>Your historic class performance across all rooms</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <div style={{ flex: 1, padding: '28px 32px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '28px' }}>
            {[
              { icon: '🏫', label: 'Total Rooms', value: stats?.totalRooms || 0, color: '#3b82f6' },
              { icon: '📝', label: 'Questions Asked', value: stats?.totalQuestions || 0, color: '#8b5cf6' },
              { icon: '👥', label: 'Total Responses', value: stats?.totalResponses || 0, color: '#f59e0b' },
              { icon: '🎯', label: 'Avg Correct %', value: `${stats?.averageCorrect || 0}%`, color: '#10b981' },
            ].map(s => (
              <div key={s.label} className="card fade-in" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '28px' }}>{s.icon}</div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div className="card fade-in" style={{ padding: '24px' }}>
              <h2 className="section-title" style={{ marginBottom: '16px' }}>📊 Response Overview</h2>
              <PerformanceChart data={[
                { label: 'Correct', value: stats?.averageCorrect || 0, color: '#10b981' },
                { label: 'Incorrect', value: 100 - (stats?.averageCorrect || 0), color: '#ef4444' }
              ]} height={200} />
            </div>

            <div className="card fade-in" style={{ padding: '24px' }}>
              <h2 className="section-title" style={{ marginBottom: '16px' }}>⚠️ Most Difficult Topics</h2>
              {stats?.difficultQuestions?.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No question data yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {stats?.difficultQuestions?.map((q, i) => (
                    <div key={i} style={{ background: 'var(--bg-hover)', padding: '12px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>{q.question}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        <span>Correct Rate</span>
                        <span style={{ fontWeight: '700', color: '#ef4444' }}>{Math.round(q.correctPct)}%</span>
                      </div>
                      <div style={{ height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${q.correctPct}%`, background: '#ef4444', borderRadius: '2px' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
