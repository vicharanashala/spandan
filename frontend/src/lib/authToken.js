import useAuthStore from '../stores/authStore.js'

function readPersistedAuthState() {
  try {
    const persistedAuth = localStorage.getItem('spandan-auth')
    if (!persistedAuth) {
      return null
    }

    return JSON.parse(persistedAuth)?.state || null
  } catch (error) {
    console.warn('Unable to read persisted auth state:', error)
    return null
  }
}

export function decodeJwtPayload(token) {
  try {
    const payload = token?.split('.')?.[1]
    if (!payload) {
      return null
    }

    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      '='
    )

    return JSON.parse(atob(paddedPayload))
  } catch (error) {
    return null
  }
}

export function isJwtExpired(token) {
  const payload = decodeJwtPayload(token)
  if (!payload?.exp) {
    return false
  }

  return payload.exp * 1000 <= Date.now()
}

export function getAuthToken(candidateToken) {
  const stateToken = useAuthStore.getState().token
  const token = candidateToken || stateToken || readPersistedAuthState()?.token || null

  if (!token) {
    return null
  }

  if (isJwtExpired(token)) {
    useAuthStore.getState().logout()
    return null
  }

  return token
}

export function getAuthHeader() {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
