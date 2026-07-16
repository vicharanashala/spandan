import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'

function RoomHistoryPage() {
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { rooms, isLoading, fetchRooms, setAuthToken } = useRoomStore()

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      // Students use dedicated endpoint for their room history
      if (user?.role === 'student') {
        useRoomStore.getState().fetchStudentRoomHistory()
      } else {
        fetchRooms()
      }
    }
  }, [token, user?.role])

  // Teacher: only ended rooms. Student: all rooms they participated in
  const displayRooms = user?.role === 'student'
    ? (rooms || [])
    : (rooms?.filter(r => r.endedAt) || [])

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
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Room History</h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>View past classroom sessions</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, padding: '32px' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
            Ended Rooms
          </h2>
          
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              Loading rooms...
            </div>
          ) : displayRooms.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {displayRooms.map((room) => (
                <div
                  key={room._id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '20px',
                    background: 'var(--nav-hover)',
                    borderRadius: '16px',
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
                      Ended {room.endedAt ? new Date(room.endedAt).toLocaleDateString() : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/${user?.role === 'teacher' ? 'teacher' : 'student'}/room/${room._id}/results`)}
                    style={{
                      marginTop: '16px',
                      padding: '10px 16px',
                      background: '#059669',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    View Results →
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📜</div>
              <p>No ended rooms yet.</p>
              <p style={{ fontSize: '12px', marginTop: '8px' }}>Rooms you join will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default RoomHistoryPage