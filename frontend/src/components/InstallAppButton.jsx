import React, { useState, useEffect } from 'react'

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  const isWin = typeof navigator !== 'undefined' && /Win/.test(navigator.platform || navigator.userAgent)

  useEffect(() => {
    // Detect if already running in standalone PWA / Desktop mode
    if (window.matchMedia('(display-mode: standalone)').matches || window.isDesktopApp) {
      setIsInstalled(true)
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setIsInstalled(true)
      }
      setDeferredPrompt(null)
      setShowModal(false)
    } else {
      setShowModal(true)
    }
  }

  if (isInstalled) return null

  return (
    <>
      <button
        onClick={handleInstallClick}
        style={{
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: 'var(--radius, 10px)',
          padding: '8px 14px',
          fontSize: '13px',
          fontWeight: '600',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: 'var(--text-primary, #0f172a)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'none'
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
        }}
      >
        <span>💻</span>
        <span>Get Desktop App</span>
      </button>

      {/* Modal for App Download / Installation Options */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-card, #ffffff)',
            color: 'var(--text-primary, #0f172a)',
            borderRadius: '16px',
            padding: '28px',
            maxWidth: '460px',
            width: '100%',
            boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
            border: '1px solid var(--border-color, #e2e8f0)',
            position: 'relative',
            animation: 'fadeInUp 0.3s ease-out'
          }}>
            {/* Close button */}
            <button
              onClick={() => setShowModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                color: 'var(--text-secondary, #64748b)'
              }}
            >
              ✕
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                color: '#ffffff'
              }}>
                ⚡
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>Install Spandan App</h2>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #64748b)' }}>
                  Experience Spandan in a dedicated desktop window
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px' }}>
              {/* PWA Direct Browser Install */}
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid var(--border-color, #e2e8f0)',
                background: 'var(--input-bg, #f8fafc)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🌐</span> Install via Browser (Mac & Windows)
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary, #64748b)', lineHeight: '1.5' }}>
                  In <strong>Chrome</strong> or <strong>Edge</strong>, click the <strong>Install Icon (⊕)</strong> in your browser's address bar to add Spandan to your Desktop & Applications folder.
                </div>
              </div>

              {/* Windows Standalone Executable */}
              {isWin && (
                <div style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #3b82f6',
                  background: 'rgba(59, 130, 246, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: '#2563eb' }}>🪟 Windows Desktop App (.exe)</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary, #64748b)' }}>Standalone desktop bundle</div>
                  </div>
                  <a
                    href={(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/Spandan-Portable.exe'}
                    download="Spandan-Portable.exe"
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: '#2563eb',
                      color: '#ffffff',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: '600',
                      boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
                    }}
                  >
                    Download
                  </a>
                </div>
              )}

              {/* macOS Information & .dmg Download */}
              {isMac && (
                <div style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #8b5cf6',
                  background: 'rgba(139, 92, 246, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: '#7c3aed' }}>🍎 macOS Desktop App (.dmg)</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary, #64748b)' }}>Native Mac installer</div>
                    </div>
                    <a
                      href={(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/Spandan.dmg'}
                      download="Spandan.dmg"
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        background: '#7c3aed',
                        color: '#ffffff',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: '600',
                        boxShadow: '0 2px 6px rgba(124, 58, 237, 0.3)'
                      }}
                    >
                      Download .dmg
                    </a>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary, #64748b)', lineHeight: '1.4', paddingTop: '4px', borderTop: '1px solid rgba(139, 92, 246, 0.2)' }}>
                    💡 <em>Or click <strong>Share ➔ Add to Dock</strong> in Safari/Chrome to install instantly without downloading!</em>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '24px', textAlign: 'right' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  background: 'transparent',
                  color: 'var(--text-primary, #0f172a)',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '13px'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
