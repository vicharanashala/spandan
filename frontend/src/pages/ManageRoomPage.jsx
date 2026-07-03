import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'

function ManageRoomPage() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { rooms, isLoading, fetchRooms, deleteRoom, setAuthToken } = useRoomStore()

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
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width)' }}>
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: '24px 32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Manage Rooms</h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>View and manage your active classrooms</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="card-hover" style={{ flex: 1, padding: '32px' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
            Active Rooms
          </h2>
          
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              Loading rooms...
            </div>
          ) : activeRooms.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {activeRooms.map((room) => (
                <div className="stats-card-hover"
                  key={room._id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '20px',
                    background: 'var(--bg-card)',
                    borderRadius: '16px',
                    border: '1px solid var(--border-color)',
                    minHeight: '140px'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                      {room.name}
                    </h3>
                    <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Code: <strong style={{ color: '#3b82f6', letterSpacing: '1px' }}>{room.code}</strong>
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {room.questionCount || 0} questions
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                    <button
                      onClick={() => navigate(`/teacher/room/${room._id}`)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Manage
                    </button>
                    <button
                      onClick={() => handleDeleteRoom(room._id)}
                      style={{
                        padding: '10px 12px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
              <p>No active rooms.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ManageRoomPage