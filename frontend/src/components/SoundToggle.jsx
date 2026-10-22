import React, { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { isSoundEnabled, setSoundEnabled, unlockAudio, playPreview, SOUND_CHANGE_EVENT } from '../lib/sounds'

// Bell button that mutes/unmutes the attention chimes on this device (per browser, default on).
// Turning it ON happens inside a click, so it also unlocks audio and plays a short preview.
export default function SoundToggle({ style = {} }) {
  const [enabled, setEnabled] = useState(() => isSoundEnabled())

  useEffect(() => {
    const sync = (e) => setEnabled(e?.detail?.enabled ?? isSoundEnabled())
    window.addEventListener(SOUND_CHANGE_EVENT, sync)
    return () => window.removeEventListener(SOUND_CHANGE_EVENT, sync)
  }, [])

  const toggle = async () => {
    const next = !enabled
    setSoundEnabled(next)
    setEnabled(next)
    if (next) {
      await unlockAudio()
      playPreview()
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? 'Sound on — click to mute chimes on this device' : 'Sound off — click to enable chimes on this device'}
      title={enabled ? 'Sound on (click to mute)' : 'Sound off (click to enable)'}
      style={{
        padding: '8px 12px',
        background: 'var(--nav-hover)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '500',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        ...style
      }}
    >
      {enabled ? <Bell size={18} aria-hidden="true" /> : <BellOff size={18} aria-hidden="true" />}
    </button>
  )
}
