import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import useIsMobile from '../hooks/useIsMobile'
import { PageHeader, pageWash, inputStyle, primaryButton } from '../components/AppUI'
import { KeyRound, Link as LinkIcon, Users } from 'lucide-react'

function JoinRoomPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, token } = useAuthStore()
  const { joinRoom, leaveRoom } = useSocketStore()
  const { joinRoomByCode, joinCoHostRoom, fetchRoomByCode, setAuthToken } = useRoomStore()
  const isMobile = useIsMobile()

  const isTeacher = user?.role === 'teacher'
  const isTeacherRoute = location.pathname.includes('/teacher/join-cohost')

  const [roomCode, setRoomCode] = useState('')
  const [coHostCode, setCoHostCode] = useState('')
  const [isCoHostJoin, setIsCoHostJoin] = useState(isTeacherRoute || isTeacher)
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isCoHostFocused, setIsCoHostFocused] = useState(false)

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

    if (isTeacher && isCoHostJoin && !coHostCode.trim()) {
      setError('Please enter the 8-character Co-Host Join Code')
      return
    }

    setIsJoining(true)
    setError('')

    try {
      if (isTeacher && isCoHostJoin) {
        // Synchronous REST join first to ensure room.coHosts is saved in Mongo before mounting RoomDetailPage
        const room = await joinCoHostRoom(roomCode.trim().toUpperCase(), coHostCode.trim().toUpperCase())
        joinRoom(room.code, user._id, coHostCode.trim().toUpperCase())
        navigate(`/teacher/room/${room._id}`)
      } else {
        const room = await joinRoomByCode(roomCode.trim().toUpperCase())
        joinRoom(room.code, user._id)
        navigate(`/student/session/${room.code}`)
      }
    } catch (err) {
      setError(err.message || 'Failed to join room. Please check the codes and try again.')
    } finally {
      setIsJoining(false)
    }
  }

  const isDisabled = isJoining || roomCode.length < 6 || (isTeacher && isCoHostJoin && coHostCode.length < 8)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif', maxWidth: '100%' }}>
      <Sidebar user={user} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width, 240px)', minWidth: 0, maxWidth: '100%' }}>
        <PageHeader
          isMobile={isMobile}
          icon={isTeacher && isCoHostJoin ? Users : LinkIcon}
          title={isTeacher && isCoHostJoin ? 'Join as Co-Host' : 'Join a Room'}
          subtitle={
            isTeacher && isCoHostJoin
              ? 'Enter the room code and 8-character co-host code shared by the host teacher'
              : 'Enter the code shared by your teacher'
          }
        />

        {/* Content */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '40px 32px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', boxSizing: 'border-box', background: pageWash }}>
          <div className="insight-card" style={{
            background: 'var(--bg-card)', borderRadius: 22, border: '1px solid var(--border-color)', width: '100%', maxWidth: 480, boxSizing: 'border-box', overflow: 'hidden',
            boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 14px 36px rgba(16,24,40,0.08)'
          }}>
            {/* gradient band with the key/users badge */}
            <div style={{ position: 'relative', height: 92, background: 'var(--header-bg)' }}>
              <span aria-hidden="true" style={{ position: 'absolute', width: 220, height: 220, right: -60, top: -120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.18), rgba(255,255,255,0) 70%)' }} />
              <div aria-hidden="true" style={{
                position: 'absolute', left: isMobile ? 20 : 32, bottom: -28, width: 60, height: 60, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
                background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: '0 8px 20px rgba(16,24,40,0.12)', color: 'var(--accent)'
              }}>
                {isTeacher && isCoHostJoin ? <Users size={28} /> : <KeyRound size={28} />}
              </div>
            </div>

            <div style={{ padding: isMobile ? '40px 20px 24px' : '44px 32px 32px' }}>
              <h2 style={{ margin: '0 0 6px', fontSize: isMobile ? '20px' : '22px', fontWeight: 750, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                {isTeacher && isCoHostJoin ? 'Co-Host Join Details' : 'Enter Room Code'}
              </h2>
              <p style={{ margin: '0 0 22px', color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
                {isTeacher && isCoHostJoin
                  ? 'Provide the 6-character room code and the 8-character active co-host code'
                  : 'Ask your teacher for the 6-character code to join their room.'}
              </p>

              {error && (
                <div role="alert" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', color: '#dc2626', fontSize: '14px', lineHeight: 1.4 }}>
                  {error}
                </div>
              )}

              {/* Room Code Field */}
              <div data-tour="join-code" style={{ marginBottom: isTeacher && isCoHostJoin ? '16px' : '18px' }}>
                {isTeacher && isCoHostJoin && (
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Room Code (6 characters)
                  </label>
                )}
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
                    fontSize: isMobile ? '24px' : '28px', fontWeight: 800, letterSpacing: isMobile ? '6px' : '10px', textAlign: 'center',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    borderColor: isFocused ? 'var(--accent)' : 'var(--border-color)'
                  })}
                />
                {!isTeacher && (
                  <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                    {Array.from({ length: 6 }, (_, i) => (
                      <span key={i} style={{ width: 22, height: 4, borderRadius: 4, background: i < roomCode.length ? 'var(--accent)' : 'var(--border-color)', transition: 'background .15s ease' }} />
                    ))}
                  </div>
                )}
              </div>

              {/* Co-Host Join Code Field (Teachers only) */}
              {isTeacher && isCoHostJoin && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Co-Host Join Code (8 characters)
                  </label>
                  <input
                    type="text"
                    className="app-input"
                    value={coHostCode}
                    onChange={(e) => setCoHostCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    onFocus={() => setIsCoHostFocused(true)}
                    onBlur={() => setIsCoHostFocused(false)}
                    onKeyDown={(e) => e.key === 'Enter' && !isDisabled && handleJoinRoom()}
                    placeholder="XXXXXXXX"
                    aria-label="Co-host code"
                    autoComplete="off"
                    maxLength={8}
                    style={inputStyle({
                      padding: isMobile ? '14px 12px' : '18px 14px', borderWidth: 2, borderRadius: 16,
                      fontSize: isMobile ? '20px' : '24px', fontWeight: 800, letterSpacing: isMobile ? '4px' : '6px', textAlign: 'center',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      borderColor: isCoHostFocused ? 'var(--accent)' : 'var(--border-color)'
                    })}
                  />
                  <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
                    {Array.from({ length: 8 }, (_, i) => (
                      <span key={i} style={{ width: 18, height: 4, borderRadius: 4, background: i < coHostCode.length ? 'var(--accent)' : 'var(--border-color)', transition: 'background .15s ease' }} />
                    ))}
                  </div>
                </div>
              )}

              <button
                data-tour="join-button"
                onClick={handleJoinRoom}
                disabled={isDisabled}
                style={primaryButton(isDisabled, { width: '100%', padding: '14px 18px', fontSize: '16px', borderRadius: 14 })}
              >
                {isJoining ? 'Joining…' : (isTeacher && isCoHostJoin ? 'Join as Co-Host →' : 'Join Room →')}
              </button>

              {!isTeacher && (
                <p style={{ margin: '14px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', textAlign: 'center' }}>
                  Tip: keep this tab open during the class. Questions pop up here as your teacher launches them.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default JoinRoomPage
