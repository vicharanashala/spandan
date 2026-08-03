import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SpandanIcon from '../components/SpandanIcon'
import PasswordInput from '../components/PasswordInput'
import ThemeToggle from '../components/ThemeToggle'
import useThemeStore from '../stores/themeStore'
import useIsMobile from '../hooks/useIsMobile'
import { API_URL } from '../config.js'

function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { isDark, toggleTheme } = useThemeStore()
  const isMobile = useIsMobile()

  const [formData, setFormData] = useState({ password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      navigate('/')
    }
  }, [token, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: formData.password })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to reset password')

      setSuccess(true)
      setTimeout(() => navigate('/'), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '8px'
  }

  const cardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    padding: isMobile ? '24px 20px' : '32px',
    width: '100%',
    maxWidth: '420px',
    boxSizing: 'border-box'
  }

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: isMobile ? '24px 16px' : '40px',
      boxSizing: 'border-box',
      position: 'relative',
      overflowX: 'hidden'
    }}>
      {/* Theme toggle - top right */}
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        style={{
          position: 'absolute',
          top: isMobile ? '16px' : '24px',
          right: isMobile ? '16px' : '24px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius)',
          padding: '9px 14px',
          fontSize: '16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: 'var(--text-primary)',
          boxShadow: 'var(--shadow-sm)',
          transition: 'all 0.2s'
        }}
      >
        {isDark ? '☀️' : '🌙'}
        <span style={{ fontSize: '13px', fontWeight: 600 }}>{isDark ? 'Light' : 'Dark'}</span>
      </button>

      {success ? (
        <div style={{ ...cardStyle, textAlign: 'center', animation: 'fadeInUp 0.5s ease-out' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #059669, #10b981)',
            borderRadius: 'var(--radius)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: 'var(--shadow-md)'
          }}>
            <span style={{ fontSize: '32px', color: '#fff' }}>✓</span>
          </div>
          <h2 style={{
            color: 'var(--text-primary)',
            fontSize: isMobile ? '20px' : '24px',
            fontWeight: 700,
            marginBottom: '10px'
          }}>
            Password Reset!
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            Your password has been successfully reset. Redirecting you to login...
          </p>
          <div style={{
            width: '100%',
            height: '4px',
            background: 'var(--border-color)',
            borderRadius: '999px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: '100%',
              height: '100%',
              background: 'var(--accent-gradient)',
              animation: 'shrink 3s linear forwards'
            }} />
          </div>
        </div>
      ) : (
        <div style={{ ...cardStyle, animation: 'fadeInUp 0.5s ease-out' }}>
          {/* Logo and Title */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              background: 'var(--accent-gradient)',
              borderRadius: 'var(--radius)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: 'var(--shadow-md)'
            }}>
              <SpandanIcon size={34} />
            </div>
            <h1 style={{
              fontSize: isMobile ? '22px' : '26px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '8px'
            }}>
              Set New Password
            </h1>
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              lineHeight: 1.5
            }}>
              Enter your new password below.
            </p>
          </div>

          {error && (
            <div style={{
              background: isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2',
              border: `1px solid ${isDark ? 'rgba(239,68,68,0.3)' : '#fecaca'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '12px 16px',
              marginBottom: '20px',
              color: isDark ? '#fca5a5' : '#dc2626',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '20px' }}>
            <div>
              <label style={labelStyle}>
                New Password
              </label>
              <PasswordInput
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Enter new password"
                style={{ background: 'var(--input-bg)' }}
              />
              <p style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                marginTop: '6px'
              }}>
                Min 8 chars: 1 uppercase, 1 lowercase, 1 digit, 1 special char
              </p>
            </div>
            <div>
              <label style={labelStyle}>
                Confirm New Password
              </label>
              <PasswordInput
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Confirm new password"
                style={{ background: 'var(--input-bg)' }}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px 18px',
                fontSize: '15px',
                fontWeight: 600,
                background: 'var(--accent-gradient)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
                boxShadow: 'var(--shadow-md)',
                transition: 'all 0.2s'
              }}
            >
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        </div>
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  )
}

export default ResetPasswordPage
