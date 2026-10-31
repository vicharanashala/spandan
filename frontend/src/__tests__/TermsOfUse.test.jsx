// Terms of Use on registration: the Sign up form shows the 18+/terms checkbox, and both "Create Account"
// and "Continue with Google" stay disabled until it is ticked. Sign in is unaffected. Also checks the
// shared terms content renders the highlighted Research Use section.
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

jest.mock('../config.js', () => ({ API_URL: '/spandan/api', BASE_PATH: '/spandan', SOCKET_URL: '' }))
jest.mock('../stores/authStore', () => () => new Proxy({ user: null, token: null, isAuthenticated: false, isLoading: false, error: null, sessionExpired: false }, { get: (t, k) => (k in t ? t[k] : jest.fn()) }))
jest.mock('../stores/socketStore', () => () => new Proxy({ socket: null, isConnected: false }, { get: (t, k) => (k in t ? t[k] : jest.fn()) }))
jest.mock('../stores/themeStore', () => () => new Proxy({ isDark: false }, { get: (t, k) => (k in t ? t[k] : jest.fn()) }))
jest.mock('../hooks/useIsMobile', () => ({ __esModule: true, default: () => false }))
import AuthPage from '../pages/AuthPage'
import TermsContent from '../components/TermsContent'
import { TERMS_SECTIONS, TERMS_CONTACT_EMAIL } from '../content/terms.js'

beforeEach(() => { global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) })

const renderAuth = () => render(<MemoryRouter initialEntries={['/']}><AuthPage /></MemoryRouter>)
const goToSignUp = () => {
  const tab = screen.queryByRole('tab', { name: 'Sign up' })
  fireEvent.click(tab || screen.getByRole('button', { name: /Sign up/i }))
}

describe('registration terms checkbox', () => {
  it('is not shown on Sign in, and Google sign-in stays enabled there', () => {
    renderAuth()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByRole('button', { name: /Continue with Google/ })).not.toBeDisabled()
  })

  it('gates Create Account and Continue with Google on Sign up', () => {
    renderAuth()
    goToSignUp()
    const box = screen.getByRole('checkbox')
    const create = screen.getByRole('button', { name: 'Create Account' })
    const google = screen.getByRole('button', { name: /Continue with Google/ })
    expect(box).not.toBeChecked()
    expect(create).toBeDisabled()
    expect(google).toBeDisabled()

    fireEvent.click(box)
    expect(create).not.toBeDisabled()
    expect(google).not.toBeDisabled()
  })

  it('labels the checkbox with the 18+ declaration and links to /terms', () => {
    renderAuth()
    goToSignUp()
    const label = screen.getByRole('checkbox').closest('label')
    expect(label).toHaveTextContent(/18 years of age or older/)
    expect(within(label).getByRole('link', { name: /Read the terms/ })).toHaveAttribute('href', '/terms')
  })
})

describe('terms content', () => {
  it('renders every section with Research Use highlighted and the contact email', () => {
    render(<TermsContent />)
    for (const s of TERMS_SECTIONS) expect(screen.getByText(s.title)).toBeInTheDocument()
    expect(TERMS_SECTIONS.filter((s) => s.highlight).map((s) => s.id)).toEqual(['research'])
    expect(document.getElementById('terms-research').getAttribute('style')).toMatch(/border/)
    expect(screen.getAllByText(new RegExp(TERMS_CONTACT_EMAIL.replace('.', '\\.'))).length).toBeGreaterThan(0)
  })
})
