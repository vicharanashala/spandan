import React from 'react'
import { Link } from 'react-router-dom'
import { TERMS_CHECKBOX_LABEL } from '../content/terms.js'

// The "I am 18+ and agree to the Terms" checkbox used on every path that creates or confirms an
// account. The link opens /terms in a new tab so a half-filled form is not lost.
function TermsCheckbox({ checked, onChange, disabled = false }) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      fontSize: '13px',
      lineHeight: 1.5,
      color: 'var(--text-secondary)',
      textAlign: 'left',
      cursor: disabled ? 'default' : 'pointer'
    }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: '3px', width: '16px', height: '16px', flexShrink: 0, accentColor: 'var(--accent)' }}
      />
      <span>
        {TERMS_CHECKBOX_LABEL}{' '}
        <Link to="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
          Read the terms
        </Link>
      </span>
    </label>
  )
}

export default TermsCheckbox
