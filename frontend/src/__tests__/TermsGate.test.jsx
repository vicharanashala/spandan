// Already-signed-in users must accept the terms: a session restored from storage BEFORE the terms existed
// (stored user has no termsAccepted field at all) is refreshed via /auth/me and blocked by TermsGate; a 403
// TERMS_REQUIRED from any API call or a socket refusal also raises the gate. Uses the REAL auth store.
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

jest.mock('../config.js', () => ({ API_URL: '/spandan/api', BASE_PATH: '/spandan', SOCKET_URL: '' }))
const mockReauthenticate = jest.fn()
jest.mock('../stores/socketStore.js', () => ({
  __esModule: true,
  default: { getState: () => ({ reauthenticate: mockReauthenticate }) }
}))
import useAuthStore from '../stores/authStore'
import TermsGate from '../components/TermsGate'
import { installAuthFetchInterceptor } from '../lib/authFetch.js'

// A minimal Response stand-in whose clone() works the way the interceptor uses it.
const resp = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  clone: () => ({ json: async () => body })
})

const legacyUser = { _id: 'u1', name: 'Old Student', email: 'old@example.com', role: 'student' } // pre-terms: no termsAccepted

const renderGate = (path = '/student') => render(<MemoryRouter initialEntries={[path]}><TermsGate /></MemoryRouter>)

beforeEach(() => {
  mockReauthenticate.mockClear()
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false, termsRequired: false, sessionExpired: false })
})

describe('TermsGate for already signed-in accounts', () => {
  it('blocks a restored pre-terms session after /auth/me reports termsAccepted: false', async () => {
    global.fetch = jest.fn((url) => {
      if (String(url).endsWith('/auth/me')) return Promise.resolve(resp(200, { user: { ...legacyUser, termsAccepted: false } }))
      return Promise.resolve(resp(404, {}))
    })
    useAuthStore.setState({ user: legacyUser, token: 'old-token', isAuthenticated: true })
    renderGate()
    expect(await screen.findByRole('dialog', { name: /accept the Spandan Terms of Use/i })).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/spandan/api/auth/me', expect.anything())
  })

  it('Accept stays disabled until ticked, then records acceptance, closes, and re-authenticates the socket', async () => {
    global.fetch = jest.fn((url) => {
      if (String(url).endsWith('/auth/me')) return Promise.resolve(resp(200, { user: { ...legacyUser, termsAccepted: false } }))
      if (String(url).endsWith('/auth/accept-terms')) return Promise.resolve(resp(200, { user: { ...legacyUser, termsAccepted: true } }))
      return Promise.resolve(resp(404, {}))
    })
    useAuthStore.setState({ user: legacyUser, token: 'old-token', isAuthenticated: true })
    renderGate()
    await screen.findByRole('dialog')
    const accept = screen.getByRole('button', { name: /Accept and continue/ })
    expect(accept).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(accept).not.toBeDisabled()
    fireEvent.click(accept)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const call = global.fetch.mock.calls.find(([u]) => String(u).endsWith('/auth/accept-terms'))
    expect(JSON.parse(call[1].body)).toEqual({ acceptTerms: true })
    expect(call[1].headers.Authorization).toBe('Bearer old-token')
    expect(useAuthStore.getState().user.termsAccepted).toBe(true)
    expect(useAuthStore.getState().termsRequired).toBe(false)
    expect(mockReauthenticate).toHaveBeenCalledWith('old-token')
  })

  it('Decline signs the user out', async () => {
    global.fetch = jest.fn(() => Promise.resolve(resp(200, { user: { ...legacyUser, termsAccepted: false } })))
    useAuthStore.setState({ user: legacyUser, token: 'old-token', isAuthenticated: true })
    renderGate()
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: /Decline and sign out/ }))
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not show for an account that already accepted', async () => {
    global.fetch = jest.fn(() => Promise.resolve(resp(200, { user: { ...legacyUser, termsAccepted: true } })))
    useAuthStore.setState({ user: legacyUser, token: 'tok', isAuthenticated: true })
    renderGate()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not show when signed out, or on the /terms page itself', async () => {
    global.fetch = jest.fn(() => Promise.resolve(resp(200, {})))
    const first = renderGate()
    expect(screen.queryByRole('dialog')).toBeNull()
    first.unmount()
    useAuthStore.setState({ user: { ...legacyUser, termsAccepted: false }, token: 'tok', isAuthenticated: true, termsRequired: true })
    renderGate('/terms')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a network failure on refresh does not sign the user out', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('offline')))
    useAuthStore.setState({ user: legacyUser, token: 'tok', isAuthenticated: true })
    renderGate()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await act(async () => {})
    expect(useAuthStore.getState().token).toBe('tok')
  })
})

describe('403 TERMS_REQUIRED from any API call raises the gate', () => {
  it('sets termsRequired for our API, ignores other 403s', async () => {
    const original = jest.fn()
    window.fetch = original
    installAuthFetchInterceptor()
    useAuthStore.setState({ user: { ...legacyUser, termsAccepted: true }, token: 'tok', isAuthenticated: true })

    original.mockResolvedValueOnce(resp(403, { error: 'Access denied' }))
    await window.fetch('/spandan/api/rooms')
    await act(async () => {})
    expect(useAuthStore.getState().termsRequired).toBe(false)

    original.mockResolvedValueOnce(resp(403, { code: 'TERMS_REQUIRED' }))
    const r = await window.fetch('/spandan/api/responses')
    await act(async () => {})
    expect(useAuthStore.getState().termsRequired).toBe(true)
    expect(r.status).toBe(403) // caller still gets the response untouched
  })
})
