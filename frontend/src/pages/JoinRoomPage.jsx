import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import useIsMobile from '../hooks/useIsMobile'
import { PageHeader, pageWash, inputStyle, primaryButton } from '../components/AppUI'
import { KeyRound, Link as LinkIcon } from 'lucide-react'

function JoinRoomPage() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { joinRoom, leaveRoom } = useSocketStore()
  const { joinRoomByCode, setAuthToken } = useRoomStore()
  const isMobile = useIsMobile()

  const [roomCode, setRoomCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')
  const [joinedRoom, setJoinedRoom] = useState(null)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (token) {
      setAuthToken(token)
    }
  }, [token])

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) {
      setError('Please enter a room code')
      return
    }

    setIsJoining(true)
    setError('')

    try {
      const room = await joinRoomByCode(roomCode.trim().toUpperCase())
      setJoinedRoom(room)
      joinRoom(room.code, user._id)
      navigate(`/student/session/${room.code}`)
    } catch (err) {
      setError(err.message || 'Failed to join room. Please check the code and try again.')
    } finally {
      setIsJoining(false)
    }
  }

  const handleLeaveRoom = () => {
    if (joinedRoom) {
      leaveRoom(joinedRoom.code, user._id)
      setJoinedRoom(null)
    }
  }

  const isDisabled = isJoining || roomCode.length < 6

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif', maxWidth: '100%' }}>
      <Sidebar user={user} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width, 240px)', minWidth: 0, maxWidth: '100%' }}>
        <PageHeader isMobile={isMobile} icon={LinkIcon} title="Join a Room" subtitle="Enter the code shared by your teacher" />

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '40px 32px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', boxSizing: 'border-box', background: pageWash }}>
          <div className="insight-card" style={{
            background: 'var(--bg-card)', borderRadius: 22, border: '1px solid var(--border-color)', width: '100%', maxWidth: 480, boxSizing: 'border-box', overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 14px 36px rgba(16,24,40,0.08)'
          }}>
            {/* gradient band with the key badge */}
            <div style={{ position: 'relative', height: 92, background: 'var(--header-bg)' }}>
              <span aria-hidden="true" style={{ position: 'absolute', width: 220, height: 220, right: -60, top: -120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.18), rgba(255,255,255,0) 70%)' }} />
              <div aria-hidden="true" style={{
                position: 'absolute', left: isMobile ? 20 : 32, bottom: -28, width: 60, height: 60, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
                background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: '0 8px 20px rgba(16,24,40,0.12)', color: 'var(--accent)'
              }}><KeyRound size={28} /></div>
            </div>
            <div style={{ padding: isMobile ? '40px 20px 24px' : '44px 32px 32px' }}>
              <h2 style={{ margin: '0 0 6px', fontSize: isMobile ? '20px' : '22px', fontWeight: 750, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>Enter Room Code</h2>
              <p style={{ margin: '0 0 22px', color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
                Ask your teacher for the 6-character code to join their room.
              </p>

              {error && (
                <div role="alert" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', color: '#dc2626', fontSize: '14px', lineHeight: 1.4 }}>
                  {error}
                </div>
              )}

              <div data-tour="join-code" style={{ marginBottom: '18px' }}>
                <input
                  type="text"
                  className="app-input"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onKeyDown={(e) => e.key === 'Enter' && !isDisabled && handleJoinRoom()}
                  placeholder="XXXXXX"
                  aria-label="Room code"
                  autoComplete="off"
                  maxLength={6}
                  style={inputStyle({
                    padding: isMobile ? '16px 12px' : '20px 16px', borderWidth: 2, borderRadius: 16,
                    fontSize: isMobile ? '26px' : '32px', fontWeight: 800, letterSpacing: isMobile ? '8px' : '12px', textAlign: 'center',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    borderColor: isFocused ? 'var(--accent)' : 'var(--border-color)'
                  })}
                />
                <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                  {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} style={{ width: 22, height: 4, borderRadius: 4, background: i < roomCode.length ? 'var(--accent)' : 'var(--border-color)', transition: 'background .15s ease' }} />
                  ))}
                </div>
              </div>

              <button data-tour="join-button" onClick={handleJoinRoom} disabled={isDisabled} style={primaryButton(isDisabled, { width: '100%', padding: '14px 18px', fontSize: '16px', borderRadius: 14 })}>
                {isJoining ? 'Joining…' : 'Join Room →'}
              </button>
              <p style={{ margin: '14px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', textAlign: 'center' }}>
                Tip: keep this tab open during the class. Questions pop up here as your teacher launches them.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default JoinRoomPage
