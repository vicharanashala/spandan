import React, { useEffect, useState } from 'react'
import { aiConfigApi } from '../lib/api.js'

const PROVIDERS = [
  { id: 'minimax', label: 'MiniMax' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google Gemini' }
]

function AIIntegrationSettings() {
  const [keys, setKeys] = useState({
    minimax: '',
    openai: '',
    anthropic: '',
    google: ''
  })
  const [status, setStatus] = useState({})
  const [globalStatus, setGlobalStatus] = useState({})
  const [envStatus, setEnvStatus] = useState({})
  const [scope, setScope] = useState('personal')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    setIsLoading(true)
    setError('')
    try {
      const data = await aiConfigApi.getStatus()
      setStatus(data.providers || {})
      setGlobalStatus(data.globalProviders || {})
      setEnvStatus(data.envProviders || {})
    } catch (err) {
      setError(err.message || 'Unable to load AI configuration')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (provider, value) => {
    setKeys(prev => ({ ...prev, [provider]: value }))
    setMessage('')
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setMessage('')

    try {
      const nonEmptyKeys = Object.fromEntries(
        Object.entries(keys).filter(([, value]) => value.trim())
      )

      if (Object.keys(nonEmptyKeys).length === 0) {
        throw new Error('Enter at least one API key to save')
      }

      const data = await aiConfigApi.saveKeys(nonEmptyKeys, scope)
      setStatus(data.providers || {})
      setGlobalStatus(data.globalProviders || {})
      setKeys({ minimax: '', openai: '', anthropic: '', google: '' })
      setMessage('AI integration settings saved')
    } catch (err) {
      setError(err.message || 'Unable to save AI settings')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section style={{
      background: 'var(--bg-card)',
      borderRadius: '16px',
      padding: '24px',
      boxShadow: 'var(--card-shadow)',
      border: '1px solid var(--border-color)',
      marginBottom: '24px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '16px',
        alignItems: 'flex-start',
        marginBottom: '20px'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
            AI Integration Settings
          </h2>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Save provider keys for quiz generation. Existing keys are never displayed.
          </p>
        </div>
        <button
          type="button"
          onClick={loadStatus}
          disabled={isLoading}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontSize: '13px'
          }}
        >
          {isLoading ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#b91c1c',
          padding: '10px 12px',
          fontSize: '13px',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}

      {message && (
        <div style={{
          background: '#ecfdf5',
          border: '1px solid #bbf7d0',
          borderRadius: '8px',
          color: '#047857',
          padding: '10px 12px',
          fontSize: '13px',
          marginBottom: '16px'
        }}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => setScope('personal')}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: scope === 'personal' ? '2px solid #2563eb' : '1px solid var(--border-color)',
              background: scope === 'personal' ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-primary)',
              color: scope === 'personal' ? '#2563eb' : 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Personal
          </button>
          <button
            type="button"
            onClick={() => setScope('global')}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: scope === 'global' ? '2px solid #2563eb' : '1px solid var(--border-color)',
              background: scope === 'global' ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-primary)',
              color: scope === 'global' ? '#2563eb' : 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Institution
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px'
        }}>
          {PROVIDERS.map(provider => {
            const providerStatus = scope === 'global'
              ? (globalStatus[provider.id] || {})
              : (status[provider.id] || {})
            const providerEnvStatus = envStatus[provider.id] || {}
            return (
              <label key={provider.id} style={{ display: 'block' }}>
                <span style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  alignItems: 'center',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                  marginBottom: '8px'
                }}>
                  {provider.label}
                  <span style={{
                    color: providerStatus.hasKey ? '#047857' : providerEnvStatus.hasEnvFallback ? '#2563eb' : 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: '600'
                  }}>
                    {providerStatus.hasKey ? 'Configured' : providerEnvStatus.hasEnvFallback ? 'Env fallback' : 'Not set'}
                  </span>
                </span>
                {provider.id === 'google' && (
                  <div style={{
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '10px',
                    color: '#1d4ed8',
                    padding: '10px 12px',
                    fontSize: '12px',
                    lineHeight: '1.45',
                    marginBottom: '10px'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      flexWrap: 'wrap'
                    }}>
                      <span>Don't have a budget? Get a free Google Gemini API key in 30 seconds (no credit card required).</span>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          background: '#2563eb',
                          color: 'white',
                          fontSize: '12px',
                          fontWeight: '700',
                          textDecoration: 'none',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Get Free Gemini Key
                      </a>
                    </div>
                  </div>
                )}
                <input
                  type="password"
                  value={keys[provider.id]}
                  onChange={(event) => handleChange(provider.id, event.target.value)}
                  placeholder={providerStatus.hasKey ? 'Leave blank to keep current key' : 'Paste API key'}
                  autoComplete="off"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px'
                  }}
                />
              </label>
            )
          })}
        </div>

        <button
          type="submit"
          disabled={isSaving}
          style={{
            marginTop: '18px',
            padding: '12px 18px',
            borderRadius: '10px',
            border: 'none',
            background: isSaving ? '#9ca3af' : '#2563eb',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: isSaving ? 'not-allowed' : 'pointer'
          }}
        >
          {isSaving ? 'Saving...' : 'Save AI Keys'}
        </button>
      </form>
    </section>
  )
}

export default AIIntegrationSettings
