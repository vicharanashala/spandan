import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import SpandanIcon from '../components/SpandanIcon'
import useSocketStore from '../stores/socketStore'
import PasswordInput from '../components/PasswordInput'
import ThemeToggle from '../components/ThemeToggle'
import HelpButton from '../components/HelpButton'
import useThemeStore from '../stores/themeStore'
import useIsMobile from '../hooks/useIsMobile'
import { API_URL } from '../config.js'
import TermsCheckbox from '../components/TermsCheckbox'
import { TERMS_TICKED_KEY } from '../content/terms.js'
import { ArrowLeft, ChartColumn, Check, GraduationCap, Lock as LockIcon, Mic, Moon, Presentation, Sun, Target, Zap } from 'lucide-react'
import { Ico, renderIcon } from '../components/icons'

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
  // Terms of Use acceptance for registration (email and Google). The backend enforces it too.
  const [acceptedTerms, setAcceptedTerms] = useState(false)

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
    if (!isLogin && !acceptedTerms) {
      setValidationError('Please accept the Terms of Use to create an account')
      return
    }

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
      const data = await verifyRegistration(formData.name, formData.email, formData.password, formData.role, otpValue, acceptedTerms)
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
    // On the Register tab the terms must be ticked first; remember it so the Google role screen
    // (shown to first-time Google users) can pre-tick its own checkbox instead of asking twice.
    if (!isLogin && !acceptedTerms) {
      setValidationError('Please accept the Terms of Use to create an account')
      return
    }
    try {
      if (!isLogin && acceptedTerms) sessionStorage.setItem(TERMS_TICKED_KEY, '1')
      else sessionStorage.removeItem(TERMS_TICKED_KEY)
    } catch { /* storage blocked: the role screen just asks again */ }
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
  // Logo navy (#082049) family: deep navy → a brighter navy-blue; darker still in dark mode.
  const brandGradient = isDark
    ? 'linear-gradient(135deg, #040d20 0%, #082049 60%, #0d2d63 100%)'
    : 'linear-gradient(135deg, #082049 0%, #0f3170 55%, #1d4a97 100%)'

  // Shared input styles (token-driven), with accent focus/blur handlers
  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    fontSize: '15px',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    outline: 'none',
    background: 'var(--input-bg)',
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s, box-shadow 0.2s'
  }
  const handleInputFocus = (e) => {
    e.target.style.borderColor = 'var(--accent)'
    e.target.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent)'
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
    borderRadius: '12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    boxShadow: '0 8px 20px rgba(8,32,73,.28)',
    transition: 'all 0.2s'
  })

  const showModeSwitch = !showForgotPassword && !otpSent
  const switchTo = (login) => {
    if (login === isLogin) return
    setIsLogin(login)
    setValidationError('')
    setFormData(login ? { name: '', confirmPassword: '' } : { ...formData, confirmPassword: '' })
  }
  const glass = { background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }

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
      {/* Soft light blobs + a faint dot grid behind everything */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <span style={{ position: 'absolute', width: 620, height: 620, left: -180, top: -240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.16), rgba(255,255,255,0) 68%)' }} />
        <span style={{ position: 'absolute', width: 520, height: 520, right: -160, bottom: -220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(96,165,250,0.28), rgba(96,165,250,0) 68%)' }} />
        {/* the brand wordmark, large and faint behind everything */}
        <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%) rotate(-10deg)', fontSize: 'clamp(140px, 24vw, 360px)', fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.055)', fontFamily: '"Noto Sans Devanagari", "Segoe UI", sans-serif', userSelect: 'none' }}>स्पंदन</span>
        <span style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)', backgroundSize: '26px 26px', maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.2))', WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.2))' }} />
      </div>
      {/* Theme toggle - top right (available on all layouts) */}
      <button
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 5,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
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
        {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        <span style={{ fontSize: '13px', fontWeight: '600' }}>{isDark ? 'Light' : 'Dark'}</span>
      </button>

      {/* ⓘ help: how to register and sign in (opens the guest guide) */}
      <HelpButton style={{
        position: 'absolute', top: '20px', right: '120px', zIndex: 5,
        background: 'var(--bg-card)', borderRadius: '12px', padding: '9px 14px', boxShadow: 'var(--shadow-sm)'
      }} />

      {/* Left side - Branding (desktop only) */}
      {!isMobile && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '64px 56px 64px 72px', position: 'relative', zIndex: 1, color: 'white', minWidth: 0 }}>
          <div style={{ maxWidth: 560 }}>
            {/* brand row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 34 }}>
              <div style={{ width: 58, height: 58, borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.25)', boxShadow: '0 14px 40px rgba(0,0,0,0.30)' }}>
                <SpandanIcon size={32} />
              </div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Spandan</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>स्पंदन · live classroom polls</div>
              </div>
            </div>

            <h1 style={{ fontSize: 'clamp(34px, 3.4vw, 50px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.08, margin: '0 0 16px', textShadow: '0 4px 30px rgba(0,0,0,0.15)' }}>
              Turn every lecture into a{' '}
              <span style={{ background: 'linear-gradient(90deg, #fde68a, #fbcfe8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>live conversation</span>.
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.6, opacity: 0.88, margin: '0 0 30px', maxWidth: 480 }}>
              Empowering educators and students with intelligent poll questions, real-time responses, and beautiful analytics.
            </p>

            {/* how it works + a sample poll card */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18, alignItems: 'stretch' }}>
              <ol style={{ ...glass, listStyle: 'none', margin: 0, padding: '18px 18px', borderRadius: 18, display: 'grid', gap: 14 }}>
                {[[Mic, 'Teach as usual', 'Spandan listens to your lecture.'], [Zap, 'Questions appear', 'Polls drafted from what you just said.'], [ChartColumn, 'Students answer live', 'Results the moment the class ends.']].map(([icon, t, d]) => (
                  <li key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span aria-hidden="true" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, background: 'rgba(255,255,255,0.18)' }}>{renderIcon(icon, 17)}</span>
                    <span>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{t}</span>
                      <span style={{ display: 'block', fontSize: 12.5, opacity: 0.8, marginTop: 1 }}>{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div aria-hidden="true" style={{ background: 'rgba(255,255,255,0.96)', color: '#0f172a', borderRadius: 18, padding: '16px 16px 14px', boxShadow: '0 24px 60px rgba(0,0,0,0.28)', transform: 'rotate(1.5deg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--accent)' }}>LIVE POLL · Q3</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#10b981' }}><span className="app-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} /> 0:14</span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.35, marginBottom: 12 }}>Which normal form removes transitive dependencies?</div>
                {[['A', '2NF', 12, false], ['B', '3NF', 71, true], ['C', 'BCNF', 17, false]].map(([l, t, pct, ok]) => (
                  <div key={l} style={{ marginBottom: 7 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 3 }}><span>{l}. {t}{ok ? <> <Ico as={Check} /></> : ''}</span><span style={{ color: '#64748b' }}>{pct}%</span></div>
                    <div style={{ height: 7, borderRadius: 7, background: '#e2e8f0', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', borderRadius: 7, background: ok ? 'linear-gradient(90deg,#10b981,#34d399)' : '#94a3b8' }} /></div>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>118 of 126 students answered</div>
              </div>
            </div>

            {/* features */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 26 }}>
              {[[Zap, 'AI-Powered Questions'], [ChartColumn, 'Live Analytics'], [Target, 'Multiple Question Types'], [LockIcon, 'Secure & Private']].map(([icon, text]) => (
                <span key={text} style={{ ...glass, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
                  <span aria-hidden="true" style={{ display: 'inline-flex' }}>{renderIcon(icon, 16)}</span>{text}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Right side - Auth Form */}
      <div style={{
        width: isMobile ? '100%' : '540px',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // Extra top padding reserves space for the absolute theme toggle, so the taller
        // registration card starts below it instead of overlapping; tall forms push the
        // page height and scroll (root is overflowX-only) rather than clipping.
        padding: isMobile ? '76px 16px 24px' : '96px 48px 48px 24px',
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: 1
      }}>
        {/* phones: compact brand above the card (the branding column is desktop-only) */}
        {isMobile && (
          <div style={{ textAlign: 'center', color: 'white', marginBottom: 18 }}>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Spandan</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>Turn every lecture into a live conversation</div>
          </div>
        )}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '24px',
          padding: isMobile ? '22px 20px' : '32px',
          width: '100%',
          maxWidth: isMobile ? 'calc(100% - 8px)' : '430px',
          boxShadow: '0 30px 80px rgba(15,23,42,0.35), 0 2px 6px rgba(15,23,42,0.08)',
          border: '1px solid var(--border-color)',
          boxSizing: 'border-box',
          animation: 'fadeInUp 0.4s ease-out'
        }}>
          {/* Sign in / Sign up switch */}
          {showModeSwitch && (
            <div role="tablist" aria-label="Sign in or sign up" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4, marginBottom: 24, borderRadius: 14, background: 'color-mix(in srgb, var(--text-secondary) 10%, var(--bg-card))', border: '1px solid var(--border-color)' }}>
              {[[true, 'Sign in'], [false, 'Sign up']].map(([login, text]) => {
                const on = isLogin === login
                return (
                  <button key={text} type="button" role="tab" aria-selected={on} onClick={() => switchTo(login)} style={{
                    padding: '10px 12px', fontSize: 14, fontWeight: on ? 700 : 600, border: 'none', borderRadius: 11, cursor: 'pointer',
                    background: on ? 'var(--bg-card)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-secondary)',
                    boxShadow: on ? '0 1px 2px rgba(16,24,40,0.06), 0 4px 10px rgba(16,24,40,0.08)' : 'none'
                  }}>{text}</button>
                )
              })}
            </div>
          )}

          {/* Logo and Title */}
          <div style={{ textAlign: 'center', marginBottom: '26px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '18px',
              overflow: 'hidden',
              margin: '0 auto 14px',
              boxShadow: '0 10px 24px rgba(8,32,73,0.35)'
            }}>
              <SpandanIcon size={32} />
            </div>
            <h1 style={{
              fontSize: isMobile ? '24px' : '27px',
              fontWeight: '800',
              letterSpacing: '-0.02em',
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
                  <Ico as={ArrowLeft} /> Change details
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
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <Ico as={GraduationCap} /> Learn
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
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <Ico as={Presentation} /> Teach
                    </button>
                  </div>
                </div>
              )}

              {!isLogin && (
                <div style={{ marginBottom: '20px' }}>
                  <TermsCheckbox checked={acceptedTerms} onChange={setAcceptedTerms} disabled={isLoading} />
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || (!isLogin && !acceptedTerms)}
                style={primaryButtonStyle(isLoading || (!isLogin && !acceptedTerms))}
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
                disabled={isLoading || (!isLogin && !acceptedTerms)}
                style={{
                  width: '100%',
                  padding: '12px 18px',
                  fontSize: '15px',
                  fontWeight: '600',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  cursor: isLoading || (!isLogin && !acceptedTerms) ? 'not-allowed' : 'pointer',
                  opacity: !isLogin && !acceptedTerms ? 0.6 : 1,
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
