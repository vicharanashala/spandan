import React, { useState, useRef, useEffect } from 'react'

/**
 * Reusable export menu with CSV/PDF dropdown options.
 *
 * Props:
 *  - options: array of { label, value, description? }
 *  - onSelect(value): called when an option is chosen
 *  - buttonLabel: main button text/icon (default: "Export")
 *  - variant: 'header' | 'inline' (style preset)
 *  - disabled: bool
 */
export default function ExportMenu({
  options = [],
  onSelect,
  buttonLabel = 'Export',
  variant = 'header',
  disabled = false
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const buttonStyle = variant === 'header' ? {
    padding: '8px 14px',
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '8px',
    color: 'white',
    fontSize: '13px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  } : {
    padding: '8px 14px',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '13px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        style={buttonStyle}
        disabled={disabled}
        title="Export results"
      >
        📊 {buttonLabel} ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          minWidth: '240px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          zIndex: 1000,
          overflow: 'hidden'
        }}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setOpen(false); onSelect(opt.value) }}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border-color)',
                textAlign: 'left',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                fontSize: '13px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--nav-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontWeight: '600' }}>{opt.label}</div>
              {opt.description && (
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {opt.description}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}