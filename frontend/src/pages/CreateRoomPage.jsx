import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import useSocketStore from '../stores/socketStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useIsMobile from '../hooks/useIsMobile'

function CreateRoomPage() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { createRoom, setAuthToken } = useRoomStore()
  const isMobile = useIsMobile()

  const [roomName, setRoomName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  React.useEffect(() => {
    if (token) {
      setAuthToken(token)
    }
  }, [token])

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setError('Please enter a room name')
      return
    }

    setIsCreating(true)
    setError('')

    try {
      const room = await createRoom(roomName.trim())
      navigate(`/teacher/room/${room._id}`)
    } catch (err) {
      setError(err.message || 'Failed to create room')
    } finally {
      setIsCreating(false)
    }
  }

  const isDisabled = isCreating || !roomName.trim()

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      maxWidth: '100%'
    }}>
      <Sidebar user={user} />

      {/* Main Content */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        marginLeft: 'var(--sidebar-width, 240px)'
      }}>
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: isMobile ? '20px 16px' : '28px 32px',
          paddingLeft: isMobile ? '64px' : '32px'
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
                fontSize: isMobile ? '20px' : '25px',
                fontWeight: 700,
                letterSpacing: '-0.02em'
              }}>
                Create New Room
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Create a new room for your students
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
          boxSizing: 'border-box',
          maxWidth: '100%'
        }}>
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            padding: isMobile ? '20px' : '24px',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--border-color)',
            maxWidth: '600px',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <h2 style={{
              margin: '0 0 4px',
              fontSize: isMobile ? '17px' : '19px',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)'
            }}>
              Room Details
            </h2>
            <p style={{
              margin: '0 0 24px',
              fontSize: '13px',
              color: 'var(--text-secondary)'
            }}>
              Give your room a clear name so students can find it easily.
            </p>

            {error && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
                marginBottom: '16px',
                color: '#dc2626',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: '8px'
              }}>
                Room Name
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Enter room name..."
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--accent)'
                  e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,.15)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border-color)'
                  e.target.style.boxShadow = 'none'
                }}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  transition: 'border-color .15s ease, box-shadow .15s ease'
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
              />
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              flexDirection: isMobile ? 'column-reverse' : 'row'
            }}>
              <button
                onClick={handleCreateRoom}
                disabled={isDisabled}
                style={{
                  padding: '11px 18px',
                  background: isDisabled ? '#9ca3af' : 'var(--accent-gradient)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  fontSize: '14px',
                  fontWeight: 600,
                  boxShadow: isDisabled ? 'none' : '0 2px 10px rgba(30,64,175,.25)',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  width: isMobile ? '100%' : 'auto'
                }}
              >
                {isCreating ? 'Creating...' : 'Create Room'}
              </button>
              <button
                onClick={() => navigate('/teacher')}
                style={{
                  padding: '11px 18px',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: isMobile ? '100%' : 'auto'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CreateRoomPage
