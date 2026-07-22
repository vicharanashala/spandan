const PROVIDERS = ['minimax', 'openai', 'anthropic', 'google']

const userKeys = new Map()
const roomKeys = new Map()
const serverKeys = new Map()

function normalizeProvider(provider) {
  return PROVIDERS.includes(provider) ? provider : null
}

function normalizeScope(scope) {
  if (scope === 'room' || scope === 'global') return scope
  return 'personal'
}

function getCache(scope, ownerId) {
  if (scope === 'room') {
    if (!ownerId) return null
    return roomKeys
  }

  if (scope === 'global') {
    return serverKeys
  }

  if (!ownerId) return null
  return userKeys
}

function getCacheKey(scope, ownerId) {
  return scope === 'global' ? 'default' : String(ownerId || '')
}

function getProviderStatus(keys = {}) {
  return PROVIDERS.reduce((acc, provider) => {
    acc[provider] = {
      hasKey: typeof keys?.[provider] === 'string' && keys[provider].trim() !== '',
      hasEnvFallback: false
    }
    return acc
  }, {})
}

export function setAiKeys({ scope = 'personal', ownerId, keys = {} }) {
  const normalizedScope = normalizeScope(scope)
  const cache = getCache(normalizedScope, ownerId)
  const cacheKey = getCacheKey(normalizedScope, ownerId)

  if (!cache || !cacheKey) {
    throw new Error(`${normalizedScope} AI key scope requires an owner id`)
  }

  const current = { ...(cache.get(cacheKey) || {}) }
  let savedCount = 0

  for (const [provider, value] of Object.entries(keys)) {
    const normalizedProvider = normalizeProvider(provider)
    const trimmedValue = typeof value === 'string' ? value.trim() : ''

    if (normalizedProvider && trimmedValue) {
      current[normalizedProvider] = trimmedValue
      savedCount += 1
    }
  }

  if (savedCount > 0) {
    cache.set(cacheKey, current)
  }

  return savedCount
}

export function getAiKeys({ scope = 'personal', ownerId } = {}) {
  const normalizedScope = normalizeScope(scope)
  const cache = getCache(normalizedScope, ownerId)
  const cacheKey = getCacheKey(normalizedScope, ownerId)

  if (!cache || !cacheKey) return {}
  return { ...(cache.get(cacheKey) || {}) }
}

export function getAiKeyStatus({ userId, roomId } = {}) {
  return {
    providers: getProviderStatus(getAiKeys({ scope: 'personal', ownerId: userId })),
    roomProviders: getProviderStatus(getAiKeys({ scope: 'room', ownerId: roomId })),
    globalProviders: getProviderStatus(getAiKeys({ scope: 'global' }))
  }
}

export function resolveCachedAiKey(provider, { userId, roomId } = {}) {
  const normalizedProvider = normalizeProvider(provider)
  if (!normalizedProvider) {
    return {
      apiKey: '',
      source: 'none'
    }
  }

  const roomKey = getAiKeys({ scope: 'room', ownerId: roomId })[normalizedProvider]
  if (roomKey) {
    return {
      apiKey: roomKey.trim(),
      source: 'room'
    }
  }

  const userKey = getAiKeys({ scope: 'personal', ownerId: userId })[normalizedProvider]
  if (userKey) {
    return {
      apiKey: userKey.trim(),
      source: 'personal'
    }
  }

  const globalKey = getAiKeys({ scope: 'global' })[normalizedProvider]
  if (globalKey) {
    return {
      apiKey: globalKey.trim(),
      source: 'global'
    }
  }

  return {
    apiKey: '',
    source: 'none'
  }
}

export function clearAiKeyCache() {
  userKeys.clear()
  roomKeys.clear()
  serverKeys.clear()
}

export { PROVIDERS as AI_KEY_PROVIDERS }
