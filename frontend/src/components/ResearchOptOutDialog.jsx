import React, { useEffect, useState } from 'react'
import useAuthStore from '../stores/authStore'
import useResearchOptOutStore from '../stores/researchOptOutStore'
import ResearchNoticeContent from './ResearchNoticeContent'
import { RESEARCH_NOTICE_TITLE } from '../content/research.js'
import { API_URL } from '../config.js'

// Research notice + the single research opt-out button (Terms of Use, Section 8), as a dialog opened
// from the sidebar. The choice is the user's own: it is read and saved through /auth/research-opt-out
// and is never shown to teachers or admins. Opting out changes nothing else in Spandan and can be undone.
function ResearchOptOutDialog() {
  const { isOpen, close } = useResearchOptOutStore()
  const { token, isAuthenticated } = useAuthStore()
  const [optedOut, setOptedOut] = useState(null) // null = loading
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen || !token) return
    let cancelled = false
    setOptedOut(null)
    setError('')
    fetch(`${API_URL}/auth/research-opt-out`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => { if (!cancelled) setOptedOut(!!d.optedOut) })
      .catch(() => { if (!cancelled) setError('Could not load your research choice, please try again') })
    return () => { cancelled = true }
  }, [isOpen, token])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  if (!isOpen || !token || !isAuthenticated) return null

  const save = async () => {
    if (saving || optedOut === null) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/auth/research-opt-out`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ optOut: !optedOut })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save your research choice, please try again')
      setOptedOut(!!data.optedOut)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const disabled = optedOut === null || saving
  const button = (primary) => ({
    padding: '11px 18px',
    fontSize: '14px',
    fontWeight: 600,
    background: primary ? 'var(--accent-gradient)' : 'transparent',
    color: primary ? '#fff' : 'var(--text-secondary)',
    border: primary ? 'none' : '1px solid var(--border-color)',
    borderRadius: '12px',
    cursor: 'pointer'
  })

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="research-optout-title" onClick={close} style={{
      position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0, 0, 0, 0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)',
        width: '100%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{ padding: '20px 24px 8px' }}>
          <h2 id="research-optout-title" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {RESEARCH_NOTICE_TITLE}
          </h2>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 24px', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
          <ResearchNoticeContent />
          <div role="status" aria-live="polite" style={{ margin: '4px 0 16px', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border-color)', fontSize: '14px', color: 'var(--text-primary)' }}>
            {optedOut === null
              ? (error ? 'Your current choice could not be loaded.' : 'Loading your choice…')
              : optedOut
                ? 'You have opted out. Your Spandan data will not be used in the research.'
                : 'You are included in the research. You can opt out at any time.'}
          </div>
        </div>
        {error && <p style={{ color: '#dc2626', fontSize: '13px', margin: '10px 24px 0' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '12px', padding: '16px 24px 20px' }}>
          <button type="button" onClick={close} style={button(false)}>Cancel</button>
          <button type="button" onClick={save} disabled={disabled}
            style={{ ...button(!optedOut), cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
            {saving ? 'Saving…' : optedOut ? 'Opt back in to research' : 'Opt out of research'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ResearchOptOutDialog
