import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import useAuthStore from '../stores/authStore'
import { API_URL } from '../config'

export default function AnalyticsPage() {
  const { user, token } = useAuthStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchHistory()
  }, [])

  const fetchHistory = async () => {
    try {
      const response = await fetch(`${API_URL}/analytics/history`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch analytics')
      }
      
      const json = await response.json()
      setData(json)
    } catch (err) {
      console.error(err)
      setError('Could not load analytics. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Sidebar user={user} />
        <main style={{ flex: 1, padding: '40px', marginLeft: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loading-spinner"></div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Sidebar user={user} />
        <main style={{ flex: 1, padding: '40px', marginLeft: '240px' }}>
          <div style={{ color: '#ef4444', background: '#fef2f2', padding: '16px', borderRadius: '8px' }}>
            {error}
          </div>
        </main>
      </div>
    )
  }

  const { summary, trends, recentRooms } = data

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Sidebar user={user} />
      
      <main style={{ flex: 1, padding: '40px', marginLeft: '240px', color: 'var(--text-primary)' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          
          <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>Historical Analytics</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Track your overall performance and engagement across all sessions.</p>

          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            
            <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '16px', boxShadow: 'var(--card-shadow)' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Total Sessions</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#3b82f6' }}>{summary.totalSessions}</div>
            </div>
            
            <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '16px', boxShadow: 'var(--card-shadow)' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Students Taught</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981' }}>{summary.totalStudentsTaught}</div>
            </div>
            
            <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '16px', boxShadow: 'var(--card-shadow)' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Questions Asked</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>{summary.totalQuestions}</div>
            </div>
            
            <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '16px', boxShadow: 'var(--card-shadow)' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Avg. Correct Rate</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#8b5cf6' }}>{summary.avgCorrectRate.toFixed(1)}%</div>
            </div>

          </div>

          {/* Recent Trends Table */}
          <div style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Recent Sessions Performance</h2>
            
            {trends.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No historical data available yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px' }}>Date</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px' }}>Session Name</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px' }}>Engagement (Total Answers)</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px' }}>Correct Rate</th>
                      <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trends.map((t, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px 16px', fontSize: '14px' }}>{new Date(t.date).toLocaleDateString()}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>{t.roomName}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px' }}>{t.engagement} answers</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${t.correctRate}%`, height: '100%', background: '#10b981' }} />
                            </div>
                            <span>{t.correctRate.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            onClick={() => navigate(`/teacher/room/${t.roomId}`)}
                            style={{
                              padding: '6px 12px',
                              background: 'transparent',
                              border: '1px solid #3b82f6',
                              color: '#3b82f6',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '13px'
                            }}
                          >
                            View Room
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
