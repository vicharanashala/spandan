import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import TermsContent from './TermsContent'
import TermsCheckbox from './TermsCheckbox'

// Blocking accept-terms screen for signed-in accounts that have not accepted the CURRENT Terms of Use
// (accounts created before the terms existed, or after a version bump). The backend refuses such
// accounts with 403 TERMS_REQUIRED on every other route, so nothing else works until they accept.
// Shown when the refreshed user says termsAccepted === false, or when any request / the socket
// reported TERMS_REQUIRED (covers a session restored from storage before the user was refreshed).
function TermsGate() {
  const { pathname } = useLocation()
  const { token, isAuthenticated, user, termsRequired, refreshUser, acceptTerms, logout } = useAuthStore()
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // The stored user may predate the terms (no termsAccepted field): refresh it once per session.
  useEffect(() => {
    if (token && isAuthenticated) refreshUser()
  }, [token, isAuthenticated, refreshUser])

  const show = token && isAuthenticated && (termsRequired || user?.termsAccepted === false) && pathname !== '/terms'
  if (!show) return null

  const handleAccept = async () => {
    if (!checked || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await acceptTerms()
      setChecked(false)
    } catch (e) {
      setError(e.message || 'Could not record acceptance, please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="terms-gate-title" style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      background: 'rgba(0, 0, 0, 0.55)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        width: '100%',
        maxWidth: '640px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{ padding: '20px 24px 8px' }}>
          <h2 id="terms-gate-title" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Please accept the Spandan Terms of Use
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
            To keep using Spandan, please read and accept the terms below.
          </p>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 24px', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
          <TermsContent />
        </div>
        <div style={{ padding: '16px 24px 20px' }}>
          <TermsCheckbox checked={checked} onChange={setChecked} disabled={submitting} />
          {error && <p style={{ color: '#dc2626', fontSize: '13px', margin: '10px 0 0' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={logout}
              disabled={submitting}
              style={{
                flex: 1,
                padding: '12px',
                fontSize: '15px',
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                cursor: 'pointer'
              }}
            >
              Decline and sign out
            </button>
            <button
              type="button"
              onClick={handleAccept}
              disabled={!checked || submitting}
              style={{
                flex: 1,
                padding: '12px',
                fontSize: '15px',
                fontWeight: 600,
                background: 'var(--accent-gradient)',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                cursor: !checked || submitting ? 'not-allowed' : 'pointer',
                opacity: !checked || submitting ? 0.6 : 1
              }}
            >
              {submitting ? 'Saving…' : 'Accept and continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TermsGate
