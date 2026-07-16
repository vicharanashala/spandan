import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import SpandanIcon from '../components/SpandanIcon'
import useSocketStore from '../stores/socketStore'
import PasswordInput from '../components/PasswordInput'
import ThemeToggle from '../components/ThemeToggle'
import useThemeStore from '../stores/themeStore'
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
        await login(formData.email, formData.password)
        // Navigation handled by useEffect watching isAuthenticated
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

  // Background gradients for light/dark
  const bgGradient = isDark
    ? 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)'
    : 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)'

  const textColor = isDark ? '#f1f5f9' : '#1e293b'
  const subTextColor = isDark ? '#94a3b8' : '#64748b'
  const cardBg = isDark ? 'rgba(30,41,59,0.85)' : 'rgba(255,255,255,0.95)'
  const cardBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)'

  return (
    <div style={{
      minHeight: '100vh',
      background: bgGradient,
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      display: 'flex',
      position: 'relative',
      overflow: 'hidden',
      transition: 'background 0.5s ease'
    }}>
      {/* Left side - Branding */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '60px',
        position: 'relative'
      }}>
        {/* Big watermark text */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%) rotate(-15deg)',
          fontSize: 'clamp(80px, 12vw, 160px)',
          fontWeight: '800',
          color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.15)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none',
          letterSpacing: '-4px'
        }}>
          SPANDAN
        </div>
        <div style={{
          position: 'absolute',
          top: '58%',
          left: '50%',
          transform: 'translate(-50%, -50%) rotate(-12deg)',
          fontSize: 'clamp(60px, 10vw, 120px)',
          fontWeight: '700',
          color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none'
        }}>
          स्पंदन
        </div>

        {/* Theme toggle - top left */}
        <button
          onClick={toggleTheme}
          style={{
            position: 'absolute',
            top: '32px',
            left: '32px',
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '12px',
            padding: '10px 16px',
            fontSize: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'white',
            transition: 'all 0.3s'
          }}
        >
          {isDark ? '☀️' : '🌙'}
          <span style={{ fontSize: '13px', fontWeight: '600' }}>{isDark ? 'Light' : 'Dark'}</span>
        </button>

        {/* Icon and brand */}
        <div style={{
          width: '100px',
          height: '100px',
          background: 'linear-gradient(135deg, #667eea, #764ba2)',
          borderRadius: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
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
          textShadow: '0 4px 30px rgba(0,0,0,0.3)',
          position: 'relative',
          zIndex: 1
        }}>
          Spandan
        </h1>
        <p style={{
          fontSize: '18px',
          color: 'rgba(255,255,255,0.8)',
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
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '12px',
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

      {/* Right side - Auth Form */}
      <div style={{
        width: '520px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        position: 'relative'
      }}>
        <div style={{
          background: cardBg,
          backdropFilter: 'blur(20px)',
          borderRadius: '24px',
          padding: '48px',
          width: '100%',
          maxWidth: '440px',
          boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
          border: `1px solid ${cardBorder}`,
          animation: 'fadeInUp 0.5s ease-out'
        }}>
          {/* Logo and Title */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '70px',
              height: '70px',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              borderRadius: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 15px 35px rgba(102, 126, 234, 0.35)'
            }}>
              <SpandanIcon size={35} />
            </div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: textColor,
              marginBottom: '6px'
            }}>
              {showForgotPassword ? 'Reset Password' : isLogin ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p style={{
              fontSize: '14px',
              color: subTextColor
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
              borderRadius: '10px',
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
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: subTextColor,
                  marginBottom: '8px'
                }}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="Enter your registered email"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    fontSize: '16px',
                    border: `2px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                    borderRadius: '12px',
                    outline: 'none',
                    background: isDark ? '#1e293b' : 'white',
                    color: textColor,
                    boxSizing: 'border-box',
                    transition: 'border-color 0.3s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = isDark ? '#334155' : '#e2e8f0'}
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
                  borderRadius: '10px',
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
                style={{
                  width: '100%',
                  padding: '14px',
                  fontSize: '16px',
                  fontWeight: '600',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: forgotPasswordLoading ? 'not-allowed' : 'pointer',
                  opacity: forgotPasswordLoading ? 0.7 : 1,
                  transition: 'all 0.3s'
                }}
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
                  color: subTextColor,
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
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: subTextColor,
                    marginBottom: '8px'
                  }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required={!isLogin}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      fontSize: '16px',
                      border: `2px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                      borderRadius: '12px',
                      outline: 'none',
                      background: isDark ? '#1e293b' : 'white',
                      color: textColor,
                      boxSizing: 'border-box',
                      transition: 'border-color 0.3s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#667eea'}
                    onBlur={(e) => e.target.style.borderColor = isDark ? '#334155' : '#e2e8f0'}
                  />
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: subTextColor,
                  marginBottom: '8px'
                }}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    fontSize: '16px',
                    border: `2px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                    borderRadius: '12px',
                    outline: 'none',
                    background: isDark ? '#1e293b' : 'white',
                    color: textColor,
                    boxSizing: 'border-box',
                    transition: 'border-color 0.3s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = isDark ? '#334155' : '#e2e8f0'}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: subTextColor,
                  marginBottom: '8px'
                }}>
                  Password
                </label>
                <PasswordInput
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value })
                    if (!isLogin) setShowPasswordReqs(true)
                  }}
                  placeholder="Enter your password"
                  style={{ background: isDark ? '#1e293b' : 'white' }}
                  showRequirements={!isLogin && showPasswordReqs}
                  passwordReqs={getPasswordReqs(formData.password)}
                  onFocus={() => {
                    if (!isLogin) setShowPasswordReqs(true)
                  }}
                />
              </div>

              {!isLogin && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: subTextColor,
                    marginBottom: '8px'
                  }}>
                    Confirm Password
                  </label>
                  <PasswordInput
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="Confirm your password"
                    style={{ background: isDark ? '#1e293b' : 'white' }}
                  />
                </div>
              )}

              {!isLogin && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: subTextColor,
                    marginBottom: '8px'
                  }}>
                    I am a...
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: 'student' })}
                      style={{
                        padding: '14px',
                        fontSize: '15px',
                        fontWeight: '600',
                        background: formData.role === 'student'
                          ? 'linear-gradient(135deg, #667eea, #764ba2)'
                          : 'transparent',
                        color: formData.role === 'student' ? 'white' : subTextColor,
                        border: `2px solid ${formData.role === 'student' ? 'transparent' : (isDark ? '#334155' : '#e2e8f0')}`,
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.3s'
                      }}
                    >
                      🎓 Student
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, role: 'teacher' })}
                      style={{
                        padding: '14px',
                        fontSize: '15px',
                        fontWeight: '600',
                        background: formData.role === 'teacher'
                          ? 'linear-gradient(135deg, #667eea, #764ba2)'
                          : 'transparent',
                        color: formData.role === 'teacher' ? 'white' : subTextColor,
                        border: `2px solid ${formData.role === 'teacher' ? 'transparent' : (isDark ? '#334155' : '#e2e8f0')}`,
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.3s'
                      }}
                    >
                      👨‍🏫 Teacher
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '16px',
                  fontSize: '17px',
                  fontWeight: '700',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.7 : 1,
                  boxShadow: '0 8px 25px rgba(102, 126, 234, 0.4)',
                  transition: 'all 0.3s'
                }}
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
                      color: '#667eea',
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
                borderTop: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                color: subTextColor,
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
                        color: '#667eea',
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
                        color: '#667eea',
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