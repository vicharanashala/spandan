import useAuthStore from '../stores/authStore.js'
import { API_URL } from '../config.js'

// Install a one-time global fetch wrapper that turns any 401 from OUR backend into a graceful
// session-expiry: it drops the session and flags sessionExpired, so ProtectedRoute redirects to the
// login screen with a clear message — instead of the previous silent failure. (The answer-submit path
// in StudentRoomPage uses a raw fetch that swallowed the 401, so an expired student appeared "in the
// room" but simply could not answer.) Wrapping fetch once here covers every call site — the api.js
// helper, the stores, and any raw fetch — without editing each one.
//
// Login / registration 401s are NOT treated as expiry: those happen while no token is stored, and we
// only react when a token is currently present (a live session going stale). Cross-origin calls (e.g.
// the Samagama SSO probe to samagama.in) are ignored — only same-origin requests under API_URL count.
let installed = false

function isOurApiUrl(input) {
  const raw = typeof input === 'string' ? input : (input && input.url) || ''
  try {
    const u = new URL(raw, window.location.origin)
    if (u.host !== window.location.host) return false // cross-origin (e.g. samagama.in) → not ours
    return u.pathname.startsWith(API_URL)
  } catch {
    return false
  }
}

export function installAuthFetchInterceptor() {
  if (installed || typeof window === 'undefined' || !window.fetch) return
  installed = true
  const originalFetch = window.fetch.bind(window)

  window.fetch = async (...args) => {
    const response = await originalFetch(...args)
    try {
      if (response.status === 401 && isOurApiUrl(args[0]) && useAuthStore.getState().token) {
        console.warn('[Spandan AuthFetch] Intercepted 401 response from backend for URL:', args[0])
        useAuthStore.getState().handleSessionExpired()
      }
    } catch {
      // Never let interceptor bookkeeping break the caller's response.
    }
    return response
  }
}

export default installAuthFetchInterceptor
