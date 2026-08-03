import React, { useState } from 'react'
import useThemeStore from '../stores/themeStore'

export default function PasswordInput({ value, onChange, placeholder, required, style, showRequirements, passwordReqs, ...props }) {
  const [show, setShow] = useState(false)
  const { isDark } = useThemeStore()

  const bg = style?.background || (isDark ? '#1e293b' : 'white')
  const borderColor = isDark ? '#334155' : '#e2e8f0'

  return (
    <div style={{ ...style }}>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          style={{
            width: '100%',
            padding: '14px 44px 14px 16px',
            fontSize: '16px',
            border: `2px solid ${borderColor}`,
            borderRadius: '12px',
            background: bg,
            color: isDark ? '#f1f5f9' : '#1e293b',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.3s'
          }}
          onFocus={(e) => e.target.style.borderColor = '#667eea'}
          onBlur={(e) => e.target.style.borderColor = borderColor}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          style={{
            position: 'absolute',
            right: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: isDark ? '#94a3b8' : '#64748b',
            padding: '4px'
          }}
          tabIndex={-1}
        >
          {show ? '🙈' : '👁️'}
        </button>
      </div>
      {showRequirements && passwordReqs && (
        <div style={{
          marginTop: '12px',
          padding: '12px',
          background: isDark ? 'rgba(51,65,85,0.5)' : '#f8f9fa',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          {passwordReqs.map((req) => (
            <div key={req.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              color: req.met ? (isDark ? '#6ee7b7' : '#059669') : (isDark ? '#94a3b8' : '#9ca3af'),
              fontWeight: req.met ? '600' : '400'
            }}>
              <span style={{ fontSize: '14px', width: '16px', textAlign: 'center' }}>
                {req.met ? '✓' : '○'}
              </span>
              {req.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}