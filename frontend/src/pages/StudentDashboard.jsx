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

function StudentDashboard() {
  // Inject streak flame pulse animation once
  useEffect(() => {
    if (!document.getElementById('streak-fire-anim')) {
      const style = document.createElement('style')
      style.id = 'streak-fire-anim'
      style.textContent = `
        @keyframes streakPulse {
          0%, 100% { transform: scale(1) rotate(-2deg); }
          50%      { transform: scale(1.08) rotate(2deg); }
        }
        @keyframes streakGlow {
          0%, 100% { filter: drop-shadow(0 0 12px rgba(255,200,80,0.6)); }
          50%      { filter: drop-shadow(0 0 22px rgba(255,200,80,0.95)); }
        }
      `
      document.head.appendChild(style)
    }
  }, [])
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
    average: 0,
    bestStreak: 0,
    currentStreak: 0
  })

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchStudentStats()
      fetchActiveRooms()
    }
  }, [token])

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
          average: data.stats.average || 0,
          bestStreak: data.stats.bestStreak || 0,
          currentStreak: data.stats.currentStreak || 0,
          streakFreezes: data.stats.streakFreezes || 0
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
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <div style={{
          flex: 1,
          padding: isMobile ? '16px' : '32px',
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Streak Fire — featured big card on its own row */}
          <div
            title={stats.bestStreak > 0 ? `Personal best: ${stats.bestStreak} in a row 🔥` : 'Get 2 correct answers in a row to light the streak'}
            style={{
              background: 'linear-gradient(135deg, #ff7a18 0%, #ff3d00 50%, #b71c1c 100%)',
              borderRadius: '20px',
              padding: '28px 32px',
              marginBottom: '24px',
              boxShadow: '0 8px 24px rgba(255, 61, 0, 0.25), var(--card-shadow)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'white',
              position: 'relative',
              overflow: 'hidden',
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr auto',
              gap: '32px',
              alignItems: 'center',
            }}>
            <div style={{
              position: 'absolute', top: '-40px', right: '-40px',
              width: '180px', height: '180px',
              background: 'radial-gradient(circle, rgba(255,235,59,0.18) 0%, transparent 70%)',
              borderRadius: '50%',
              pointerEvents: 'none',
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{
                fontSize: '72px',
                lineHeight: 1,
                filter: stats.currentStreak > 0 ? 'drop-shadow(0 0 12px rgba(255,200,80,0.6))' : 'grayscale(0.5) opacity(0.6)',
                animation: stats.currentStreak >= 3 ? 'streakPulse 1.6s ease-in-out infinite' : 'none',
              }}>🔥</div>
              <div>
                <div style={{
                  fontSize: '64px',
                  fontWeight: '900',
                  lineHeight: 1,
                  color: 'white',
                  textShadow: '0 2px 8px rgba(0,0,0,0.25)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {stats.currentStreak}
                </div>
                <div style={{ fontSize: '14px', opacity: 0.9, fontWeight: '500', marginTop: '2px' }}>in a row</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: 'white', letterSpacing: '0.3px', marginBottom: '6px' }}>Streak Fire</div>
              <div style={{ fontSize: '14px', opacity: 0.92, lineHeight: 1.4, maxWidth: '360px' }}>
                {stats.currentStreak === 0
                  ? 'Answer correctly to light the fire.'
                  : stats.currentStreak === 1
                    ? "You're warming up. Keep it going!"
                    : stats.currentStreak < 5
                      ? 'On fire — don\'t break the chain.'
                      : stats.currentStreak < 10
                        ? 'Blazing! Best streak of the run.'
                        : 'Unstoppable. Legendary status.'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: isMobile ? 'flex-start' : 'flex-end' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: '999px', padding: '6px 14px', fontSize: '13px', fontWeight: '500', backdropFilter: 'blur(4px)' }}>
                <span>🏆</span>
                <span>Best: <strong style={{ color: 'white' }}>{stats.bestStreak}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: stats.streakFreezes > 0 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255,255,255,0.08)', border: '1px solid ' + (stats.streakFreezes > 0 ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255,255,255,0.12)'), borderRadius: '999px', padding: '6px 14px', fontSize: '13px', fontWeight: '500', opacity: stats.streakFreezes > 0 ? 1 : 0.5 }}
                title="One-time shield that saves your streak from a wrong answer or skipped question">
                <span>🛡️</span>
                <span>Freeze: <strong style={{ color: 'white' }}>{stats.streakFreezes}</strong></span>
              </div>
            </div>
          </div>
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