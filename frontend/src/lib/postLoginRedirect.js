// Where to send a user after they sign in, so deep links (e.g. an invite link) survive the login page.
//   rememberRedirect(path)    → ProtectedRoute saves the page a logged-out visitor asked for
//   redirectAfterLogin(role)  → that page if it belongs to the role, otherwise the role's dashboard
//   clearRedirect()           → forget it once a protected page has rendered
// Kept in sessionStorage (per tab) so it also survives the Google OAuth round-trip.

const KEY = 'spandan:postLoginRedirect'

const homeFor = (role) => (role === 'teacher' ? '/teacher' : '/student')

export function rememberRedirect(path) {
  try { sessionStorage.setItem(KEY, path) } catch (err) { /* storage unavailable */ }
}

export function clearRedirect() {
  try { sessionStorage.removeItem(KEY) } catch (err) { /* storage unavailable */ }
}

export function redirectAfterLogin(role) {
  let path = null
  try { path = sessionStorage.getItem(KEY) } catch (err) { /* storage unavailable */ }
  const home = homeFor(role)
  // Only in-app paths under the user's own area: no other origins, no other role's pages.
  if (path && !path.startsWith('//') && (path === home || path.startsWith(home + '/') || path.startsWith(home + '?'))) return path
  return home
}
