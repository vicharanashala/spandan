import React from 'react'
import { Link } from 'react-router-dom'
import TermsContent from '../components/TermsContent'

// Public page (no sign-in needed) with the full Terms of Use; the registration checkboxes link here.
function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '32px 16px' }}>
      <div style={{
        maxWidth: '760px',
        margin: '0 auto',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        padding: '28px'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          Spandan Terms of Use and Privacy Notice
        </h1>
        <TermsContent />
        <Link to="/" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '14px' }}>Back to Spandan</Link>
      </div>
    </div>
  )
}

export default TermsPage
