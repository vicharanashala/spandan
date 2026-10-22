import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import { PageHeader, pageWash } from '../components/AppUI'
import useIsMobile from '../hooks/useIsMobile'
import { adminApi } from '../lib/api'
import { ShieldCheck } from 'lucide-react'

// Admin-only page to approve/reject teacher account requests. Uses the same page shell
// (sidebar + header + content) as the other teacher pages so it looks native.
export default function AdminPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user } = useAuthStore()

  const [tab, setTab] = useState('pending')
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (user && !user.isAdmin) navigate('/teacher')
  }, [user, navigate])

  const load = useCallback(async (status) => {
    setLoading(true); setError('')
    try {
      const data = await adminApi.listTeacherRequests(status)
      setRows(data.requests || [])
      if (data.counts) setCounts(data.counts)
    } catch (e) {
      setError(e.message || 'Failed to load requests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  const act = async (id, kind) => {
    setBusyId(id)
    try {
      if (kind === 'approve') await adminApi.approve(id)
      else await adminApi.reject(id)
      await load(tab)
    } catch (e) {
      setError(e.message || 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  const tabBtn = (t, label) => (
    <button onClick={() => setTab(t)} style={{
      padding: '8px 16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
      border: `1px solid ${tab === t ? 'transparent' : 'var(--border-color)'}`,
      background: tab === t ? 'var(--accent-color, #4f46e5)' : 'var(--bg-secondary)',
      color: tab === t ? 'white' : 'var(--text-secondary)'
    }}>{label} ({counts[t] ?? 0})</button>
  )

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }
  const td = { padding: '14px 12px', fontSize: '14px', color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)' }

  return (
    <div style={{
      display: 'flex', minHeight: '100vh', maxWidth: '100%', boxSizing: 'border-box',
      background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <Sidebar user={user} />

      <div style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        marginLeft: 'var(--sidebar-width, 240px)', maxWidth: '100%', boxSizing: 'border-box'
      }}>
        {/* Header */}
        <PageHeader isMobile={isMobile} icon={ShieldCheck} title="Teacher Approvals" subtitle="Review and approve teacher account requests" />

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '28px 32px 32px', maxWidth: '100%', boxSizing: 'border-box', background: pageWash }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {tabBtn('pending', 'Pending')}
            {tabBtn('approved', 'Approved')}
            {tabBtn('rejected', 'Rejected')}
          </div>

          {error && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid #fecaca', color: '#dc2626',
              borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: '16px', fontSize: '14px'
            }}>{error}</div>
          )}

          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md, 12px)', overflow: 'hidden'
          }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', fontSize: '14px' }}>Loading…</div>
            ) : rows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                No {tab} teacher accounts.
              </div>
            ) : (
              <div data-tour="approvals-table" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Name</th>
                      <th style={th}>Email</th>
                      <th style={th}>Requested</th>
                      {tab === 'rejected' && <th style={th}>Reason</th>}
                      {tab === 'pending' && <th style={{ ...th, textAlign: 'right' }}>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r._id}>
                        <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                        <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.email}</td>
                        <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
                        {tab === 'rejected' && <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.rejectionReason || '—'}</td>}
                        {tab === 'pending' && (
                          <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button data-tour="approve-button" disabled={busyId === r._id} onClick={() => act(r._id, 'approve')} style={{
                              padding: '7px 16px', marginRight: '8px', borderRadius: 'var(--radius-sm)', border: 'none',
                              background: '#16a34a', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                              opacity: busyId === r._id ? 0.6 : 1
                            }}>Approve</button>
                            <button disabled={busyId === r._id} onClick={() => act(r._id, 'reject')} style={{
                              padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid #dc2626',
                              background: 'transparent', color: '#dc2626', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                              opacity: busyId === r._id ? 0.6 : 1
                            }}>Reject</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
