import {
  clearAiKeyCache,
  getAiKeyStatus,
  getAiKeys,
  resolveCachedAiKey,
  setAiKeys
} from '../services/aiKeyCache.js'

describe('AI key in-memory cache', () => {
  beforeEach(() => {
    clearAiKeyCache()
  })

  it('stores and returns personal keys without using MongoDB', () => {
    const savedCount = setAiKeys({
      scope: 'personal',
      ownerId: 'user-1',
      keys: {
        openai: ' sk-test ',
        unknown: 'ignored',
        google: ''
      }
    })

    expect(savedCount).toBe(1)
    expect(getAiKeys({ scope: 'personal', ownerId: 'user-1' })).toEqual({
      openai: 'sk-test'
    })
  })

  it('resolves room keys before personal and global keys', () => {
    setAiKeys({ scope: 'global', keys: { openai: 'global-key' } })
    setAiKeys({ scope: 'personal', ownerId: 'user-1', keys: { openai: 'user-key' } })
    setAiKeys({ scope: 'room', ownerId: 'room-1', keys: { openai: 'room-key' } })

    expect(resolveCachedAiKey('openai', { userId: 'user-1', roomId: 'room-1' })).toEqual({
      apiKey: 'room-key',
      source: 'room'
    })
  })

  it('reports provider status from memory only', () => {
    setAiKeys({ scope: 'personal', ownerId: 'user-1', keys: { anthropic: 'anthropic-key' } })

    const status = getAiKeyStatus({ userId: 'user-1', roomId: 'room-1' })

    expect(status.providers.anthropic.hasKey).toBe(true)
    expect(status.roomProviders.anthropic.hasKey).toBe(false)
    expect(status.globalProviders.anthropic.hasKey).toBe(false)
  })
})
