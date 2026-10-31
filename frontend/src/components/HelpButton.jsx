import React from 'react'
import useHelpStore from '../stores/helpStore'
import { Info } from 'lucide-react'

// The ⓘ button shown in every logged-in page header (left of the theme toggle). Opens the help
// drawer, which picks the section for the current page. data-tour lets the dashboard tour point at it.
export default function HelpButton({ style = {} }) {
  const open = useHelpStore(s => s.open)
  return (
    <button
      type="button"
      data-tour="help-button"
      onClick={() => open()}
      aria-label="Help"
      title="Help — guide for this page (press ? anytime)"
      style={{
        padding: '8px 12px',
        background: 'var(--nav-hover)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        ...style
      }}
    >
      <Info size={18} aria-hidden="true" />
    </button>
  )
}
