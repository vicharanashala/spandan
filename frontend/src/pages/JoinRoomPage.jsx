import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'

function JoinRoomPage() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { joinRoom, leaveRoom } = useSocketStore()
  const { joinRoomByCode, setAuthToken } = useRoomStore()
  
  const [roomCode, setRoomCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')
  const [joinedRoom, setJoinedRoom] = useState(null)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (token) {
      setAuthToken(token)
    }
  }, [token])

  // Pre-fill code from URL ?code= param (set by email invite deep-link)
  useEffect(() => {
    const codeFromUrl = searchParams.get('code')
    if (codeFromUrl) {
      setRoomCode(codeFromUrl.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
    }
  }, [searchParams])

  const handleJoinRoom = useCallback(async (codeOverride) => {
    const code = codeOverride || roomCode
    if (!code.trim()) {
      setError('Please enter a room code')
      return
    }
    
    setIsJoining(true)
    setError('')
    
    try {
      const room = await joinRoomByCode(code.trim().toUpperCase())
      setJoinedRoom(room)
      joinRoom(room.code, user._id)
      navigate(`/student/session/${room.code}`)
    } catch (err) {
      setError(err.message || 'Failed to join room. Please check the code and try again.')
    } finally {
      setIsJoining(false)
    }
  }, [roomCode, joinRoomByCode, joinRoom, user, navigate])

  // Auto-submit when a valid code arrives from URL
  useEffect(() => {
    const codeFromUrl = searchParams.get('code')
    const normalized = codeFromUrl?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    if (normalized && normalized.length === 6 && token) {
      handleJoinRoom(normalized)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]) // run once when token (auth) is confirmed ready

  const handleLeaveRoom = () => {
    if (joinedRoom) {
      leaveRoom(joinedRoom.code, user._id)
      setJoinedRoom(null)
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
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '240px' }}>
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: '24px 32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Join a Room</h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>Enter the code shared by your teacher</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, padding: '32px' }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: 'var(--card-shadow)',
            border: '1px solid var(--border-color)',
            maxWidth: '500px',
            margin: '0 auto'
          }}>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)' }}>
              Enter Room Code
            </h2>
            <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: '14px' }}>
              Ask your teacher for the 6-digit code to join their room
            </p>
            
            {error && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px',
                color: '#dc2626',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}
            
            <div style={{ marginBottom: '24px' }}>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="XXXXXX"
                maxLength={6}
                style={{
                  width: '100%',
                  padding: '20px 16px',
                  border: '2px solid var(--border-color)',
                  borderRadius: '12px',
                  fontSize: '28px',
                  fontWeight: '700',
                  letterSpacing: '8px',
                  textAlign: 'center',
                  outline: 'none',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            <button
              onClick={() => handleJoinRoom()}
              disabled={isJoining || roomCode.length < 6}
              style={{
                width: '100%',
                padding: '16px',
                background: (isJoining || roomCode.length < 6) ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: (isJoining || roomCode.length < 6) ? 'not-allowed' : 'pointer'
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