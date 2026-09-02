import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import useIsMobile from '../hooks/useIsMobile'
import { API_URL } from '../config.js'

export default function JoinAsGuestPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user, token } = useAuthStore()

  const [code, setCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null) // { roomName, roomId }
  const inputRef = useRef(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length < 6) { setError('Please enter a valid invite code.'); return }
    setIsLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/rooms/join-as-cohost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code: trimmed })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to join room')
      setSuccess({ roomName: data.room.name, roomId: data.room._id })
      // Navigate after a short delay so the user sees the success message
      setTimeout(() => navigate(`/teacher/room/${data.room._id}`), 1800)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)', width: '100vw', maxWidth: '100vw', overflowX: 'hidden' }}>
      <Sidebar user={user} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 'var(--sidebar-width, 240px)', minWidth: 0 }}>
        {/* Header */}
        <header style={{ background: 'var(--header-bg)', color: 'white', padding: isMobile ? '16px 16px' : '16px 32px', paddingLeft: isMobile ? '64px' : '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>Join as Co-host</h1>
              <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '13px' }}>Enter the invite code to co-host a session</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 16px' : '48px 32px' }}>
          <div style={{
            width: '100%',
            maxWidth: '440px',
            background: 'var(--bg-card)',
            borderRadius: '20px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
            padding: '40px 36px',
            textAlign: 'center'
          }}>
            {success ? (
              <div>
                <div style={{ fontSize: '56px', marginBottom: '16px' }}>✅</div>
                <h2 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  Joined!
                </h2>
                <p style={{ margin: '0 0 6px', fontSize: '15px', color: 'var(--text-secondary)' }}>
                  You are now a co-host of
                </p>
                <p style={{ margin: '0 0 24px', fontSize: '18px', fontWeight: '700', color: '#7c3aed' }}>
                  {success.roomName}
                </p>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
                  Redirecting to the session…
                </p>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '52px', marginBottom: '20px' }}>🎫</div>
                <h2 style={{ margin: '0 0 10px', fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  Enter Invite Code
                </h2>
                <p style={{ margin: '0 0 32px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Ask the room owner to generate a co-host code from inside their session, then paste it below.
                </p>

                <form onSubmit={handleSubmit}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={code}
                    onChange={(e) => { setCode(e.target.value.toUpperCase()); setError('') }}
                    placeholder="e.g. A3BX9K2M"
                    maxLength={8}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '16px 20px',
                      fontSize: '26px',
                      fontWeight: '700',
                      letterSpacing: '6px',
                      textAlign: 'center',
                      textTransform: 'uppercase',
                      border: `2px solid ${error ? '#ef4444' : 'var(--border-color)'}`,
                      borderRadius: '12px',
                      background: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      boxSizing: 'border-box',
                      marginBottom: '16px',
                      fontFamily: '"Courier New", monospace'
                    }}
                    onFocus={(e) => { if (!error) e.target.style.borderColor = '#7c3aed' }}
                    onBlur={(e) => { if (!error) e.target.style.borderColor = 'var(--border-color)' }}
                  />

                  {error && (
                    <div style={{
                      padding: '10px 14px',
                      background: '#ef444415',
                      border: '1px solid #ef444440',
                      borderRadius: '8px',
                      color: '#dc2626',
                      fontSize: '13px',
                      marginBottom: '16px',
                      textAlign: 'left'
                    }}>
                      ⚠️ {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading || code.trim().length < 6}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: isLoading || code.trim().length < 6
                        ? 'var(--border-color)'
                        : 'linear-gradient(135deg, #7c3aed, #9333ea)',
                      color: isLoading || code.trim().length < 6 ? 'var(--text-secondary)' : '#fff',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '15px',
                      fontWeight: '700',
                      cursor: isLoading || code.trim().length < 6 ? 'not-allowed' : 'pointer',
                      letterSpacing: '0.3px'
                    }}
                  >
                    {isLoading ? 'Joining…' : 'Join as Co-host →'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
