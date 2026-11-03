import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useIsMobile from '../hooks/useIsMobile'
import Sidebar from '../components/Sidebar'
import { classApi } from '../lib/api'
import StudentPerformancePage from './StudentPerformancePage'
import {
  PageHeader,
  pageWash,
  primaryButton,
  ghostButton,
  Pill,
  EmptyState,
  CodeChip
} from '../components/AppUI'
import { StatTile, TileGrid, SectionLabel, SectionHeader, cardStyle } from '../components/InsightUI'
import {
  School,
  ArrowLeft,
  Play,
  CircleDot,
  Library,
  Award,
  CheckCircle2,
  Clock,
  XCircle,
  FileSpreadsheet,
  ChartColumn,
  Archive
} from 'lucide-react'

export default function StudentClassDetailPage() {
  const { id: classId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, token } = useAuthStore()
  const { socket } = useSocketStore()
  const isMobile = useIsMobile()

  const [activeTab, setActiveTab] = useState(
    location.state?.activeTab === 'performance' ? 'performance' : 'sessions'
  ) // 'sessions' | 'performance'
  const [classData, setClassData] = useState(null)
  const [performance, setPerformance] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)


  const fetchClassDetails = async () => {
    try {
      const [clsRes, perfRes] = await Promise.all([
        classApi.getById(classId),
        classApi.getMemberPerformance(classId, user._id)
      ])
      setClassData(clsRes)
      setPerformance(perfRes)
    } catch (err) {
      console.error('Failed to load class details:', err)
      setError(err.message || 'Failed to load class')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (token && classId && user?._id) {
      fetchClassDetails()
    }
  }, [token, classId, user?._id])

  // Real-time updates via Socket.IO
  useEffect(() => {
    if (!socket || !classId) return

    socket.emit('class:join', { classId })

    const handleSessionStarted = (data) => {
      if (String(data.classId) === String(classId)) {
        fetchClassDetails()
      }
    }

    const handleClassUpdated = (data) => {
      if (String(data.classId) === String(classId)) {
        fetchClassDetails()
      }
    }

    const handleRoomEnded = () => {
      fetchClassDetails()
    }

    socket.on('class:session-started', handleSessionStarted)
    socket.on('class:updated', handleClassUpdated)
    socket.on('room:ended', handleRoomEnded)

    return () => {
      socket.emit('class:leave', { classId })
      socket.off('class:session-started', handleSessionStarted)
      socket.off('class:updated', handleClassUpdated)
      socket.off('room:ended', handleRoomEnded)
    }
  }, [socket, classId])

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 44,
            height: 44,
            border: '4px solid var(--border-color)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 14px'
          }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading class...</p>
        </div>
      </div>
    )
  }

  const cls = classData?.class || {}
  const isArchived = cls.isActive === false
  const activeSession = classData?.activeSession || null
  const sessions = performance?.sessions || []

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
          eyebrow={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, letterSpacing: '0.04em' }}>CLASS SERIES</span>
              <span style={{ opacity: 0.6 }}>•</span>
              <CodeChip code={cls.code || ''} variant="header" />
              {isArchived ? (
                <Pill tone="#f59e0b">Archived</Pill>
              ) : (
                activeSession && <Pill tone="#10b981" dot>Session Live</Pill>
              )}
            </div>
          }
          title={cls.name || 'Class'}
          subtitle={`Teacher: ${cls.teacher?.name || 'Instructor'} · ${sessions.length} total sessions`}
        >
          <button
            type="button"
            onClick={() => navigate('/student/classes')}
            style={ghostButton({ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 })}
          >
            <ArrowLeft size={14} /> My Classes
          </button>
        </PageHeader>

        <div style={{
          flex: 1,
          padding: isMobile ? '16px' : '28px 32px 32px',
          maxWidth: '100%',
          boxSizing: 'border-box',
          background: pageWash
        }}>
          {isArchived && (
            <div style={{
              padding: '14px 18px',
              borderRadius: 16,
              background: 'color-mix(in srgb, #f59e0b 9%, var(--bg-card))',
              border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}>
              <span style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'color-mix(in srgb, #f59e0b 16%, transparent)',
                color: '#f59e0b',
                flexShrink: 0
              }}>
                <Archive size={18} />
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  This class series has ended
                </div>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Your teacher has archived this class. Past sessions, questions, attendance, and your performance records remain fully accessible.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 14,
              background: 'color-mix(in srgb, #ef4444 12%, var(--bg-card))',
              border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)',
              color: '#ef4444',
              marginBottom: 20,
              fontSize: 14
            }}>
              {error}
            </div>
          )}

          {/* Tab Navigation: Sessions & Roster | Performance */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 24,
            borderBottom: '1px solid var(--border-color)',
            overflowX: 'auto',
            paddingBottom: 2
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('sessions')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: '12px 12px 0 0',
                border: 'none',
                borderBottom: activeTab === 'sessions' ? '3px solid var(--accent)' : '3px solid transparent',
                background: activeTab === 'sessions' ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : 'transparent',
                color: activeTab === 'sessions' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'sessions' ? 750 : 600,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              <Library size={16} /> Sessions & Roster
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('performance')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: '12px 12px 0 0',
                border: 'none',
                borderBottom: activeTab === 'performance' ? '3px solid var(--accent)' : '3px solid transparent',
                background: activeTab === 'performance' ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : 'transparent',
                color: activeTab === 'performance' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'performance' ? 750 : 600,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              <ChartColumn size={16} /> Performance
            </button>
          </div>

          {activeTab === 'sessions' && (
            <>
              {/* Live Session Banner (Real-time update) */}
              {!isArchived && activeSession && (
                <div style={{
                  ...cardStyle(isMobile),
                  background: 'linear-gradient(135deg, color-mix(in srgb, #10b981 12%, var(--bg-card)) 0%, color-mix(in srgb, var(--accent) 8%, var(--bg-card)) 100%)',
                  border: '1px solid color-mix(in srgb, #10b981 35%, var(--border-color))',
                  marginBottom: 28
                }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'flex-start' : 'center',
                    justifyContent: 'space-between',
                    gap: 16
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{
                        width: 48,
                        height: 48,
                        borderRadius: 14,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#10b981',
                        color: '#fff',
                        flexShrink: 0,
                        boxShadow: '0 4px 14px rgba(16,185,129,0.35)'
                      }}>
                        <CircleDot size={24} className="app-pulse" />
                      </span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 17, fontWeight: 750, color: 'var(--text-primary)' }}>
                            {activeSession.name}
                          </span>
                          <Pill tone="#10b981" dot>Live Now</Pill>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--text-secondary)' }}>
                          Your teacher is conducting this session right now. Click below to enter and answer live polls.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate(`/student/session/${activeSession.code}`, { state: { classId, classCode: cls.code, className: cls.name } })}
                      style={primaryButton(false, {
                        width: isMobile ? '100%' : 'auto',
                        padding: '12px 24px',
                        fontSize: 14,
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        boxShadow: '0 6px 18px rgba(16,185,129,0.35)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8
                      })}
                    >
                      <Play size={16} /> Join Live Session
                    </button>
                  </div>
                </div>
              )}

              {/* Class Sessions History */}
              <SectionLabel actions={<span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sessions.length} sessions</span>}>
                Session History
              </SectionLabel>

              <div style={{ ...cardStyle(isMobile), padding: 0, overflow: 'hidden' }}>
                {sessions.length === 0 ? (
                  <div style={{ padding: 32 }}>
                    <EmptyState
                      icon={Library}
                      title="No sessions hosted yet"
                      description="When your teacher launches a session for this class, it will appear here."
                    />
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13.5 }}>
                      <thead>
                        <tr style={{ background: 'color-mix(in srgb, var(--text-secondary) 5%, var(--bg-card))', borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Session</th>
                          <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                          <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Attendance</th>
                          <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score</th>
                          <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.map((sess) => {
                          const isLive = sess.isActive && !sess.endedAt
                          return (
                            <tr
                              key={sess.roomId}
                              style={{
                                borderBottom: '1px solid var(--border-color)',
                                background: isLive ? 'color-mix(in srgb, #10b981 4%, var(--bg-card))' : 'transparent',
                                transition: 'background 0.15s ease'
                              }}
                            >
                              <td style={{ padding: '14px 18px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ fontWeight: 650, color: 'var(--text-primary)' }}>{sess.roomName}</span>
                                  {isLive && <Pill tone="#10b981" dot>Live</Pill>}
                                </div>
                              </td>

                              <td style={{ padding: '14px 18px', color: 'var(--text-secondary)' }}>
                                {sess.date ? new Date(sess.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                              </td>

                              <td style={{ padding: '14px 18px' }}>
                                {sess.status === 'not_enrolled' || sess.status === 'before_join' || sess.isBeforeJoin ? (
                                  <Pill tone="var(--text-secondary)">Before joined</Pill>
                                ) : sess.status === 'during_removal' || sess.isDuringRemoval ? (
                                  <Pill tone="#f59e0b">Removed</Pill>
                                ) : sess.attended ? (
                                  <Pill tone="#10b981">Attended</Pill>
                                ) : (
                                  <Pill tone="var(--text-secondary)">Missed</Pill>
                                )}
                              </td>

                              <td style={{ padding: '14px 18px' }}>
                                {sess.status === 'not_enrolled' || sess.status === 'before_join' || sess.isBeforeJoin ? (
                                  <span style={{ color: 'var(--text-secondary)', fontSize: 12.5, fontStyle: 'italic' }}>Not enrolled yet</span>
                                ) : sess.status === 'during_removal' || sess.isDuringRemoval ? (
                                  <span style={{ color: 'var(--text-secondary)', fontSize: 12.5, fontStyle: 'italic' }}>Not in class</span>
                                ) : sess.attended ? (
                                  sess.totalQuestions === 0 ? (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: 12.5, fontStyle: 'italic' }}>No polls in this session</span>
                                  ) : (
                                    <div>
                                      <div style={{ fontWeight: 650, color: 'var(--text-primary)' }}>
                                        {sess.pollsAttempted} / {sess.totalQuestions} answered
                                      </div>
                                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                                        {sess.pollsAttempted > 0 ? (
                                          <span>{sess.correctCount} / {sess.pollsAttempted} correct ({sess.accuracy}%)</span>
                                        ) : (
                                          <span>0 answered</span>
                                        )}
                                        {sess.pollsMissed > 0 && (
                                          <span style={{ color: '#f59e0b' }}> · {sess.pollsMissed} missed</span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                ) : (
                                  <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
                                )}
                              </td>

                              <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                                {isLive ? (
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/student/session/${sess.roomCode}`, { state: { classId, classCode: cls.code, className: cls.name } })}
                                    style={primaryButton(false, {
                                      padding: '6px 12px',
                                      fontSize: 12.5,
                                      background: 'linear-gradient(135deg, #10b981, #059669)'
                                    })}
                                  >
                                    Join
                                  </button>
                                ) : sess.attended ? (
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/student/room/${sess.roomId}/results`)}
                                    style={ghostButton({ padding: '6px 12px', fontSize: 12.5 })}
                                  >
                                    View Results
                                  </button>
                                ) : (
                                  <span style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>Ended</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'performance' && (
            <StudentPerformancePage embedded classId={classId} />
          )}
        </div>
      </div>
    </div>

  )
}
