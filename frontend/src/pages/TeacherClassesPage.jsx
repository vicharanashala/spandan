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
  ChoiceCard,
  Pill,
  EmptyState,
  CodeChip
} from '../components/AppUI'
import { StatTile, TileGrid, SectionLabel, SectionHeader, cardStyle } from '../components/InsightUI'
import { School, Plus, Users, Library, CircleDot, Sparkles, X, ChevronRight, Mic, Clapperboard, Clock } from 'lucide-react'
import { renderIcon } from '../components/icons'

export default function TeacherClassesPage() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { socket } = useSocketStore()
  const isMobile = useIsMobile()

  const [classes, setClasses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [newClassMode, setNewClassMode] = useState('normal')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchClasses = async () => {
    try {
      const data = await classApi.getAll()
      setClasses(data.classes || [])
    } catch (err) {
      console.error('Failed to load classes:', err)
      setError(err.message || 'Failed to load classes')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      fetchClasses()
    }
  }, [token])

  // Real-time socket updates: automatically refresh classes when teacher creates session, student joins, etc.
  useEffect(() => {
    if (!socket) return

    const handleClassCreated = () => fetchClasses()
    const handleClassUpdated = () => fetchClasses()
    const handleSessionStarted = () => fetchClasses()
    const handleMemberUpdated = () => fetchClasses()

    socket.on('class:created', handleClassCreated)
    socket.on('class:updated', handleClassUpdated)
    socket.on('class:session-started', handleSessionStarted)
    socket.on('class:member-updated', handleMemberUpdated)

    return () => {
      socket.off('class:created', handleClassCreated)
      socket.off('class:updated', handleClassUpdated)
      socket.off('class:session-started', handleSessionStarted)
      socket.off('class:member-updated', handleMemberUpdated)
    }
  }, [socket])

  const handleCreateClass = async (e) => {
    e?.preventDefault()
    if (!newClassName.trim() || isSubmitting) return

    setIsSubmitting(true)
    setError(null)
    try {
      const res = await classApi.create(newClassName.trim(), { mode: newClassMode })
      setNewClassName('')
      setNewClassMode('normal')
      setShowCreateModal(false)
      await fetchClasses()
      if (res?.class?._id) {
        navigate(`/teacher/classes/${res.class._id}`)
      }
    } catch (err) {
      setError(err.message || 'Failed to create class')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Aggregated overview stats
  const totalClasses = classes.length
  const liveSessions = classes.filter(c => c.activeSession).length
  const hasAnyLiveClassSession = classes.some(c => c.activeSession)
  const totalEnrolled = classes.reduce((sum, c) => sum + (c.totalMembers || 0), 0)
  const totalSessionsRun = classes.reduce((sum, c) => sum + (c.totalSessions || 0), 0)

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
          eyebrow="Recurring Class Series"
          title="Classes"
          subtitle="Manage recurring classes, student rosters, and session series"
        >
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            style={primaryButton(false, { display: 'inline-flex', alignItems: 'center', gap: 8 })}
          >
            <Plus size={16} /> New Class
          </button>
        </PageHeader>

        <div style={{
          flex: 1,
          padding: isMobile ? '16px' : '28px 32px 32px',
          maxWidth: '100%',
          boxSizing: 'border-box',
          background: pageWash
        }}>
          {hasAnyLiveClassSession && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 14,
              background: 'color-mix(in srgb, #f59e0b 12%, var(--bg-card))',
              border: '1px solid color-mix(in srgb, #f59e0b 35%, transparent)',
              color: '#d97706',
              marginBottom: 20,
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}>
              <CircleDot size={18} className="app-pulse" color="#d97706" />
              <span>You have a live class session in progress. End the current live session first.</span>
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
              fontSize: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
          )}

          <SectionLabel>Overview</SectionLabel>
          <TileGrid isMobile={isMobile} cols={4} tour="class-stats">
            <StatTile
              icon={School}
              label="Total classes"
              value={totalClasses}
              sub={`${liveSessions} live right now`}
              tint="var(--accent)"
              isMobile={isMobile}
            />
            <StatTile
              icon={CircleDot}
              label="Live sessions"
              value={liveSessions}
              sub={liveSessions ? 'Active sessions running' : 'None live'}
              tint="#10b981"
              tone={liveSessions ? '#10b981' : undefined}
              isMobile={isMobile}
            />
            <StatTile
              icon={Users}
              label="Total enrolled"
              value={totalEnrolled}
              sub="Across all classes"
              tint="#8b5cf6"
              isMobile={isMobile}
            />
            <StatTile
              icon={Library}
              label="Total sessions"
              value={totalSessionsRun}
              sub={totalClasses ? `${(totalSessionsRun / totalClasses).toFixed(1)} per class` : 'Sessions hosted'}
              tint="#0ea5e9"
              isMobile={isMobile}
            />
          </TileGrid>

          <SectionLabel>Your Classes</SectionLabel>

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
          ) : classes.length === 0 ? (
            <EmptyState
              icon={School}
              title="No classes yet"
              description="Create recurring class series like 'DBMS 2026' or 'Linear Algebra'. Students enroll once and stay across every live session."
            >
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                style={primaryButton(false, { display: 'inline-flex', alignItems: 'center', gap: 8 })}
              >
                <Plus size={16} /> Create Your First Class
              </button>
            </EmptyState>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16
            }}>
              {classes.map((cls) => {
                const isArchived = cls.isActive === false
                const hasLive = !isArchived && !!cls.activeSession
                return (
                  <div
                    key={cls._id}
                    className="app-card app-card--hover"
                    onClick={() => navigate(`/teacher/classes/${cls._id}`)}
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
                          : hasLive
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
                            : hasLive
                              ? 'color-mix(in srgb, #10b981 12%, transparent)'
                              : 'color-mix(in srgb, var(--accent) 12%, transparent)',
                          color: isArchived ? '#f59e0b' : hasLive ? '#10b981' : 'var(--accent)',
                          border: `1px solid ${isArchived ? 'color-mix(in srgb, #f59e0b 25%, transparent)' : hasLive ? 'color-mix(in srgb, #10b981 25%, transparent)' : 'color-mix(in srgb, var(--accent) 25%, transparent)'}`
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
                            letterSpacing: '-0.01em',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={cls.name}
                        >
                          {cls.name}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          <CodeChip code={cls.code} />
                          {isArchived ? (
                            <Pill tone="#f59e0b">Archived</Pill>
                          ) : (
                            <>
                              {hasLive && (
                                <Pill tone="#10b981" dot>Live Session</Pill>
                              )}
                              {cls.pendingRequests > 0 && (
                                <Pill tone="#f59e0b">{cls.pendingRequests} pending</Pill>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      fontSize: 12.5,
                      color: 'var(--text-secondary)',
                      paddingTop: 4
                    }}>
                      <span><strong>{cls.totalSessions || 0}</strong> {cls.totalSessions === 1 ? 'session' : 'sessions'}</span>
                      <span>•</span>
                      <span><strong>{cls.totalMembers || 0}</strong> {cls.totalMembers === 1 ? 'student' : 'students'}</span>
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 'auto',
                      paddingTop: 8,
                      borderTop: '1px solid var(--border-color)'
                    }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)' }}>
                        Manage Class
                      </span>
                      <ChevronRight size={16} color="var(--accent)" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Solid Opaque Background Create Class Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: '100%',
            maxWidth: 480,
            background: 'var(--bg-card)', // Solid opaque background
            borderRadius: 20,
            border: '1px solid var(--border-color)',
            boxShadow: '0 20px 45px rgba(0,0,0,0.22)',
            overflow: 'hidden',
            boxSizing: 'border-box'
          }}>
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                  color: 'var(--accent)'
                }}>
                  <School size={18} />
                </span>
                <div>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Create New Class</h2>
                  <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>A recurring series for all your lecture sessions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateClass} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Class Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="e.g. Distributed Systems 2026, Physics 101"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  style={inputStyle()}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Default Teaching Mode
                </label>
                <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
                  <ChoiceCard
                    icon={Mic}
                    title="Live Audio"
                    description="Live mic transcript"
                    active={newClassMode === 'normal'}
                    onClick={() => setNewClassMode('normal')}
                  />
                  <ChoiceCard
                    icon={Clapperboard}
                    title="Video Mode"
                    description="YouTube lecture link"
                    active={newClassMode === 'video'}
                    onClick={() => setNewClassMode('video')}
                  />
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 10,
                marginTop: 8,
                paddingTop: 16,
                borderTop: '1px solid var(--border-color)'
              }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={ghostButton()}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={primaryButton(!newClassName.trim() || isSubmitting)}
                  disabled={!newClassName.trim() || isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
