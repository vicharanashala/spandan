import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// mode: 'light' | 'dark' | 'system'
// - light/dark force a theme regardless of the OS preference.
// - system follows the OS theme and updates LIVE when the OS preference changes.
//
// `isDark` is exposed as a plain boolean so every existing consumer that reads it keeps
// working: it equals the *effective* applied theme (the OS preference when mode is system).

const DEFAULTS = { mode: 'dark' }

// Hoisted helper shared by the store and the module-level matchMedia listener.
function effectiveIsDark(mode, prefersDark) {
  if (mode === 'light') return false
  if (mode === 'dark') return true
  return !!prefersDark
}

const prefersDark = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

const useThemeStore = create(
  persist(
    (set, get) => ({
      mode: DEFAULTS.mode,
      isDark: effectiveIsDark(DEFAULTS.mode, prefersDark()),
      // Cycle light -> dark -> system (kept for any code still calling toggleTheme).
      toggleTheme: () => {
        const { mode } = get()
        const next = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light'
        get().setMode(next)
      },
      // Set an explicit mode and recompute the effective isDark.
      setMode: (mode) => {
        set({ mode, isDark: effectiveIsDark(mode, prefersDark()) })
      },
    }),
    {
      name: 'spandan-theme',
      // We no longer persist the old boolean; only `mode`. Migrate a legacy { isDark } payload.
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== 'object') return current
        const p = persisted
        // Legacy store only had isDark. If mode is absent, derive it so returning users keep
        // their dark/light choice; otherwise fall back to the default.
        if (p.mode === undefined) {
          return { ...current, mode: p.isDark === true ? 'dark' : 'light' }
        }
        return { ...current, ...p }
      },
    }
  )
)

// Subscribe to OS theme changes so 'system' mode updates live (no reload needed). If the user
// later picks an explicit mode we simply recompute from it; matchMedia keeps firing regardless.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    const { mode } = useThemeStore.getState()
    if (mode === 'system') {
      useThemeStore.setState({ isDark: mq.matches })
    }
  }
  mq.addEventListener?.('change', handler) || mq.addListener?.(handler)
}

export default useThemeStore
