import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useIsMobile from '../hooks/useIsMobile'
import Sidebar from '../components/Sidebar'
import { classApi } from '../lib/api'
import {
  PageHeader,
  pageWash,
  inputStyle,
  primaryButton,
  ghostButton,
  Pill,
  EmptyState,
  CodeChip
} from '../components/AppUI'
import { StatTile, TileGrid, SectionLabel, SectionHeader, cardStyle } from '../components/InsightUI'
import { School, Plus, Play, CircleDot, ChevronRight, X, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { renderIcon } from '../components/icons'

export default function StudentClassesPage() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { socket } = useSocketStore()
  const isMobile = useIsMobile()

  const [classes, setClasses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: 'success' | 'info' | 'error', message: string }

  const fetchClasses = async () => {
    try {
      const data = await classApi.getAll()
      setClasses(data.classes || [])
    } catch (err) {
      console.error('Failed to load student classes:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      fetchClasses()
    }
  }, [token])

  // Real-time socket updates: student sees live session launch or membership approval without refreshing
  useEffect(() => {
    if (!socket) return

    const handleSessionStarted = () => fetchClasses()
    const handleClassUpdated = () => fetchClasses()
    const handleMemberUpdated = (data) => {
      if (!data?.studentId || String(data.studentId) === String(user?._id)) {
        fetchClasses()
      }
    }

    socket.on('class:session-started', handleSessionStarted)
    socket.on('class:updated', handleClassUpdated)
    socket.on('class:member-updated', handleMemberUpdated)

    return () => {
      socket.off('class:session-started', handleSessionStarted)
      socket.off('class:updated', handleClassUpdated)
      socket.off('class:member-updated', handleMemberUpdated)
    }
  }, [socket, user?._id])

  const handleJoinClass = async (e) => {
    e?.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code || isJoining) return

    setIsJoining(true)
    setFeedback(null)
    try {
      const res = await classApi.join(code)
      setJoinCode('')
      if (res.status === 'pending') {
        setFeedback({
          type: 'info',
          message: 'Your re-join request was submitted. Awaiting teacher approval before you can access the class.'
        })
      } else {
        setFeedback({
          type: 'success',
          message: `Enrolled in "${res.class?.name || 'Class'}" successfully!`
        })
      }
      await fetchClasses()
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to join class. Verify code and try again.'
      })
    } finally {
      setIsJoining(false)
    }
  }

  const activeClasses = classes.filter(c => c.memberStatus === 'active')
  const pendingClasses = classes.filter(c => c.memberStatus === 'pending')
  const liveSessionsCount = activeClasses.filter(c => c.activeSession).length

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

      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        marginLeft: 'var(--sidebar-width, 240px)',
        transition: 'margin-left 0.2s ease',
        maxWidth: '100%',
        boxSizing: 'border-box'
      }}>
        <PageHeader
          isMobile={isMobile}
          icon={School}
          eyebrow="Google Classroom–Style Classes"
          title="My Classes"
          subtitle="Enrolled classes, live sessions, and attendance history"
        />

        <div style={{
          flex: 1,
          padding: isMobile ? '16px' : '28px 32px 32px',
          maxWidth: '100%',
          boxSizing: 'border-box',
          background: pageWash
        }}>
          {feedback && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 14,
              background: feedback.type === 'error'
                ? 'color-mix(in srgb, #ef4444 12%, var(--bg-card))'
                : feedback.type === 'info'
                ? 'color-mix(in srgb, #f59e0b 12%, var(--bg-card))'
                : 'color-mix(in srgb, #10b981 12%, var(--bg-card))',
              border: `1px solid ${
                feedback.type === 'error'
                  ? 'color-mix(in srgb, #ef4444 35%, transparent)'
                  : feedback.type === 'info'
                  ? 'color-mix(in srgb, #f59e0b 35%, transparent)'
                  : 'color-mix(in srgb, #10b981 35%, transparent)'
              }`,
              color: feedback.type === 'error' ? '#ef4444' : feedback.type === 'info' ? '#d97706' : '#059669',
              marginBottom: 20,
              fontSize: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>{feedback.message}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Join Class by Code Card */}
          <SectionLabel>Join a Class</SectionLabel>
          <div style={{ ...cardStyle(isMobile), marginBottom: 28 }}>
            <SectionHeader
              icon={Plus}
              title="Enter Class Code"
              hint="Join a class with the 6-character code provided by your teacher. You only need to join once to attend all future sessions."
            />
            <form onSubmit={handleJoinClass} style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
              <input
                type="text"
                placeholder="6-character code (e.g. 7K2M9P)"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                style={inputStyle({
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  maxWidth: isMobile ? '100%' : '260px'
                })}
              />
              <button
                type="submit"
                disabled={joinCode.trim().length !== 6 || isJoining}
                style={primaryButton(joinCode.trim().length !== 6 || isJoining, {
                  padding: '12px 24px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8
                })}
              >
                {isJoining ? 'Joining...' : 'Join Class'}
              </button>
            </form>
          </div>

          {/* Enrolled Classes List */}
          <SectionLabel actions={<span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{activeClasses.length} enrolled</span>}>
            Enrolled Classes
          </SectionLabel>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
              <div style={{
                width: 40,
                height: 40,
                border: '3px solid var(--border-color)',
                borderTopColor: 'var(--accent)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 12px'
              }} />
              <p style={{ margin: 0, fontSize: 14 }}>Loading your classes...</p>
            </div>
          ) : activeClasses.length === 0 && pendingClasses.length === 0 ? (
            <EmptyState
              icon={School}
              title="Not enrolled in any class yet"
              description="Ask your teacher for their 6-character class code to join your first class."
            />
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16
            }}>
              {activeClasses.map((cls) => {
                const isArchived = cls.isActive === false
                const liveSession = !isArchived && cls.activeSession
                return (
                  <div
                    key={cls._id}
                    className="app-card app-card--hover"
                    onClick={() => navigate(`/student/classes/${cls._id}`)}
                    style={{
                      background: 'var(--bg-card)',
                      borderRadius: 18,
                      border: '1px solid var(--border-color)',
                      boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 6px 18px rgba(16,24,40,0.06)',
                      padding: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      cursor: 'pointer',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        inset: '0 0 auto 0',
                        height: 3,
                        background: isArchived
                          ? '#f59e0b'
                          : liveSession
                            ? 'linear-gradient(90deg, #10b981, #34d399)'
                            : 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 35%, transparent))'
                      }}
                    />

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 12,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 20,
                          flexShrink: 0,
                          background: isArchived
                            ? 'color-mix(in srgb, #f59e0b 12%, transparent)'
                            : liveSession
                              ? 'color-mix(in srgb, #10b981 12%, transparent)'
                              : 'color-mix(in srgb, var(--accent) 12%, transparent)',
                          color: isArchived ? '#f59e0b' : liveSession ? '#10b981' : 'var(--accent)',
                          border: `1px solid ${isArchived ? 'color-mix(in srgb, #f59e0b 25%, transparent)' : liveSession ? 'color-mix(in srgb, #10b981 25%, transparent)' : 'color-mix(in srgb, var(--accent) 25%, transparent)'}`
                        }}
                      >
                        {renderIcon(School, 20)}
                      </span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3
                          style={{
                            margin: 0,
                            fontSize: 16,
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={cls.name}
                        >
                          {cls.name}
                        </h3>
                        <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                          Teacher: {cls.teacher?.name || 'Instructor'}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <CodeChip code={cls.code} />
                      {isArchived ? (
                        <Pill tone="#f59e0b">Archived</Pill>
                      ) : liveSession ? (
                        <Pill tone="#10b981" dot>Session Live Now</Pill>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {cls.totalSessions || 0} past {cls.totalSessions === 1 ? 'session' : 'sessions'}
                        </span>
                      )}
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 'auto',
                      paddingTop: 8,
                      borderTop: '1px solid var(--border-color)'
                    }}>
                      {liveSession ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/student/session/${liveSession.code}`, { state: { classId: cls._id, classCode: cls.code, className: cls.name } })
                          }}
                          style={primaryButton(false, {
                            flex: 1,
                            padding: '8px 14px',
                            fontSize: 13,
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6
                          })}
                        >
                          <Play size={14} /> Join Live Session
                        </button>
                      ) : (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: 'var(--accent)'
                        }}>
                          <span>View Class</span>
                          <ChevronRight size={16} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Pending Approvals */}
              {pendingClasses.map((cls) => (
                <div
                  key={cls._id}
                  style={{
                    background: 'var(--bg-card)',
                    borderRadius: 18,
                    border: '1px dashed color-mix(in srgb, #f59e0b 50%, var(--border-color))',
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    opacity: 0.9
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'color-mix(in srgb, #f59e0b 12%, transparent)',
                      color: '#f59e0b'
                    }}>
                      <Clock size={18} />
                    </span>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{cls.name}</h4>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>Teacher: {cls.teacher?.name}</p>
                    </div>
                  </div>

                  <div style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: 'color-mix(in srgb, #f59e0b 8%, var(--bg-card))',
                    fontSize: 12.5,
                    color: '#b45309'
                  }}>
                    Awaiting teacher approval to re-join this class.
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
