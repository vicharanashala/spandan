import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import { API_URL } from '../config.js'
import useIsMobile from '../hooks/useIsMobile'
import '../css/notification.css'

function StudentDashboard() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { socket, isConnected, joinRoom, leaveRoom } = useSocketStore()
  const { activeRooms, joinRoomByCode, setAuthToken, fetchActiveRooms } = useRoomStore()

  const [roomCode, setRoomCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [stats, setStats] = useState({
    totalRooms: 0,
    pollsTaken: 0,
    pollsMissed: 0,
    average: 0
  })

  // Notifications State (Loaded from and saved to localStorage)
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('announcement_history')
    return saved ? JSON.parse(saved) : []
  })
  const [hasNewNotification, setHasNewNotification] = useState(() => {
    return localStorage.getItem('has_new_announcement') === 'true'
  })
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false)

  // Persist notifications to localStorage
  useEffect(() => {
    localStorage.setItem('announcement_history', JSON.stringify(notifications))
  }, [notifications])

  // Persist hasNewNotification to localStorage
  useEffect(() => {
    localStorage.setItem('has_new_announcement', String(hasNewNotification))
  }, [hasNewNotification])

  // Connect/join rooms to listen for announcements
  useEffect(() => {
    if (socket && isConnected && activeRooms.length > 0) {
      activeRooms.forEach(room => {
        joinRoom(room.code, user._id)
      })
    }
  }, [socket, isConnected, activeRooms])

  // Listen for socket events and filter by student email if CSV emails are present
  useEffect(() => {
    if (!socket) return

    const handleNewAnnouncement = (data) => {
      console.log('Received new announcement on dashboard:', data)

      // If there are target emails from a CSV file, check if student's email is in it
      if (data.emails && data.emails.length > 0) {
        const studentEmail = user?.email?.toLowerCase()
        if (!studentEmail || !data.emails.map(e => e.toLowerCase()).includes(studentEmail)) {
          console.log('Skipping announcement: student email is not in target list')
          return
        }
      }

      const newNotif = {
        ...data,
        timestamp: new Date().toLocaleTimeString()
      }

      setNotifications(prev => [newNotif, ...prev])
      setHasNewNotification(true)
    }

    socket.on('new_announcement', handleNewAnnouncement)

    return () => {
      socket.off('new_announcement', handleNewAnnouncement)
    }
  }, [socket, user])

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchStudentStats()
      fetchActiveRooms()
      fetchNotifications()
    }
  }, [token])

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_URL}/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        if (data.notifications) {
          setNotifications(data.notifications)
          if (data.notifications.length > 0) {
            setHasNewNotification(true)
          } else {
            setHasNewNotification(false)
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch notifications from backend:', err)
    }
  }

  const handleClearNotifications = async (notificationId = null) => {
    try {
      await fetch(`${API_URL}/notifications/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(notificationId ? { notificationId } : {})
      })
      if (notificationId) {
        setNotifications(prev => prev.filter(n => (n._id || n.id) !== notificationId))
      } else {
        setNotifications([])
      }
      setHasNewNotification(false)
    } catch (err) {
      console.error('Failed to clear notifications:', err)
    }
  }

  const fetchStudentStats = async () => {
    try {
      const res = await fetch(`${API_URL}/responses/stats/student/${user._id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.stats) {
        setStats({
          totalRooms: data.stats.totalRooms || 0,
          pollsTaken: data.stats.pollsTaken || 0,
          pollsMissed: data.stats.pollsMissed || 0,
          average: data.stats.average || 0
        })
      }
    } catch (err) {
      console.error('Failed to fetch student stats:', err)
    }
  }

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) return
    setIsJoining(true)
    try {
      // First validate the room exists via API
      const room = await joinRoomByCode(roomCode.trim().toUpperCase())
      // Then join via socket
      joinRoom(room.code, user._id)
      // Then navigate to session
      navigate(`/student/session/${room.code}`)
    } catch (err) {
      console.error('Failed to join room:', err)
    } finally {
      setIsJoining(false)
    }
  }

  const statCards = [
    { icon: '📚', value: stats.totalRooms, label: 'Total Rooms', tint: '#3b82f6' },
    { icon: '✅', value: stats.pollsTaken, label: 'Polls Taken', tint: '#10b981' },
    { icon: '❌', value: stats.pollsMissed, label: 'Polls Missed', tint: '#ef4444' },
    { icon: '📈', value: `${stats.average}%`, label: 'Earned Points %', tint: '#8b5cf6' }
  ]

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


      {/* Main Content */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        marginLeft: 'var(--sidebar-width, 240px)',
        transition: 'margin-left 0.2s ease'
      }}>
        {/* Header - Blue gradient bar */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: isMobile ? '20px 16px' : '28px 32px',
          paddingLeft: isMobile ? '64px' : '32px',
          boxShadow: 'var(--shadow-md)'
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
                fontWeight: '700',
                letterSpacing: '-0.02em'
              }}>
                Welcome, {user?.name || 'Student'}!
              </h1>
              <p style={{ margin: '6px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Join rooms and participate in polls
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
              {/* Notification Bell */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <div
                  className={`bell ${hasNewNotification ? 'ringing' : ''}`}
                  onClick={() => {
                    setShowNotificationsDropdown(!showNotificationsDropdown)
                    setHasNewNotification(false)
                  }}
                  title="Notifications"
                >
                  <div className="anchor material-icons layer-1">notifications_active</div>
                  <div className="anchor material-icons layer-2">notifications</div>
                  <div className="anchor material-icons layer-3">notifications</div>
                </div>

                {/* Notifications Dropdown */}
                {showNotificationsDropdown && (
                  <div style={dropdownStyles.dropdown}>
                    <div style={dropdownStyles.dropdownHeader}>
                      <h4 style={dropdownStyles.dropdownTitle}>Announcements</h4>
                      {notifications.length > 0 && (
                        <button
                          onClick={() => handleClearNotifications()}
                          style={dropdownStyles.clearBtn}
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <p style={dropdownStyles.noNotifications}>No new announcements</p>
                    ) : (
                      <div style={dropdownStyles.notificationsList}>
                        {notifications.map((n, idx) => (
                          <div key={n._id || idx} style={dropdownStyles.notificationItem}>
                            <div style={dropdownStyles.notificationHeader}>
                              <span style={dropdownStyles.notificationRoom}>Room: {n.roomCode}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={dropdownStyles.notificationTime}>
                                  {n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (n.timestamp || 'Received')}
                                </span>
                                {(n._id || n.id) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleClearNotifications(n._id || n.id)
                                    }}
                                    title="Dismiss notification"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#9ca3af',
                                      cursor: 'pointer',
                                      fontSize: '14px',
                                      padding: '0 2px',
                                      lineHeight: 1
                                    }}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>
                            <p style={dropdownStyles.notificationText}>{n.announcement}</p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', gap: '8px' }}>
                              {n.fileName ? (
                                <div style={dropdownStyles.notificationFile}>
                                  📎 <a
                                    href="#"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      alert(`Downloading CSV: ${n.fileName}`)
                                    }}
                                    style={dropdownStyles.fileLink}
                                  >
                                    {n.fileName}
                                  </a>
                                </div>
                              ) : <div />}

                              <button
                                onClick={async () => {
                                  setShowNotificationsDropdown(false)
                                  setRoomCode(n.roomCode.toUpperCase())
                                  setIsJoining(true)
                                  try {
                                    const room = await joinRoomByCode(n.roomCode.toUpperCase())
                                    joinRoom(room.code, user._id)
                                    navigate(`/student/session/${room.code}`)
                                  } catch (err) {
                                    console.error('Failed to join room from notification:', err)
                                    alert('Failed to join room. Please check if the room is active.')
                                  } finally {
                                    setIsJoining(false)
                                  }
                                }}
                                style={{
                                  padding: '4px 10px',
                                  background: '#3b82f6',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  cursor: 'pointer'
                                }}
                              >
                                🚪 Join Room
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Dashboard content */}
        <div style={{
          flex: 1,
          padding: isMobile ? '16px' : '32px',
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Stats Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit,minmax(220px, 1fr))',
            gap: isMobile ? '12px' : '20px',
            marginBottom: isMobile ? '24px' : '32px'
          }}>
            {statCards.map((card) => (
              <div key={card.label} style={{
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                padding: '24px',
                boxShadow: 'var(--shadow-md)',
                border: '1px solid var(--border-color)',
                minWidth: 0,
                boxSizing: 'border-box'
              }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius)',
                  fontSize: '24px',
                  marginBottom: '12px',
                  background: `${card.tint}1a`
                }}>{card.icon}</div>
                <div style={{
                  fontSize: isMobile ? '26px' : '30px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em'
                }}>{card.value}</div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>{card.label}</div>
              </div>
            ))}
          </div>

          {/* Quick Join Section */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            padding: isMobile ? '20px' : '24px',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--border-color)',
            marginBottom: isMobile ? '24px' : '32px',
            boxSizing: 'border-box'
          }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Quick Join
            </h2>

            <div style={{
              display: 'flex',
              gap: '12px',
              flexDirection: isMobile ? 'column' : 'row'
            }}>

              <div style={{ display: 'flex', gap: '12px' }}>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Enter room code..."
                  maxLength={8}
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
                    letterSpacing: '2px',
                    fontWeight: '600',
                    boxSizing: 'border-box'
                  }}
                />


                <button
                  onClick={handleJoinRoom}
                  disabled={isJoining || !roomCode.trim()}
                  style={{
                    padding: '11px 24px',
                    background: (isJoining || !roomCode.trim()) ? 'var(--border-color)' : 'var(--accent-gradient)',
                    color: (isJoining || !roomCode.trim()) ? 'var(--text-secondary)' : '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius)',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: (isJoining || !roomCode.trim()) ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                  }}
                >
                  {isJoining ? 'Joining...' : 'Join Room'}
                </button>
              </div>
            </div>

            {/* Active Joined Rooms Section */}
            {activeRooms.length > 0 && (
              <>
                <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                  🟢 Previously Joined Active Rooms
                </h2>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '16px',
                  marginBottom: isMobile ? '24px' : '32px'
                }}>
                  {activeRooms.map((room) => (
                    <div
                      key={room._id}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '20px',
                        background: 'var(--bg-card)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-color)',
                        boxShadow: 'var(--shadow-md)',
                        minHeight: '140px',
                        minWidth: 0,
                        boxSizing: 'border-box',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.01em' }}>
                          {room.name}
                        </h3>
                        <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          Code: <strong style={{ color: 'var(--accent)', letterSpacing: '1px' }}>{room.code}</strong>
                        </p>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                          {room.questionCount || 0} questions • {room.settings?.timeToAnswer || 30}s per question
                        </p>
                      </div>
                      <button
                        onClick={() => navigate(`/student/session/${room.code}`)}
                        style={{
                          marginTop: '16px',
                          padding: '11px 18px',
                          background: 'var(--accent-gradient)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 'var(--radius)',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'transform 0.15s ease'
                        }}
                      >
                        🔄 Rejoin Room →
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const dropdownStyles = {
  dropdown: {
    position: 'absolute',
    top: '40px',
    right: '0',
    width: '320px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    boxShadow: 'var(--card-shadow)',
    padding: '16px',
    zIndex: 1000,
    color: 'var(--text-primary)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  dropdownHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '8px',
    marginBottom: '4px'
  },
  dropdownTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '600'
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    color: '#3b82f6',
    fontSize: '12px',
    cursor: 'pointer',
    padding: 0
  },
  noNotifications: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
    margin: '12px 0'
  },
  notificationsList: {
    maxHeight: '240px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    paddingRight: '4px'
  },
  notificationItem: {
    background: 'var(--bg-primary)',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  notificationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    fontWeight: '500'
  },
  notificationRoom: {
    color: '#3b82f6',
    fontWeight: '600'
  },
  notificationTime: {
    fontSize: '11px',
    color: 'var(--text-secondary)'
  },
  notificationText: {
    margin: 0,
    fontSize: '13px',
    lineHeight: '1.4',
    wordBreak: 'break-word',
    color: 'var(--text-primary)'
  },
  notificationFile: {
    fontSize: '12px',
    marginTop: '4px',
    background: 'rgba(59, 130, 246, 0.08)',
    padding: '4px 8px',
    borderRadius: '4px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    width: 'fit-content'
  },
  fileLink: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: '500'
  }
}

export default StudentDashboard