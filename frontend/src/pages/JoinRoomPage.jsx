import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useIsMobile from '../hooks/useIsMobile'

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
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      maxWidth: '100%'
    }}>
      <Sidebar user={user} />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        marginLeft: 'var(--sidebar-width, 240px)',
        minWidth: 0,
        maxWidth: '100%'
      }}>
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: isMobile ? '20px 16px' : '28px 32px',
          paddingLeft: isMobile ? '64px' : '32px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            minWidth: 0
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{
                margin: 0,
                fontSize: isMobile ? '20px' : '25px',
                fontWeight: 700,
                letterSpacing: '-0.02em'
              }}>
                Join a Room
              </h1>
              <p style={{
                margin: '4px 0 0',
                opacity: 0.9,
                fontSize: isMobile ? '13px' : '14px'
              }}>
                Enter the code shared by your teacher
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{
          flex: 1,
          padding: isMobile ? '16px' : '32px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            padding: isMobile ? '24px 20px' : '32px',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--border-color)',
            width: '100%',
            maxWidth: '480px',
            boxSizing: 'border-box'
          }}>
            {/* Icon badge */}
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius)',
              background: 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
              marginBottom: '20px',
              boxShadow: '0 2px 10px rgba(30,64,175,.25)'
            }}>
              🔑
            </div>

            <h2 style={{
              margin: '0 0 8px',
              fontSize: isMobile ? '19px' : '21px',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)'
            }}>
              Enter Room Code
            </h2>
            <p style={{
              margin: '0 0 24px',
              color: 'var(--text-secondary)',
              fontSize: '14px',
              lineHeight: 1.5
            }}>
              Ask your teacher for the 6-digit code to join their room
            </p>

            {error && (
              <div style={{
                background: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
                marginBottom: '16px',
                color: '#dc2626',
                fontSize: '14px',
                lineHeight: 1.4
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '24px' }}>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="XXXXXX"
                maxLength={6}
                style={{
                  width: '100%',
                  padding: isMobile ? '16px 12px' : '20px 16px',
                  border: `2px solid ${isFocused ? 'var(--accent)' : 'var(--border-color)'}`,
                  borderRadius: 'var(--radius)',
                  fontSize: isMobile ? '24px' : '30px',
                  fontWeight: 700,
                  letterSpacing: isMobile ? '6px' : '10px',
                  textAlign: 'center',
                  outline: 'none',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                  boxShadow: isFocused ? '0 0 0 4px rgba(59,130,246,0.15)' : 'none',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
                }}
              />
            </div>

            <button
              onClick={handleJoinRoom}
              disabled={isDisabled}
              style={{
                width: '100%',
                padding: '14px 18px',
                background: isDisabled ? 'var(--border-color)' : 'var(--accent-gradient)',
                color: isDisabled ? 'var(--text-secondary)' : '#fff',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: '16px',
                fontWeight: 600,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                boxShadow: isDisabled ? 'none' : '0 2px 10px rgba(30,64,175,.25)',
                transition: 'transform 0.1s ease, box-shadow 0.15s ease'
              }}
            >
              {isJoining ? 'Joining...' : 'Join Room'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default JoinRoomPage
