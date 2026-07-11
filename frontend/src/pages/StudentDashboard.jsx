import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import { API_URL } from '../config.js'

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

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <Sidebar user={user} />
      
      {/* Main Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        marginLeft: '240px'
      }}>
        {/* Header - Blue gradient bar */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: '24px 32px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>
                Welcome, {user?.name || 'Student'}!
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Join rooms and participate in polls
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Dashboard content */}
        <div style={{ flex: 1, padding: '32px' }}>
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
              gridTemplateColumns: 'auto 1fr auto',
              gap: '32px',
              alignItems: 'center',
            }}>
            {/* Soft glow blob in the corner */}
            <div style={{
              position: 'absolute', top: '-40px', right: '-40px',
              width: '180px', height: '180px',
              background: 'radial-gradient(circle, rgba(255,235,59,0.18) 0%, transparent 70%)',
              borderRadius: '50%',
              pointerEvents: 'none',
            }} />
            {/* Left: flame icon + huge number */}
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
                <div style={{ fontSize: '14px', opacity: 0.9, fontWeight: '500', marginTop: '2px' }}>
                  in a row
                </div>
              </div>
            </div>
            {/* Middle: title + tagline */}
            <div>
              <div style={{
                fontSize: '22px', fontWeight: '700',
                color: 'white', letterSpacing: '0.3px',
                marginBottom: '6px',
              }}>
                Streak Fire
              </div>
              <div style={{
                fontSize: '14px', opacity: 0.92, lineHeight: 1.4,
                maxWidth: '360px',
              }}>
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
            {/* Right: best + freeze pills */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.22)',
                borderRadius: '999px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: '500',
                backdropFilter: 'blur(4px)',
              }}>
                <span>🏆</span>
                <span>Best: <strong style={{ color: 'white' }}>{stats.bestStreak}</strong></span>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: stats.streakFreezes > 0
                  ? 'rgba(56, 189, 248, 0.25)'
                  : 'rgba(255,255,255,0.08)',
                border: '1px solid ' + (stats.streakFreezes > 0
                  ? 'rgba(56, 189, 248, 0.5)'
                  : 'rgba(255,255,255,0.12)'),
                borderRadius: '999px',
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: '500',
                opacity: stats.streakFreezes > 0 ? 1 : 0.5,
              }}
              title="One-time shield that saves your streak from a wrong answer or skipped question">
                <span>🛡️</span>
                <span>Freeze: <strong style={{ color: 'white' }}>{stats.streakFreezes}</strong></span>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            marginBottom: '32px'
          }}>

            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📚</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>{stats.totalRooms}</div>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>Total Rooms</div>
            </div>
            
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>{stats.pollsTaken}</div>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>Polls Taken</div>
            </div>
            
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>❌</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>{stats.pollsMissed}</div>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>Polls Missed</div>
            </div>
            
            <div style={{
              background: 'var(--bg-card)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: 'var(--card-shadow)',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📈</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)' }}>{stats.average}%</div>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>Earned Points %</div>
            </div>
          </div>

          {/* Quick Join Section */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: 'var(--card-shadow)',
            border: '1px solid var(--border-color)',
            marginBottom: '32px'
          }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Quick Join
            </h2>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter room code..."
                maxLength={8}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: '2px solid var(--border-color)',
                  borderRadius: '10px',
                  fontSize: '14px',
                  outline: 'none',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  letterSpacing: '2px',
                  fontWeight: '600'
                }}
              />
              
              <button
                onClick={handleJoinRoom}
                disabled={isJoining || !roomCode.trim()}
                style={{
                  padding: '12px 24px',
                  background: (isJoining || !roomCode.trim()) ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: (isJoining || !roomCode.trim()) ? 'not-allowed' : 'pointer'
                }}
              >
                {isJoining ? 'Joining...' : 'Join Room'}
              </button>
            </div>
          </div>

          {/* Active Joined Rooms Section */}
          {activeRooms.length > 0 && (
            <>
              <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
                🟢 Previously Joined Active Rooms
              </h2>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                gap: '16px',
                marginBottom: '32px'
              }}>
                {activeRooms.map((room) => (
                  <div
                    key={room._id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '20px',
                      background: 'var(--bg-card)',
                      borderRadius: '16px',
                      border: '1px solid var(--border-color)',
                      minHeight: '140px'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                        {room.name}
                      </h3>
                      <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Code: <strong style={{ color: '#3b82f6', letterSpacing: '1px' }}>{room.code}</strong>
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {room.questionCount || 0} questions • {room.settings?.timeToAnswer || 30}s per question
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/student/session/${room.code}`)}
                      style={{
                        marginTop: '16px',
                        padding: '10px 16px',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer'
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