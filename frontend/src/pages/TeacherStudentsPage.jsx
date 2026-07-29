import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useIsMobile from '../hooks/useIsMobile'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import StudentProfileModal from '../components/StudentProfileModal'
import { API_URL } from '../config.js'

const PAGE_SIZE = 30

export default function TeacherStudentsPage() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()

  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState('lastActive')
  const [sortOrder, setSortOrder] = useState('desc')

  // State for modal
  const [selectedStudentId, setSelectedStudentId] = useState(null)

  const fetchStudents = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page, limit: PAGE_SIZE, sort: sortBy, order: sortOrder })
      const res = await fetch(`${API_URL}/analytics/teacher/students?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'Failed to load students')
      setStudents(data.students || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, page, sortBy, sortOrder])

  useEffect(() => {
    if (token) {
      setLoading(true)
      setError(null)
      fetchStudents()
    }
  }, [fetchStudents, token])

  const handleRetry = () => {
    setLoading(true)
    setError(null)
    fetchStudents()
  }

  const handleSortChange = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
    setPage(1)
  }

  // Filter students based on search input (client-side on current page)
  const filteredStudents = students.filter(s =>
    (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const formatLastActive = (dateStr) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      maxWidth: '100%',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      boxSizing: 'border-box'
    }}>
      <Sidebar user={user} />

      {/* Main Content */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        marginLeft: 'var(--sidebar-width)',
        transition: 'margin-left 0.2s ease',
        maxWidth: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Header - Blue gradient bar */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: isMobile ? '20px 16px' : '24px 32px',
          paddingLeft: isMobile ? '64px' : '32px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{
                margin: 0,
                fontSize: isMobile ? '20px' : '26px',
                fontWeight: 700,
                letterSpacing: '-0.02em'
              }}>
                Welcome, {user?.name || 'Teacher'}! | My Students
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Track student growth and learning journeys across sessions
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div style={{
          flex: 1,
          padding: isMobile ? '16px' : '32px',
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}>
          {loading ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
              boxSizing: 'border-box'
            }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px',
                  border: '1px solid var(--border-color)',
                  boxShadow: 'var(--shadow-md)',
                  boxSizing: 'border-box'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'var(--border-color)', opacity: 0.5 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ height: '14px', width: '60%', background: 'var(--border-color)', borderRadius: '4px', marginBottom: '6px', opacity: 0.5 }} />
                      <div style={{ height: '12px', width: '40%', background: 'var(--border-color)', borderRadius: '4px', opacity: 0.4 }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius)' }}>
                    {[1,2,3].map(j => (
                      <div key={j} style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ height: '12px', width: '80%', background: 'var(--border-color)', borderRadius: '4px', margin: '0 auto 6px', opacity: 0.4 }} />
                        <div style={{ height: '16px', width: '40%', background: 'var(--border-color)', borderRadius: '4px', margin: '0 auto', opacity: 0.5 }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', boxSizing: 'border-box' }}>
              <p style={{ color: '#dc2626', fontWeight: 600, margin: '0 0 16px' }}>⚠️ Failed to load students</p>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>{error}</p>
              <button
                onClick={handleRetry}
                style={{
                  padding: '10px 20px',
                  background: 'var(--accent-gradient)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-md)'
                }}
              >
                Retry
              </button>
            </div>
          ) : students.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 24px',
              color: 'var(--text-secondary)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-md)',
              boxSizing: 'border-box'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
              <p style={{ margin: 0, fontWeight: 500 }}>No students yet. Create rooms and have students join to see them here.</p>
            </div>
          ) : (
            <>
              {/* Search + Sort Toolbar */}
              <div style={{
                display: 'flex', gap: '12px', marginBottom: '24px',
                flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center',
                boxSizing: 'border-box'
              }}>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search students by name or email..."
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '12px 16px',
                    border: '2px solid var(--border-color)',
                    borderRadius: 'var(--radius)',
                    fontSize: '15px',
                    outline: 'none',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontWeight: '600',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
                  {[
                    { key: 'name', label: 'Name' },
                    { key: 'averageScore', label: 'Score' },
                    { key: 'totalSessions', label: 'Sessions' },
                    { key: 'lastActive', label: 'Recent' }
                  ].map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => handleSortChange(opt.key)}
                      style={{
                        padding: '8px 12px',
                        background: sortBy === opt.key ? 'var(--accent-gradient)' : 'var(--bg-card)',
                        color: sortBy === opt.key ? '#fff' : 'var(--text-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {opt.label} {sortBy === opt.key ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Students Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px',
                boxSizing: 'border-box'
              }}>
                {filteredStudents.map((student) => (
                  <div
                    key={student._id}
                    onClick={() => setSelectedStudentId(student._id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                    }}
                    style={{
                      background: 'var(--bg-card)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '20px',
                      border: '1px solid var(--border-color)',
                      boxShadow: 'var(--shadow-md)',
                      cursor: 'pointer',
                      transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                      justifyContent: 'space-between'
                    }}
                  >
                    {/* Avatar & Basic Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        background: student.profileImage ? 'transparent' : 'var(--accent-gradient)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 600,
                        flexShrink: 0,
                        overflow: 'hidden'
                      }}>
                        {student.profileImage ? (
                          <img src={student.profileImage} alt={student.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          (student.name || 'U').charAt(0).toUpperCase()
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {student.name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {student.email}
                        </div>
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--bg-primary)',
                      padding: '12px',
                      borderRadius: 'var(--radius)',
                      boxSizing: 'border-box'
                    }}>
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Sessions</div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                          {student.totalSessions}
                        </div>
                      </div>
                      <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Avg Score</div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                          {student.averageScore}%
                        </div>
                      </div>
                      <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Trend</div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                          <span>{student.trend === 'up' ? '📈' : student.trend === 'down' ? '📉' : '➡️'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Last Active */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12px',
                      color: 'var(--text-secondary)'
                    }}>
                      <span>Last active:</span>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                        {formatLastActive(student.lastActive)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '12px',
                  marginTop: '24px',
                  padding: '16px',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-color)',
                  boxShadow: 'var(--shadow-md)'
                }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    style={{
                      padding: '8px 16px',
                      background: page <= 1 ? 'var(--border-color)' : 'var(--accent-gradient)',
                      color: page <= 1 ? 'var(--text-secondary)' : '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: page <= 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Page {page} of {totalPages} ({total} students)
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    style={{
                      padding: '8px 16px',
                      background: page >= totalPages ? 'var(--border-color)' : 'var(--accent-gradient)',
                      color: page >= totalPages ? 'var(--text-secondary)' : '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: page >= totalPages ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Profile Modal */}
      {selectedStudentId && (
        <StudentProfileModal
          studentId={selectedStudentId}
          onClose={() => setSelectedStudentId(null)}
        />
      )}
    </div>
  )
}
