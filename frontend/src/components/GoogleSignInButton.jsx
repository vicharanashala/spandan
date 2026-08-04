import React, { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID } from '../config.js'

const GOOGLE_SCRIPT_ID = 'google-identity-services'
const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

function GoogleSignInButton({ onCredential, disabled = false, isDark = false, isMobile = false }) {
  const buttonRef = useRef(null)
  const credentialRef = useRef(onCredential)
  const [ready, setReady] = useState(false)
  const [configurationError, setConfigurationError] = useState('')

  useEffect(() => {
    credentialRef.current = onCredential
  }, [onCredential])

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setConfigurationError('Google sign-in is not configured')
      return undefined
    }

    const renderButton = () => {
      if (!window.google?.accounts?.id || !buttonRef.current) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (response?.credential) credentialRef.current(response.credential)
        }
      })
      buttonRef.current.innerHTML = ''
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: isDark ? 'filled_black' : 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: isMobile ? 280 : 350
      })
      setReady(true)
    }

    if (window.google?.accounts?.id) {
      renderButton()
      return undefined
    }

    let script = document.getElementById(GOOGLE_SCRIPT_ID)
    if (!script) {
      script = document.createElement('script')
      script.id = GOOGLE_SCRIPT_ID
      script.src = GOOGLE_SCRIPT_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', renderButton)
    script.addEventListener('error', () => setConfigurationError('Unable to load Google sign-in'))

    return () => {
      script.removeEventListener('load', renderButton)
    }
  }, [isDark, isMobile])

  if (configurationError) {
    return (
      <div
        role="status"
        aria-disabled="true"
        style={{
          minHeight: '42px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 16px',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          color: 'var(--text-secondary)',
          fontSize: '12px',
          opacity: 0.7
        }}
      >
        {configurationError}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', minHeight: '42px', display: 'flex', justifyContent: 'center', opacity: disabled ? 0.65 : 1 }} aria-busy={!ready || disabled}>
      <div ref={buttonRef} />
      {disabled && <div style={{ position: 'absolute', inset: 0, cursor: 'not-allowed' }} aria-hidden="true" />}
      {!ready && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>Loading Google sign-in...</div>}
    </div>
  )
}

export default GoogleSignInButton
