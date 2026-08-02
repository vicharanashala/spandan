// Read a JWT payload's `exp` (seconds since epoch) WITHOUT verifying the signature. This is used only
// to decide, client-side, whether a stored token is already expired so we can send the user to
// re-login BEFORE they hit a silent 401. The server stays the real authority (it rejects bad/expired
// tokens); this is purely a UX fast-path, so it fails OPEN: if the token can't be decoded we assume
// "not expired" and let the server's 401 (caught by the fetch interceptor) handle it.
export function getTokenExp(token) {
  try {
    const part = token.split('.')[1]
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(json)
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

export function isTokenExpired(token) {
  if (!token) return false
  const exp = getTokenExp(token)
  if (!exp) return false // undecodable → fail open; the server will reject it if it is truly invalid
  return exp * 1000 <= Date.now()
}
