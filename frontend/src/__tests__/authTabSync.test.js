// Cross-tab auth sync: a logout or account switch in one tab must end the session in the others,
// so one browser cannot run two accounts at once.
jest.mock('../config.js', () => ({ API_URL: '/spandan/api', BASE_PATH: '/spandan', SOCKET_URL: '' }))
import useAuthStore from '../stores/authStore.js'
import { authSyncAction, installAuthTabSync, AUTH_STORAGE_KEY } from '../lib/authTabSync.js'

const stored = (user, token) => JSON.stringify({ state: { user, token, isAuthenticated: !!user }, version: 0 })
const A = { _id: 'a1', name: 'A', role: 'student' }
const B = { _id: 'b2', name: 'B', role: 'student' }
const evt = (newValue, key = AUTH_STORAGE_KEY) => ({ key, newValue })

describe('authSyncAction', () => {
  it('reloads when another tab logs out', () => {
    expect(authSyncAction(evt(stored(null, null)), { user: A, token: 'tA' })).toBe('reload')
  })

  it('reloads when another tab signs in as a different account', () => {
    expect(authSyncAction(evt(stored(B, 'tB')), { user: A, token: 'tA' })).toBe('reload')
  })

  it('reloads a logged-out tab when another tab signs in', () => {
    expect(authSyncAction(evt(stored(B, 'tB')), { user: null, token: null })).toBe('reload')
  })

  it('rehydrates quietly when the same account signs in again with a new token', () => {
    expect(authSyncAction(evt(stored(A, 'tA2')), { user: A, token: 'tA' })).toBe('rehydrate')
  })

  it('ignores changes that keep the same token (e.g. a profile update)', () => {
    expect(authSyncAction(evt(stored({ ...A, name: 'A2' }, 'tA')), { user: A, token: 'tA' })).toBe('ignore')
  })

  it('ignores a logout seen by a tab that is already logged out', () => {
    expect(authSyncAction(evt(stored(null, null)), { user: null, token: null })).toBe('ignore')
  })

  it('ignores other storage keys', () => {
    expect(authSyncAction(evt('x', 'spandan-theme'), { user: A, token: 'tA' })).toBe('ignore')
  })

  it('treats localStorage.clear() (key null) as a logout', () => {
    expect(authSyncAction({ key: null, newValue: null }, { user: A, token: 'tA' })).toBe('reload')
  })

  it('treats a removed or unreadable value as a logout', () => {
    expect(authSyncAction(evt(null), { user: A, token: 'tA' })).toBe('reload')
    expect(authSyncAction(evt('{not json'), { user: A, token: 'tA' })).toBe('reload')
  })
})

describe('installAuthTabSync', () => {
  const reload = jest.fn()
  beforeAll(() => installAuthTabSync({ reload }))
  beforeEach(() => {
    reload.mockClear()
    useAuthStore.setState({ user: A, token: 'tA', isAuthenticated: true })
  })

  const fire = (newValue) => window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STORAGE_KEY, newValue }))

  it('reloads this tab when another tab switches account', () => {
    fire(stored(B, 'tB'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload for an unrelated change', () => {
    fire(stored(A, 'tA'))
    expect(reload).not.toHaveBeenCalled()
  })

  it('picks up a new token for the same account without reloading and without writing storage', async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, stored(A, 'tA2'))
    const setItem = jest.spyOn(Storage.prototype, 'setItem')
    fire(stored(A, 'tA2'))
    await new Promise((r) => setTimeout(r, 0))
    expect(reload).not.toHaveBeenCalled()
    expect(useAuthStore.getState().token).toBe('tA2')
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})
