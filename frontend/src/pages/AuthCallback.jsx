import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import SpandanIcon from '../components/SpandanIcon'
import useThemeStore from '../stores/themeStore'

// Landing route for the Google OAuth redirect. The backend redirects here with a URL fragment that
// describes the outcome — #token=<jwt> (success), #status=pending_teacher, or #error=<message>. The
// fragment never reaches the server. We consume it, establish the session (or show a message), and
// strip it from the address bar so the token is not left in history.
function AuthCallback() {
  const navigate = useNavigate()
  const { completeGoogleLogin, completeGoogleSignup } = useAuthStore()
  const { isDark } = useThemeStore()
  const [message, setMessage] = useState('Completing sign-in…')
  const [state, setState] = useState('loading') // 'loading' | 'error' | 'pending' | 'needs_role'
  const [reg, setReg] = useState('')            // signed pending-registration token (first-time users)
  const [chosenRole, setChosenRole] = useState('student')
  const [submitting, setSubmitting] = useState(false)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // guard against React StrictMode double-invoke consuming the token twice
    ran.current = true

    const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
    const params = new URLSearchParams(raw)
    const token = params.get('token')
    const status = params.get('status')
    const error = params.get('error')
    const regToken = params.get('reg')
    const hint = params.get('hint')

    // Remove the fragment immediately so the JWT / registration token is not retained in the URL / history.
    window.history.replaceState(null, '', window.location.pathname + window.location.search)

    if (error) {
      setState('error')
      setMessage(error)
      return
    }
    // First-time Google user: ask which role before the account is created.
    if (status === 'needs_role' && regToken) {
      setReg(regToken)
      setChosenRole(hint === 'teacher' ? 'teacher' : 'student')
      setState('needs_role')
      setMessage('Almost there — tell us how you will use Spandan.')
      return
    }
    if (status === 'pending_teacher') {
      setState('pending')
      setMessage('Your teacher account has been created and is pending admin approval. You can sign in once an administrator approves it.')
      return
    }
    if (token) {
      completeGoogleLogin(token)
        .then((user) => navigate(user?.role === 'teacher' ? '/teacher' : '/student', { replace: true }))
        .catch((e) => { setState('error'); setMessage(e.message || 'Sign-in could not be completed') })
      return
    }
    setState('error')
    setMessage('Invalid sign-in response. Please try again.')
  }, [completeGoogleLogin, navigate])

  // Finalize a first-time sign-up with the chosen role.
  const handleRoleSubmit = () => {
    if (submitting) return
    setSubmitting(true)
    completeGoogleSignup(reg, chosenRole)
      .then((result) => {
        if (result?.pendingTeacher) {
          setState('pending')
          setMessage('Your teacher account has been created and is pending admin approval. You can sign in once an administrator approves it.')
          return
        }
        navigate(result?.user?.role === 'teacher' ? '/teacher' : '/student', { replace: true })
      })
      .catch((e) => { setState('error'); setMessage(e.message || 'Sign-up could not be completed') })
      .finally(() => setSubmitting(false))
  }

  const brandGradient = isDark
    ? 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)'
    : 'var(--accent-gradient)'

  return (
    <div style={{
      minHeight: '100vh',
      background: brandGradient,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-color)',
        textAlign: 'center'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          background: 'var(--accent-gradient)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px'
        }}>
          <SpandanIcon size={34} />
        </div>

        <p style={{
          fontSize: '15px',
          lineHeight: 1.6,
          color: state === 'error' ? (isDark ? '#fca5a5' : '#dc2626') : 'var(--text-primary)',
          marginBottom: state === 'loading' ? 0 : '24px'
        }}>
          {message}
        </p>

        {state === 'needs_role' && (
          <>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
              Want to....
            </p>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              {[{ value: 'student', label: 'Learn' }, { value: 'teacher', label: 'Teach' }].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setChosenRole(value)}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: '14px 10px',
                    fontSize: '15px',
                    fontWeight: 600,
                    background: chosenRole === value ? 'var(--accent-gradient)' : 'transparent',
                    color: chosenRole === value ? '#fff' : 'var(--text-secondary)',
                    border: `1px solid ${chosenRole === value ? 'transparent' : 'var(--border-color)'}`,
                    borderRadius: 'var(--radius)',
                    cursor: submitting ? 'default' : 'pointer'
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {chosenRole === 'teacher' && (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
                Teacher accounts require administrator approval before you can sign in.
              </p>
            )}
            <button
              type="button"
              onClick={handleRoleSubmit}
              disabled={submitting}
              style={{
                width: '100%',
                padding: '13px 18px',
                fontSize: '15px',
                fontWeight: 600,
                background: 'var(--accent-gradient)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius)',
                cursor: submitting ? 'default' : 'pointer',
                opacity: submitting ? 0.7 : 1
              }}
            >
              {submitting ? 'Creating your account…' : 'Continue'}
            </button>
          </>
        )}

        {state !== 'loading' && state !== 'needs_role' && (
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            style={{
              width: '100%',
              padding: '13px 18px',
              fontSize: '15px',
              fontWeight: 600,
              background: 'var(--accent-gradient)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius)',
              cursor: 'pointer'
            }}
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  )
}

export default AuthCallback
