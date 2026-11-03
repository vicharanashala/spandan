import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useIsMobile from '../hooks/useIsMobile'
import Sidebar from '../components/Sidebar'
import { API_URL } from '../config.js'
import { classApi } from '../lib/api'
import { downloadText, safeFilename } from '../lib/questionsExport'
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
import {
  School,
  ArrowLeft,
  Download,
  Plus,
  Play,
  Check,
  X,
  Users,
  Library,
  ChartColumn,
  MessageSquare,
  Clock,
  Eye,
  UserX,
  UserCheck,
  CircleAlert,
  Mic,
  Clapperboard,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Award,
  CircleDot,
  Archive,
  ArchiveRestore
} from 'lucide-react'
import { Ico, renderIcon } from '../components/icons'


export default function TeacherClassDetailPage() {
  const { id: classId } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { socket } = useSocketStore()
  const isMobile = useIsMobile()

  const [classData, setClassData] = useState(null)
  const [sessions, setSessions] = useState([])
  const [stats, setStats] = useState(null)
  const [membersData, setMembersData] = useState({ active: [], pending: [], removed: [], totalClassSessions: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('sessions') // 'sessions' | 'performance'

  // Start Session Modal
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [sessionMode, setSessionMode] = useState('normal')
  const [videoUrl, setVideoUrl] = useState('')
  const [isStartingSession, setIsStartingSession] = useState(false)

  // Compact student list pagination ("Show more")
  const [showAllStudents, setShowAllStudents] = useState(false)
  const INITIAL_STUDENT_COUNT = 7

  // Person-wise performance panel
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentPerfLoading, setStudentPerfLoading] = useState(false)
  const [studentPerformance, setStudentPerformance] = useState(null)

  // Remove confirmation modal
  const [studentToRemove, setStudentToRemove] = useState(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [allClasses, setAllClasses] = useState([])

  // Archive class modal & loading
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)

  const fetchClassDetails = async () => {
    try {
      const [clsRes, sessRes, statsRes, memRes, classesRes] = await Promise.all([
        classApi.getById(classId),
        classApi.getSessions(classId),
        classApi.getStats(classId),
        classApi.getMembers(classId),
        classApi.getAll().catch(() => ({ classes: [] }))
      ])

      setClassData(clsRes)
      setSessions(sessRes.sessions || [])
      setStats(statsRes.stats || null)
      setMembersData(memRes || { active: [], pending: [], removed: [], totalClassSessions: 0 })
      setAllClasses(classesRes?.classes || [])
    } catch (err) {
      console.error('Failed to load class details:', err)
      setError(err.message || 'Failed to load class details')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (token && classId) {
      fetchClassDetails()
    }
  }, [token, classId])

  // Real-time socket updates for sessions, membership changes, etc.
  useEffect(() => {
    if (!socket || !classId) return

    socket.emit('class:join', { classId })

    const handleSessionStarted = (data) => {
      fetchClassDetails()
    }

    const handleClassUpdated = (data) => {
      fetchClassDetails()
    }

    const handleMemberUpdated = (data) => {
      if (String(data.classId) === String(classId)) {
        fetchClassDetails()
      }
    }

    socket.on('class:session-started', handleSessionStarted)
    socket.on('class:updated', handleClassUpdated)
    socket.on('class:member-updated', handleMemberUpdated)

    return () => {
      socket.emit('class:leave', { classId })
      socket.off('class:session-started', handleSessionStarted)
      socket.off('class:updated', handleClassUpdated)
      socket.off('class:member-updated', handleMemberUpdated)
    }
  }, [socket, classId])

  const handleStartSession = async (e) => {
    e?.preventDefault()
    if (!sessionName.trim() || isStartingSession) return
    if (cls.isActive === false) {
      setError('This class is archived. Restore it to start new sessions.')
      return
    }
    if (hasAnyLiveClassSession) {
      setError('End the current live session first.')
      return
    }

    setIsStartingSession(true)
    setError(null)
    try {
      const payload = {
        name: sessionName.trim(),
        settings: {
          mode: sessionMode,
          ...(sessionMode === 'video' ? { videoUrl: videoUrl.trim() } : {})
        }
      }
      const res = await classApi.createSession(classId, payload)
      setShowSessionModal(false)
      setSessionName('')
      setVideoUrl('')
      // Navigate directly into the newly started session
      if (res?.room?._id) {
        navigate(`/teacher/room/${res.room._id}`)
      } else {
        await fetchClassDetails()
      }
    } catch (err) {
      setError(err.message || 'Failed to start session')
    } finally {
      setIsStartingSession(false)
    }
  }

  const handleArchiveClass = async () => {
    setIsArchiving(true)
    setError(null)
    try {
      await classApi.archive(classId)
      setShowArchiveModal(false)
      await fetchClassDetails()
    } catch (err) {
      setError(err.message || 'Failed to archive class')
    } finally {
      setIsArchiving(false)
    }
  }

  const handleRestoreClass = async () => {
    setIsArchiving(true)
    setError(null)
    try {
      await classApi.restore(classId)
      await fetchClassDetails()
    } catch (err) {
      setError(err.message || 'Failed to restore class')
    } finally {
      setIsArchiving(false)
    }
  }

  const handleMemberAction = async (studentId, action) => {
    try {
      await classApi.updateMember(classId, studentId, action)
      await fetchClassDetails()
      if (selectedStudent?._id === studentId) {
        setSelectedStudent(null)
        setStudentPerformance(null)
      }
    } catch (err) {
      setError(err.message || `Failed to ${action} member`)
    }
  }

  const handleConfirmRemove = async () => {
    if (!studentToRemove) return
    setIsRemoving(true)
    try {
      await classApi.updateMember(classId, studentToRemove.studentId || studentToRemove._id, 'remove')
      setStudentToRemove(null)
      await fetchClassDetails()
    } catch (err) {
      setError(err.message || 'Failed to remove member')
    } finally {
      setIsRemoving(false)
    }
  }

  const handleViewPerformance = async (student) => {
    setSelectedStudent(student)
    setStudentPerfLoading(true)
    try {
      const perf = await classApi.getMemberPerformance(classId, student.studentId || student._id)
      setStudentPerformance(perf)
    } catch (err) {
      console.error('Failed to load student performance:', err)
      setError('Could not load student performance details')
    } finally {
      setStudentPerfLoading(false)
    }
  }

  const handleExportClassCsv = async () => {
    try {
      const res = await fetch(`${API_URL}/classes/${classId}/export`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to export class data')
      const text = await res.text()
      const clsName = classData?.class?.name || 'class'
      const code = classData?.class?.code || ''
      downloadText(`Spandan_Class_${safeFilename(clsName)}_${code}_Roster.csv`, text, 'text/csv')
    } catch (err) {
      setError(err.message || 'Export failed')
    }
  }

  const handleExportSessionCsv = async (sessionId, sessionName, sessionCode) => {
    try {
      const res = await fetch(`${API_URL}/responses/room/${sessionId}/export`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to export session data')
      const text = await res.text()
      const exportCode = sessionCode || classData?.class?.code || ''
      downloadText(`Spandan_Session_${safeFilename(sessionName || 'session')}${exportCode ? `_${exportCode}` : ''}.csv`, text, 'text/csv')
    } catch (err) {
      setError(err.message || 'Export failed')
    }
  }

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
  const hasActiveSession = !!activeSession
  const teacherActiveSession = classData?.teacherActiveSession || null
  const hasAnyLiveClassSession = Boolean(
    classData?.hasAnyLiveClassSession ||
    hasActiveSession ||
    (allClasses && allClasses.some(c => c.activeSession))
  )
  const otherClassActiveSession = !hasActiveSession && hasAnyLiveClassSession
  const activeElsewhereRoomId = teacherActiveSession?._id || allClasses.find(c => c.activeSession)?.activeSession?._id

  const activeMembers = membersData.active || []
  const pendingMembers = membersData.pending || []
  const visibleStudents = showAllStudents ? activeMembers : activeMembers.slice(0, INITIAL_STUDENT_COUNT)

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
        {/* PageHeader with Class Name + Code (Copy) */}
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
                hasActiveSession && <Pill tone="#10b981" dot>Session Live</Pill>
              )}
            </div>
          }
          title={cls.name || 'Class'}
          subtitle={`${sessions.length} total sessions · ${activeMembers.length} enrolled students`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => navigate('/teacher/classes')}
              style={ghostButton({ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 })}
            >
              <ArrowLeft size={14} /> Classes
            </button>
            {isArchived ? (
              <button
                type="button"
                onClick={handleRestoreClass}
                disabled={isArchiving}
                style={primaryButton(isArchiving, { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 })}
              >
                <ArchiveRestore size={14} /> {isArchiving ? 'Restoring...' : 'Restore class'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowArchiveModal(true)}
                disabled={hasActiveSession || isArchiving}
                title={hasActiveSession ? 'End active session before archiving' : 'Archive this class series'}
                style={ghostButton({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  color: hasActiveSession ? 'var(--text-secondary)' : '#f59e0b',
                  borderColor: hasActiveSession ? 'var(--border-color)' : 'color-mix(in srgb, #f59e0b 35%, transparent)'
                })}
              >
                <Archive size={14} /> Archive class
              </button>
            )}
          </div>
        </PageHeader>

        <div style={{
          flex: 1,
          padding: isMobile ? '16px' : '28px 32px 32px',
          maxWidth: '100%',
          boxSizing: 'border-box',
          background: pageWash
        }}>
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

          {/* 1. Stat Tiles: sessions, enrolled, questions, responses */}
          <SectionLabel>Class Overview</SectionLabel>
          <TileGrid isMobile={isMobile} cols={4} tour="class-detail-stats">
            <StatTile
              icon={Library}
              label="Sessions Hosted"
              value={stats?.totalSessions ?? sessions.length}
              sub={hasActiveSession ? '1 live right now' : 'All completed'}
              tint="var(--accent)"
              isMobile={isMobile}
            />
            <StatTile
              icon={Users}
              label="Enrolled Students"
              value={stats?.totalMembers ?? activeMembers.length}
              sub={pendingMembers.length > 0 ? `${pendingMembers.length} pending approval` : 'Active roster'}
              tint="#10b981"
              isMobile={isMobile}
            />
            <StatTile
              icon={ChartColumn}
              label="Questions Asked"
              value={stats?.totalQuestions ?? 0}
              sub={sessions.length ? `${Math.round(((stats?.totalQuestions ?? 0) / Math.max(sessions.length, 1)) * 10) / 10} avg per session` : 'Across sessions'}
              tint="#8b5cf6"
              isMobile={isMobile}
            />
            <StatTile
              icon={MessageSquare}
              label="Total Responses"
              value={(stats?.totalResponses ?? 0).toLocaleString()}
              sub={`Accuracy: ${stats?.averageAccuracy ?? 0}%`}
              tint="#0ea5e9"
              isMobile={isMobile}
            />
          </TileGrid>

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
              {/* 2. Start New Session Guard & Actions */}
              <SectionLabel>Live Session Control</SectionLabel>

          <div style={{ ...cardStyle(isMobile), marginBottom: 28 }}>
            <SectionHeader
              icon={Play}
              title="Session Manager"
              hint={
                isArchived
                  ? 'This class series is archived. Past sessions, attendance, and performance records are preserved. Restore this class to start new sessions.'
                  : hasActiveSession
                    ? 'A live session is currently active for this class. Only one active session is permitted at a time.'
                    : hasAnyLiveClassSession
                      ? 'A live class session is currently in progress. End the current live session first.'
                      : 'Start a new session under this class. Enrolled students will be notified live and can join with one click.'
              }
            />

            {isArchived ? (
              <div style={{
                padding: '16px 20px',
                borderRadius: 16,
                background: 'color-mix(in srgb, #f59e0b 8%, var(--bg-card))',
                border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: 14
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'color-mix(in srgb, #f59e0b 16%, transparent)',
                    color: '#f59e0b',
                    flexShrink: 0
                  }}>
                    <Archive size={20} />
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 750, color: 'var(--text-primary)' }}>
                        Class Series Archived
                      </span>
                      <Pill tone="#f59e0b">Archived</Pill>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                      All history, attendance, and analytics are preserved. Restore this class to launch new live sessions.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRestoreClass}
                  disabled={isArchiving}
                  style={primaryButton(isArchiving, {
                    flex: isMobile ? 1 : 'initial',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13.5
                  })}
                >
                  <ArchiveRestore size={16} /> {isArchiving ? 'Restoring...' : 'Restore class'}
                </button>
              </div>
            ) : hasActiveSession ? (
              <div style={{
                padding: '16px 20px',
                borderRadius: 16,
                background: 'color-mix(in srgb, #10b981 9%, var(--bg-card))',
                border: '1px solid color-mix(in srgb, #10b981 30%, transparent)',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: 14
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#10b981',
                    color: '#fff',
                    flexShrink: 0
                  }}>
                    <CircleDot size={20} className="app-pulse" />
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 750, color: 'var(--text-primary)' }}>
                        {activeSession.name}
                      </span>
                      <Pill tone="#10b981" dot>Live Now</Pill>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: '#059669', fontWeight: 600 }}>
                      End the current live session first.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: isMobile ? '100%' : 'auto' }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/teacher/room/${activeSession._id}`)}
                    style={primaryButton(false, {
                      flex: isMobile ? 1 : 'initial',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
                      padding: '10px 18px',
                      fontSize: 13.5
                    })}
                  >
                    Open Live Room
                  </button>
                  <button
                    type="button"
                    disabled
                    title="End the current live session first"
                    style={primaryButton(true, {
                      flex: isMobile ? 1 : 'initial',
                      padding: '10px 16px',
                      fontSize: 13.5
                    })}
                  >
                    Start New Session
                  </button>
                </div>
              </div>
            ) : otherClassActiveSession ? (
              <div style={{
                padding: '16px 20px',
                borderRadius: 16,
                background: 'color-mix(in srgb, #f59e0b 9%, var(--bg-card))',
                border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: 14
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f59e0b',
                    color: '#fff',
                    flexShrink: 0
                  }}>
                    <CircleDot size={20} className="app-pulse" />
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 750, color: 'var(--text-primary)' }}>
                        Live Session In Another Class
                      </span>
                      <Pill tone="#f59e0b" dot>Active elsewhere</Pill>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: '#d97706', fontWeight: 600 }}>
                      End the current live session first.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: isMobile ? '100%' : 'auto' }}>
                  {activeElsewhereRoomId && (
                    <button
                      type="button"
                      onClick={() => navigate(`/teacher/room/${activeElsewhereRoomId}`)}
                      style={primaryButton(false, {
                        flex: isMobile ? 1 : 'initial',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        boxShadow: '0 4px 14px rgba(245,158,11,0.35)',
                        padding: '10px 18px',
                        fontSize: 13.5
                      })}
                    >
                      Open Live Room
                    </button>
                  )}
                  <button
                    type="button"
                    disabled
                    title="End the current live session first"
                    style={primaryButton(true, {
                      flex: isMobile ? 1 : 'initial',
                      padding: '10px 16px',
                      fontSize: 13.5
                    })}
                  >
                    Start New Session
                  </button>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                padding: '14px 18px',
                borderRadius: 16,
                background: 'var(--input-bg)',
                border: '1px solid var(--border-color)'
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-primary)' }}>
                    Ready to teach?
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Click below to launch today's interactive session.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSessionName(`${cls.name} - Lecture ${sessions.length + 1}`)
                    setShowSessionModal(true)
                  }}
                  style={primaryButton(false, { display: 'inline-flex', alignItems: 'center', gap: 8 })}
                >
                  <Plus size={16} /> Start New Session
                </button>
              </div>
            )}
          </div>

          {/* 3. Sessions List (Live + Past) with per-session Download CSV */}
          <SectionLabel actions={<span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sessions.length} sessions</span>}>
            Class Sessions
          </SectionLabel>

          <div style={{ ...cardStyle(isMobile), padding: 0, overflow: 'hidden', marginBottom: 28 }}>
            {sessions.length === 0 ? (
              <div style={{ padding: 32 }}>
                <EmptyState
                  icon={Library}
                  title="No sessions hosted yet"
                  description="When you start a session, it will be catalogued here along with its questions, attendance, and downloadable results."
                />
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ background: 'color-mix(in srgb, var(--text-secondary) 5%, var(--bg-card))', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Session</th>
                      <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                      <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                      <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Questions</th>
                      <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Responses</th>
                      <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((sess) => {
                      const isLive = sess.isActive && !sess.endedAt
                      return (
                        <tr
                          key={sess._id}
                          style={{
                            borderBottom: '1px solid var(--border-color)',
                            background: isLive ? 'color-mix(in srgb, #10b981 4%, var(--bg-card))' : 'transparent',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontWeight: 650, color: 'var(--text-primary)' }}>{sess.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '14px 18px' }}>
                            {isLive ? (
                              <Pill tone="#10b981" dot>Live</Pill>
                            ) : (
                              <Pill tone="var(--text-secondary)">Completed</Pill>
                            )}
                          </td>
                          <td style={{ padding: '14px 18px', color: 'var(--text-secondary)' }}>
                            {sess.createdAt ? new Date(sess.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </td>
                          <td style={{ padding: '14px 18px', color: 'var(--text-primary)', fontWeight: 600 }}>
                            {sess.questionCount || 0}
                          </td>
                          <td style={{ padding: '14px 18px', color: 'var(--text-primary)', fontWeight: 600 }}>
                            {sess.responseCount || 0}
                          </td>
                          <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              {isLive ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/teacher/room/${sess._id}`)}
                                  style={primaryButton(false, {
                                    padding: '6px 12px',
                                    fontSize: 12.5,
                                    background: 'linear-gradient(135deg, #10b981, #059669)'
                                  })}
                                >
                                  Resume
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => navigate(`/teacher/room/${sess._id}/results`)}
                                    style={ghostButton({ padding: '6px 12px', fontSize: 12.5 })}
                                  >
                                    Results
                                  </button>
                                  <button
                                    type="button"
                                    title="Download Session CSV"
                                    onClick={() => handleExportSessionCsv(sess._id, sess.name, cls.code)}
                                    style={ghostButton({
                                      padding: '6px 10px',
                                      fontSize: 12.5,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4
                                    })}
                                  >
                                    <Download size={13} /> CSV
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. People Section = Compact List + Show More + Performance Panel + Pending Requests */}
          <SectionLabel actions={<span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{activeMembers.length} active</span>}>
            People & Attendance
          </SectionLabel>

          {/* Pending Requests Section (approval required on re-join) */}
          {pendingMembers.length > 0 && (
            <div style={{
              ...cardStyle(isMobile),
              border: '1px solid color-mix(in srgb, #f59e0b 35%, var(--border-color))',
              background: 'color-mix(in srgb, #f59e0b 6%, var(--bg-card))',
              marginBottom: 20
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <CircleAlert size={18} color="#f59e0b" />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Pending Re-Join Requests ({pendingMembers.length})
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Students who previously left/were removed and entered the class code again.
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingMembers.map((req) => (
                  <div
                    key={req._id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: 'var(--accent-gradient)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 13
                      }}>
                        {req.name?.charAt(0)?.toUpperCase() || 'S'}
                      </div>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>{req.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{req.email}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleMemberAction(req.studentId || req._id, 'approve')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 10,
                          fontSize: 12.5,
                          fontWeight: 650,
                          cursor: 'pointer',
                          border: 'none',
                          background: '#10b981',
                          color: '#fff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <UserCheck size={14} /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMemberAction(req.studentId || req._id, 'reject')}
                        style={ghostButton({
                          padding: '6px 12px',
                          fontSize: 12.5,
                          color: '#ef4444',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        })}
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Enrolled Students: Roster Table */}
          <div style={{ ...cardStyle(isMobile), padding: 0, overflow: 'hidden' }}>
            {activeMembers.length === 0 ? (
              <div style={{ padding: 32 }}>
                <EmptyState
                  icon={Users}
                  title="No students enrolled yet"
                  description={`Share the 6-character class code with your students to have them join:`}
                >
                  <div style={{ marginTop: 12 }}>
                    <CodeChip code={cls.code || ''} />
                  </div>
                </EmptyState>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ background: 'color-mix(in srgb, var(--text-secondary) 5%, var(--bg-card))', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Student</th>
                      {!isMobile && <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</th>}
                      <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                      <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeMembers.map((student) => (
                      <tr
                        key={student._id}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <td style={{ padding: '12px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              background: 'var(--accent-gradient)',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: 13,
                              flexShrink: 0
                            }}>
                              {student.name?.charAt(0)?.toUpperCase() || 'S'}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 650, color: 'var(--text-primary)' }}>{student.name}</div>
                              {isMobile && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{student.email}</div>}
                            </div>
                          </div>
                        </td>

                        {!isMobile && (
                          <td style={{ padding: '12px 18px', color: 'var(--text-secondary)', fontSize: 13 }}>
                            {student.email}
                          </td>
                        )}

                        <td style={{ padding: '12px 18px' }}>
                          <Pill tone="#10b981">Active</Pill>
                        </td>

                        <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleViewPerformance(student)}
                              title="View detailed performance"
                              style={ghostButton({
                                padding: '5px 10px',
                                fontSize: 12.5,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              })}
                            >
                              <Eye size={13} /> View
                            </button>
                            <button
                              type="button"
                              onClick={() => setStudentToRemove(student)}
                              title="Remove student from class (retaining historical data)"
                              style={ghostButton({
                                padding: '5px 10px',
                                fontSize: 12.5,
                                color: '#ef4444',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              })}
                            >
                              <UserX size={13} /> Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </>
          )}

          {activeTab === 'performance' && (
            <>
              {/* Performance Tab Header + Export CSV Action */}
              <div style={{
                display: 'flex',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                flexDirection: isMobile ? 'column' : 'row',
                gap: 16,
                marginBottom: 20
              }}>
                <div>
                  <SectionLabel style={{ margin: 0 }}>Class Performance & Analytics</SectionLabel>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                    Track student engagement, attendance rate, and response accuracy across all completed sessions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportClassCsv}
                  title="Download whole class roster and performance as CSV"
                  style={primaryButton(false, {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 18px',
                    fontSize: 13.5
                  })}
                >
                  <Download size={15} /> Export CSV
                </button>
              </div>

              {/* Summary Tiles from existing stats */}
              <TileGrid isMobile={isMobile} cols={3} style={{ marginBottom: 24 }}>
                <StatTile
                  icon={Users}
                  label="Enrolled Students"
                  value={activeMembers.length}
                  sub="Active class members"
                  tint="var(--accent)"
                  isMobile={isMobile}
                />
                <StatTile
                  icon={Library}
                  label="Average Attendance"
                  value={`${membersData.avgAttendance ?? stats?.avgAttendance ?? (activeMembers.length > 0 ? Math.round(activeMembers.reduce((sum, m) => sum + (m.attendanceRate ?? (m.sessionsPossible > 0 ? Math.round((m.sessionsAttended / m.sessionsPossible) * 100) : 0)), 0) / activeMembers.length) : 0)}%`}
                  sub={`${sessions.length} total sessions hosted`}
                  tint="#10b981"
                  isMobile={isMobile}
                />
                <StatTile
                  icon={Award}
                  label="Class Accuracy"
                  value={`${stats?.averageAccuracy ?? (activeMembers.reduce((acc, m) => acc + (m.pollsAttempted || 0), 0) > 0 ? Math.round((activeMembers.reduce((acc, m) => acc + (m.correctCount || 0), 0) / activeMembers.reduce((acc, m) => acc + (m.pollsAttempted || 0), 0)) * 100) : 0)}%`}
                  sub={`${activeMembers.reduce((acc, m) => acc + (m.pollsAttempted || 0), 0)} total polls attempted`}
                  tint="#8b5cf6"
                  isMobile={isMobile}
                />
              </TileGrid>

              {/* Whole-Class Performance List */}
              <SectionLabel actions={<span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{activeMembers.length} students</span>}>
                Student Performance Breakdown
              </SectionLabel>

              <div style={{ ...cardStyle(isMobile), padding: 0, overflow: 'hidden' }}>
                {activeMembers.length === 0 ? (
                  <div style={{ padding: 32 }}>
                    <EmptyState
                      icon={Award}
                      title="No student performance data"
                      description="Once students join and participate in class sessions, their performance metrics will appear here."
                    />
                  </div>
                ) : (
                  <div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13.5 }}>
                        <thead>
                          <tr style={{ background: 'color-mix(in srgb, var(--text-secondary) 5%, var(--bg-card))', borderBottom: '1px solid var(--border-color)' }}>
                            <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Student</th>
                            {!isMobile && <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</th>}
                            <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sessions Attended</th>
                            <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Polls Attempted</th>
                            <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Correct (Count + %)</th>
                            <th style={{ padding: '14px 18px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleStudents.map((student) => {
                            const totalSess = membersData.totalClassSessions || sessions.length || 0
                            return (
                              <tr
                                key={student._id}
                                style={{
                                  borderBottom: '1px solid var(--border-color)',
                                  transition: 'background 0.15s ease'
                                }}
                              >
                                <td style={{ padding: '12px 18px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: '50%',
                                      background: 'var(--accent-gradient)',
                                      color: '#fff',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontWeight: 700,
                                      fontSize: 13,
                                      flexShrink: 0
                                    }}>
                                      {student.name?.charAt(0)?.toUpperCase() || 'S'}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontWeight: 650, color: 'var(--text-primary)' }}>{student.name}</div>
                                      {isMobile && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{student.email}</div>}
                                    </div>
                                  </div>
                                </td>

                                {!isMobile && (
                                  <td style={{ padding: '12px 18px', color: 'var(--text-secondary)', fontSize: 13 }}>
                                    {student.email}
                                  </td>
                                )}

                                <td style={{ padding: '12px 18px', color: 'var(--text-primary)' }}>
                                  <div style={{ fontWeight: 650 }}>
                                    {student.sessionsAttended} / {student.sessionsPossible ?? totalSess}
                                  </div>
                                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                                    {student.attendanceRate ?? (student.sessionsPossible > 0 ? Math.round((student.sessionsAttended / student.sessionsPossible) * 100) : 0)}% rate
                                    {student.sessionsPossible != null && student.sessionsPossible < totalSess && (
                                      <span> · {student.sessionsAttended}/{totalSess} total</span>
                                    )}
                                  </div>
                                </td>

                                <td style={{ padding: '12px 18px', color: 'var(--text-primary)' }}>
                                  <div style={{ fontWeight: 650 }}>
                                    {student.pollsAttempted}
                                    {student.pollsLaunched != null && student.pollsLaunched > 0 && (
                                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                                        {' '}/ {student.pollsLaunched}
                                      </span>
                                    )}
                                  </div>
                                  {student.pollsMissed != null && student.pollsMissed > 0 ? (
                                    <div style={{ fontSize: 11.5, color: '#f59e0b', marginTop: 2 }}>
                                      {student.pollsMissed} missed
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                                      attempted
                                    </div>
                                  )}
                                </td>

                                <td style={{ padding: '12px 18px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontWeight: 650, color: 'var(--text-primary)' }}>
                                      {student.correctCount}
                                    </span>
                                    <Pill tone={student.accuracy >= 70 ? '#10b981' : student.accuracy >= 40 ? '#f59e0b' : 'var(--text-secondary)'}>
                                      {student.accuracy}%
                                    </Pill>
                                  </div>
                                </td>

                                <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleViewPerformance(student)}
                                    title="View detailed performance"
                                    style={ghostButton({
                                      padding: '5px 10px',
                                      fontSize: 12.5,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4
                                    })}
                                  >
                                    <Eye size={13} /> View
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Show more / Show less toggle */}
                    {activeMembers.length > INITIAL_STUDENT_COUNT && (
                      <div style={{
                        padding: '12px 18px',
                        borderTop: '1px solid var(--border-color)',
                        background: 'var(--input-bg)',
                        textAlign: 'center'
                      }}>
                        <button
                          type="button"
                          onClick={() => setShowAllStudents(!showAllStudents)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent)',
                            fontWeight: 650,
                            fontSize: 13.5,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          {showAllStudents ? (
                            <>Show less <ChevronUp size={16} /></>
                          ) : (
                            <>Show more ({activeMembers.length - INITIAL_STUDENT_COUNT} more) <ChevronDown size={16} /></>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>


      {/* Slide-over / Modal: Person-Wise Performance Panel */}
      {selectedStudent && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 85,
          display: 'flex',
          alignItems: 'center',
          justifyContent: isMobile ? 'center' : 'flex-end',
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: isMobile ? '100%' : '520px',
            maxWidth: '100%',
            height: isMobile ? '90vh' : '100vh',
            background: 'var(--bg-card)', // Solid opaque background
            borderLeft: isMobile ? 'none' : '1px solid var(--border-color)',
            borderRadius: isMobile ? '20px 20px 0 0' : 0,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-10px 0 35px rgba(0,0,0,0.22)',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'var(--accent-gradient)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 16
                }}>
                  {selectedStudent.name?.charAt(0)?.toUpperCase() || 'S'}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedStudent.name}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    {selectedStudent.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedStudent(null); setStudentPerformance(null) }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
              {studentPerfLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    border: '3px solid var(--border-color)',
                    borderTopColor: 'var(--accent)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 12px'
                  }} />
                  <p style={{ margin: 0, fontSize: 13.5 }}>Loading performance details...</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <SectionLabel>Class Performance Summary</SectionLabel>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                    <StatTile
                      icon={Library}
                      label="Attendance"
                      value={`${selectedStudent.sessionsAttended} / ${selectedStudent.sessionsPossible ?? (membersData.totalClassSessions || sessions.length)}`}
                      sub={
                        selectedStudent.sessionsPossible != null
                          ? `${selectedStudent.attendanceRate ?? (selectedStudent.sessionsPossible > 0 ? Math.round((selectedStudent.sessionsAttended / selectedStudent.sessionsPossible) * 100) : 0)}% rate${selectedStudent.sessionsPossible < (membersData.totalClassSessions || sessions.length) ? ` (${selectedStudent.sessionsAttended}/${membersData.totalClassSessions || sessions.length} total)` : ' since joined'}`
                          : membersData.totalClassSessions > 0
                            ? `${Math.round((selectedStudent.sessionsAttended / membersData.totalClassSessions) * 100)}% attendance rate`
                            : 'No sessions hosted'
                      }
                      tint="var(--accent)"
                      isMobile
                    />
                    <StatTile
                      icon={MessageSquare}
                      label="Polls Answered"
                      value={`${selectedStudent.pollsAttempted}${selectedStudent.pollsLaunched != null && selectedStudent.pollsLaunched > 0 ? ` / ${selectedStudent.pollsLaunched}` : ''}`}
                      sub={selectedStudent.pollsMissed != null && selectedStudent.pollsMissed > 0 ? `${selectedStudent.pollsMissed} missed while present` : 'In attended sessions'}
                      tint="#0ea5e9"
                      isMobile
                    />
                    <StatTile
                      icon={CircleAlert}
                      label="Polls Missed"
                      value={`${selectedStudent.pollsMissed ?? (studentPerformance?.pollsMissed ?? 0)}`}
                      sub="Missed while present"
                      tint="#f59e0b"
                      isMobile
                    />
                    <StatTile
                      icon={Award}
                      label="Accuracy"
                      value={`${selectedStudent.accuracy}%`}
                      sub={`${selectedStudent.correctCount} of ${selectedStudent.pollsAttempted} correct`}
                      tint="#10b981"
                      tone={selectedStudent.accuracy >= 70 ? '#10b981' : undefined}
                      isMobile
                    />
                  </div>

                  <div style={{
                    padding: '12px 14px',
                    borderRadius: 14,
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    fontSize: 13,
                    color: 'var(--text-secondary)'
                  }}>
                    <span>Last active in class: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {selectedStudent.lastActive ? new Date(selectedStudent.lastActive).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'}
                    </strong>
                  </div>

                  {/* Per-Session Breakdown */}
                  <SectionLabel>Per-Session Breakdown</SectionLabel>

                  {studentPerformance?.sessions && studentPerformance.sessions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {studentPerformance.sessions.map((sess) => {
                        const isPreJoin = sess.status === 'not_enrolled' || sess.isBeforeJoin
                        return (
                          <div
                            key={sess.roomId}
                            style={{
                              padding: '12px 14px',
                              borderRadius: 12,
                              background: sess.attended
                                ? 'var(--bg-card)'
                                : 'color-mix(in srgb, var(--text-secondary) 4%, var(--bg-card))',
                              border: '1px solid var(--border-color)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 12
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>
                                  {sess.roomName}
                                </span>
                                {isPreJoin ? (
                                  <Pill tone="var(--text-secondary)">Before joined</Pill>
                                ) : sess.attended ? (
                                  <Pill tone="#10b981">Attended</Pill>
                                ) : (
                                  <Pill tone="var(--text-secondary)">Missed</Pill>
                                )}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                                {new Date(sess.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              {isPreJoin ? (
                                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                  Not enrolled yet
                                </span>
                              ) : sess.attended ? (
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {sess.correctCount} / {sess.pollsAttempted} correct
                                  </div>
                                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                                    {sess.pollsAttempted} of {sess.totalQuestions} answered{sess.pollsMissed > 0 ? ` · ${sess.pollsMissed} missed` : ''} ({sess.accuracy}%)
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                    Did not attend
                                  </span>
                                  {sess.totalQuestions > 0 && (
                                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                                      {sess.totalQuestions} polls held
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                      No session history recorded yet.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Start New Session Modal */}
      {showSessionModal && (
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
                  <Play size={18} />
                </span>
                <div>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Start New Session
                  </h2>
                  <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    {cls.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSessionModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleStartSession} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Session Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder={`e.g. ${cls.name} - Lecture ${sessions.length + 1}`}
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  style={inputStyle()}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Teaching Mode
                </label>
                <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
                  <ChoiceCard
                    icon={Mic}
                    title="Live Audio"
                    description="Real-time mic transcription"
                    active={sessionMode === 'normal'}
                    onClick={() => setSessionMode('normal')}
                  />
                  <ChoiceCard
                    icon={Clapperboard}
                    title="Video Mode"
                    description="YouTube lecture link"
                    active={sessionMode === 'video'}
                    onClick={() => setSessionMode('video')}
                  />
                </div>
              </div>

              {sessionMode === 'video' && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 6 }}>
                    YouTube Video URL <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    style={inputStyle()}
                  />
                </div>
              )}

              {hasAnyLiveClassSession && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'color-mix(in srgb, #ef4444 12%, var(--bg-card))',
                  border: '1px solid color-mix(in srgb, #ef4444 35%, transparent)',
                  color: '#ef4444',
                  fontSize: 13,
                  fontWeight: 600
                }}>
                  End the current live session first.
                </div>
              )}

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
                  onClick={() => setShowSessionModal(false)}
                  style={ghostButton()}
                  disabled={isStartingSession}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={primaryButton(hasAnyLiveClassSession || !sessionName.trim() || isStartingSession)}
                  disabled={hasAnyLiveClassSession || !sessionName.trim() || isStartingSession}
                >
                  {isStartingSession ? 'Launching...' : 'Launch Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Soft Remove Student */}
      {studentToRemove && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 90,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: '100%',
            maxWidth: 440,
            background: 'var(--bg-card)', // Solid opaque background
            borderRadius: 20,
            border: '1px solid var(--border-color)',
            boxShadow: '0 20px 45px rgba(0,0,0,0.22)',
            padding: 24,
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'color-mix(in srgb, #ef4444 12%, transparent)',
                color: '#ef4444'
              }}>
                <UserX size={20} />
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Remove Student from Class?
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {studentToRemove.name} ({studentToRemove.email})
                </p>
              </div>
            </div>

            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px' }}>
              All responses, attendance, and scores for this student are permanently preserved. If this student attempts to re-join using the class code, their request will be placed on hold until you approve it.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setStudentToRemove(null)}
                style={ghostButton()}
                disabled={isRemoving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={isRemoving}
                style={{
                  padding: '10px 18px',
                  borderRadius: 12,
                  fontSize: 13.5,
                  fontWeight: 650,
                  cursor: isRemoving ? 'not-allowed' : 'pointer',
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  boxShadow: '0 4px 14px rgba(239,68,68,0.30)'
                }}
              >
                {isRemoving ? 'Removing...' : 'Remove Student'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Archive Class */}
      {showArchiveModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 90,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: '100%',
            maxWidth: 440,
            background: 'var(--bg-card)', // Solid opaque background
            borderRadius: 20,
            border: '1px solid var(--border-color)',
            boxShadow: '0 20px 45px rgba(0,0,0,0.22)',
            padding: 24,
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'color-mix(in srgb, #f59e0b 14%, transparent)',
                color: '#f59e0b'
              }}>
                <Archive size={20} />
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Archive Class Series?
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {cls.name} ({cls.code})
                </p>
              </div>
            </div>

            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 20px' }}>
              Archiving ends this class series without deleting any data. All past sessions, enrolled students, attendance records, responses, and CSV exports remain completely accessible. New sessions cannot be started and new students cannot join while archived. You can restore this class at any time.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                style={ghostButton()}
                disabled={isArchiving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleArchiveClass}
                disabled={isArchiving}
                style={{
                  padding: '10px 18px',
                  borderRadius: 12,
                  fontSize: 13.5,
                  fontWeight: 650,
                  cursor: isArchiving ? 'not-allowed' : 'pointer',
                  border: 'none',
                  background: '#f59e0b',
                  color: '#fff',
                  boxShadow: '0 4px 14px rgba(245,158,11,0.30)'
                }}
              >
                {isArchiving ? 'Archiving...' : 'Archive class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
