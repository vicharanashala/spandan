import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import SpandanIcon from './SpandanIcon'

const menuItems = {
  teacher: [
    { id: 'dashboard',     label: 'Dashboard',     icon: '📊', path: '/teacher' },
    { id: 'analytics',     label: 'Analytics',     icon: '📈', path: '/teacher/analytics' },
    { id: 'create-room',   label: 'Create Room',   icon: '➕', path: '/teacher/create-room' },
    { id: 'manage-room',   label: 'Manage Room',   icon: '⚙️', path: '/teacher/manage-room' },
    { id: 'room-history',  label: 'Room History',  icon: '📜', path: '/teacher/room-history' },
  ],
  student: [
    { id: 'dashboard',    label: 'Dashboard',    icon: '📊', path: '/student' },
    { id: 'join-room',    label: 'Join Room',    icon: '🔗', path: '/student/join-room' },
    { id: 'room-history', label: 'Room History', icon: '📜', path: '/student/room-history' },
  ],
}

export default function Sidebar({ user }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const role  = user?.role || 'student'
  const items = menuItems[role] || menuItems.student

  const isActive = (item) =>
    location.pathname === item.path ||
    (item.id === 'dashboard' && (location.pathname === '/teacher' || location.pathname === '/student'))

  return (
    <>
      {/* ── Sidebar ── */}
      <aside style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: '240px',
        background: 'var(--sidebar-bg)',
        boxShadow: 'var(--sidebar-shadow)',
        display: 'flex', flexDirection: 'column', zIndex: 50,
        borderRight: '1px solid var(--border-color)',
      }}>

        {/* Logo */}
        <div style={{
          padding: '20px 18px 16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <div style={{
            width: '40px', height: '40px', flexShrink: 0,
            background: 'linear-gradient(135deg, #4c1d95, #7c3aed)',
            borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px',
            boxShadow: '0 4px 14px rgba(124,58,237,.35)',
          }}>
            <SpandanIcon />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-.3px' }}>Spandan</h2>
            <p style={{ margin: 0, fontSize: '10px', color: 'var(--accent)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {role} Portal
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.2px', padding: '0 8px 8px' }}>
            Navigation
          </div>
          {items.map((item) => {
            const active = isActive(item)
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                style={{
                  position: 'relative', width: '100%',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 14px', borderRadius: '10px',
                  background: active ? 'var(--nav-active)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer',
                  textAlign: 'left', fontWeight: active ? '700' : '600',
                  fontSize: '13px', transition: 'all 0.2s',
                  boxShadow: active ? '0 4px 12px rgba(124,58,237,.25)' : 'none',
                }}
                onMouseEnter={e => !active && (e.currentTarget.style.background = 'var(--nav-hover)')}
                onMouseLeave={e => !active && (e.currentTarget.style.background = 'transparent')}
              >
                {active && (
                  <div style={{
                    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                    width: '4px', height: '20px', background: '#fff',
                    borderRadius: '0 4px 4px 0', animation: 'slideRight 0.3s ease'
                  }} />
                )}
                <span style={{ fontSize: '16px', filter: active ? 'drop-shadow(0 2px 4px rgba(0,0,0,.2))' : 'none' }}>{item.icon}</span>
                <span style={{ letterSpacing: '.3px' }}>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Divider with label */}
        <div style={{ padding: '0 10px' }}>
          <div style={{ height: '1px', background: 'var(--border-color)' }} />
        </div>

        {/* User card */}
        <div style={{ padding: '14px 12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 12px',
            background: 'var(--bg-hover)',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
          }}>
            {/* Avatar */}
            <div style={{
              width: '34px', height: '34px', flexShrink: 0,
              background: user?.profileImage ? 'transparent' : 'linear-gradient(135deg, #4c1d95, #7c3aed)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '13px', fontWeight: '700',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(124,58,237,.3)',
            }}>
              {user?.profileImage
                ? <img src={user.profileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name || 'User'}
              </p>
              <p style={{ margin: 0, fontSize: '10px', color: 'var(--accent)', fontWeight: '600', textTransform: 'capitalize' }}>{role}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
