import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import HelpButton from '../components/HelpButton'
import ProfileDropdown from '../components/ProfileDropdown'
import useIsMobile from '../hooks/useIsMobile'
import { adminApi } from '../lib/api'

// Admin Platform Overview & Teacher Approvals Page (closes #145).
// Uses the standard page shell (sidebar + header + content) matching the platform design.
export default function AdminPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user } = useAuthStore()

  const [tab, setTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (user && !user.isAdmin) navigate('/teacher')
  }, [user, navigate])

  const loadData = useCallback(async (currentTab) => {
    setLoading(true)
    setError('')
    try {
      if (currentTab === 'overview') {
        const data = await adminApi.getStats()
        setStats(data)
        if (data.teachers) {
          setCounts({
            pending: data.teachers.pending,
            approved: data.teachers.approved,
            rejected: data.teachers.rejected
          })
        }
      } else {
        const data = await adminApi.listTeacherRequests(currentTab)
        setRows(data.requests || [])
        if (data.counts) setCounts(data.counts)
      }
    } catch (e) {
      setError(e.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(tab)
  }, [tab, loadData])

  const act = async (id, kind) => {
    setBusyId(id)
    try {
      if (kind === 'approve') await adminApi.approve(id)
      else await adminApi.reject(id)
      await loadData(tab)
    } catch (e) {
      setError(e.message || 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  const tabBtn = (t, label, count = null) => (
    <button
      onClick={() => setTab(t)}
      style={{
        padding: '8px 16px',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 600,
        border: `1px solid ${tab === t ? 'transparent' : 'var(--border-color)'}`,
        background: tab === t ? 'var(--accent-color, #4f46e5)' : 'var(--bg-secondary)',
        color: tab === t ? 'white' : 'var(--text-secondary)',
        transition: 'all 0.15s ease'
      }}
    >
      {label} {count !== null ? `(${count})` : ''}
    </button>
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
        <header style={{
          background: 'var(--header-bg)', color: 'white',
          padding: isMobile ? '20px 16px' : '24px 32px',
          paddingLeft: isMobile ? '64px' : '32px', boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: isMobile ? '22px' : '26px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                Admin Console
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Platform overview, health statistics, and teacher approvals
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <HelpButton />
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '32px', maxWidth: '100%', boxSizing: 'border-box' }}>
          {/* Navigation Tabs */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {tabBtn('overview', 'Platform Overview')}
            {tabBtn('pending', 'Pending Approvals', counts.pending)}
            {tabBtn('approved', 'Approved Teachers', counts.approved)}
            {tabBtn('rejected', 'Rejected', counts.rejected)}
          </div>

          {error && (
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid #fecaca', color: '#dc2626',
              borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: '20px', fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)', fontSize: '14px' }}>
              Loading platform data…
            </div>
          ) : tab === 'overview' && stats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Stat Cards Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px'
              }}>
                {/* Teachers Card */}
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md, 12px)', padding: '20px', boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Teachers</span>
                    <span style={{ fontSize: '20px' }}>👨‍🏫</span>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
                    {stats.teachers.total}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '11px', fontWeight: 600 }}>
                    <span style={{ background: 'rgba(22, 163, 74, 0.1)', color: '#16a34a', padding: '2px 6px', borderRadius: '4px' }}>
                      ✓ {stats.teachers.approved} Approved
                    </span>
                    <span style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#ca8a04', padding: '2px 6px', borderRadius: '4px' }}>
                      ⏳ {stats.teachers.pending} Pending
                    </span>
                    <span style={{ background: 'rgba(220, 38, 38, 0.1)', color: '#dc2626', padding: '2px 6px', borderRadius: '4px' }}>
                      ✕ {stats.teachers.rejected}
                    </span>
                  </div>
                </div>

                {/* Students Card */}
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md, 12px)', padding: '20px', boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Students</span>
                    <span style={{ fontSize: '20px' }}>🎓</span>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    {stats.students.total}
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Registered learners participating in polls
                  </p>
                </div>

                {/* Rooms Card */}
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md, 12px)', padding: '20px', boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Classrooms</span>
                    <span style={{ fontSize: '20px' }}>🏫</span>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
                    {stats.rooms.total}
                  </div>
                  <span style={{
                    display: 'inline-block',
                    background: stats.rooms.active > 0 ? 'rgba(22, 163, 74, 0.1)' : 'var(--bg-secondary)',
                    color: stats.rooms.active > 0 ? '#16a34a' : 'var(--text-secondary)',
                    padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600
                  }}>
                    {stats.rooms.active > 0 ? `🟢 ${stats.rooms.active} Live Active` : '0 currently active'}
                  </span>
                </div>

                {/* Engagement Card */}
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md, 12px)', padding: '20px', boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Poll Answers</span>
                    <span style={{ fontSize: '20px' }}>⚡</span>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    {stats.engagement.totalResponses}
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Across {stats.engagement.totalQuestions} questions generated
                  </p>
                </div>
              </div>

              {/* Live Active Classrooms Section */}
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md, 12px)', padding: '24px', boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Live Active Classrooms
                  </h2>
                  <span style={{
                    fontSize: '12px', fontWeight: 600,
                    color: stats.rooms.active > 0 ? '#16a34a' : 'var(--text-secondary)',
                    background: stats.rooms.active > 0 ? 'rgba(22, 163, 74, 0.1)' : 'var(--bg-secondary)',
                    padding: '4px 10px', borderRadius: '6px'
                  }}>
                    {stats.rooms.active} Active Now
                  </span>
                </div>

                {stats.rooms.recentActive && stats.rooms.recentActive.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={th}>Room Name</th>
                          <th style={th}>Code</th>
                          <th style={th}>Teacher</th>
                          <th style={th}>Mode</th>
                          <th style={th}>Started</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.rooms.recentActive.map(r => (
                          <tr key={r._id}>
                            <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                            <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: '#4f46e5' }}>{r.code}</td>
                            <td style={td}>{r.teacher?.name || '—'} <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>({r.teacher?.email})</span></td>
                            <td style={td}>
                              <span style={{
                                textTransform: 'uppercase', fontSize: '11px', fontWeight: 700,
                                padding: '2px 6px', borderRadius: '4px',
                                background: r.settings?.mode === 'video' ? '#ede9fe' : '#e0e7ff',
                                color: r.settings?.mode === 'video' ? '#6d28d9' : '#3730a3'
                              }}>
                                {r.settings?.mode || 'normal'}
                              </span>
                            </td>
                            <td style={{ ...td, color: 'var(--text-secondary)' }}>
                              {r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                    No active classroom sessions running right now.
                  </div>
                )}
              </div>

              {/* 30-Day Signup Growth Trend */}
              {stats.dailySignups && stats.dailySignups.length > 0 && (
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md, 12px)', padding: '24px', boxShadow: 'var(--shadow-sm)'
                }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--text-primary)' }}>
                    Recent User Signups (Last 30 Days)
                  </h2>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={th}>Date</th>
                          <th style={th}>Total Signups</th>
                          <th style={th}>Teachers</th>
                          <th style={th}>Students</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.dailySignups.slice(-10).reverse().map(d => (
                          <tr key={d._id}>
                            <td style={{ ...td, fontWeight: 600 }}>{d._id}</td>
                            <td style={{ ...td, fontWeight: 700, color: '#4f46e5' }}>{d.count}</td>
                            <td style={td}>👨‍🏫 {d.teachers}</td>
                            <td style={td}>🎓 {d.students}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Teacher Requests Table */
            <div style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md, 12px)', overflow: 'hidden'
            }}>
              {rows.length === 0 ? (
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
          )}
        </div>
      </div>
    </div>
  )
}
