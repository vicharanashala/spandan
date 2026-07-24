import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import SpandanIcon from './SpandanIcon'
import useSidebarStore from '../stores/sidebarStore'

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

const MOBILE_QUERY = '(max-width: 768px)'

export default function Sidebar({ user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const role = user?.role || 'student'
  const items = menuItems[role] || menuItems.student

  const { isCollapsed, toggle } = useSidebarStore()
  const sidebarWidth = isCollapsed ? '60px' : '240px'

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  // Track viewport → mobile vs desktop
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = (e) => {
      setIsMobile(e.matches)
      if (!e.matches) setMobileOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Close the mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const railWidth = isMobile ? '260px' : sidebarWidth
  const showLabels = isMobile || !isCollapsed
  const hidden = isMobile && !mobileOpen

  return (
    <>
      {/* Floating hamburger — mobile only, when drawer closed */}
      {isMobile && !mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          style={{
            position: 'fixed', top: '14px', left: '14px', zIndex: 60,
            width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #1e40af, #3b82f6)', color: 'white',
            border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '18px',
            boxShadow: '0 4px 14px rgba(30,64,175,0.35)'
          }}
        >☰</button>
      )}

      {/* Backdrop — mobile drawer open */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 55, backdropFilter: 'blur(1px)' }}
        />
      )}

      {/* Sidebar (rail on desktop, drawer on mobile) */}
      <aside style={{
        position: 'fixed', left: 0, top: 0, bottom: 0,
        width: railWidth,
        background: 'var(--sidebar-bg)',
        boxShadow: 'var(--sidebar-shadow)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex', flexDirection: 'column',
        zIndex: 56,
        transform: hidden ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.25s ease, width 0.2s ease',
        overflow: 'hidden'
      }}>
        {/* Logo */}
        <div style={{
          padding: showLabels ? '18px 16px' : '18px 0',
          display: 'flex', alignItems: 'center', justifyContent: showLabels ? 'space-between' : 'center',
          gap: '10px', borderBottom: '1px solid var(--border-color)', minHeight: '64px', boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, margin: showLabels ? '0' : '0 auto' }}>
            <div style={{
              width: '40px', height: '40px', background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
              borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px', flexShrink: 0, boxShadow: '0 2px 8px rgba(30,64,175,0.3)'
            }}>
              <SpandanIcon />
            </div>
            {showLabels && (
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Spandan</h2>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{role} Portal</p>
              </div>
            )}
          </div>
          {isMobile && mobileOpen && (
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              style={{
                width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px',
                color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '15px', flexShrink: 0,
                transition: 'all 0.15s ease'
              }}
            >✕</button>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: showLabels ? '14px 12px' : '10px 0', overflowY: 'auto' }}>
          {items.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.id === 'dashboard' && (location.pathname === '/teacher' || location.pathname === '/student'))
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                title={item.label}
                style={{
                  width: showLabels ? '100%' : '40px',
                  height: showLabels ? 'auto' : '40px',
                  margin: showLabels ? '0 0 4px' : '0 auto 6px',
                  display: 'flex', alignItems: 'center', justifyContent: showLabels ? 'flex-start' : 'center',
                  gap: '12px', padding: showLabels ? '11px 14px' : '0',
                  background: isActive ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : 'transparent',
                  border: 'none', borderRadius: '10px', cursor: 'pointer',
                  color: isActive ? 'white' : 'var(--text-secondary)',
                  fontSize: '14px', fontWeight: isActive ? 600 : 500, textAlign: 'left',
                  boxShadow: isActive ? '0 2px 10px rgba(30,64,175,0.28)' : 'none',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--nav-hover)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
                onMouseOut={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
              >
                <span style={{ fontSize: '18px', width: '24px', textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                {showLabels && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {/* User section */}
        <div style={{ padding: showLabels ? '14px 16px' : '14px 0', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: showLabels ? 'flex-start' : 'center', gap: '10px' }}>
            <div style={{
              width: '38px', height: '38px',
              background: user?.profileImage ? 'transparent' : 'linear-gradient(135deg, #1e40af, #3b82f6)',
              borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '14px', fontWeight: 600, flexShrink: 0, overflow: 'hidden',
              margin: showLabels ? '0' : '0 auto'
            }}>
              {user?.profileImage
                ? <img src={user.profileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (user?.name?.charAt(0)?.toUpperCase() || 'U')}
            </div>
            {showLabels && (
              <div style={{ overflow: 'hidden' }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'User'}</p>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{role}</p>
              </div>
            )}
          </div>
        </div>

        {/* Toggle button at bottom (desktop) with ◀ icon that rotates */}
        {!isMobile && (
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: isCollapsed ? 'center' : 'flex-end',
            alignItems: 'center'
          }}>
            <button
              onClick={toggle}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{
                width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '8px',
                color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px', flexShrink: 0,
                transition: 'all 0.2s ease',
                transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)'
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'var(--nav-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              ◀
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
