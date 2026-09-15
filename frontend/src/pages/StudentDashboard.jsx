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

const fetchWithRetry = async (url, options, attempts = 4) => {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, options)
      if (response.status < 500 || attempt === attempts - 1) return response
    } catch (error) {
      lastError = error
    }
    if (attempt < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt))
    }
  }
  throw lastError
}

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
  const [achievementProgress, setAchievementProgress] = useState({ earned: 0, total: 0, percent: 0 })

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchStudentStats()
      fetchAchievementProgress()
      fetchActiveRooms()
    }
  }, [token])

  const fetchStudentStats = async () => {
    try {
      const res = await fetchWithRetry(`${API_URL}/responses/stats/student/${user._id}`, {
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

  const fetchAchievementProgress = async () => {
    try {
      const res = await fetchWithRetry(`${API_URL}/achievements/progress`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) return
      const data = await res.json()
      setAchievementProgress(data)
    } catch (err) {
      console.error('Failed to fetch achievement progress:', err)
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

          {/* Achievement Progress */}
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-lg)',
              padding: isMobile ? '20px' : '24px',
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--border-color)',
              marginBottom: isMobile ? '24px' : '32px'
            }}
          >
            <div
              style={{
                position: 'absolute',
                right: -35,
                top: -45,
                width: 130,
                height: 130,
                borderRadius: '50%',
                background: 'var(--accent-gradient)',
                opacity: 0.07
              }}
            />

            <div
              style={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                marginBottom: 16,
                flexWrap: 'wrap'
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <span style={{ fontSize: 21 }}>🏆</span>

                  <h2
                    style={{
                      margin: 0,
                      fontSize: 18,
                      color: 'var(--text-primary)'
                    }}
                  >
                    Achievement Progress
                  </h2>
                </div>

                <p
                  style={{
                    margin: '5px 0 0 29px',
                    color: 'var(--text-secondary)',
                    fontSize: 12
                  }}
                >
                  {achievementProgress.earned || 0} of{' '}
                  {achievementProgress.total || 0} badges unlocked
                </p>
              </div>

              <button
                onClick={() => navigate('/student/achievements')}
                style={{
                  padding: '9px 14px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 10,
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontWeight: 650,
                  fontSize: 12
                }}
              >
                View achievements →
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 7,
                color: 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 650
              }}
            >
              <span>Overall progress</span>
              <span>{achievementProgress.percent || 0}%</span>
            </div>

            <div
              style={{
                height: 10,
                borderRadius: 99,
                background: 'var(--border-color)',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${achievementProgress.percent || 0}%`,
                  height: '100%',
                  borderRadius: 99,
                  background: 'var(--accent-gradient)',
                  transition: 'width .5s ease'
                }}
              />
            </div>

            <div
              style={{
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--text-secondary)',
                fontSize: 12
              }}
            >
              <span>🚀</span>

              <span>
                {(achievementProgress.percent || 0) >= 100
                  ? 'You unlocked everything!'
                  : 'Keep answering polls to unlock your next badge.'}
              </span>
            </div>
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
  )
}

export default StudentDashboard