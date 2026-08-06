import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import useSocketStore from '../stores/socketStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useThemeStore from '../stores/themeStore'
import useIsMobile from '../hooks/useIsMobile'

function DashboardPage() {
  const navigate = useNavigate()
  const { user, token, isAuthenticated } = useAuthStore()
  const { rooms, currentRoom, isLoading, error, fetchRooms, createRoom, startRoom, setAuthToken } = useRoomStore()
  const { isConnected } = useSocketStore()
  const { isDark } = useThemeStore()
  const isMobile = useIsMobile()

  const [roomName, setRoomName] = useState('')
  const [mode, setMode] = useState('normal')
  const [videoUrl, setVideoUrl] = useState('')
  const [isScheduled, setIsScheduled] = useState(false)
  const [scheduledStartTime, setScheduledStartTime] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [checked, setChecked] = useState(false)

  // Video Mode needs a Chromium browser (getDisplayMedia tab-audio capture on the teacher side).
  const isChromium = /Chrome|Edg/.test(navigator.userAgent) && !/OPR|Opera/.test(navigator.userAgent)
  const isValidYouTube = (url) =>
    /(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)[\w-]+/.test(url.trim())
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
    if (mode === 'video' && !isValidYouTube(videoUrl)) return
    if (isScheduled && !scheduledStartTime) return

    setIsCreating(true)
    try {
      const settings = { mode }
      if (mode === 'video') settings.videoUrl = videoUrl.trim()
      const startTime = isScheduled && scheduledStartTime ? new Date(scheduledStartTime).toISOString() : null

      const newRoom = await createRoom(roomName.trim(), settings, startTime)
      setRoomName('')
      setVideoUrl('')
      setMode('normal')
      setIsScheduled(false)
      setScheduledStartTime('')
      await fetchRooms()
      fetchTeacherStats()

      if (newRoom.status !== 'SCHEDULED') {
        navigate(`/teacher/room/${newRoom._id}`)
      }
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

  const disabled = isCreating || !roomName.trim() || (mode === 'video' && !isValidYouTube(videoUrl))

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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

            {/* Room mode */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { key: 'normal', title: 'Normal', desc: 'Live mic + transcript' },
                { key: 'video', title: 'Video', desc: 'YouTube video or live link' }
              ].map((opt) => {
                const active = mode === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setMode(opt.key)}
                    style={{
                      flex: 1,
                      minWidth: '150px',
                      textAlign: 'left',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius)',
                      border: active ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                      background: active ? 'rgba(59,130,246,.08)' : 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{opt.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {opt.desc}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Video URL (video mode only) */}
            {mode === 'video' && (
              <div>
                <input
                  type="text"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="YouTube video or live URL..."
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius)',
                    fontSize: '14px',
                    outline: 'none',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box'
                  }}
                />
                {videoUrl.trim() && !isValidYouTube(videoUrl) && (
                  <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '6px' }}>
                    Enter a valid YouTube link (youtube.com/watch, /live, or youtu.be).
                  </div>
                )}
                {!isChromium && (
                  <div style={{
                    fontSize: '12px',
                    color: '#b45309',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px',
                    marginTop: '10px'
                  }}>
                    Video Mode needs Google Chrome or Microsoft Edge to capture the video's audio.
                  </div>
                )}
              </div>
            )}

            {/* Room Scheduling */}
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                userSelect: 'none'
              }}>
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  style={{ width: '15px', height: '15px', accentColor: 'var(--accent)' }}
                />
                ⏰ Schedule room for later
              </label>

              {isScheduled && (
                <div style={{ marginTop: '12px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    marginBottom: '6px'
                  }}>
                    Scheduled Start Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledStartTime}
                    onChange={(e) => setScheduledStartTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius)',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Students joining early will be held in the Waiting Room until you click Start Now.
                  </div>
                </div>
              )}
            </div>
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
                {rooms.filter(r => !r.endedAt).map((room) => {
                  const isScheduled = room.status === 'SCHEDULED' || Boolean(room.scheduledStartTime && room.status !== 'ACTIVE')
                  const isPastDue = isScheduled && room.scheduledStartTime && new Date() > new Date(room.scheduledStartTime)
                  return (
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
                        background: isPastDue
                          ? (isDark ? 'rgba(249, 115, 22, 0.15)' : 'linear-gradient(135deg, #fff7ed, #ffedd5)')
                          : 'var(--bg-card)',
                        borderRadius: 'var(--radius-lg)',
                        border: isPastDue
                          ? (isDark ? '1px solid rgba(249, 115, 22, 0.5)' : '1px solid #fdba74')
                          : isScheduled
                          ? '1px solid rgba(234, 179, 8, 0.4)'
                          : '1px solid var(--border-color)',
                        boxShadow: 'var(--shadow-md)',
                        minHeight: '140px',
                        minWidth: 0,
                        cursor: 'pointer',
                        transition: 'transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease',
                        boxSizing: 'border-box'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                            {room.name}
                          </h3>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            background: isPastDue ? 'rgba(249, 115, 22, 0.25)' : isScheduled ? 'rgba(234,179,8,0.2)' : 'rgba(34,197,94,0.15)',
                            color: isPastDue ? '#ea580c' : isScheduled ? '#b45309' : '#16a34a',
                            border: isPastDue ? '1px solid rgba(249, 115, 22, 0.4)' : isScheduled ? '1px solid rgba(234,179,8,0.4)' : '1px solid rgba(34,197,94,0.3)'
                          }}>
                            {isScheduled ? 'SCHEDULED' : 'ACTIVE'}
                          </span>
                        </div>
                        <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          Code: <strong style={{ color: 'var(--accent)', letterSpacing: '1px' }}>{room.code}</strong>
                        </p>
                        {isScheduled && room.scheduledStartTime && (
                          <div style={{
                            margin: '6px 0',
                            padding: '6px 10px',
                            background: isPastDue ? 'rgba(249, 115, 22, 0.12)' : 'rgba(234, 179, 8, 0.08)',
                            borderRadius: '6px',
                            border: isPastDue ? '1px dashed rgba(249, 115, 22, 0.5)' : '1px dashed rgba(234, 179, 8, 0.4)',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: isPastDue ? '#c2410c' : '#b45309',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}>
                            <span>⏰ {isPastDue ? 'Time Passed:' : 'Scheduled:'}</span>
                            <span>
                              {new Date(room.scheduledStartTime).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        )}
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {room.questionCount || 0} questions
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                        {isScheduled && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              try {
                                await startRoom(room._id)
                                navigate(`/teacher/room/${room._id}`)
                              } catch (err) {
                                alert(err.message || 'Failed to start room')
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: '9px 12px',
                              background: '#16a34a',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 'var(--radius)',
                              fontSize: '13px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            ▶ Start
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/teacher/room/${room._id}`)}
                          style={{
                            flex: 1,
                            padding: '9px 12px',
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
                    </div>
                  )
                })}
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
