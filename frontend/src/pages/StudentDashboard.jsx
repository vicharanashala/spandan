import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import { classApi } from '../lib/api'
import { API_URL } from '../config.js'
import useIsMobile from '../hooks/useIsMobile'
import useNow from '../hooks/useNow'

import {
  PageHeader,
  pageWash,
  greeting,
  dateLabel,
  LiveClock,
  RoomCard,
  Pill,
  EmptyState,
} from '../components/AppUI'

import {
  StatTile,
  TileGrid,
  SectionLabel,
  SectionHeader,
  cardStyle,
} from '../components/InsightUI'

import {
  CircleCheck,
  Clapperboard,
  GraduationCap,
  Library,
  Link as LinkIcon,
  Mic,
  SkipForward,
  Telescope,
  TrendingUp,
} from 'lucide-react'

function StudentDashboard() {
  const isMobile = useIsMobile()
  const now = useNow()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { joinRoom } = useSocketStore()
  const {
    activeRooms,
    joinRoomByCode,
    setAuthToken,
    fetchActiveRooms,
  } = useRoomStore()

  const [roomCode, setRoomCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [stats, setStats] = useState({
    totalRooms: 0,
    pollsTaken: 0,
    pollsMissed: 0,
    average: 0,
  })
  const [classes, setClasses] = useState([])

  useEffect(() => {
    if (!token) return

    setAuthToken(token)
    fetchStudentStats()
    fetchActiveRooms()
    classApi.getAll().then(d => setClasses(d.classes || [])).catch(() => {})
  }, [token])

  const fetchStudentStats = async () => {
    try {
      if (!user?._id) return

      const res = await fetch(
        `${API_URL}/responses/stats/student/${user._id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      )

      if (!res.ok) {
        throw new Error(`Failed to fetch student stats (${res.status})`)
      }

      const data = await res.json()

      if (data.stats) {
        setStats({
          totalRooms: data.stats.totalRooms || 0,
          pollsTaken: data.stats.pollsTaken || 0,
          pollsMissed: data.stats.pollsMissed || 0,
          average: data.stats.average || 0,
        })
      }
    } catch (err) {
      console.error('Failed to fetch student stats:', err)
    }
  }

  const handleJoinRoom = async () => {
    const normalizedCode = roomCode.trim().toUpperCase()
    setJoinError('')

    if (!normalizedCode) {
      setJoinError('Please enter the 6-character room code.')
      return
    }

    if (normalizedCode.length !== 6) {
      setJoinError('Room codes are exactly 6 characters.')
      return
    }

    setIsJoining(true)

    try {
      // Validate the room through the API before navigating to the live session.
      const room = await joinRoomByCode(normalizedCode)

      // The session page will also re-join when its authenticated socket is ready.
      joinRoom(room.code, user._id)
      navigate(`/student/session/${room.code}`)
    } catch (err) {
      console.error('Failed to join room:', err)
      setJoinError(
        err.message || 'Unable to join this room. Check the code and try again.',
      )
    } finally {
      setIsJoining(false)
    }
  }

  const totalPolls = stats.pollsTaken + stats.pollsMissed
  const displayName = user?.name || 'Student'
  const joinDisabled = isJoining || roomCode.trim().length !== 6

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Sidebar user={user} />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          marginLeft: 'var(--sidebar-width, 240px)',
          transition: 'margin-left 0.2s ease',
        }}
      >
        <PageHeader
          isMobile={isMobile}
          icon={GraduationCap}
          eyebrow={
            <>
              {dateLabel(now)} · <LiveClock />
            </>
          }
          title={`${greeting(now)}, ${displayName}!`}
          subtitle="Join rooms and participate in polls"
        />

        <div
          style={{
            flex: 1,
            padding: isMobile ? '16px' : '28px 32px 32px',
            maxWidth: '100%',
            boxSizing: 'border-box',
            background: pageWash,
          }}
        >
          <SectionLabel>Your progress</SectionLabel>

          <TileGrid isMobile={isMobile} cols={4} tour="stats">
            {[
              {
                icon: Library,
                label: 'Rooms joined',
                value: stats.totalRooms,
                sub: 'sessions attended',
                tint: 'var(--accent)',
              },
              {
                icon: CircleCheck,
                label: 'Polls taken',
                value: stats.pollsTaken,
                sub: totalPolls ? `of ${totalPolls} polls` : 'answered so far',
                tint: '#10b981',
                progress: totalPolls
                  ? (stats.pollsTaken / totalPolls) * 100
                  : undefined,
              },
              {
                icon: SkipForward,
                label: 'Polls missed',
                value: stats.pollsMissed,
                sub: stats.pollsMissed
                  ? 'not answered in time'
                  : 'none missed',
                tint: '#ef4444',
              },
              {
                icon: TrendingUp,
                label: 'Earned points',
                value: `${stats.average}%`,
                sub: 'of the points available',
                tint: '#8b5cf6',
                progress: stats.average,
              },
            ].map((tile) => (
              <StatTile key={tile.label} {...tile} isMobile={isMobile} />
            ))}
          </TileGrid>

          {/* Student Performance Journey entry point */}
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-lg)',
              padding: isMobile ? '20px' : '24px',
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--border-color)',
              marginBottom: isMobile ? '24px' : '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '20px',
              flexWrap: 'wrap',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(59,130,246,0.12)',
                  fontSize: '23px',
                  flexShrink: 0,
                }}
              >
                📈
              </div>

              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '18px',
                    fontWeight: '700',
                    color: 'var(--text-primary)',
                  }}
                >
                  Performance Journey
                </h2>
                <p
                  style={{
                    margin: '5px 0 0',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Track your accuracy, scores, rank, questions and progress
                  across completed sessions.
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/student/performance')}
              style={{
                padding: '11px 18px',
                background: 'var(--accent-gradient)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              View Journey →
            </button>
          </div>

          {/* Quick Join — preserve room validation and socket logic */}
          <SectionLabel>Join a session</SectionLabel>

          <div
            data-tour="quick-join"
            className="insight-card"
            style={{
              ...cardStyle(isMobile),
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--bg-card)) 0%, color-mix(in srgb, #8b5cf6 7%, var(--bg-card)) 100%)',
              border:
                '1px solid color-mix(in srgb, var(--accent) 22%, var(--border-color))',
              marginBottom: isMobile ? '24px' : '32px',
            }}
          >
            <SectionHeader
              icon={LinkIcon}
              title="Quick Join"
              hint="Enter the room code your teacher shared to join the live session."
            />

            <div
              style={{
                display: 'flex',
                gap: '12px',
                flexDirection: isMobile ? 'column' : 'row',
              }}
            >
              <input
                type="text"
                className="app-input"
                value={roomCode}
                onChange={(event) => {
                  setJoinError('')
                  setRoomCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 6),
                  )
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !joinDisabled) {
                    handleJoinRoom()
                  }
                }}
                placeholder="Enter 6-character room code..."
                aria-label="Room code"
                autoComplete="off"
                maxLength={6}
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
                  boxSizing: 'border-box',
                }}
              />

              <button
                onClick={handleJoinRoom}
                disabled={joinDisabled}
                style={{
                  padding: '11px 24px',
                  background: joinDisabled
                    ? 'var(--border-color)'
                    : 'var(--accent-gradient)',
                  color: joinDisabled ? 'var(--text-secondary)' : '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: joinDisabled ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                {isJoining ? 'Joining…' : 'Join Room'}
              </button>
            </div>

            {joinError && (
              <div
                role="alert"
                style={{
                  marginTop: 14,
                  padding: '11px 13px',
                  borderRadius: 10,
                  border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.08)',
                  color: '#b91c1c',
                  fontSize: 13,
                  lineHeight: 1.4,
                }}
              >
                {joinError}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: 12,
              }}
            >
              <button
                onClick={() => navigate('/student/join-room')}
                style={{
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--accent)',
                  borderRadius: 10,
                  padding: '8px 11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Open Join Room page →
              </button>
            </div>
          </div>

          {/* Active joined rooms */}
          <SectionLabel>
            {`Your active rooms${activeRooms.length ? ` · ${activeRooms.length}` : ''}`}
          </SectionLabel>

          {activeRooms.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile
                  ? '1fr'
                  : 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px',
                marginBottom: isMobile ? '24px' : '32px',
              }}
            >
              {activeRooms.map((room) => {
                const isClass = Boolean(room.classId)
                const classObj = isClass ? classes?.find(c => String(c._id) === String(room.classId?._id || room.classId)) : null
                const displayCode = isClass ? (classObj?.code || (typeof room.classId === 'object' ? room.classId?.code : null)) : room.code
                return (
                <RoomCard
                  key={room._id}
                  icon={
                    room.settings?.mode === 'video' ? Clapperboard : Mic
                  }
                  tint={
                    room.settings?.mode === 'video'
                      ? '#ec4899'
                      : 'var(--accent)'
                  }
                  title={room.name}
                  code={displayCode}
                  status={
                    <span
                      style={{
                        display: 'inline-flex',
                        gap: 6,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Pill tone="#10b981" dot>
                        Live
                      </Pill>
                      {room.settings?.mode === 'video' && (
                        <Pill tone="#ec4899">Video</Pill>
                      )}
                    </span>
                  }
                  meta={[
                    `${room.questionCount || 0} questions`,
                    `${room.settings?.timeToAnswer || 30}s each`,
                  ]}
                  actionLabel="Rejoin room →"
                  onAction={() => navigate(`/student/session/${room.code}`)}
                />
              )})}
            </div>
          ) : (
            <EmptyState
              icon={Telescope}
              title="No active rooms right now"
              description="When your teacher starts a session, enter its code above. Rooms you join stay here while they are live."
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default StudentDashboard
