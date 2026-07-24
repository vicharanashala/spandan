import React, { useState, useRef, useEffect } from 'react'
import useAuthStore from '../stores/authStore'
import { useNavigate } from 'react-router-dom'

export default function ProfileDropdown() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleProfile = () => {
    setIsOpen(false)
    navigate(user.role === 'teacher' ? '/teacher/profile' : '/student/profile')
  }

  const handleLogout = () => {
    setIsOpen(false)
    logout()
    navigate('/')
  }

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: user?.profileImage ? 'transparent' : 'linear-gradient(135deg, #1e40af, #3b82f6)',
          border: '2px solid white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '14px',
          fontWeight: '600',
          padding: 0,
          overflow: 'hidden'
        }}
        title="Profile"
      >
        {user?.profileImage ? (
          <img src={user.profileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          user?.name?.charAt(0)?.toUpperCase() || 'U'
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '8px',
          background: 'var(--bg-card)',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          border: '1px solid var(--border-color)',
          minWidth: '160px',
          zIndex: 100,
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color)'
          }}>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              {user?.name || 'User'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
              {user?.role || 'student'}
            </p>
          </div>
          
          <button
            onClick={handleProfile}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '14px',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'var(--nav-hover)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
          >
            👤 Profile
          </button>
          
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'var(--nav-hover)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
          >
            🚪 Logout
          </button>
        </div>
      )}
    </div>
  )
}