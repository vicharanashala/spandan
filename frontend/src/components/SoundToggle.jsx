import React from 'react'
import useSoundStore from '../stores/soundStore'

// Small on/off toggle for the app's sound effects. Reads the persisted preference
// from the sound store and flips it on click.
function SoundToggle({ style }) {
  const { soundEnabled, toggleSound } = useSoundStore()

  return (
    <button
      onClick={toggleSound}
      title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
      aria-label={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
      style={{
        padding: '8px 10px',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        background: soundEnabled ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
        color: soundEnabled ? '#10b981' : 'var(--text-secondary)',
        fontSize: '14px',
        cursor: 'pointer',
        lineHeight: 1,
        ...style,
      }}
    >
      {soundEnabled ? '🔊' : '🔇'}
    </button>
  )
}

export default SoundToggle