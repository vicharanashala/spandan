import React from 'react'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'
import AIIntegrationSettings from '../components/AIIntegrationSettings'
import useAuthStore from '../stores/authStore'

function AISettingsPage() {
  const { user } = useAuthStore()

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <Sidebar user={user} />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        marginLeft: '240px'
      }}>
        <header style={{
          background: 'var(--header-bg)',
          color: 'white',
          padding: '24px 32px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>
                AI Integration Settings
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                Configure API keys for automated question generation.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: '32px', maxWidth: '980px', width: '100%', boxSizing: 'border-box' }}>
          <AIIntegrationSettings />
        </main>
      </div>
    </div>
  )
}

export default AISettingsPage
