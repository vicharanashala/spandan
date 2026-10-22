import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import useSocketStore from '../stores/socketStore'
import Sidebar from '../components/Sidebar'
import useIsMobile from '../hooks/useIsMobile'
import useNow from '../hooks/useNow'
import { PageHeader, pageWash, greeting, dateLabel, LiveClock, inputStyle, primaryButton, ChoiceCard, RoomCard, Pill, EmptyState } from '../components/AppUI'
import { StatTile, TileGrid, SectionLabel, SectionHeader, cardStyle } from '../components/InsightUI'
import { ChartColumn, CircleDot, Clapperboard, Hand, Inbox, Library, MessageSquare, Mic, Plus, Users } from 'lucide-react'
import { Ico } from '../components/icons'

function DashboardPage() {
  const navigate = useNavigate()
  const { user, token, isAuthenticated } = useAuthStore()
  const { rooms, currentRoom, isLoading, error, fetchRooms, createRoom, joinCoHostRoom, setAuthToken } = useRoomStore()
  const { isConnected } = useSocketStore()
  const isMobile = useIsMobile()
  const now = useNow()

  const [roomName, setRoomName] = useState('')
  const [mode, setMode] = useState('normal')
  const [videoUrl, setVideoUrl] = useState('')
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

  const [coHostActiveRooms, setCoHostActiveRooms] = useState([])

  // Initial setup
  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchRooms()
      fetchTeacherStats()
      fetchCoHostActiveRooms()
    }
    setChecked(true)
  }, [token])

  const fetchCoHostActiveRooms = async () => {
    try {
      const res = await fetch(`${API_URL}/rooms/teacher/cohost/active`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setCoHostActiveRooms(data.rooms || [])
      }
    } catch (err) {
      console.error('Failed to fetch co-host active rooms:', err)
    }
  }

  const fetchTeacherStats = async () => {
    try {
      // Fetch ALL rooms by paging through the result set (the API caps each page at 100).
      // Previously this read only the first 20 rooms, so every card below undercounted for
      // teachers with more than 20 rooms.
      const headers = { 'Authorization': `Bearer ${token}` }
      let allRooms = []
      let page = 1
      while (true) {
        const roomsRes = await fetch(`${API_URL}/rooms?page=${page}&limit=100`, { headers })
        const roomsData = await roomsRes.json()
        allRooms = allRooms.concat(roomsData.rooms || [])
        const pages = roomsData.pagination?.pages || 1
        if (page >= pages) break
        page++
      }
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
    setIsCreating(true)
    try {
      const settings = { mode }
      if (mode === 'video') settings.videoUrl = videoUrl.trim()
      await createRoom(roomName.trim(), settings)
      setRoomName('')
      setVideoUrl('')
      setMode('normal')
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
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading...</p>
        </div>
      </div>
    )
  }

  const disabled = isCreating || !roomName.trim() || (mode === 'video' && !isValidYouTube(videoUrl))
  const activeRooms = (rooms || []).filter(r => !r.endedAt)
  const firstName = (user?.name || 'Teacher').split(' ')[0]

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
        <PageHeader isMobile={isMobile} icon={Hand} eyebrow={<>{dateLabel(now)} · <LiveClock /></>}
          title={`${greeting(now)}, ${firstName}!`} subtitle="Manage your rooms and questions" />

        {/* Dashboard content */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '28px 32px 32px', maxWidth: '100%', boxSizing: 'border-box', background: pageWash }}>
          <SectionLabel>Overview</SectionLabel>
          <TileGrid isMobile={isMobile} cols={4} tour="stats">
            {[
              { icon: Library, label: 'Total rooms', value: stats.totalRooms, sub: `${stats.totalRooms - stats.activeRooms} ended`, tint: 'var(--accent)' },
              { icon: CircleDot, label: 'Active rooms', value: stats.activeRooms, sub: stats.activeRooms ? 'open right now' : 'none open', tint: '#10b981' },
              { icon: ChartColumn, label: 'Total polls', value: stats.totalPolls, sub: stats.totalRooms ? `${Math.round(stats.totalPolls / stats.totalRooms * 10) / 10} per room` : 'across all rooms', tint: '#8b5cf6' },
              { icon: MessageSquare, label: 'Total responses', value: stats.totalResponses.toLocaleString(), sub: stats.totalPolls ? `${Math.round(stats.totalResponses / stats.totalPolls)} per poll` : 'student answers', tint: '#0ea5e9' },
            ].map(t => <StatTile key={t.label} {...t} isMobile={isMobile} />)}
          </TileGrid>

          {/* Create Room Section */}
          <SectionLabel>Start a session</SectionLabel>
          <div data-tour="create-room" className="insight-card" style={cardStyle(isMobile)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
              <SectionHeader icon={Plus} title="Create New Room" hint="Give it a name and pick how you will teach. Students join with the room code." />
              <button
                onClick={() => navigate('/teacher/join-cohost')}
                style={{
                  padding: '8px 14px',
                  background: 'var(--nav-hover)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  borderRadius: 12,
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Ico as={Users} /> Join Room as Co-Host
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
                <input
                  type="text"
                  className="app-input"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Room name, e.g. DBMS Lecture 12"
                  aria-label="Room name"
                  style={inputStyle({ flex: 1 })}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                />
                {!isMobile && (
                  <button onClick={handleCreateRoom} disabled={disabled} style={primaryButton(disabled)}>
                    {isCreating ? 'Creating…' : <><Ico as={Plus} /> Create Room</>}
                  </button>
                )}
              </div>

              {/* Room mode */}
              <div role="radiogroup" aria-label="Room mode" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {[
                  { key: 'normal', icon: Mic, title: 'Normal', desc: 'Live mic + transcript', tint: 'var(--accent)' },
                  { key: 'video', icon: Clapperboard, title: 'Video', desc: 'YouTube video or live link', tint: '#ec4899' }
                ].map((opt) => (
                  <ChoiceCard key={opt.key} icon={opt.icon} title={opt.title} description={opt.desc} tint={opt.tint} active={mode === opt.key} onClick={() => setMode(opt.key)} />
                ))}
              </div>

              {/* Video URL (video mode only) */}
              {mode === 'video' && (
                <div>
                  <input
                    type="text"
                    className="app-input"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="YouTube video or live URL…"
                    aria-label="YouTube video or live URL"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                    style={inputStyle()}
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
                      borderRadius: '12px',
                      padding: '10px 12px',
                      marginTop: '10px'
                    }}>
                      Video Mode needs Google Chrome or Microsoft Edge to capture the video's audio.
                      Please open Spandan in Chrome or Edge before starting a video room.
                    </div>
                  )}
                </div>
              )}
              {/* phones: the button comes below the Normal / Video selector, at full width */}
              {isMobile && (
                <button onClick={handleCreateRoom} disabled={disabled} style={primaryButton(disabled, { width: '100%' })}>
                  {isCreating ? 'Creating…' : <><Ico as={Plus} /> Create Room</>}
                </button>
              )}
            </div>
          </div>

          {/* Active Co-Host Rooms Section */}
          {coHostActiveRooms && coHostActiveRooms.length > 0 && (
            <div style={{ marginBottom: '32px' }}>
              <SectionLabel>{`Rooms you are co-hosting · ${coHostActiveRooms.length}`}</SectionLabel>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(270px, 1fr))',
                gap: '16px'
              }}>
                {coHostActiveRooms.map((room) => (
                  <RoomCard
                    key={room._id}
                    icon={Users}
                    tint="var(--accent)"
                    title={room.name}
                    code={room.code}
                    status={<Pill tone="var(--accent)">Co-Host</Pill>}
                    meta={[`Host: ${room.teacher?.name || 'Teacher'}`]}
                    actionLabel="Rejoin Room →"
                    onOpen={() => navigate(`/teacher/room/${room._id}`)}
                    onAction={() => navigate(`/teacher/room/${room._id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Active Rooms List */}
          <div data-tour="active-rooms">
            <SectionLabel>{`My active rooms${activeRooms.length ? ` · ${activeRooms.length}` : ''}`}</SectionLabel>
          </div>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading rooms…</div>
          ) : activeRooms.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(270px, 1fr))', gap: '16px' }}>
              {activeRooms.map((room) => (
                <RoomCard
                  key={room._id}
                  icon={room.settings?.mode === 'video' ? Clapperboard : Mic}
                  tint={room.settings?.mode === 'video' ? '#ec4899' : 'var(--accent)'}
                  title={room.name}
                  code={room.code}
                  status={<span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}><Pill tone="#10b981" dot>Active</Pill>{room.settings?.mode === 'video' && <Pill tone="#ec4899">Video</Pill>}</span>}
                  meta={[`${room.questionCount || 0} question${room.questionCount === 1 ? '' : 's'}`]}
                  actionLabel="Manage →"
                  onOpen={() => navigate(`/teacher/room/${room._id}`)}
                  onAction={() => navigate(`/teacher/room/${room._id}`)}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={Inbox} title="No active rooms" description="Create your first room above. It will appear here while it is open." />
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
