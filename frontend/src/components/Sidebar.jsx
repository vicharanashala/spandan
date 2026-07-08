import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import SpandanIcon from './SpandanIcon'

const menuItems = {
  teacher: [
    { id: 'dashboard',     label: 'Dashboard',     icon: '📊', path: '/teacher' },
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
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          <p style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.2px', padding: '6px 8px 10px' }}>
            Navigation
          </p>
          {items.map((item) => {
            const active = isActive(item)
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px',
                  marginBottom: '3px',
                  background: active ? 'linear-gradient(135deg, #4c1d95, #7c3aed)' : 'transparent',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  color: active ? 'white' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: active ? '700' : '500',
                  textAlign: 'left',
                  transition: 'all 0.18s ease',
                  boxShadow: active ? '0 4px 14px rgba(124,58,237,.3)' : 'none',
                  position: 'relative',
                }}
                onMouseOver={(e) => { if (!active) { e.currentTarget.style.background = 'var(--nav-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                onMouseOut={(e)  => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
              >
                <span style={{ fontSize: '16px', width: '22px', textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                <span>{item.label}</span>
                {active && (
                  <span style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,.7)' }} />
                )}
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
