import React from 'react'
import useThemeStore from '../stores/themeStore'

const OPTIONS = [
  { value: 'light', label: '☀️', title: 'Light mode' },
  { value: 'system', label: '🖥️', title: 'Follow system (auto)' },
  { value: 'dark', label: '🌙', title: 'Dark mode' },
]

export default function ThemeToggle() {
  const { mode, setMode } = useThemeStore()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        background: 'rgba(255,255,255,0.15)',
        borderRadius: '10px',
        padding: '3px'
      }}
      title={`Theme: ${mode}${mode === 'system' ? ' (auto)' : ''}`}
    >
      {OPTIONS.map((opt) => {
        const active = mode === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => setMode(opt.value)}
            title={opt.title}
            style={{
              padding: '6px 8px',
              background: active ? 'rgba(255,255,255,0.35)' : 'transparent',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: active ? 1 : 0.7,
              transition: 'background 0.2s ease, opacity 0.2s ease'
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
