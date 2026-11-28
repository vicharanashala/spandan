import useAuthStore from '../stores/authStore.js'

// Keep every open tab on the same account. The session lives in localStorage ('spandan-auth'), but
// each tab reads it once on load and then keeps its own in-memory copy, so without this a tab never
// learned that another tab had logged out or signed in as someone else: one browser could then run
// two student accounts in the same room at once (and the old tab's token and socket kept working).
//
// The browser fires a 'storage' event in every OTHER tab when that key changes. On it:
// - same account, new token (signed in again)  -> pick up the new session quietly (rehydrate);
// - logged out, or a different account          -> reload, so this tab drops the old session, its
//   socket and any room state, and comes back as whatever is now stored (login screen or the new
//   account).
// Neither path writes to storage (rehydrate only reads, reload starts fresh), so two tabs can never
// overwrite each other's session in a loop. Incognito windows and other browsers have separate
// storage and are not affected.
export const AUTH_STORAGE_KEY = 'spandan-auth'

let installed = false

const userIdOf = (user) => (user && (user._id || user.id)) || null

function readStoredSession(raw) {
  if (!raw) return { token: null, userId: null }
  try {
    const state = JSON.parse(raw)?.state || {}
    return { token: state.token || null, userId: userIdOf(state.user) }
  } catch {
    return { token: null, userId: null }
  }
}

// Decide what this tab should do for a storage event: 'ignore', 'rehydrate' or 'reload'.
// key === null means localStorage.clear() was called, which also clears the session.
export function authSyncAction(event, current) {
  if (event.key !== AUTH_STORAGE_KEY && event.key !== null) return 'ignore'
  const next = readStoredSession(event.key === null ? null : event.newValue)
  const curToken = current.token || null
  const curUserId = userIdOf(current.user)
  if (next.token === curToken) return 'ignore'
  if (curToken && next.token && next.userId && next.userId === curUserId) return 'rehydrate'
  return 'reload'
}

export function installAuthTabSync({ reload = () => window.location.reload() } = {}) {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('storage', (event) => {
    try {
      const action = authSyncAction(event, useAuthStore.getState())
      if (action === 'rehydrate') useAuthStore.persist.rehydrate()
      else if (action === 'reload') reload()
    } catch {
      // Never let sync bookkeeping break the page.
    }
  })
}

export default installAuthTabSync
