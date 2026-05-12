import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import useSocketStore from '../stores/socketStore'

function DashboardPage() {
  const navigate = useNavigate()
  const { user, token, isAuthenticated, logout } = useAuthStore()
  const { socket, isConnected, currentRoom } = useSocketStore()
  const { rooms, currentRoom: roomData, isLoading, error, fetchRooms, createRoom, getRoom, updateRoom, deleteRoom, setAuthToken } = useRoomStore()
  
  const [roomName, setRoomName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Set auth token for room store
  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchRooms()
    }
  }, [token])

  const handleCreateRoom = async () => {
    if (!roomName.trim()) return
    setIsCreating(true)
    try {
      await createRoom(roomName.trim())
      setRoomName('')
      setShowCreateModal(false)
    } catch (err) {
      console.error('Failed to create room:', err)
    } finally {
      setIsCreating(false)
    }
  }

  const handleLogout = () => {
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
        background: 'linear-gradient(to right, #1e40af, #1e3a8a)',
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
            <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>Teacher Dashboard</p>
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
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
        {/* Welcome Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
          borderRadius: '20px',
          padding: '40px',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px',
          boxShadow: '0 10px 40px rgba(30, 64, 175, 0.3)'
        }}>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
              Welcome Back, {user?.name || 'Educator'}
            </h2>
            <p style={{ fontSize: '16px', opacity: 0.9, margin: 0 }}>
              Create and manage assessment spaces for your classroom
            </p>
          </div>
          <div style={{
            width: '120px',
            height: '120px',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontSize: '48px' }}>📊</span>
          </div>
        </div>

        {/* Create Room Button */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb',
          marginBottom: '32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{ fontSize: '24px', color: 'white' }}>📝</span>
              </div>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
                  Create Assessment Space
                </h3>
                <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>
                  Set up a new room for your classroom
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)'
              }}
            >
              + Create New
            </button>
          </div>
        </div>

        {/* Rooms List */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', marginBottom: '20px' }}>
            Your Assessment Spaces
          </h3>
          
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              Loading rooms...
            </div>
          ) : rooms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>📋</span>
              <p>No assessment spaces yet. Create one to get started!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              {rooms.map((room) => (
                <div
                  key={room._id}
                  style={{
                    padding: '20px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                >
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>
                      {room.name}
                    </h4>
                    <p style={{ fontSize: '14px', color: '#6b7280' }}>
                      Code: <strong style={{ color: '#1e40af' }}>{room.code}</strong> • 
                      {room.isActive ? ' Active' : ' Inactive'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      style={{
                        padding: '8px 16px',
                        background: '#eff6ff',
                        color: '#1e40af',
                        border: '1px solid #bfdbfe',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Open
                    </button>
                    <button
                      onClick={() => deleteRoom(room._id)}
                      style={{
                        padding: '8px 16px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '24px',
          marginTop: '32px'
        }}>
          {[
            { icon: '🏠', label: 'Total Rooms', value: rooms.length.toString(), color: '#1e40af' },
            { icon: '📊', label: 'Total Polls', value: '0', color: '#7c3aed' },
            { icon: '👥', label: 'Total Responses', value: '0', color: '#059669' },
            { icon: '📈', label: 'Participation Rate', value: '0%', color: '#dc2626' }
          ].map((stat, index) => (
            <div key={index} style={{
              background: 'white',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <span style={{ fontSize: '24px' }}>{stat.icon}</span>
                <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{stat.label}</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: stat.color }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '24px',
            padding: '32px',
            maxWidth: '450px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', marginBottom: '20px' }}>
              Create New Assessment Space
            </h3>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                Assessment Title
              </label>
              <input
                type="text"
                placeholder="e.g., Algebra Midterm Review"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  fontSize: '16px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRoom}
                disabled={!roomName.trim() || isCreating}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: roomName.trim() && !isCreating ? '#1e40af' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: roomName.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '16px',
                  fontWeight: '500'
                }}
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

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

export default DashboardPage