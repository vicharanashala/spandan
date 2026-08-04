import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useIsMobile from '../hooks/useIsMobile'
import { API_URL } from '../config.js'

function ManageRoomPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user, token } = useAuthStore()
  const { rooms, isLoading, fetchRooms, deleteRoom, setAuthToken } = useRoomStore()

  useEffect(() => {
    if (token) {
      setAuthToken(token)
      fetchRooms()
      fetchCoHostRooms()
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

  const isOwner = (room) => {
    const teacherId = room.teacher?._id || room.teacher
    return teacherId?.toString() === user?._id?.toString()
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
                <div
                  key={room._id}
                  onClick={() => navigate(`/teacher/room/${room._id}`)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '24px',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-color)',
                    boxShadow: 'var(--shadow-md)',
                    minHeight: '150px',
                    minWidth: 0,
                    cursor: 'pointer',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    boxSizing: 'border-box'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      marginBottom: '12px'
                    }}>
                      <h3 style={{
                        margin: 0,
                        fontSize: '17px',
                        fontWeight: '700',
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.01em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0
                      }}>
                        {room.name}
                      </h3>
                      <span style={{
                        flexShrink: 0,
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#16a34a',
                        background: 'rgba(22, 163, 74, 0.12)'
                      }}>
                        Active
                      </span>
                    </div>
                    <p style={{ margin: '0 0 6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Code: <strong style={{ color: 'var(--accent)', letterSpacing: '1px' }}>{room.code}</strong>
                    </p>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {room.questionCount || 0} questions
                    </p>
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '20px',
                    flexWrap: 'wrap'
                  }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/teacher/room/${room._id}`) }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '11px 18px',
                        background: 'var(--accent-gradient)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius)',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      Manage
                    </button>
                    {/* Delete — owner only */}
                    {isOwner(room) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteRoom(room._id) }}
                        style={{
                          padding: '11px 16px',
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 'var(--radius)',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
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

          {/* Co-hosting section */}
          {coHostRooms.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '36px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: isMobile ? '17px' : '18px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🤝 Co-hosting
                  <span style={{ fontSize: '12px', fontWeight: 500, background: '#7c3aed', color: 'white', borderRadius: '999px', padding: '2px 10px' }}>
                    {coHostRooms.length}
                  </span>
                </h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {coHostRooms.map((room) => (
                  <div
                    key={room._id}
                    onClick={() => navigate(`/teacher/room/${room._id}`)}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
                    style={{
                      display: 'flex', flexDirection: 'column', padding: '24px',
                      background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
                      border: '2px solid #7c3aed33', boxShadow: 'var(--shadow-md)',
                      minHeight: '150px', minWidth: 0, cursor: 'pointer',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                      boxSizing: 'border-box', position: 'relative'
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '14px', right: '14px',
                      fontSize: '11px', fontWeight: 600, background: '#7c3aed22',
                      color: '#7c3aed', borderRadius: '999px', padding: '3px 10px',
                      border: '1px solid #7c3aed44'
                    }}>Co-host</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: '0 0 10px', fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', paddingRight: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {room.name}
                      </h3>
                      <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-secondary)' }}>Owner: <strong>{room.teacher?.name || 'Unknown'}</strong></p>
                      <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-secondary)' }}>Code: <strong style={{ color: '#7c3aed', letterSpacing: '1px' }}>{room.code}</strong></p>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>{room.questionCount || 0} questions</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/teacher/room/${room._id}`) }}
                      style={{
                        marginTop: '20px', padding: '11px 18px',
                        background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                        color: '#fff', border: 'none', borderRadius: 'var(--radius)',
                        fontSize: '14px', fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      Enter Session →
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ManageRoomPage
