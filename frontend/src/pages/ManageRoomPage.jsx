import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useThemeStore from '../stores/themeStore'
import RoomCard from '../components/RoomCard'
import useIsMobile from '../hooks/useIsMobile'

function ManageRoomPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user, token } = useAuthStore()
  const { rooms, isLoading, fetchRooms, deleteRoom, startRoom, setAuthToken } = useRoomStore()
  const { isDark } = useThemeStore()

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchRooms()
    }
  }, [token])

  const handleDeleteRoom = async (roomId) => {
    if (window.confirm('Are you sure you want to delete this room?')) {
      try {
        await deleteRoom(roomId)
      } catch (err) {
        console.error('Failed to delete room:', err)
      }
    }
  }

  // Filter only active rooms (not ended)
  const activeRooms = rooms?.filter(r => !r.endedAt) || []

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <Sidebar user={user} />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        marginLeft: 'var(--sidebar-width, 240px)',
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: isMobile ? '20px 16px' : '28px 32px',
          paddingLeft: isMobile ? '64px' : '32px',
          boxShadow: 'var(--shadow-sm)',
          boxSizing: 'border-box'
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
                fontWeight: '700',
                letterSpacing: '-0.02em'
              }}>Manage Rooms</h1>
              <p style={{ margin: '6px 0 0', opacity: 0.9, fontSize: '14px' }}>View and manage your active classrooms</p>
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
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '20px'
          }}>
            <h2 style={{
              margin: 0,
              fontSize: isMobile ? '17px' : '18px',
              fontWeight: '700',
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em'
            }}>
              Active Rooms
            </h2>
            {!isLoading && activeRooms.length > 0 && (
              <span style={{
                fontSize: '13px',
                fontWeight: '600',
                color: 'var(--text-secondary)'
              }}>
                {activeRooms.length} active
              </span>
            )}
          </div>

          {isLoading ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 24px',
              color: 'var(--text-secondary)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              Loading rooms...
            </div>
          ) : activeRooms.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px'
            }}>
              {activeRooms.map((room) => (
                <RoomCard key={room._id} room={room} showDelete={true} />
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '48px 24px',
              color: 'var(--text-secondary)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
              <p style={{ margin: 0 }}>No active rooms.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ManageRoomPage
