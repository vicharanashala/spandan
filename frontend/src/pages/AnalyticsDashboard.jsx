import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import LpsDonut from '../components/LpsDonut'
import useSocketStore from '../stores/socketStore'

// Simple reusable bar chart using pure SVG
function LpsBarChart({ distribution, maxStudents }) {
  const buckets = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90-100']
  const barWidth = 36
  const gap = 8
  const chartHeight = 160
  const maxVal = maxStudents || Math.max(...Object.values(distribution || {}), 1)

  return (
    <svg width={(barWidth + gap) * buckets.length + 40} height={chartHeight + 40} style={{ overflow: 'visible' }}>
      {buckets.map((label, i) => {
        const key = i * 10
        const count = distribution?.[key] || 0
        const barH = maxVal > 0 ? (count / maxVal) * chartHeight : 0
        const x = i * (barWidth + gap) + 30
        const y = chartHeight - barH
        return (
          <g key={label}>
            <rect
              x={x} y={y} width={barWidth} height={barH}
              rx={4} ry={4}
              fill="url(#barGrad)"
              style={{ transition: 'height 0.5s ease, y 0.5s ease' }}
            />
            <text x={x + barWidth / 2} y={chartHeight + 16} textAnchor="middle"
              style={{ fontSize: 9, fill: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>
              {label}
            </text>
            {count > 0 && (
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle"
                style={{ fontSize: 11, fill: 'var(--text-primary)', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                {count}
              </text>
            )}
          </g>
        )
      })}
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// Student row in the table
function StudentRow({ rank, name, lps, attendance, quizScore, participation }) {
  const getLpsColor = (val) => {
    if (val >= 80) return '#10b981'
    if (val >= 60) return '#3b82f6'
    if (val >= 40) return '#f59e0b'
    return '#ef4444'
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
      <td style={tdStyle}>{rank}</td>
      <td style={{ ...tdStyle, fontWeight: 600 }}>{name}</td>
      <td style={tdStyle}>
        <span style={{
          display: 'inline-block', padding: '4px 12px', borderRadius: '20px',
          background: `${getLpsColor(lps)}18`, color: getLpsColor(lps), fontWeight: 700, fontSize: 13
        }}>
          {lps}
        </span>
      </td>
      <td style={tdStyle}>{(attendance * 100).toFixed(0)}%</td>
      <td style={tdStyle}>{(quizScore * 100).toFixed(0)}%</td>
      <td style={tdStyle}>{(participation * 100).toFixed(0)}%</td>
    </tr>
  )
}

const tdStyle = {
  padding: '12px 16px', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left'
}

const thStyle = {
  padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
  textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.5px',
  borderBottom: '2px solid var(--border-color)'
}

function AnalyticsDashboard() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { rooms, fetchRooms, setAuthToken } = useRoomStore()

  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [classStats, setClassStats] = useState(null)
  const [studentMetrics, setStudentMetrics] = useState([])
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const isTeacher = user?.role === 'teacher'
  const socket = useSocketStore(state => state.socket)

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchRooms()
    }
    setChecked(true)
  }, [token])

  useEffect(() => {
    if (checked && !token) navigate('/')
  }, [checked, token, navigate])

  // Auto-select first room
  useEffect(() => {
    if (rooms?.length > 0 && !selectedRoomId) {
      setSelectedRoomId(rooms[0]._id)
    }
  }, [rooms])

  // Socket listener for real-time updates
  useEffect(() => {
    if (!socket || !selectedRoomId || !rooms?.length) return

    const selectedRoom = rooms.find(r => r._id === selectedRoomId)
    if (!selectedRoom?.code) return

    const handleUpdate = () => {
      setRefreshTrigger(prev => prev + 1)
    }

    socket.on('points:updated', handleUpdate)
    socket.on('response:new', handleUpdate)
    socket.on('question:ended', handleUpdate)

    return () => {
      socket.off('points:updated', handleUpdate)
      socket.off('response:new', handleUpdate)
      socket.off('question:ended', handleUpdate)
    }
  }, [socket, selectedRoomId, rooms])

  // Fetch analytics when room changes or updates are received
  useEffect(() => {
    if (!selectedRoomId || !token) return
    const fetchData = async () => {
      setLoading(true)
      try {
        if (isTeacher) {
          // Fetch class stats
          const classRes = await fetch(`${API_URL}/analytics/class/${selectedRoomId}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          const classData = await classRes.json()
          if (classData.success) setClassStats(classData.stats)
          else setClassStats(null)

          // Fetch individual student metrics
          const RoomMember = await fetch(`${API_URL}/rooms/${selectedRoomId}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          const roomData = await RoomMember.json()
          const members = roomData.room?.members || roomData.members || []
          
          // Fetch LPS for each member
          const metricsArr = []
          for (const member of members) {
            const sid = member.studentId?._id || member.studentId || member._id
            const sName = member.studentId?.name || member.name || 'Unknown'
            try {
              const mRes = await fetch(`${API_URL}/analytics/student/${sid}/${selectedRoomId}`, {
                headers: { Authorization: `Bearer ${token}` }
              })
              const mData = await mRes.json()
              if (mData.success) {
                metricsArr.push({ id: sid, name: sName, ...mData.metrics })
              }
            } catch { /* skip on error */ }
          }
          metricsArr.sort((a, b) => b.lps - a.lps)
          setStudentMetrics(metricsArr)
        } else {
          // Student view: fetch own metrics for selected room
          const mRes = await fetch(`${API_URL}/analytics/student/${user._id}/${selectedRoomId}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          const mData = await mRes.json()
          if (mData.success) {
            setStudentMetrics([{ id: user._id, name: user.name, ...mData.metrics }])
          } else {
            setStudentMetrics([])
          }
          setClassStats(null)
        }
      } catch (err) {
        console.error('Analytics fetch error:', err)
        setClassStats(null)
        setStudentMetrics([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [selectedRoomId, token, refreshTrigger])

  const avgLps = classStats?.average || (studentMetrics.length === 1 ? studentMetrics[0]?.lps : 0) || 0

  if (!checked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '4px solid var(--border-color)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
      <Sidebar user={user} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        {/* Header */}
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>📈 Learning Analytics Dashboard</h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: 14 }}>
                {isTeacher ? 'Track student progress and class performance' : 'View your learning progress'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, padding: 32 }}>
          {/* Room selector */}
          <div style={{
            background: 'var(--bg-card)', borderRadius: 16, padding: '20px 24px', marginBottom: 24,
            boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)',
            display: 'flex', alignItems: 'center', gap: 16
          }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              Select Room:
            </label>
            <select
              value={selectedRoomId}
              onChange={e => setSelectedRoomId(e.target.value)}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 10, border: '2px solid var(--border-color)',
                background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                cursor: 'pointer'
              }}
            >
              {!rooms?.length && <option value="">No rooms available</option>}
              {rooms?.map(r => (
                <option key={r._id} value={r._id}>{r.name} ({r.code})</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
              <div style={{ width: 40, height: 40, border: '4px solid var(--border-color)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p>Loading analytics...</p>
            </div>
          ) : (
            <>
              {/* Top metrics row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginBottom: 28 }}>
                {/* LPS Donut */}
                <div style={{
                  background: 'var(--bg-card)', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)'
                }}>
                  <LpsDonut percentage={avgLps} size={140} label={isTeacher ? 'Class Avg LPS' : 'Your LPS'} />
                </div>

                {/* Stat cards */}
                {isTeacher && classStats && (
                  <>
                    <div style={statCardStyle}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{classStats.totalStudents}</div>
                      <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>Total Students</div>
                    </div>
                    <div style={statCardStyle}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>{classStats.max}</div>
                      <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>Highest LPS</div>
                    </div>
                    <div style={statCardStyle}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📉</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: '#ef4444' }}>{classStats.min}</div>
                      <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>Lowest LPS</div>
                    </div>
                  </>
                )}

                {!isTeacher && studentMetrics.length === 1 && (
                  <>
                    <div style={statCardStyle}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{(studentMetrics[0].attendance * 100).toFixed(0)}%</div>
                      <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>Attendance</div>
                    </div>
                    <div style={statCardStyle}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🧠</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{(studentMetrics[0].quizScore * 100).toFixed(0)}%</div>
                      <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>Quiz Score</div>
                    </div>
                    <div style={statCardStyle}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🙋</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{(studentMetrics[0].participation * 100).toFixed(0)}%</div>
                      <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>Participation</div>
                    </div>
                  </>
                )}
              </div>

              {/* Distribution chart (teacher only) */}
              {isTeacher && classStats?.distribution && (
                <div style={{
                  background: 'var(--bg-card)', borderRadius: 16, padding: 24, marginBottom: 28,
                  boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)'
                }}>
                  <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
                    📊 LPS Distribution
                  </h2>
                  <div style={{ overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
                    <LpsBarChart distribution={classStats.distribution} maxStudents={classStats.totalStudents} />
                  </div>
                </div>
              )}

              {/* Student-wise breakdown table (teacher) */}
              {isTeacher && studentMetrics.length > 0 && (
                <div style={{
                  background: 'var(--bg-card)', borderRadius: 16, padding: 24,
                  boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)'
                }}>
                  <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
                    🎓 Student-wise LPS Breakdown
                  </h2>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>#</th>
                          <th style={thStyle}>Student</th>
                          <th style={thStyle}>LPS</th>
                          <th style={thStyle}>Attendance</th>
                          <th style={thStyle}>Quiz Score</th>
                          <th style={thStyle}>Participation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentMetrics.map((s, i) => (
                          <StudentRow
                            key={s.id}
                            rank={i + 1}
                            name={s.name}
                            lps={s.lps}
                            attendance={s.attendance}
                            quizScore={s.quizScore}
                            participation={s.participation}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Student personal breakdown */}
              {!isTeacher && studentMetrics.length === 1 && (
                <div style={{
                  background: 'var(--bg-card)', borderRadius: 16, padding: 24,
                  boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)'
                }}>
                  <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
                    📋 Your LPS Breakdown
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                    {[
                      { label: 'Attendance (30%)', value: studentMetrics[0].attendance, color: '#3b82f6' },
                      { label: 'Quiz Score (30%)', value: studentMetrics[0].quizScore, color: '#10b981' },
                      { label: 'Assignment (20%)', value: studentMetrics[0].assignment, color: '#f59e0b' },
                      { label: 'Participation (20%)', value: studentMetrics[0].participation, color: '#6366f1' },
                    ].map(item => (
                      <div key={item.label} style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{item.label}</div>
                        <div style={{ position: 'relative', height: 8, background: 'var(--border-color)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{
                            position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 4,
                            width: `${(item.value || 0) * 100}%`, background: item.color,
                            transition: 'width 0.6s ease'
                          }} />
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: item.color, marginTop: 8 }}>
                          {((item.value || 0) * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!loading && studentMetrics.length === 0 && !classStats && (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>No analytics data yet</h3>
                  <p>Analytics will appear once students start participating in quizzes.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const statCardStyle = {
  background: 'var(--bg-card)', borderRadius: 16, padding: 24,
  boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
}

export default AnalyticsDashboard
