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
    sendRegistrationOtp,
    verifyRegistration,
    logout,
    clearError,
    sessionExpired
  } = useAuthStore()
  const { isDark, toggleTheme } = useThemeStore()
  const socket = useSocketStore(state => state.socket)
  const isMobile = useIsMobile()

  const [step, setStep] = useState('auth')
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'student' })
  const [validationError, setValidationError] = useState('')
  const [pendingMsg, setPendingMsg] = useState('')
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')
  const [forgotPasswordMsg, setForgotPasswordMsg] = useState('')
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
  const [showPasswordReqs, setShowPasswordReqs] = useState(false)
  // Email-OTP registration step: after the form is submitted we send a code and switch to OTP entry.
  const [otpSent, setOtpSent] = useState(false)
  const [otpValue, setOtpValue] = useState('')
  const [resendIn, setResendIn] = useState(0) // seconds left before "Resend" is allowed

  // Reset form data whenever login/registration mode switches
  useEffect(() => {
    setFormData({ name: '', email: '', password: '', confirmPassword: '', role: 'student' })
    setShowPasswordReqs(false)
    setValidationError('')
    setOtpSent(false)
    setOtpValue('')
    setResendIn(0)
  }, [isLogin])

  // Tick down the resend cooldown once per second.
  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

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
    setPendingMsg('')

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
        // Step 1: request an email verification code, then switch to the OTP entry screen.
        await sendRegistrationOtp(formData.name, formData.email)
        setOtpValue('')
        setOtpSent(true)
        setResendIn(60)
      } catch (err) {
        setValidationError(err.message || 'Failed to send verification code')
      }
    }
  }

  // Step 2: verify the emailed code and create the account (signs the user in on success).
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    clearError()
    setValidationError('')
    if (!/^\d{6}$/.test(otpValue)) {
      setValidationError('Enter the 6-digit code from your email')
      return
    }
    try {
      const data = await verifyRegistration(formData.name, formData.email, formData.password, formData.role, otpValue)
      // Teacher accounts require admin approval: no session is created. Send the registrant
      // back to the login screen with an "approval pending" message instead of a dashboard.
      if (data.pendingApproval) {
        setOtpSent(false)
        setOtpValue('')
        setIsLogin(true)
        setPendingMsg(data.message || 'Your teacher account is pending admin approval. You can sign in once an administrator approves it.')
        return
      }
      navigate(data.user?.role === 'teacher' ? '/teacher' : '/student')
    } catch (err) {
      setValidationError(err.message || 'Registration failed')
    }
  }

  const handleResendOtp = async () => {
    if (resendIn > 0) return
    clearError()
    setValidationError('')
    try {
      await sendRegistrationOtp(formData.name, formData.email)
      setResendIn(60)
    } catch (err) {
      setValidationError(err.message || 'Failed to resend code')
    }
  }

  const handleBackToForm = () => {
    setOtpSent(false)
    setOtpValue('')
    setValidationError('')
    clearError()
  }

  // Start the Google OAuth Authorization Code flow (full-page redirect to the backend, which
  // redirects on to Google). The selected role is passed through; the backend only applies it when
  // creating a brand-new account (returning users keep their role), and a teacher pick still lands in
  // the admin-approval gate.
  const handleGoogleSignIn = () => {
    clearError()
    setValidationError('')
    window.location.href = `${API_URL}/auth/google?role=${formData.role}`
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
              {showForgotPassword ? 'Reset Password' : otpSent ? 'Verify your email' : isLogin ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary)'
            }}>
              {showForgotPassword
                ? 'Enter your email to receive a reset link'
                : otpSent
                  ? `Enter the 6-digit code sent to ${formData.email}`
                  : isLogin
                    ? 'Sign in to continue to your dashboard'
                    : 'Join Spandan to start creating polls'}
            </p>
          </div>

          {/* Session-expiry notice (shown when the app dropped an expired token, not a login error) */}
          {sessionExpired && !validationError && !error && (
            <div style={{
              background: isDark ? 'rgba(245,158,11,0.15)' : '#fffbeb',
              border: `1px solid ${isDark ? 'rgba(245,158,11,0.3)' : '#fde68a'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '12px 16px',
              marginBottom: '20px',
              color: isDark ? '#fcd34d' : '#b45309',
              fontSize: '14px'
            }}>
              Your session expired. Please sign in again.
            </div>
          )}

          {/* Teacher account pending admin approval (shown after a teacher registers) */}
          {pendingMsg && (
            <div style={{
              background: isDark ? 'rgba(34,197,94,0.15)' : '#f0fdf4',
              border: `1px solid ${isDark ? 'rgba(34,197,94,0.3)' : '#bbf7d0'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '12px 16px',
              marginBottom: '20px',
              color: isDark ? '#86efac' : '#15803d',
              fontSize: '14px'
            }}>
              {pendingMsg}
            </div>
          )}

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
          ) : otpSent ? (
            <form onSubmit={handleVerifyOtp}>
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                  style={{ ...inputStyle, letterSpacing: '10px', textAlign: 'center', fontSize: '22px', fontWeight: 700 }}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || otpValue.length !== 6}
                style={primaryButtonStyle(isLoading || otpValue.length !== 6)}
              >
                {isLoading ? 'Verifying...' : 'Verify & Create Account'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Didn't receive it?{' '}
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendIn > 0}
                  style={{ background: 'none', border: 'none', color: resendIn > 0 ? 'var(--text-secondary)' : 'var(--accent)', fontWeight: 600, cursor: resendIn > 0 ? 'default' : 'pointer' }}
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                </button>
              </div>
              <div style={{ textAlign: 'center', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={handleBackToForm}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
                >
                  ← Change details
                </button>
              </div>
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
                    Want to ...
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

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>or</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
              </div>

              {/* Continue with Google — starts the OAuth redirect flow */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '12px 18px',
                  fontSize: '15px',
                  fontWeight: '600',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius)',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.2s'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
                </svg>
                Continue with Google
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
