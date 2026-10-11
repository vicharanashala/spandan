import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useIsMobile from '../hooks/useIsMobile'
import { classApi, roomApi } from '../lib/api'

export default function ClassDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user } = useAuthStore()
  const { joinRoom } = useSocketStore()

  const [classData, setClassData] = useState(null)
  const [sessions, setSessions] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Start Session modal
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [startingSession, setStartingSession] = useState(false)

  // Copied feedback
  const [copied, setCopied] = useState(false)

  const isTeacher = user?.role === 'teacher'

  useEffect(() => {
    fetchClassDetails()
  }, [id])

  const fetchClassDetails = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await classApi.getById(id)
      setClassData(data.class)
      setSessions(data.sessions || [])

      if (isTeacher) {
        try {
          const statsRes = await classApi.getStats(id)
          setStats(statsRes.stats)
        } catch (e) {
          console.warn('Failed to fetch class stats:', e)
        }
      }
    } catch (err) {
      console.error('Failed to load class:', err)
      setError(err.message || 'Failed to load class details')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyCode = () => {
    if (!classData?.code) return
    navigator.clipboard.writeText(classData.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenStartSession = () => {
    const nextSessionNum = (sessions.length || 0) + 1
    setSessionName(`${classData.name} - Session ${nextSessionNum}`)
    setShowSessionModal(true)
  }

  const handleStartSession = async (e) => {
    e.preventDefault()
    try {
      setStartingSession(true)
      const res = await classApi.createSession(id, { name: sessionName.trim() })
      if (res.room?._id) {
        navigate(`/teacher/room/${res.room._id}`)
      }
    } catch (err) {
      alert(err.message || 'Failed to start session')
      setStartingSession(false)
    }
  }

  const handleStudentJoinSession = async (session) => {
    try {
      await roomApi.joinByCode(session.code)
      joinRoom(session.code, user._id)
      navigate(`/student/session/${session.code}`)
    } catch (err) {
      alert(err.message || 'Failed to join session')
    }
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      <Sidebar user={user} />

      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        marginLeft: 'var(--sidebar-width, 240px)',
        transition: 'margin-left 0.2s ease'
      }}>
        {/* Top Header */}
        <header style={{
          background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
          color: 'white',
          padding: isMobile ? '16px 20px' : '20px 32px',
          boxShadow: '0 4px 20px rgba(30, 64, 175, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => navigate(isTeacher ? '/teacher/classes' : '/student/classes')}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: 'white',
                borderRadius: '8px',
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ← Classes
            </button>
            <h1 style={{ margin: 0, fontSize: isMobile ? '18px' : '22px', fontWeight: 700 }}>
              {classData?.name || 'Class Details'}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ThemeToggle />
            <ProfileDropdown user={user} />
          </div>
        </header>

        {/* Main Content */}
        <main style={{ padding: isMobile ? '20px 16px' : '32px', flex: 1, maxWidth: '1280px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid var(--border-color)',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px'
              }} />
              <p>Loading class sessions...</p>
            </div>
          ) : error ? (
            <div style={{
              padding: '24px',
              borderRadius: 'var(--radius)',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#dc2626',
              textAlign: 'center'
            }}>
              <p style={{ margin: 0, fontWeight: 500 }}>{error}</p>
              <button
                onClick={fetchClassDetails}
                style={{
                  marginTop: '12px',
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Retry
              </button>
            </div>
          ) : classData && (
            <>
              {/* Hero Banner Card */}
              <div style={{
                background: 'var(--card-bg)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                padding: isMobile ? '20px' : '28px',
                marginBottom: '28px',
                boxShadow: 'var(--shadow-md)',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: '20px'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '20px' }}>🏫</span>
                    <h2 style={{ margin: 0, fontSize: isMobile ? '20px' : '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {classData.name}
                    </h2>
                  </div>
                  <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                    Instructor: {classData.teacher?.name || 'Teacher'} ({classData.teacher?.email})
                  </p>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <span>👥 <strong>{classData.memberCount || classData.members?.length || 0}</strong> Enrolled Students</span>
                    <span>📚 <strong>{sessions.length}</strong> Total Sessions</span>
                    <span>📅 Created {new Date(classData.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Class Code & Action Box */}
                <div style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'row' : 'column',
                  alignItems: isMobile ? 'center' : 'flex-end',
                  justifyContent: 'space-between',
                  width: isMobile ? '100%' : 'auto',
                  gap: '12px'
                }}>
                  <div style={{
                    background: 'var(--input-bg)',
                    border: '1px dashed var(--border-color)',
                    borderRadius: '10px',
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <div>
                      <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Class Code</span>
                      <strong style={{ fontSize: '18px', fontFamily: 'monospace', letterSpacing: '0.12em', color: 'var(--text-primary)' }}>
                        {classData.code}
                      </strong>
                    </div>
                    <button
                      onClick={handleCopyCode}
                      style={{
                        background: copied ? '#10b981' : 'transparent',
                        color: copied ? 'white' : 'var(--text-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {copied ? '✓ Copied' : '📋 Copy'}
                    </button>
                  </div>

                  {isTeacher && (
                    <button
                      onClick={handleOpenStartSession}
                      style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                        color: 'white',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 10px rgba(30, 64, 175, 0.25)'
                      }}
                    >
                      <span>🚀</span> Start New Session
                    </button>
                  )}
                </div>
              </div>

              {/* Stats Overview Grid (Teacher only) */}
              {isTeacher && stats && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                  gap: '16px',
                  marginBottom: '28px'
                }}>
                  <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '18px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#3b82f6' }}>{stats.totalSessions}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Total Sessions</div>
                  </div>
                  <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '18px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981' }}>{stats.enrolledStudents}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Enrolled Students</div>
                  </div>
                  <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '18px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#8b5cf6' }}>{stats.totalQuestionsAsked}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Questions Conducted</div>
                  </div>
                  <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '18px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#f59e0b' }}>{stats.totalResponses}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Total Responses</div>
                  </div>
                </div>
              )}

              {/* Sessions List */}
              <div style={{
                background: 'var(--card-bg)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                padding: isMobile ? '20px' : '28px',
                boxShadow: 'var(--shadow-sm)',
                marginBottom: '28px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Class Sessions ({sessions.length})
                  </h3>
                  {isTeacher && (
                    <button
                      onClick={handleOpenStartSession}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      + New Session
                    </button>
                  )}
                </div>

                {sessions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                    <div style={{ fontSize: '36px', marginBottom: '12px' }}>📖</div>
                    <p style={{ margin: 0, fontSize: '15px', fontWeight: 500 }}>No sessions created yet under this class.</p>
                    <p style={{ margin: '6px 0 0', fontSize: '13px' }}>
                      {isTeacher ? 'Click "Start New Session" above to launch your first interactive room.' : 'Your teacher has not launched any sessions for this class series yet.'}
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {sessions.map((session) => {
                      const isLive = session.isActive && !session.endedAt
                      return (
                        <div
                          key={session._id}
                          style={{
                            padding: '16px 20px',
                            borderRadius: '10px',
                            border: isLive ? '1.5px solid #3b82f6' : '1px solid var(--border-color)',
                            background: isLive ? 'rgba(59, 130, 246, 0.04)' : 'var(--input-bg)',
                            display: 'flex',
                            flexDirection: isMobile ? 'column' : 'row',
                            alignItems: isMobile ? 'flex-start' : 'center',
                            justifyContent: 'space-between',
                            gap: '14px'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                              <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>
                                {session.name}
                              </strong>
                              <span style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '3px 8px',
                                borderRadius: '12px',
                                background: isLive ? '#dcfce7' : '#f3f4f6',
                                color: isLive ? '#15803d' : '#6b7280'
                              }}>
                                {isLive ? '🟢 LIVE' : 'Ended'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                              <span>Code: <code style={{ fontWeight: 600 }}>{session.code}</code></span>
                              <span>❓ {session.questionCount || 0} Questions</span>
                              <span>👥 {session.participantCount || 0} Attended</span>
                              <span>📅 {new Date(session.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div style={{ display: 'flex', gap: '10px', width: isMobile ? '100%' : 'auto' }}>
                            {isTeacher ? (
                              <>
                                {isLive ? (
                                  <button
                                    onClick={() => navigate(`/teacher/room/${session._id}`)}
                                    style={{
                                      padding: '8px 16px',
                                      borderRadius: '6px',
                                      border: 'none',
                                      background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                                      color: 'white',
                                      fontSize: '13px',
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Live Console →
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => navigate(`/teacher/room/${session._id}/results`)}
                                    style={{
                                      padding: '8px 14px',
                                      borderRadius: '6px',
                                      border: '1px solid var(--border-color)',
                                      background: 'transparent',
                                      color: 'var(--text-primary)',
                                      fontSize: '13px',
                                      fontWeight: 500,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    View Results
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                {isLive ? (
                                  <button
                                    onClick={() => handleStudentJoinSession(session)}
                                    style={{
                                      padding: '8px 16px',
                                      borderRadius: '6px',
                                      border: 'none',
                                      background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                                      color: 'white',
                                      fontSize: '13px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)'
                                    }}
                                  >
                                    Join Live Session →
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => navigate(`/student/room/${session._id}/results`)}
                                    style={{
                                      padding: '8px 14px',
                                      borderRadius: '6px',
                                      border: '1px solid var(--border-color)',
                                      background: 'transparent',
                                      color: 'var(--text-primary)',
                                      fontSize: '13px',
                                      fontWeight: 500,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    View Results
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Enrolled Students Roster (Teacher only) */}
              {isTeacher && (
                <div style={{
                  background: 'var(--card-bg)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border-color)',
                  padding: isMobile ? '20px' : '28px',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Enrolled Students ({classData.members?.length || 0})
                  </h3>

                  {!classData.members || classData.members.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-secondary)' }}>
                      <p style={{ margin: 0, fontSize: '14px' }}>
                        No students enrolled yet. Share class code <strong>{classData.code}</strong> with your students to have them join!
                      </p>
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
                      gap: '12px'
                    }}>
                      {classData.members.map((member) => (
                        <div
                          key={member._id}
                          style={{
                            padding: '12px 14px',
                            background: 'var(--input-bg)',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                          }}
                        >
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontSize: '13px'
                          }}>
                            {member.name ? member.name.charAt(0).toUpperCase() : 'S'}
                          </div>
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {member.name}
                            </div>
                            {member.email && (
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                {member.email}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Start Session Modal */}
      {showSessionModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px',
          backdropFilter: 'blur(2px)'
        }}>
          <div style={{
            background: 'var(--card-bg)',
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-xl)',
            width: '100%',
            maxWidth: '480px',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Start New Session
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Class: {classData?.name}
                </span>
              </div>
              <button
                onClick={() => setShowSessionModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '18px',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleStartSession} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Session Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Session 3 - Tree Traversal"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowSessionModal(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={startingSession}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: startingSession ? 'not-allowed' : 'pointer',
                    opacity: startingSession ? 0.7 : 1
                  }}
                >
                  {startingSession ? 'Launching...' : '🚀 Launch Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
