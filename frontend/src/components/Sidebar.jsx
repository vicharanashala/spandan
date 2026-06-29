import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import SpandanIcon from './SpandanIcon'

const menuItems = {
  teacher: [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', path: '/teacher' },
    { id: 'create-room', label: 'Create Room', icon: '➕', path: '/teacher/create-room' },
    { id: 'manage-room', label: 'Manage Room', icon: '⚙️', path: '/teacher/manage-room' },
    { id: 'room-history', label: 'Room History', icon: '📜', path: '/teacher/room-history' },
  ],
  student: [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', path: '/student' },
    { id: 'join-room', label: 'Join Room', icon: '🔗', path: '/student/join-room' },
    { id: 'room-history', label: 'Room History', icon: '📜', path: '/student/room-history' },
  ]
}

export default function Sidebar({ user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const role = user?.role || 'student'
  const items = menuItems[role] || menuItems.student

  return (
    <>
      {/* Mobile overlay */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 40,
          display: 'none'
        }}
        className="sidebar-overlay"
      />
      
      {/* Sidebar - Always expanded */}
      <aside style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: '240px',
        background: 'var(--sidebar-bg)',
        boxShadow: 'var(--sidebar-shadow)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50
      }}>
        {/* Logo section */}
        <div style={{
          padding: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            flexShrink: 0
          }}>
            <SpandanIcon />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>Spandan</h2>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{role} Portal</p>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
          {items.map((item) => {
            const isActive = location.pathname === item.path || 
              (item.id === 'dashboard' && location.pathname === '/teacher') ||
              (item.id === 'dashboard' && location.pathname === '/student')
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  marginBottom: '4px',
                  background: isActive ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : 'transparent',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  color: isActive ? 'white' : 'var(--text-secondary)',
                  fontSize: '14px',
                  fontWeight: isActive ? '600' : '500',
                  textAlign: 'left',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--nav-hover)'
                    e.currentTarget.style.color = 'var(--text-primary)'
                  }
                }}
                onMouseOut={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }
                }}
              >
                <span style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* User section */}
        <div style={{
          padding: '16px',
          borderTop: '1px solid var(--border-color)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              background: user?.profileImage ? 'transparent' : 'linear-gradient(135deg, #1e40af, #3b82f6)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              flexShrink: 0,
              overflow: 'hidden'
            }}>
              {user?.profileImage ? (
                <img src={user.profileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                user?.name?.charAt(0)?.toUpperCase() || 'U'
              )}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name || 'User'}
              </p>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{role}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
