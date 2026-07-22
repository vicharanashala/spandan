import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import SpandanIcon from '../components/SpandanIcon'
import useSocketStore from '../stores/socketStore'
import PasswordInput from '../components/PasswordInput'
import ThemeToggle from '../components/ThemeToggle'
import useThemeStore from '../stores/themeStore'
import useIsMobile from '../hooks/useIsMobile'
import { API_URL } from '../config.js'

// Password requirements for registration
const PASSWORD_REQUIREMENTS = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'One number (0-9)', test: (p) => /\d/.test(p) },
  { id: 'special', label: 'One special character (!@#$%^&*)', test: (p) => /[!@#$%^&*()_+\-=\[\]{};:'"\\|,.<>\/?]/.test(p) },
]

function AuthPage() {
  const navigate = useNavigate()
  const {
    user,
    token,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    clearError
  } = useAuthStore()
  const { isDark, toggleTheme } = useThemeStore()
  const socket = useSocketStore(state => state.socket)
  const isMobile = useIsMobile()

  const [step, setStep] = useState('auth')
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'student' })
  const [validationError, setValidationError] = useState('')
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')
  const [forgotPasswordMsg, setForgotPasswordMsg] = useState('')
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
  const [showPasswordReqs, setShowPasswordReqs] = useState(false)

  // Reset form data whenever login/registration mode switches
  useEffect(() => {
    setFormData({ name: '', email: '', password: '', confirmPassword: '', role: 'student' })
    setShowPasswordReqs(false)
    setValidationError('')
  }, [isLogin])

  const getPasswordReqs = (password) => {
    if (password == null) return PASSWORD_REQUIREMENTS.map(req => ({ ...req, met: false }))
    return PASSWORD_REQUIREMENTS.map((req) => ({
      ...req,
      met: req.test(password),
    }))
  }

  useEffect(() => {
    if (isAuthenticated && token) {
      navigate(user?.role === 'teacher' ? '/teacher' : '/student')
    }
  }, [isAuthenticated, token, navigate, user])

  const validateForm = () => {
    if (!isLogin && formData.password !== formData.confirmPassword) {
      setValidationError('Passwords do not match')
      return false
    }
    if (!isLogin && formData.password) {
      const failedReqs = PASSWORD_REQUIREMENTS.filter((req) => !req.test(formData.password))
      if (failedReqs.length > 0) {
        setValidationError('Password must have: ' + failedReqs.map((r) => r.label).join(', '))
        return false
      }
    }
    setValidationError('')
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    setValidationError('')

    if (!validateForm()) return

    if (isLogin) {
      try {
        const data = await login(formData.email, formData.password)
        // Navigate based on actual role from backend response, not local user state
        if (data.user?.role === 'teacher') {
          navigate('/teacher')
        } else {
          navigate('/student')
        }
      } catch (err) {
        setValidationError(err.message || 'Login failed')
      }
    } else {
      try {
        const data = await register(formData.name, formData.email, formData.password, formData.role)
        // Registration returns a token and signs the user in — go straight into the app,
        // based on the role from the backend response (matching the login flow) instead of
        // sending the new user back to the login form.
        if (data.user?.role === 'teacher') {
          navigate('/teacher')
        } else {
          navigate('/student')
        }
      } catch (err) {
        setValidationError(err.message || 'Registration failed')
      }
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setForgotPasswordMsg('')
    setForgotPasswordLoading(true)
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotPasswordEmail })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send reset email')
      setForgotPasswordMsg('✓ Password reset link sent! Check your email.')
      setForgotPasswordEmail('')
    } catch (err) {
      setForgotPasswordMsg(err.message)
    } finally {
      setForgotPasswordLoading(false)
    }
  }

  // Full-page brand gradient — theme-aware, so the ENTIRE auth page is one blue wash
  // (deep navy in dark mode). Both the branding column and the form card sit on top of it.
  const brandGradient = isDark
    ? 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)'
    : 'var(--accent-gradient)'

  // Shared input styles (token-driven), with accent focus/blur handlers
  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    fontSize: '15px',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius)',
    outline: 'none',
    background: 'var(--input-bg)',
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s, box-shadow 0.2s'
  }
  const handleInputFocus = (e) => {
    e.target.style.borderColor = 'var(--accent)'
    e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)'
  }
  const handleInputBlur = (e) => {
    e.target.style.borderColor = 'var(--border-color)'
    e.target.style.boxShadow = 'none'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    marginBottom: '8px'
  }

  const primaryButtonStyle = (disabled) => ({
    width: '100%',
    padding: '13px 18px',
    fontSize: '15px',
    fontWeight: '600',
    background: 'var(--accent-gradient)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    boxShadow: '0 2px 10px rgba(30,64,175,.25)',
    transition: 'all 0.2s'
  })

  return (
    <div style={{
      minHeight: '100vh',
      background: brandGradient,
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      display: 'flex',
      position: 'relative',
      overflowX: 'hidden',
      transition: 'background 0.4s ease'
    }}>
      {/* Centered brand watermark — spans the whole page, behind all content */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        userSelect: 'none',
        overflow: 'hidden',
        zIndex: 0
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 'clamp(80px, 14vw, 200px)',
            fontWeight: '800',
            color: 'rgba(255,255,255,0.08)',
            whiteSpace: 'nowrap',
            letterSpacing: '-4px',
            transform: 'rotate(-12deg)'
          }}>
            SPANDAN
          </div>
          <div style={{
            fontSize: 'clamp(60px, 11vw, 150px)',
            fontWeight: '700',
            color: 'rgba(255,255,255,0.06)',
            whiteSpace: 'nowrap',
            transform: 'rotate(-10deg)',
            marginTop: '-8px'
          }}>
            स्पंदन
          </div>
        </div>
      </div>
      {/* Theme toggle - top right (available on all layouts) */}
      <button
        onClick={toggleTheme}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 5,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius)',
          padding: '9px 14px',
          fontSize: '18px',
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
        <span style={{ fontSize: '13px', fontWeight: '600' }}>{isDark ? 'Light' : 'Dark'}</span>
      </button>

      {/* Left side - Branding (desktop only) */}
      {!isMobile && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '60px',
          position: 'relative',
          zIndex: 1
        }}>
          {/* Icon and brand */}
          <div style={{
            width: '96px',
            height: '96px',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            position: 'relative',
            zIndex: 1
          }}>
            <SpandanIcon size={50} />
          </div>
          <h1 style={{
            fontSize: '48px',
            fontWeight: '800',
            color: 'white',
            marginBottom: '16px',
            textShadow: '0 4px 30px rgba(0,0,0,0.2)',
            position: 'relative',
            zIndex: 1
          }}>
            Spandan
          </h1>
          <p style={{
            fontSize: '18px',
            color: 'rgba(255,255,255,0.85)',
            textAlign: 'center',
            maxWidth: '400px',
            lineHeight: '1.6',
            position: 'relative',
            zIndex: 1
          }}>
            Empowering educators and students with intelligent poll questions, real-time responses, and beautiful analytics.
          </p>

          {/* Features */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginTop: '48px',
            maxWidth: '420px',
            position: 'relative',
            zIndex: 1
          }}>
            {[
              { icon: '⚡', text: 'AI-Powered Questions' },
              { icon: '📊', text: 'Live Analytics' },
              { icon: '🎯', text: 'Multiple Question Types' },
              { icon: '🔒', text: 'Secure & Private' }
            ].map((f, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 'var(--radius)',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: 'white',
                fontSize: '14px',
                fontWeight: '500'
              }}>
                <span style={{ fontSize: '20px' }}>{f.icon}</span>
                {f.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Right side - Auth Form */}
      <div style={{
        width: isMobile ? '100%' : '520px',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // Extra top padding reserves space for the absolute theme toggle, so the taller
        // registration card starts below it instead of overlapping; tall forms push the
        // page height and scroll (root is overflowX-only) rather than clipping.
        padding: isMobile ? '76px 16px 24px' : '96px 40px 48px',
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: 1
      }}>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          padding: isMobile ? '20px' : '32px',
          width: '100%',
          maxWidth: isMobile ? 'calc(100% - 16px)' : '420px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-color)',
          boxSizing: 'border-box',
          animation: 'fadeInUp 0.4s ease-out'
        }}>
          {/* Logo and Title */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              background: 'var(--accent-gradient)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 8px 24px rgba(30,64,175,0.30)'
            }}>
              <SpandanIcon size={34} />
            </div>
            <h1 style={{
              fontSize: isMobile ? '24px' : '28px',
              fontWeight: '700',
              color: 'var(--text-primary)',
              marginBottom: '6px'
            }}>
              {showForgotPassword ? 'Reset Password' : isLogin ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary)'
            }}>
              {showForgotPassword
                ? 'Enter your email to receive a reset link'
                : isLogin
                  ? 'Sign in to continue to your dashboard'
                  : 'Join Spandan to start creating polls'}
            </p>
          </div>

          {/* Error / Success messages */}
          {validationError && (
            <div style={{
              background: isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2',
              border: `1px solid ${isDark ? 'rgba(239,68,68,0.3)' : '#fecaca'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '12px 16px',
              marginBottom: '20px',
              color: isDark ? '#fca5a5' : '#dc2626',
              fontSize: '14px'
            }}>
              {validationError}
            </div>
          )}

          {showForgotPassword ? (
            <form onSubmit={handleForgotPassword}>
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="Enter your registered email"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  required
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
              {forgotPasswordMsg && (
                <div style={{
                  background: forgotPasswordMsg.startsWith('✓')
                    ? (isDark ? 'rgba(16,185,129,0.15)' : '#ecfdf5')
                    : (isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2'),
                  border: `1px solid ${forgotPasswordMsg.startsWith('✓')
                    ? (isDark ? 'rgba(16,185,129,0.3)' : '#6ee7b7')
                    : (isDark ? 'rgba(239,68,68,0.3)' : '#fecaca')}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 16px',
                  marginBottom: '20px',
                  color: forgotPasswordMsg.startsWith('✓')
                    ? (isDark ? '#6ee7b7' : '#059669')
                    : (isDark ? '#fca5a5' : '#dc2626'),
                  fontSize: '14px'
                }}>
                  {forgotPasswordMsg}
                </div>
              )}
              <button
                type="submit"
                disabled={forgotPasswordLoading}
                style={primaryButtonStyle(forgotPasswordLoading)}
              >
                {forgotPasswordLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForgotPassword(false); setForgotPasswordMsg('') }}
                style={{
                  width: '100%',
                  marginTop: '12px',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: '600',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Back to login
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit}>
              {!isLogin && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={labelStyle}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required={!isLogin}
                    style={inputStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>
                  Password
                </label>
                <PasswordInput
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value })
                    if (!isLogin) setShowPasswordReqs(true)
                  }}
                  placeholder="Enter your password"
                  style={{ background: 'var(--input-bg)' }}
                  showRequirements={!isLogin && showPasswordReqs}
                  passwordReqs={getPasswordReqs(formData.password)}
                  onFocus={() => {
                    if (!isLogin) setShowPasswordReqs(true)
                  }}
                />
              </div>

              {!isLogin && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={labelStyle}>
                    Confirm Password
                  </label>
                  <PasswordInput
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="Confirm your password"
                    style={{ background: 'var(--input-bg)' }}
                  />
                </div>
              )}

              {!isLogin && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={labelStyle}>
                    I am a...
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: 'student' })}
                      style={{
                        padding: '13px',
                        fontSize: '15px',
                        fontWeight: '600',
                        background: formData.role === 'student'
                          ? 'var(--accent-gradient)'
                          : 'transparent',
                        color: formData.role === 'student' ? 'white' : 'var(--text-secondary)',
                        border: `1px solid ${formData.role === 'student' ? 'transparent' : 'var(--border-color)'}`,
                        borderRadius: 'var(--radius)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      🎓 Learn
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: 'teacher' })}
                      style={{
                        padding: '13px',
                        fontSize: '15px',
                        fontWeight: '600',
                        background: formData.role === 'teacher'
                          ? 'var(--accent-gradient)'
                          : 'transparent',
                        color: formData.role === 'teacher' ? 'white' : 'var(--text-secondary)',
                        border: `1px solid ${formData.role === 'teacher' ? 'transparent' : 'var(--border-color)'}`,
                        borderRadius: 'var(--radius)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      👨‍🏫 Teach
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                style={primaryButtonStyle(isLoading)}
              >
                {isLoading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
              </button>

              {isLogin && (
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <div style={{
                textAlign: 'center',
                marginTop: '24px',
                paddingTop: '24px',
                borderTop: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                fontSize: '14px'
              }}>
                {isLogin ? (
                  <>
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setIsLogin(false); setValidationError(''); setFormData({ ...formData, confirmPassword: '' }) }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent)',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setIsLogin(true); setValidationError(''); setFormData({ name: '', confirmPassword: '' }) }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent)',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Sign in
                    </button>
                  </>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default AuthPage
