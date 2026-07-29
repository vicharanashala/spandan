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

  const [journeyData, setJourneyData] = useState(null)
  const [journeyLoading, setJourneyLoading] = useState(false)
  const [narrative, setNarrative] = useState('')
  const [narrativeLoading, setNarrativeLoading] = useState(false)
  const [narrativeError, setNarrativeError] = useState('')
  const [sessionPage, setSessionPage] = useState(1)
  const SESSIONS_PER_PAGE = 10

  useEffect(() => {
    if (!token || !user?._id) return
    const fetchJourney = async () => {
      setJourneyLoading(true)
      try {
        const res = await fetch(`${API_URL}/analytics/student/${user?._id}/sessions`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await res.json()
        if (data.success) setJourneyData(data.profile)
      } catch (err) { console.error('Failed to fetch journey:', err) }
      finally { setJourneyLoading(false) }
    }
    fetchJourney()
  }, [token, user?._id])

  const generateNarrative = async () => {
    setNarrativeLoading(true)
    setNarrativeError('')
    try {
      const res = await fetch(`${API_URL}/analytics/student/${user?._id}/narrative`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      const data = await res.json()
      if (data.success) {
        setNarrative(data.narrative)
      } else {
        setNarrativeError(data.message || 'Failed to generate narrative')
      }
    } catch (err) {
      setNarrativeError('Network error. Please try again.')
    } finally {
      setNarrativeLoading(false)
    }
  }

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
        marginLeft: 'var(--sidebar-width)',
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

          {/* My Learning Journey Section */}
          {journeyLoading && (
            <div style={{ marginBottom: isMobile ? '24px' : '32px' }}>
              <div style={{ height: '22px', width: '180px', background: 'var(--border-color)', borderRadius: '6px', marginBottom: '20px', opacity: 0.6 }} />
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: isMobile ? '12px' : '20px', marginBottom: isMobile ? '24px' : '32px' }}>
                {[1,2,3,4].map(i => (
                  <div key={i} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '24px', border: '1px solid var(--border-color)' }}>
                    <div style={{ width: '48px', height: '48px', background: 'var(--border-color)', borderRadius: 'var(--radius)', marginBottom: '12px', opacity: 0.5 }} />
                    <div style={{ height: '28px', width: '60%', background: 'var(--border-color)', borderRadius: '4px', marginBottom: '6px', opacity: 0.5 }} />
                    <div style={{ height: '14px', width: '40%', background: 'var(--border-color)', borderRadius: '4px', opacity: 0.4 }} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {journeyData && journeyData.sessions && journeyData.sessions.length > 0 && (
            <div style={{ marginBottom: isMobile ? '24px' : '32px', boxSizing: 'border-box' }}>
              <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                📈 My Learning Journey
              </h2>

              {/* Stats cards grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: isMobile ? '12px' : '20px',
                marginBottom: isMobile ? '24px' : '32px',
                boxSizing: 'border-box'
              }}>
                {[
                  { icon: '📚', value: journeyData.overall?.totalSessions || 0, label: 'Sessions', tint: '#3b82f6' },
                  { icon: '✅', value: `${journeyData.overall?.overallAccuracy || 0}%`, label: 'Overall Accuracy', tint: '#10b981' },
                  { icon: '🏆', value: journeyData.overall?.totalPoints || 0, label: 'Total Points', tint: '#f59e0b' },
                  ...(journeyData.personalBest ? [{
                    icon: '🌟',
                    value: `${journeyData.personalBest.accuracy}%`,
                    label: `Best: ${journeyData.personalBest.roomName}`,
                    tint: '#8b5cf6'
                  }] : [])
                ].map((card, idx) => (
                  <div key={idx} style={{
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-lg)',
                    padding: isMobile ? '18px' : '24px',
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
                      letterSpacing: '-0.02em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>{card.value}</div>
                    <div style={{ 
                      fontSize: '14px', 
                      color: 'var(--text-secondary)', 
                      marginTop: '4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }} title={card.label}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* AI Narrative Box */}
              <div style={{
                background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
                marginBottom: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxSizing: 'border-box'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🤖 AI Learning Narrative
                  </span>
                  <button
                    onClick={generateNarrative}
                    disabled={narrativeLoading}
                    style={{
                      padding: '8px 16px',
                      background: 'var(--accent-gradient)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: narrativeLoading ? 'not-allowed' : 'pointer',
                      transition: 'transform 0.15s ease'
                    }}
                  >
                    {narrativeLoading ? 'Generating...' : (narrative ? 'Regenerate Narrative' : 'Generate Narrative')}
                  </button>
                </div>
                {narrative && (
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5', color: 'var(--text-primary)', fontStyle: 'italic' }}>
                    "{narrative}"
                  </p>
                )}
                {narrativeError && (
                  <p style={{ margin: 0, fontSize: '12px', color: '#dc2626' }}>
                    {narrativeError}
                  </p>
                )}
              </div>

              {/* Trend Chart */}
              {journeyData.trendData && journeyData.trendData.length > 0 && (
                <div style={{
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '24px',
                  boxShadow: 'var(--shadow-md)',
                  border: '1px solid var(--border-color)',
                  marginBottom: '24px',
                  boxSizing: 'border-box'
                }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Performance Trend
                  </h3>
                  <div style={{ background: 'var(--bg-primary)', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                    {journeyData.trendData.map((s, i) => (
                      <div key={i} style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{s.roomName}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{s.accuracy}%</span>
                        </div>
                        <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${s.accuracy}%`,
                            height: '100%',
                            background: s.accuracy >= 70 ? '#10b981' : s.accuracy >= 40 ? '#f59e0b' : '#ef4444',
                            borderRadius: '4px',
                            transition: 'width 0.5s ease'
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sessions List */}
              <div style={{
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                padding: '24px',
                boxShadow: 'var(--shadow-md)',
                border: '1px solid var(--border-color)',
                marginBottom: '24px',
                boxSizing: 'border-box'
              }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Session Breakdown
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', boxSizing: 'border-box' }}>
                  {journeyData.sessions.slice(0, sessionPage * SESSIONS_PER_PAGE).map((s) => (
                    <div
                      key={s.roomId}
                      onClick={() => navigate(`/student/room/${s.roomId}/results`)}
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
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px',
                        background: 'var(--bg-primary)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border-color)',
                        boxShadow: 'var(--shadow-md)',
                        cursor: 'pointer',
                        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                        fontSize: '13px',
                        flexWrap: 'wrap',
                        gap: '12px',
                        boxSizing: 'border-box'
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          color: 'var(--accent)',
                          textDecoration: 'underline',
                          flex: '1 1 150px',
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {s.roomName}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', flex: '0 0 100px' }}>
                        {s.correctCount}/{s.questionsAttempted} questions
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 120px', minWidth: '100px' }}>
                        <div style={{ flex: 1, height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${s.accuracy}%`,
                            height: '100%',
                            background: s.accuracy >= 70 ? '#10b981' : s.accuracy >= 40 ? '#f59e0b' : '#ef4444',
                            borderRadius: '4px'
                          }} />
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', width: '36px', textAlign: 'right' }}>
                          {s.accuracy}%
                        </span>
                      </div>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)', flex: '0 0 70px', textAlign: 'right' }}>
                        {s.totalPoints} pts
                      </span>
                      <span style={{ color: 'var(--text-secondary)', flex: '0 0 90px', textAlign: 'right' }}>
                        {s.avgResponseTime}s avg
                      </span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '16px', flexShrink: 0 }}>›</span>
                    </div>
                  ))}
                </div>
                {journeyData.sessions.length > sessionPage * SESSIONS_PER_PAGE && (
                  <div style={{ textAlign: 'center', marginTop: '12px' }}>
                    <button
                      onClick={() => setSessionPage(p => p + 1)}
                      style={{
                        padding: '8px 20px',
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius)',
                        color: 'var(--accent)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Show more ({journeyData.sessions.length - sessionPage * SESSIONS_PER_PAGE} remaining)
                    </button>
                  </div>
                )}
              </div>

              {/* Weak Topics */}
              {journeyData.weakTopics && journeyData.weakTopics.length > 0 && (
                <div style={{
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '24px',
                  boxShadow: 'var(--shadow-md)',
                  border: '1px solid var(--border-color)',
                  boxSizing: 'border-box'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Areas to Focus
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {journeyData.weakTopics.map((topic, i) => (
                      <span 
                        key={i} 
                        style={{
                          display: 'inline-block',
                          padding: '6px 14px',
                          borderRadius: '20px',
                          background: 'color-mix(in srgb, #f59e0b 18%, transparent)',
                          color: '#d97706',
                          fontSize: '12px',
                          fontWeight: 500,
                          boxSizing: 'border-box'
                        }}
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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