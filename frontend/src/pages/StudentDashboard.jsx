import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'
import useRoomStore from '../stores/roomStore'

function StudentDashboard() {
  const navigate = useNavigate()
  const { user, token, isAuthenticated, logout } = useAuthStore()
  const { socket, isConnected, joinRoom, leaveRoom } = useSocketStore()
  const { joinRoomByCode, setAuthToken } = useRoomStore()
  
  const [roomCode, setRoomCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')
  const [joinedRoom, setJoinedRoom] = useState(null)

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
    } catch (err) {
      setError(err.message || 'Failed to join room')
    } finally {
      setIsJoining(false)
    }
  }

  const handleLeaveRoom = () => {
    if (joinedRoom) {
      leaveRoom(joinedRoom.code)
      setJoinedRoom(null)
    }
  }

  const handleLogout = () => {
    if (joinedRoom) {
      leaveRoom(joinedRoom.code)
    }
    logout()
    navigate('/')
  }

  if (!isAuthenticated) {
    navigate('/')
    return null
  }

  return (
    <div className="min-h-screen" style={{
      background: 'linear-gradient(135deg, #f8f9fb 90%, #e0e7ff 100%)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      {/* Header */}
      <header style={{
        background: 'linear-gradient(to right, #059669, #10b981)',
        color: 'white',
        padding: '16px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px'
          }}>
            ✨
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Spandan</h1>
            <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>Student Dashboard</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isConnected ? '#10b981' : '#ef4444'
            }}></div>
            <span style={{ fontSize: '14px' }}>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '32px' }}>
        {/* Welcome Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #059669, #10b981)',
          borderRadius: '20px',
          padding: '40px',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px',
          boxShadow: '0 10px 40px rgba(16, 185, 129, 0.3)'
        }}>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
              Welcome, {user?.name || 'Student'}
            </h2>
            <p style={{ fontSize: '16px', opacity: 0.9, margin: 0 }}>
              Join classroom sessions and participate in polls
            </p>
          </div>
          <div style={{
            width: '100px',
            height: '100px',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontSize: '40px' }}>📚</span>
          </div>
        </div>

        {/* Join Room Card */}
        {!joinedRoom ? (
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{ fontSize: '24px', color: 'white' }}>🚪</span>
              </div>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
                  Join a Session
                </h3>
                <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>
                  Enter the room code provided by your teacher
                </p>
              </div>
            </div>

            {error && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '20px',
                color: '#dc2626',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="text"
                placeholder="Enter room code (e.g., ABC123)"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  fontSize: '18px',
                  fontWeight: '600',
                  textAlign: 'center',
                  letterSpacing: '4px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  outline: 'none',
                  textTransform: 'uppercase'
                }}
                onFocus={(e) => e.target.style.borderColor = '#10b981'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
              <button
                onClick={handleJoinRoom}
                disabled={!roomCode.trim() || isJoining}
                style={{
                  padding: '14px 32px',
                  background: roomCode.trim() && !isJoining ? '#059669' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: roomCode.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '16px',
                  fontWeight: '600',
                  boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
                }}
              >
                {isJoining ? 'Joining...' : 'Join'}
              </button>
            </div>
          </div>
        ) : (
          /* Joined Room View */
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{
                width: '80px',
                height: '80px',
                background: '#ecfdf5',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <span style={{ fontSize: '40px' }}>✅</span>
              </div>
              <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#059669', marginBottom: '8px' }}>
                Joined Successfully!
              </h3>
              <p style={{ fontSize: '16px', color: '#6b7280' }}>
                You are now in the session: <strong>{joinedRoom.name}</strong>
              </p>
            </div>

            <div style={{
              background: '#f3f4f6',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
                Room Code
              </p>
              <p style={{ fontSize: '32px', fontWeight: '700', color: '#1f2937', letterSpacing: '6px' }}>
                {joinedRoom.code}
              </p>
            </div>

            <button
              onClick={handleLeaveRoom}
              style={{
                width: '100%',
                padding: '14px',
                background: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '500'
              }}
            >
              Leave Session
            </button>
          </div>
        )}

        {/* Instructions */}
        <div style={{
          background: '#eff6ff',
          borderRadius: '16px',
          padding: '24px',
          marginTop: '24px',
          border: '1px solid #bfdbfe'
        }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1e40af', marginBottom: '12px' }}>
            How to Join a Session
          </h4>
          <ol style={{ color: '#3b82f6', fontSize: '14px', lineHeight: '1.8', paddingLeft: '20px', margin: 0 }}>
            <li>Get the room code from your teacher</li>
            <li>Enter the 6-character code above</li>
            <li>Click Join to enter the classroom session</li>
            <li>Answer poll questions when they appear</li>
          </ol>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        textAlign: 'center',
        padding: '32px',
        color: '#6b7280',
        fontSize: '14px'
      }}>
        <p style={{ margin: 0 }}>Spandan - Poll Question Generator</p>
      </footer>
    </div>
  )
}

export default StudentDashboard