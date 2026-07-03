import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import SpandanIcon from './SpandanIcon'
import useSidebarStore from '../stores/sidebarStore'

const menuItems = {
  teacher: [
    { id: 'dashboard', label: 'T Dashboard', icon: '📊', path: '/teacher' },
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
  const { isCollapsed, toggle } = useSidebarStore()
  const role = user?.role || 'student'
  const items = menuItems[role] || menuItems.student
  const sidebarWidth = isCollapsed ? '60px' : '240px'

  return (
    <>
      {/* Sidebar */}
      <aside style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: sidebarWidth,
        background: 'var(--sidebar-bg)',
        boxShadow: 'var(--sidebar-shadow)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden'
      }}>
        {/* Logo section */}
        <div style={{
          padding: isCollapsed ? '20px 10px' : '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid var(--border-color)',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          transition: 'padding 0.3s ease'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            minWidth: '40px',
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
          {!isCollapsed && (
            <div style={{ opacity: 1, transition: 'opacity 0.2s ease' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>Spandan</h2>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{role} Portal</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: isCollapsed ? '16px 8px' : '16px 12px', overflowY: 'auto' }}>
          {items.map((item) => {
            const isActive = location.pathname === item.path || 
              (item.id === 'dashboard' && location.pathname === '/teacher') ||
              (item.id === 'dashboard' && location.pathname === '/student')
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                title={isCollapsed ? item.label : undefined}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  gap: '12px',
                  padding: isCollapsed ? '12px 8px' : '12px 16px',
                  marginBottom: '4px',
                  background: isActive ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : 'transparent',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  color: isActive ? 'white' : 'var(--text-secondary)',
                  fontSize: '14px',
                  fontWeight: isActive ? '600' : '500',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
                className=""
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
                <span style={{ fontSize: '18px', width: '24px', minWidth: '24px', textAlign: 'center' }}>{item.icon}</span>
                {!isCollapsed && <span>{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {/* Toggle Button - Gemini Style */}
        <div style={{
          padding: '8px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'center'
        }}>
          <button
            onClick={toggle}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="sidebar-toggle-hover"
            style={{
              width: isCollapsed ? '44px' : '100%',
              padding: '10px 12px',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '16px',
              transition: 'all 0.2s ease'
            }}
          >
            <span style={{
              display: 'inline-block',
              transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)'
            }}>
              ◀
            </span>
            {!isCollapsed && <span style={{ fontSize: '12px', fontWeight: '500' }}>Collapse</span>}
          </button>
        </div>

        {/* User section */}
        {!isCollapsed && (
          <div style={{
            padding: '16px',
            borderTop: '1px solid var(--border-color)',
            transition: 'opacity 0.2s ease'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div className="profile-avatar-hover" style={{
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
        )}
      </aside>
    </>
  )
}