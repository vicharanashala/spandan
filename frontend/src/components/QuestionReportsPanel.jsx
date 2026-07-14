import React, { useState, useEffect } from 'react'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'

function QuestionReportsPanel({ roomId, refreshTrigger }) {
  const token = useAuthStore(s => s.token)
  const [reports, setReports] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [filter, setFilter] = useState('All')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!roomId) return
    loadReports()
  }, [roomId, refreshTrigger])

  const loadReports = async () => {
    setIsLoading(true)
    try {
      const [reportsRes, analyticsRes] = await Promise.all([
        fetch(`${API_URL}/reports?roomId=${roomId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_URL}/reports/analytics?roomId=${roomId}`, { headers: { 'Authorization': `Bearer ${token}` } })
      ])
      const reportsData = await reportsRes.json()
      const analyticsData = await analyticsRes.json()
      if (reportsData.success) setReports(reportsData.reports || [])
      if (analyticsData.success) setAnalytics(analyticsData.analytics)
    } catch (err) {
      console.error('Failed to load reports:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const filtered = filter === 'All' ? reports : reports.filter(r => r.status === filter)

  if (isLoading) {
    return <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading reports...</p>
  }

  return (
    <div>
      {analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px', marginBottom: '16px' }}>
          {[
            { label: 'Total', value: analytics.total, color: '#3b82f6' },
            { label: 'Pending', value: analytics.pending, color: '#f59e0b' },
            { label: 'Accepted', value: analytics.accepted, color: '#10b981' },
            { label: 'Rejected', value: analytics.rejected, color: '#6b7280' }
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center', padding: '10px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '20px', fontWeight: '700', color: item.color }}>{item.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{item.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {['All', 'Pending', 'Reviewed', 'Accepted', 'Rejected'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 10px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
              background: filter === f ? '#3b82f6' : 'var(--bg-primary)',
              color: filter === f ? 'white' : 'var(--text-secondary)'
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', padding: '16px' }}>No reports yet</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
          {filtered.map(r => (
            <div key={r._id} style={{
              padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: '8px',
              border: '1px solid var(--border-color)', fontSize: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{r.studentName}</span>
                <span style={{
                  padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                  background: r.status === 'Pending' ? '#fef3c7' : r.status === 'Accepted' ? '#d1fae5' : '#f3f4f6',
                  color: r.status === 'Pending' ? '#92400e' : r.status === 'Accepted' ? '#059669' : '#6b7280'
                }}>
                  {r.status}
                </span>
              </div>
              <p style={{ margin: '0 0 2px', color: 'var(--text-secondary)' }}>{r.reportType}: {r.message?.substring(0, 60)}</p>
              <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-secondary)' }}>
                {new Date(r.timestamp).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default QuestionReportsPanel
