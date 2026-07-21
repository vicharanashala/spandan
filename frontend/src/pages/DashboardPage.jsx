import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import useSocketStore from '../stores/socketStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useIsMobile from '../hooks/useIsMobile'

function DashboardPage() {
  const navigate = useNavigate()
  const { user, token, isAuthenticated } = useAuthStore()
  const { rooms, currentRoom, isLoading, error, fetchRooms, createRoom, setAuthToken } = useRoomStore()
  const { isConnected } = useSocketStore()
  const isMobile = useIsMobile()

  const [roomName, setRoomName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [checked, setChecked] = useState(false)
  const [stats, setStats] = useState({
    totalRooms: 0,
    activeRooms: 0,
    totalPolls: 0,
    totalResponses: 0
  })

  // Initial setup
  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchRooms()
      fetchTeacherStats()
    }
    setChecked(true)
  }, [token])

  const fetchTeacherStats = async () => {
    try {
      // Fetch all rooms
      const roomsRes = await fetch(`${API_URL}/rooms`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const roomsData = await roomsRes.json()

      const allRooms = roomsData.rooms || []
      const activeRooms = allRooms.filter(r => !r.endedAt)

      // Fetch all questions for teacher's rooms
      let totalPolls = 0
      let totalResponses = 0

      for (const room of allRooms) {
        const qRes = await fetch(`${API_URL}/questions?roomId=${room._id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const qData = await qRes.json()
        totalPolls += (qData.questions || []).length

        const rRes = await fetch(`${API_URL}/responses/stats/room/${room._id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const rData = await rRes.json()
        totalResponses += (rData.stats?.totalResponses || 0)
      }

      setStats({
        totalRooms: allRooms.length,
        activeRooms: activeRooms.length,
        totalPolls,
        totalResponses
      })
    } catch (err) {
      console.error('Failed to fetch teacher stats:', err)
    }
  }

  // Redirect to login if no token after initial check
  useEffect(() => {
    if (checked && !token) {
      navigate('/')
    }
  }, [checked, token, navigate])

  const handleCreateRoom = async () => {
    if (!roomName.trim()) return
    setIsCreating(true)
    try {
      await createRoom(roomName.trim())
      setRoomName('')
    } catch (err) {
      console.error('Failed to create room:', err)
    } finally {
      setIsCreating(false)
    }
  }

  // Show spinner while checking
  if (!checked) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-primary)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid var(--border-color)',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading...</p>
        </div>
      </div>
    )
  }

  const statCards = [
    { icon: '📚', value: stats.totalRooms, label: 'Total Rooms' },
    { icon: '✅', value: stats.activeRooms, label: 'Active Rooms' },
    { icon: '📊', value: stats.totalPolls, label: 'Total Polls' },
    { icon: '💬', value: stats.totalResponses, label: 'Total Responses' }
  ]

  const disabled = isCreating || !roomName.trim()

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

      {/* Main Content */}
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
        {/* Header - Blue gradient bar */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: isMobile ? '20px 16px' : '24px 32px',
          paddingLeft: isMobile ? '64px' : '32px',
          boxSizing: 'border-box'
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
                fontWeight: 700,
                letterSpacing: '-0.02em'
              }}>
                Welcome back, {user?.name || 'Teacher'}!
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Manage your rooms and questions
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
                padding: isMobile ? '18px' : '24px',
                boxShadow: 'var(--shadow-md)',
                border: '1px solid var(--border-color)',
                minWidth: 0,
                boxSizing: 'border-box'
              }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  borderRadius: 'var(--radius)',
                  background: 'rgba(59, 130, 246, 0.12)',
                  marginBottom: '14px'
                }}>{card.icon}</div>
                <div style={{
                  fontSize: isMobile ? '26px' : '30px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1
                }}>{card.value}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>{card.label}</div>
              </div>
            ))}
          </div>

          {/* Create Room Section */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            padding: isMobile ? '20px' : '24px',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--border-color)',
            marginBottom: '24px',
            maxWidth: '100%',
            boxSizing: 'border-box'
          }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Create New Room
            </h2>

            <div style={{ display: 'flex', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Enter room name..."
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '12px 16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  fontSize: '14px',
                  outline: 'none',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box'
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
              />

              <button
                onClick={handleCreateRoom}
                disabled={disabled}
                style={{
                  padding: '11px 18px',
                  background: disabled ? '#9ca3af' : 'var(--accent-gradient)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  boxShadow: disabled ? 'none' : '0 2px 10px rgba(30,64,175,.25)',
                  whiteSpace: 'nowrap'
                }}
              >
                {isCreating ? 'Creating...' : 'Create Room'}
              </button>
            </div>
          </div>

          {/* Active Rooms List */}
          <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
              My Active Rooms
            </h2>

            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                Loading rooms...
              </div>
            ) : rooms && rooms.filter(r => !r.endedAt).length > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '16px'
              }}>
                {rooms.filter(r => !r.endedAt).map((room) => (
                  <div
                    key={room._id}
                    onClick={() => navigate(`/teacher/room/${room._id}`)}
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
                      cursor: 'pointer',
                      transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                      boxSizing: 'border-box'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px', letterSpacing: '-0.01em' }}>
                        {room.name}
                      </h3>
                      <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Code: <strong style={{ color: 'var(--accent)', letterSpacing: '1px' }}>{room.code}</strong>
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {room.questionCount || 0} questions
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/teacher/room/${room._id}`)}
                      style={{
                        marginTop: '16px',
                        padding: '10px 16px',
                        background: 'var(--accent-gradient)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 2px 10px rgba(30,64,175,.25)'
                      }}
                    >
                      Manage →
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '48px 24px',
                color: 'var(--text-secondary)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-md)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                <p style={{ margin: 0 }}>No rooms yet. Create your first room above!</p>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
