import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useIsMobile from '../hooks/useIsMobile'
import { classApi, roomApi } from '../lib/api'

export default function ClassesPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user, token } = useAuthStore()
  const { joinRoom } = useSocketStore()

  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Teacher Create Class modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [creating, setCreating] = useState(false)

  // Teacher Start Session modal state
  const [sessionModalClass, setSessionModalClass] = useState(null)
  const [sessionName, setSessionName] = useState('')
  const [startingSession, setStartingSession] = useState(false)

  // Student Join Class state
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinMessage, setJoinMessage] = useState(null)

  // Copy feedback state
  const [copiedCode, setCopiedCode] = useState(null)

  const isTeacher = user?.role === 'teacher'

  useEffect(() => {
    fetchClasses()
  }, [])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await classApi.getAll()
      setClasses(data.classes || [])
    } catch (err) {
      console.error('Failed to fetch classes:', err)
      setError(err.message || 'Failed to load classes')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateClass = async (e) => {
    e.preventDefault()
    if (!newClassName.trim()) return

    try {
      setCreating(true)
      await classApi.create(newClassName.trim())
      setNewClassName('')
      setShowCreateModal(false)
      await fetchClasses()
    } catch (err) {
      alert(err.message || 'Failed to create class')
    } finally {
      setCreating(false)
    }
  }

  const handleOpenStartSession = (cls) => {
    const nextSessionNum = (cls.sessionCount || 0) + 1
    setSessionModalClass(cls)
    setSessionName(`${cls.name} - Session ${nextSessionNum}`)
  }

  const handleStartSession = async (e) => {
    e.preventDefault()
    if (!sessionModalClass) return

    try {
      setStartingSession(true)
      const res = await classApi.createSession(sessionModalClass._id, {
        name: sessionName.trim()
      })
      if (res.room?._id) {
        navigate(`/teacher/room/${res.room._id}`)
      }
    } catch (err) {
      alert(err.message || 'Failed to start class session')
      setStartingSession(false)
    }
  }

  const handleStudentJoinClass = async (e) => {
    e.preventDefault()
    if (!joinCode.trim()) return

    try {
      setJoining(true)
      setJoinMessage(null)
      const res = await classApi.joinByCode(joinCode.trim().toUpperCase())
      setJoinCode('')
      setJoinMessage({ type: 'success', text: res.message || 'Successfully joined class!' })
      await fetchClasses()
    } catch (err) {
      setJoinMessage({ type: 'error', text: err.message || 'Failed to join class. Please check the code.' })
    } finally {
      setJoining(false)
    }
  }

  const handleStudentJoinLiveSession = async (cls) => {
    if (!cls.activeSession) return
    try {
      // Join room via API to register membership
      await roomApi.joinByCode(cls.activeSession.code)
      // Join via socket
      joinRoom(cls.activeSession.code, user._id)
      // Navigate to live session room
      navigate(`/student/session/${cls.activeSession.code}`)
    } catch (err) {
      alert(err.message || 'Failed to enter live session')
    }
  }

  const handleCopyCode = (code, e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
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
        {/* Top Header Bar */}
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
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? '20px' : '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>
              🏫 My Classes
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.88 }}>
              {isTeacher
                ? 'Create recurring class series, share your class code, and launch sessions on demand'
                : 'Join once with your teacher’s class code and seamlessly attend every session'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isTeacher && (
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  background: 'white',
                  color: '#1e40af',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 18px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  transition: 'transform 0.15s ease'
                }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.02)' }}
                onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                <span>➕</span> Create Class
              </button>
            )}
            <ThemeToggle />
            <ProfileDropdown user={user} />
          </div>
        </header>

        {/* Main Content Area */}
        <main style={{ padding: isMobile ? '20px 16px' : '32px', flex: 1, maxWidth: '1280px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          {/* Student Join Class Box */}
          {!isTeacher && (
            <div style={{
              background: 'var(--card-bg , #ffffff)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border-color)',
              padding: isMobile ? '20px' : '28px',
              marginBottom: '32px',
              boxShadow: 'var(--shadow-md)',
              backgroundClip: 'padding-box'
            }}>
              <div style={{ maxWidth: '640px' }}>
                <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Join a Class Series
                </h2>
                <p style={{ margin: '0 0 18px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Have a 6-character class code from your teacher? Join once to stay enrolled across all sessions and track your progress.
                </p>
                <form onSubmit={handleStudentJoinClass} style={{ display: 'flex', gap: '12px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="Enter Class Code (e.g. 7X9K2P)"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    style={{
                      flex: 1,
                      minWidth: isMobile ? '100%' : '260px',
                      padding: '12px 16px',
                      fontSize: '15px',
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={joining || !joinCode.trim()}
                    style={{
                      padding: '12px 24px',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: joining || !joinCode.trim() ? 'not-allowed' : 'pointer',
                      opacity: joining || !joinCode.trim() ? 0.7 : 1,
                      transition: 'opacity 0.2s ease',
                      width: isMobile ? '100%' : 'auto'
                    }}
                  >
                    {joining ? 'Joining...' : 'Enroll in Class'}
                  </button>
                </form>

                {joinMessage && (
                  <div style={{
                    marginTop: '14px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    background: joinMessage.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    color: joinMessage.type === 'success' ? '#059669' : '#dc2626',
                    border: `1px solid ${joinMessage.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                  }}>
                    {joinMessage.text}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {isTeacher ? 'Your Active Classes' : 'Enrolled Classes'}
            </h2>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {classes.length} {classes.length === 1 ? 'class' : 'classes'}
            </span>
          </div>

          {/* Loading / Error States */}
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
              <p>Loading classes...</p>
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
                onClick={fetchClasses}
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
          ) : classes.length === 0 ? (
            /* Empty State */
            <div style={{
              textAlign: 'center',
              padding: isMobile ? '40px 20px' : '64px 20px',
              background: 'var(--card-bg,#ffffff)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏫</div>
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {isTeacher ? 'No Classes Created Yet' : 'Not Enrolled in Any Class'}
              </h3>
              <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '420px', marginInline: 'auto' }}>
                {isTeacher
                  ? 'Create your first recurring class series to group student attendance, quizzes, and sessions together.'
                  : 'Enter a 6-character class code from your teacher to join your first class series.'}
              </p>
              {isTeacher && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={{
                    padding: '12px 24px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(30, 64, 175, 0.25)'
                  }}
                >
                  ➕ Create First Class
                </button>
              )}
            </div>
          ) : (
            /* Class Cards Grid */
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: '20px'
            }}>
              {classes.map((cls) => {
                const hasLiveSession = !!cls.activeSession
                return (
                  <div
                    key={cls._id}
                    style={{
                      background: 'var(--card-bg,#ffffff)',
                      borderRadius: 'var(--radius)',
                      border: hasLiveSession ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                      boxShadow: hasLiveSession ? '0 8px 24px rgba(59, 130, 246, 0.18)' : 'var(--shadow-md)',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      transition: 'transform 0.18s ease, box-shadow 0.18s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = hasLiveSession ? '0 8px 24px rgba(59, 130, 246, 0.18)' : 'var(--shadow-md)'
                    }}
                  >
                    {/* Live banner if session active */}
                    {hasLiveSession && (
                      <div style={{
                        background: 'linear-gradient(90deg, #dc2626, #ef4444)',
                        color: 'white',
                        padding: '6px 16px',
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: 'white',
                            display: 'inline-block',
                            animation: 'pulse 1.5s infinite'
                          }} />
                          LIVE SESSION NOW
                        </span>
                        <span style={{ opacity: 0.9 }}>Code: {cls.activeSession.code}</span>
                      </div>
                    )}

                    <div style={{ padding: '22px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      {/* Title & Teacher */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                        <div>
                          <h3 style={{
                            margin: 0,
                            fontSize: '17px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            lineHeight: 1.3
                          }}>
                            {cls.name}
                          </h3>
                          {!isTeacher && cls.teacher && (
                            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                              Instructor: {cls.teacher.name}
                            </p>
                          )}
                        </div>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: 'rgba(59, 130, 246, 0.1)',
                          color: '#3b82f6',
                          whiteSpace: 'nowrap'
                        }}>
                          Series
                        </span>
                      </div>

                      {/* Class Code Box */}
                      <div style={{
                        background: 'var(--input-bg)',
                        border: '1px dashed var(--border-color)',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '16px'
                      }}>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Class Code
                          </div>
                          <div style={{
                            fontSize: '17px',
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            color: 'var(--text-primary)',
                            fontFamily: 'monospace'
                          }}>
                            {cls.code}
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleCopyCode(cls.code, e)}
                          title="Copy Class Code"
                          style={{
                            background: copiedCode === cls.code ? '#10b981' : 'transparent',
                            color: copiedCode === cls.code ? 'white' : 'var(--text-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {copiedCode === cls.code ? '✓ Copied' : '📋 Copy'}
                        </button>
                      </div>

                      {/* Stats Badges */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px',
                        marginBottom: '20px'
                      }}>
                        <div style={{
                          padding: '10px 12px',
                          background: 'var(--nav-hover)',
                          borderRadius: '8px',
                          textAlign: 'center'
                        }}>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {cls.memberCount ?? cls.members?.length ?? 0}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            Enrolled Students
                          </div>
                        </div>

                        <div style={{
                          padding: '10px 12px',
                          background: 'var(--nav-hover)',
                          borderRadius: '8px',
                          textAlign: 'center'
                        }}>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {cls.sessionCount ?? 0}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            Total Sessions
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* Student Live Join Action */}
                        {!isTeacher && hasLiveSession && (
                          <button
                            onClick={() => handleStudentJoinLiveSession(cls)}
                            style={{
                              width: '100%',
                              padding: '11px',
                              borderRadius: '8px',
                              border: 'none',
                              background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                              color: 'white',
                              fontSize: '13px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              boxShadow: '0 2px 10px rgba(220, 38, 38, 0.3)'
                            }}
                          >
                            <span>🔴</span> Join Today's Live Session
                          </button>
                        )}

                        {/* Teacher Start Session Action */}
                        {isTeacher && (
                          <button
                            onClick={() => handleOpenStartSession(cls)}
                            style={{
                              width: '100%',
                              padding: '11px',
                              borderRadius: '8px',
                              border: 'none',
                              background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                              color: 'white',
                              fontSize: '13px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              boxShadow: '0 2px 8px rgba(30, 64, 175, 0.25)'
                            }}
                          >
                            <span>🚀</span> Start New Session
                          </button>
                        )}

                        {/* View Details / History Action */}
                        <button
                          onClick={() => navigate(`${isTeacher ? '/teacher' : '/student'}/classes/${cls._id}`)}
                          style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: 'transparent',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseOver={(e) => { e.currentTarget.style.background = 'var(--nav-hover)' }}
                          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                          View Sessions & History →
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>

      {/* Teacher: Create Class Modal */}
      {showCreateModal && (
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
            background: 'var(--card-bg,#ffffff)',
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
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Create New Class Series
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
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

            <form onSubmit={handleCreateClass} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Class Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CS101 - Algorithms & Data Structures"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
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
                <span style={{ display: 'block', marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  A unique 6-character class code will be generated for your students to join once.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
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
                  disabled={creating || !newClassName.trim()}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: creating || !newClassName.trim() ? 'not-allowed' : 'pointer',
                    opacity: creating || !newClassName.trim() ? 0.7 : 1
                  }}
                >
                  {creating ? 'Creating...' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Teacher: Start Session Modal */}
      {sessionModalClass && (
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
            background: 'var(--card-bg,#ffffff)',
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
                  Class: {sessionModalClass.name}
                </span>
              </div>
              <button
                onClick={() => setSessionModalClass(null)}
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
                  placeholder="e.g. Lecture 4 - Binary Trees"
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
                <span style={{ display: 'block', marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  This creates a live room under {sessionModalClass.name} that enrolled students can join immediately.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setSessionModalClass(null)}
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
