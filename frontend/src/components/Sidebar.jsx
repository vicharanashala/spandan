import React, { useState, useEffect, useLayoutEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import SpandanIcon from './SpandanIcon'
import { LayoutDashboard, Plus, Settings, History as HistoryIcon, Link as LinkIcon, ShieldCheck, Menu, X, Library } from 'lucide-react'
import { renderIcon } from './icons'


const menuItems = {
  
teacher: [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/teacher' },
  { id: 'create-room', label: 'Create Room', icon: Plus, path: '/teacher/create-room' },
  { id: 'manage-room', label: 'Manage Room', icon: Settings, path: '/teacher/manage-room' },
  { id: 'question-bank', label: 'Question Bank', icon: Library, path: '/teacher/question-bank' },
  { id: 'room-history', label: 'Room History', icon: HistoryIcon, path: '/teacher/room-history' },
],

    
  student: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/student' },
    { id: 'join-room', label: 'Join Room', icon: LinkIcon, path: '/student/join-room' },
    { id: 'room-history', label: 'Room History', icon: HistoryIcon, path: '/student/room-history' },
  ]
}


const MOBILE_QUERY = '(max-width: 768px)'
const EXPANDED_W = 240
const COLLAPSED_W = 76

// Single source of truth for the layout: the sidebar writes --sidebar-width on :root and every
// page's content margin reads it (var(--sidebar-width, 240px)). Mobile → 0 (drawer overlays).
export default function Sidebar({ user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const role = user?.role || 'student'
  const baseItems = menuItems[role] || menuItems.student
  // Admins get an extra "Approvals" entry at the end. (The old "Manual" entry is gone: help now
  // lives in the ⓘ drawer in every page header.)
  let items = baseItems
  if (user?.isAdmin) {
    items = [...baseItems, { id: 'admin', label: 'Approvals', icon: ShieldCheck, path: '/admin' }]
  }

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1')
  const [mobileOpen, setMobileOpen] = useState(false)

  // Track viewport → mobile vs desktop.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = (e) => { setIsMobile(e.matches); if (!e.matches) setMobileOpen(false) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Publish the current sidebar width to the layout (before paint, so content lines up).
  useLayoutEffect(() => {
    const w = isMobile ? 0 : (collapsed ? COLLAPSED_W : EXPANDED_W)
    document.documentElement.style.setProperty('--sidebar-width', `${w}px`)
  }, [isMobile, collapsed])

  // Close the mobile drawer on navigation.
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const persistCollapsed = (val) => { setCollapsed(val); localStorage.setItem('sidebarCollapsed', val ? '1' : '0') }

  const railWidth = isMobile ? 260 : (collapsed ? COLLAPSED_W : EXPANDED_W)
  const showLabels = isMobile || !collapsed
  const hidden = isMobile && !mobileOpen

  const iconBtn = (onClick, label, children) => (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="sb-icon-btn"
      style={{
        width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '9px',
        color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px', flexShrink: 0
      }}
    >{children}</button>
  )

  const profilePath = role === 'teacher' ? '/teacher/profile' : '/student/profile'

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
            background: 'var(--accent-gradient)', color: 'white',
            border: 'none', borderRadius: '13px', cursor: 'pointer', fontSize: '18px',
            boxShadow: '0 6px 16px rgba(8,32,73,0.35)'
          }}
        ><Menu size={20} aria-hidden="true" /></button>
      )}

      {/* Backdrop — mobile drawer open */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 55, backdropFilter: 'blur(2px)' }}
        />
      )}

      {/* Sidebar (rail on desktop, drawer on mobile) */}
      <aside aria-label="Main navigation" style={{
        position: 'fixed', left: 0, top: 0, bottom: 0,
        width: `${railWidth}px`,
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 5%, var(--sidebar-bg)) 0%, var(--sidebar-bg) 38%)',
        boxShadow: isMobile ? '0 20px 50px rgba(15,23,42,0.35)' : 'var(--sidebar-shadow)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex', flexDirection: 'column',
        zIndex: 56,
        transform: hidden ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.25s ease, width 0.2s ease',
        overflow: 'hidden'
      }}>
        {/* Brand + collapse */}
        <div style={{
          padding: showLabels ? '18px 14px 14px 16px' : '18px 0 12px',
          display: 'flex', alignItems: 'center', justifyContent: showLabels ? 'space-between' : 'center',
          gap: '10px', minHeight: '68px', boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            {/* Desktop: the logo IS the collapse / expand toggle (no separate « » buttons). Phones keep ☰ / ✕. */}
            {isMobile ? (
              <div style={{ width: '42px', height: '42px', borderRadius: '13px', overflow: 'hidden', flexShrink: 0, boxShadow: '0 6px 14px rgba(8,32,73,0.30)' }}>
                <SpandanIcon />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => persistCollapsed(!collapsed)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="sb-logo-toggle"
                style={{
                  position: 'relative', width: '42px', height: '42px', padding: 0, border: 'none', cursor: 'pointer',
                  borderRadius: '13px', overflow: 'hidden', flexShrink: 0, background: 'transparent',
                  boxShadow: '0 6px 14px rgba(8,32,73,0.30)'
                }}
              >
                <SpandanIcon />
              </button>
            )}
            {showLabels && (
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Spandan</h2>
                <span style={{
                  display: 'inline-block', marginTop: 4, padding: '1px 8px', borderRadius: 999, fontSize: '10.5px', fontWeight: 700,
                  letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--accent)',
                  background: 'color-mix(in srgb, var(--accent) 12%, transparent)'
                }}>{role}</span>
              </div>
            )}
          </div>
          {isMobile && iconBtn(() => setMobileOpen(false), 'Close menu', <X size={16} aria-hidden="true" />)}
        </div>

        {/* Navigation */}
        <nav data-tour="sidebar" style={{ flex: 1, padding: showLabels ? '6px 12px' : '4px 0', overflowY: 'auto' }}>
          {showLabels && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', opacity: 0.75, padding: '8px 12px 8px' }}>Menu</div>}
          {items.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.id === 'dashboard' && (location.pathname === '/teacher' || location.pathname === '/student'))
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                title={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`sb-item${isActive ? ' sb-item--active' : ''}`}
                style={{
                  position: 'relative',
                  width: showLabels ? '100%' : '48px',
                  height: showLabels ? 'auto' : '48px',
                  margin: showLabels ? '0 0 4px' : '0 auto 6px',
                  display: 'flex', alignItems: 'center', justifyContent: showLabels ? 'flex-start' : 'center',
                  gap: '12px', padding: showLabels ? '8px 10px' : '0',
                  background: isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                  border: 'none', borderRadius: '12px', cursor: 'pointer',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: '14px', fontWeight: isActive ? 700 : 550, textAlign: 'left'
                }}
              >
                {isActive && showLabels && <span aria-hidden="true" style={{ position: 'absolute', left: -12, top: 8, bottom: 8, width: 4, borderRadius: '0 4px 4px 0', background: 'var(--accent)' }} />}
                <span aria-hidden="true" style={{
                  width: 32, height: 32, flexShrink: 0, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  background: isActive ? 'var(--bg-card)' : 'color-mix(in srgb, var(--text-secondary) 8%, transparent)',
                  boxShadow: isActive ? '0 2px 6px rgba(16,24,40,0.10)' : 'none'
                }}>{renderIcon(item.icon, 18)}</span>
                {showLabels && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {/* User card → profile */}
        <div style={{ padding: showLabels ? '12px' : '12px 0', borderTop: '1px solid var(--border-color)' }}>
          <button
            onClick={() => navigate(profilePath)}
            title="Your profile"
            className="sb-item"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: showLabels ? 'flex-start' : 'center', gap: '10px',
              padding: showLabels ? '8px 10px' : '4px 0', border: showLabels ? '1px solid var(--border-color)' : 'none', borderRadius: '14px',
              background: showLabels ? 'var(--bg-card)' : 'transparent', cursor: 'pointer', textAlign: 'left'
            }}
          >
            <div style={{
              width: '36px', height: '36px', position: 'relative',
              background: user?.profileImage ? 'transparent' : 'var(--accent-gradient)',
              borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '14px', fontWeight: 700, flexShrink: 0, overflow: 'hidden'
            }}>
              {user?.profileImage
                ? <img src={user.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (user?.name?.charAt(0)?.toUpperCase() || 'U')}
            </div>
            {showLabels && (
              <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'User'}</p>
                <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email || role}</p>
              </div>
            )}
            {showLabels && <span aria-hidden="true" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>›</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
