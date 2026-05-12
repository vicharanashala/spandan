import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useSocketStore from '../stores/socketStore'

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
  
  const { connect, disconnect } = useSocketStore()
  
  const [step, setStep] = useState('auth') // 'auth' | 'role' | 'forgot'
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [validationError, setValidationError] = useState('')

  // Connect socket when authenticated
  useEffect(() => {
    if (token && isAuthenticated) {
      connect(token)
    } else {
      disconnect()
    }
  }, [token, isAuthenticated, connect, disconnect])

  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    setValidationError('')
    clearError()

    // Validate password match for signup
    if (!isLogin && formData.password !== formData.confirmPassword) {
      setValidationError('Passwords do not match!')
      return
    }

    try {
      if (isLogin) {
        await login(formData.email, formData.password)
      } else {
        // Determine role from selectedRole state (will be set in role selection)
        const role = user?.role || 'student'
        await register(formData.name, formData.email, formData.password, role)
      }
      
      // Only proceed to role selection if no role is set yet
      if (!user?.role) {
        setStep('role')
      } else {
        // Navigate to dashboard if already has role
        navigate('/dashboard')
      }
    } catch (err) {
      setValidationError(err.message)
    }
  }

  const handleRoleSelect = async (role) => {
    try {
      // Update user's role in the store
      useAuthStore.getState().updateRole(role)
      
      // Navigate to appropriate dashboard
      if (role === 'teacher') {
        navigate('/dashboard')
      } else {
        navigate('/student')
      }
    } catch (error) {
      setValidationError('Failed to set role. Please try again.')
    }
  }

  const handleForgotPassword = (e) => {
    e.preventDefault()
    if (!forgotEmail) {
      setValidationError('Please enter your email address')
      return
    }
    // Simulate sending reset email
    setForgotSent(true)
  }

  const resetAuth = () => {
    setStep('auth')
    setForgotSent(false)
    setForgotEmail('')
    setValidationError('')
  }

  const switchMode = () => {
    setIsLogin(!isLogin)
    setFormData({ ...formData, confirmPassword: '' })
    clearError()
    setValidationError('')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8f9fb 0%, #e0e7ff 100%)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      {/* Background decorative elements */}
      <div style={{
        position: 'fixed',
        top: '-200px',
        right: '-200px',
        width: '600px',
        height: '600px',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15))',
        borderRadius: '50%',
        filter: 'blur(100px)',
        animation: 'pulse 8s ease-in-out infinite',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'fixed',
        bottom: '-200px',
        left: '-200px',
        width: '600px',
        height: '600px',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))',
        borderRadius: '50%',
        filter: 'blur(100px)',
        animation: 'pulse 8s ease-in-out infinite 4s',
        pointerEvents: 'none'
      }} />

      <div style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        {/* Auth Form - First Step */}
        {step === 'auth' && (
          <div style={{
            background: 'white',
            borderRadius: '24px',
            padding: '40px',
            maxWidth: '450px',
            width: '100%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1)',
            animation: 'fadeInUp 0.5s ease-out'
          }}>
            {/* Logo and Title */}
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <div style={{
                width: '70px',
                height: '70px',
                background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                borderRadius: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                boxShadow: '0 15px 35px rgba(30, 64, 175, 0.25)'
              }}>
                <span style={{ fontSize: '35px' }}>✨</span>
              </div>
              <h1 style={{
                fontSize: '32px',
                fontWeight: '700',
                color: '#1f2937',
                marginBottom: '8px'
              }}>
                Spandan
              </h1>
              <p style={{
                fontSize: '16px',
                color: '#6b7280'
              }}>
                Poll Question Generator
              </p>
            </div>

            {/* Form Header */}
            <h2 style={{
              fontSize: '26px',
              fontWeight: '700',
              color: '#1f2937',
              textAlign: 'center',
              marginBottom: '8px'
            }}>
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p style={{
              color: '#6b7280',
              textAlign: 'center',
              marginBottom: '30px',
              fontSize: '14px'
            }}>
              {isLogin ? 'Sign in to continue' : 'Join Spandan today'}
            </p>

            {/* Error Display */}
            {(error || validationError) && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '20px',
                color: '#dc2626',
                fontSize: '14px',
                textAlign: 'center'
              }}>
                {error || validationError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {!isLogin && (
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '12px',
                      outline: 'none',
                      transition: 'border-color 0.3s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
              )}

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    fontSize: '16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '12px',
                    outline: 'none',
                    transition: 'border-color 0.3s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Password
                </label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    fontSize: '16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '12px',
                    outline: 'none',
                    transition: 'border-color 0.3s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>

              {!isLogin && (
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '12px',
                      outline: 'none',
                      transition: 'border-color 0.3s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
              )}

              {isLogin && (
                <div style={{ textAlign: 'right', marginTop: '-8px' }}>
                  <button
                    type="button"
                    onClick={() => setStep('forgot')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#3b82f6',
                      fontSize: '13px',
                      cursor: 'pointer',
                      fontWeight: '500'
                    }}
                    onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                    onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '16px',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: 'white',
                  background: isLoading 
                    ? '#9ca3af' 
                    : 'linear-gradient(135deg, #1e40af, #3b82f6)',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s',
                  boxShadow: '0 4px 15px rgba(30, 64, 175, 0.3)',
                  marginTop: '8px'
                }}
                onMouseOver={(e) => {
                  if (!isLoading) {
                    e.target.style.transform = 'translateY(-2px)'
                    e.target.style.boxShadow = '0 6px 20px rgba(30, 64, 175, 0.4)'
                  }
                }}
                onMouseOut={(e) => {
                  e.target.style.transform = 'translateY(0)'
                  e.target.style.boxShadow = '0 4px 15px rgba(30, 64, 175, 0.3)'
                }}
              >
                {isLoading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
              </button>
            </form>

            <div style={{ marginTop: '24px', textAlign: 'center' }}>
              <p style={{ color: '#6b7280', fontSize: '14px' }}>
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={switchMode}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#1e40af',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  {isLogin ? 'Sign Up' : 'Sign In'}
                </button>
              </p>
            </div>
          </div>
        )}

        {/* Forgot Password Step */}
        {step === 'forgot' && (
          <div style={{
            background: 'white',
            borderRadius: '24px',
            padding: '40px',
            maxWidth: '450px',
            width: '100%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1)',
            animation: 'fadeInUp 0.5s ease-out'
          }}>
            <button
              onClick={resetAuth}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: '14px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              ← Back to Sign In
            </button>

            <div style={{
              width: '70px',
              height: '70px',
              background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
              borderRadius: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: '0 15px 35px rgba(30, 64, 175, 0.25)'
            }}>
              <span style={{ fontSize: '35px' }}>🔑</span>
            </div>

            {!forgotSent ? (
              <>
                <h2 style={{
                  fontSize: '26px',
                  fontWeight: '700',
                  color: '#1f2937',
                  textAlign: 'center',
                  marginBottom: '8px'
                }}>
                  Forgot Password?
                </h2>
                <p style={{
                  color: '#6b7280',
                  textAlign: 'center',
                  marginBottom: '30px',
                  fontSize: '14px',
                  lineHeight: '1.5'
                }}>
                  Enter your email address and we'll send you a link to reset your password.
                </p>

                <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div>
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        fontSize: '16px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '12px',
                        outline: 'none'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                      onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                    />
                  </div>

                  <button
                    type="submit"
                    style={{
                      width: '100%',
                      padding: '16px',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: 'white',
                      background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Send Reset Link
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2 style={{
                  fontSize: '26px',
                  fontWeight: '700',
                  color: '#1f2937',
                  textAlign: 'center',
                  marginBottom: '8px'
                }}>
                  Check Your Email
                </h2>
                <p style={{
                  color: '#6b7280',
                  textAlign: 'center',
                  marginBottom: '30px',
                  fontSize: '14px',
                  lineHeight: '1.5'
                }}>
                  We've sent a password reset link to <strong>{forgotEmail}</strong>. 
                  Please check your inbox and click the link to reset your password.
                </p>

                <div style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '20px',
                  textAlign: 'center'
                }}>
                  <span style={{ fontSize: '24px' }}>📧</span>
                  <p style={{
                    color: '#3b82f6',
                    fontSize: '14px',
                    marginTop: '8px'
                  }}>
                    Didn't receive the email? Check your spam folder or try again.
                  </p>
                </div>

                <button
                  onClick={resetAuth}
                  style={{
                    width: '100%',
                    padding: '16px',
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1e40af',
                    background: 'transparent',
                    border: '2px solid #1e40af',
                    borderRadius: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Back to Sign In
                </button>
              </>
            )}
          </div>
        )}

        {/* Role Selection - Second Step */}
        {step === 'role' && (
          <div style={{
            textAlign: 'center',
            maxWidth: '900px',
            width: '100%',
            animation: 'fadeInUp 0.6s ease-out'
          }}>
            <div style={{ marginBottom: '40px' }}>
              <div style={{
                width: '80px',
                height: '80px',
                background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                borderRadius: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
                boxShadow: '0 20px 40px rgba(30, 64, 175, 0.3)'
              }}>
                <span style={{ fontSize: '40px' }}>✨</span>
              </div>
              <h1 style={{
                fontSize: '36px',
                fontWeight: '700',
                color: '#1e3c72',
                marginBottom: '10px'
              }}>
                Choose Your Role
              </h1>
              <p style={{
                fontSize: '18px',
                color: '#6b7280'
              }}>
                How will you be using Spandan?
              </p>
            </div>

            {/* Role Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '24px',
              marginBottom: '30px'
            }}>
              {/* Teacher Card */}
              <div
                onClick={() => handleRoleSelect('teacher')}
                style={{
                  position: 'relative',
                  background: 'white',
                  borderRadius: '24px',
                  padding: '40px 30px',
                  cursor: 'pointer',
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1)',
                  border: '2px solid transparent',
                  transition: 'all 0.4s ease',
                  overflow: 'hidden'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-10px)'
                  e.currentTarget.style.boxShadow = '0 30px 80px rgba(0, 0, 0, 0.15)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 20px 60px rgba(0, 0, 0, 0.1)'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'linear-gradient(135deg, transparent, rgba(59, 130, 246, 0.1), transparent)',
                  transform: 'translateX(-100%)',
                  animation: 'shimmer 3s ease-in-out infinite'
                }} />
                
                <div style={{ position: 'relative', textAlign: 'center' }}>
                  <div style={{ fontSize: '60px', marginBottom: '20px' }}>👨‍🏫</div>
                  <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1f2937', marginBottom: '10px' }}>
                    Teacher
                  </h3>
                  <p style={{ color: '#6b7280', marginBottom: '20px', lineHeight: '1.6' }}>
                    Create and manage polls for your classroom
                  </p>
                  <ul style={{ textAlign: 'left', color: '#6b7280', fontSize: '14px', marginBottom: '25px', listStyle: 'none', padding: 0 }}>
                    <li style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#3b82f6' }}>✓</span> Create assessment spaces
                    </li>
                    <li style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#3b82f6' }}>✓</span> Generate AI-powered questions
                    </li>
                    <li style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#3b82f6' }}>✓</span> View real-time results
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#3b82f6' }}>✓</span> Track student performance
                    </li>
                  </ul>
                  <button style={{
                    width: '100%',
                    padding: '14px 24px',
                    background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                    color: 'white',
                    fontWeight: '600',
                    borderRadius: '50px',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)'
                  }}>
                    I'm a Teacher
                  </button>
                </div>
              </div>

              {/* Student Card */}
              <div
                onClick={() => handleRoleSelect('student')}
                style={{
                  position: 'relative',
                  background: 'white',
                  borderRadius: '24px',
                  padding: '40px 30px',
                  cursor: 'pointer',
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1)',
                  border: '2px solid transparent',
                  transition: 'all 0.4s ease',
                  overflow: 'hidden'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-10px)'
                  e.currentTarget.style.boxShadow = '0 30px 80px rgba(0, 0, 0, 0.15)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 20px 60px rgba(0, 0, 0, 0.1)'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'linear-gradient(135deg, transparent, rgba(16, 185, 129, 0.1), transparent)',
                  transform: 'translateX(-100%)',
                  animation: 'shimmer 3s ease-in-out infinite 0.5s'
                }} />
                
                <div style={{ position: 'relative', textAlign: 'center' }}>
                  <div style={{ fontSize: '60px', marginBottom: '20px' }}>👨‍🎓</div>
                  <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#1f2937', marginBottom: '10px' }}>
                    Student
                  </h3>
                  <p style={{ color: '#6b7280', marginBottom: '20px', lineHeight: '1.6' }}>
                    Join polls and track your engagement
                  </p>
                  <ul style={{ textAlign: 'left', color: '#6b7280', fontSize: '14px', marginBottom: '25px', listStyle: 'none', padding: 0 }}>
                    <li style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#10b981' }}>✓</span> Join poll sessions
                    </li>
                    <li style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#10b981' }}>✓</span> Submit answers live
                    </li>
                    <li style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#10b981' }}>✓</span> View instant results
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#10b981' }}>✓</span> Track your scores
                    </li>
                  </ul>
                  <button style={{
                    width: '100%',
                    padding: '14px 24px',
                    background: 'linear-gradient(135deg, #059669, #10b981)',
                    color: 'white',
                    fontWeight: '600',
                    borderRadius: '50px',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
                  }}>
                    I'm a Student
                  </button>
                </div>
              </div>
            </div>

            <p style={{ color: '#9ca3af', fontSize: '14px' }}>
              You can change your role later in account settings
            </p>
          </div>
        )}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%) translateY(-100%) rotate(45deg); }
          50% { opacity: 1; }
          100% { transform: translateX(100%) translateY(100%) rotate(45deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}

export default AuthPage