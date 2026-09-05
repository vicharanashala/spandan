import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isSoundEnabled, setSoundEnabled } from '../lib/audio.js'

// UI-facing mirror of the audio module's mute flag. audio.js owns the source of
// truth (localStorage); this store just lets React components re-render on change.
const useSoundStore = create(
  persist(
    (set, get) => ({
      soundEnabled: isSoundEnabled(),
      toggleSound: () => {
        const next = !get().soundEnabled
        setSoundEnabled(next)
        set({ soundEnabled: next })
      },
      setSoundEnabled: (enabled) => {
        setSoundEnabled(enabled)
        set({ soundEnabled: !!enabled })
      },
    }),
    {
      name: 'spandan-sound',
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== 'object') return current
        const { soundEnabled } = persisted
        // Keep the audio module + store in sync with whatever was persisted.
        if (typeof soundEnabled === 'boolean') setSoundEnabled(soundEnabled)
        return { ...current, soundEnabled: isSoundEnabled() }
      },
    }
  )
)

export default useSoundStore