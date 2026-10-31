import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import { API_URL } from '../config.js'
import useIsMobile from '../hooks/useIsMobile'
import useNow from '../hooks/useNow'
import { PageHeader, pageWash, greeting, dateLabel, LiveClock, inputStyle, primaryButton, RoomCard, Pill, EmptyState } from '../components/AppUI'
import { StatTile, TileGrid, SectionLabel, SectionHeader, cardStyle } from '../components/InsightUI'
import { CircleCheck, Clapperboard, GraduationCap, Library, Link as LinkIcon, Mic, SkipForward, Telescope, TrendingUp } from 'lucide-react'

function StudentDashboard() {
  const isMobile = useIsMobile()
  const now = useNow()
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

  const totalPolls = stats.pollsTaken + stats.pollsMissed
  const firstName = (user?.name || 'Student').split(' ')[0]
  const joinDisabled = isJoining || !roomCode.trim()

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
        <PageHeader isMobile={isMobile} icon={GraduationCap} eyebrow={<>{dateLabel(now)} · <LiveClock /></>}
          title={`${greeting(now)}, ${firstName}!`} subtitle="Join rooms and participate in polls" />

        {/* Dashboard content */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '28px 32px 32px', maxWidth: '100%', boxSizing: 'border-box', background: pageWash }}>
          <SectionLabel>Your progress</SectionLabel>
          <TileGrid isMobile={isMobile} cols={4} tour="stats">
            {[
              { icon: Library, label: 'Rooms joined', value: stats.totalRooms, sub: 'sessions attended', tint: 'var(--accent)' },
              { icon: CircleCheck, label: 'Polls taken', value: stats.pollsTaken, sub: totalPolls ? `of ${totalPolls} polls` : 'answered so far', tint: '#10b981', progress: totalPolls ? (stats.pollsTaken / totalPolls) * 100 : undefined },
              { icon: SkipForward, label: 'Polls missed', value: stats.pollsMissed, sub: stats.pollsMissed ? 'not answered in time' : 'none missed', tint: '#ef4444' },
              { icon: TrendingUp, label: 'Earned points', value: `${stats.average}%`, sub: 'of the points available', tint: '#8b5cf6', progress: stats.average },
            ].map(t => <StatTile key={t.label} {...t} isMobile={isMobile} />)}
          </TileGrid>

          {/* Quick Join */}
          <SectionLabel>Join a session</SectionLabel>
          <div data-tour="quick-join" className="insight-card" style={{
            ...cardStyle(isMobile),
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--bg-card)) 0%, color-mix(in srgb, #8b5cf6 7%, var(--bg-card)) 100%)',
            border: '1px solid color-mix(in srgb, var(--accent) 22%, var(--border-color))'
          }}>
            <SectionHeader icon={LinkIcon} title="Quick Join" hint="Enter the room code your teacher shared to join the live session." />
            <div style={{ display: 'flex', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
              <input
                type="text"
                className="app-input"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                placeholder="ROOM CODE"
                aria-label="Room code"
                maxLength={8}
                style={inputStyle({ flex: 1, fontSize: '18px', fontWeight: 700, letterSpacing: '0.3em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '13px 16px', textAlign: isMobile ? 'center' : 'left' })}
              />
              <button onClick={handleJoinRoom} disabled={joinDisabled} style={primaryButton(joinDisabled, { padding: '13px 26px', fontSize: '15px' })}>
                {isJoining ? 'Joining…' : 'Join Room →'}
              </button>
            </div>
          </div>

          {/* Active Joined Rooms Section */}
          <SectionLabel>{`Your active rooms${activeRooms.length ? ` · ${activeRooms.length}` : ''}`}</SectionLabel>
          {activeRooms.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginBottom: isMobile ? '24px' : '32px' }}>
              {activeRooms.map((room) => (
                <RoomCard
                  key={room._id}
                  icon={room.settings?.mode === 'video' ? Clapperboard : Mic}
                  tint={room.settings?.mode === 'video' ? '#ec4899' : 'var(--accent)'}
                  title={room.name}
                  code={room.code}
                  status={<span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}><Pill tone="#10b981" dot>Live</Pill>{room.settings?.mode === 'video' && <Pill tone="#ec4899">Video</Pill>}</span>}
                  meta={[`${room.questionCount || 0} questions`, `${room.settings?.timeToAnswer || 30}s each`]}
                  actionLabel="Rejoin room →"
                  onAction={() => navigate(`/student/session/${room.code}`)}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={Telescope} title="No active rooms right now" description="When your teacher starts a session, enter its code above. Rooms you join stay here while they are live." />
          )}
        </div>
      </div>
    </div>
  )
}

export default StudentDashboard