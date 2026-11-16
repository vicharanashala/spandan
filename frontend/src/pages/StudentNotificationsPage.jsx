import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useIsMobile from '../hooks/useIsMobile'
import Sidebar from '../components/Sidebar'
import { notificationApi } from '../lib/api'
import {
  PageHeader,
  pageWash,
  primaryButton,
  ghostButton,
  Pill,
  EmptyState,
  CodeChip
} from '../components/AppUI'
import { cardStyle, SectionLabel } from '../components/InsightUI'
import { Bell, School, Check, X, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react'
import { renderIcon } from '../components/icons'

export default function StudentNotificationsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { socket } = useSocketStore()
  const isMobile = useIsMobile()

  const [notifications, setNotifications] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [processingId, setProcessingId] = useState(null)

  const fetchNotifications = async () => {
    try {
      const data = await notificationApi.getAll()
      setNotifications(data.notifications || [])
    } catch (err) {
      console.error('Failed to load notifications:', err)
      setError(err.message || 'Failed to load notifications')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  // Socket listener for real-time notification push
  useEffect(() => {
    if (!socket) return

    const handleNotificationEvent = (data) => {
      if (!data?.userId || String(data.userId) === String(user?._id)) {
        fetchNotifications()
      }
    }

    socket.on('notification:new', handleNotificationEvent)
    socket.on('notification:updated', handleNotificationEvent)
    socket.on('class:member-updated', handleNotificationEvent)
    return () => {
      socket.off('notification:new', handleNotificationEvent)
      socket.off('notification:updated', handleNotificationEvent)
      socket.off('class:member-updated', handleNotificationEvent)
    }
  }, [socket, user])

  const handleAccept = async (notification) => {
    setProcessingId(notification._id)
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await notificationApi.accept(notification._id)
      setNotifications(prev => prev.filter(n => n._id !== notification._id))
      window.dispatchEvent(new CustomEvent('spandan:notifications-changed'))
      const className = notification.class?.name || notification.payload?.className || 'the class'
      setSuccessMsg(`Enrolled in ${className} successfully! You can now access all past and live sessions.`)
    } catch (err) {
      setError(err.message || 'Failed to accept invitation')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDecline = async (notification) => {
    setProcessingId(notification._id)
    setError(null)
    setSuccessMsg(null)
    try {
      await notificationApi.decline(notification._id)
      setNotifications(prev => prev.filter(n => n._id !== notification._id))
      window.dispatchEvent(new CustomEvent('spandan:notifications-changed'))
      setSuccessMsg('Invitation declined.')
    } catch (err) {
      setError(err.message || 'Failed to decline invitation')
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      color: 'var(--text-primary)'
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
          icon={Bell}
          eyebrow="STUDENT PORTAL"
          title="Notifications"
          subtitle="Invitations from instructors and series announcements"
        >
          <button
            type="button"
            onClick={() => navigate('/student/classes')}
            style={ghostButton({ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 })}
          >
            <School size={14} /> My Classes
          </button>
        </PageHeader>

        <div style={{
          flex: 1,
          padding: isMobile ? '16px' : '28px 32px 32px',
          maxWidth: '100%',
          boxSizing: 'border-box',
          background: pageWash
        }}>
          {successMsg && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 14,
              background: 'color-mix(in srgb, #10b981 12%, var(--bg-card))',
              border: '1px solid color-mix(in srgb, #10b981 35%, transparent)',
              color: '#10b981',
              marginBottom: 20,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}>
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
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

          <SectionLabel actions={<span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{notifications.length} pending</span>}>
            Pending Invitations
          </SectionLabel>

          <div data-tour="notification-list">
          {isLoading ? (
            <div style={{
              padding: '48px 0',
              textAlign: 'center',
              color: 'var(--text-secondary)'
            }}>
              <div style={{
                width: 36,
                height: 36,
                border: '3px solid var(--border-color)',
                borderTopColor: 'var(--accent)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 12px'
              }} />
              <p style={{ margin: 0, fontSize: 14 }}>Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ ...cardStyle(isMobile), padding: 36 }}>
              <EmptyState
                icon={Bell}
                title="No new notifications"
                description="You're all caught up! When an instructor invites you to join a recurring class series, it will appear here for you to accept."
              >
                <div data-tour="accept-invite">
                  <button
                    type="button"
                    onClick={() => navigate('/student/classes')}
                    style={primaryButton(false, { display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12 })}
                  >
                    <School size={15} /> Go to My Classes
                  </button>
                </div>
              </EmptyState>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {notifications.map((n) => {
                const cls = n.class || {}
                const isArchived = cls.isActive === false
                const isBusy = processingId === n._id
                const teacherName = n.teacher?.name || n.payload?.teacherName || 'An instructor'
                const className = cls.name || n.payload?.className || 'Class Series'
                const classCode = cls.code || n.payload?.classCode || ''

                return (
                  <div
                    key={n._id}
                    className="app-card app-card--hover"
                    style={{
                      ...cardStyle(isMobile),
                      position: 'relative',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: isMobile ? 'column' : 'row',
                      alignItems: isMobile ? 'flex-start' : 'center',
                      justifyContent: 'space-between',
                      gap: 16
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        inset: '0 0 auto 0',
                        height: 3,
                        background: isArchived
                          ? '#64748b'
                          : 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 35%, transparent))'
                      }}
                    />

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 20,
                          flexShrink: 0,
                          background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                          color: 'var(--accent)',
                          border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)'
                        }}
                      >
                        {renderIcon(School, 22)}
                      </span>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          <span style={{ fontWeight: 700 }}>{teacherName}</span> invited you to join{' '}
                          <span style={{ fontWeight: 750, color: 'var(--accent)' }}>{className}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                          {classCode && <CodeChip code={classCode} />}
                          {isArchived ? (
                            <Pill tone="#64748b">Archived</Pill>
                          ) : (
                            <Pill tone="var(--accent)">Class Invite</Pill>
                          )}
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {n.createdAt ? new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div data-tour="accept-invite" style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: isMobile ? '100%' : 'auto',
                      justifyContent: isMobile ? 'flex-end' : 'initial',
                      marginTop: isMobile ? 8 : 0
                    }}>
                      {isArchived ? (
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          Class is archived
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleAccept(n)}
                            disabled={isBusy}
                            style={primaryButton(isBusy, {
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 13,
                              background: 'linear-gradient(135deg, #10b981, #059669)'
                            })}
                          >
                            <Check size={14} /> Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecline(n)}
                            disabled={isBusy}
                            style={ghostButton({
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 13,
                              color: '#ef4444'
                            })}
                          >
                            <X size={14} /> Decline
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
