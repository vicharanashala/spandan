// Smoke: the real landing page renders with the ⓘ help button next to the theme button, and the
// button opens the guest guide. Stores are stubbed: any action is a no-op function.
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

jest.mock('../config.js', () => ({ API_URL: '/spandan/api', BASE_PATH: '/spandan', SOCKET_URL: '' }))
// (jest hoists jest.mock above any helper, so each factory builds its own Proxy stub inline)
jest.mock('../stores/authStore', () => () => new Proxy({ user: null, token: null, isAuthenticated: false, isLoading: false, error: null, sessionExpired: false }, { get: (t, k) => (k in t ? t[k] : jest.fn()) }))
jest.mock('../stores/socketStore', () => () => new Proxy({ socket: null, isConnected: false }, { get: (t, k) => (k in t ? t[k] : jest.fn()) }))
jest.mock('../stores/themeStore', () => () => new Proxy({ isDark: false }, { get: (t, k) => (k in t ? t[k] : jest.fn()) }))
jest.mock('../hooks/useIsMobile', () => ({ __esModule: true, default: () => false }))
import AuthPage from '../pages/AuthPage'
import HelpModal from '../components/HelpModal'
import useHelpStore from '../stores/helpStore'

beforeEach(() => { useHelpStore.setState({ isOpen: false, sectionId: null }); global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) })

describe('AuthPage (landing) + ⓘ', () => {
  it('renders the landing page with the help button and opens the guest guide', () => {
    render(<MemoryRouter initialEntries={['/']}><AuthPage /><HelpModal /></MemoryRouter>)
    expect(screen.getByText(/Dark/)).toBeInTheDocument()                 // theme button still there
    const help = screen.getByRole('button', { name: 'Help' })
    expect(help).toHaveAttribute('data-tour', 'help-button')
    fireEvent.click(help)
    expect(screen.getByRole('dialog', { name: 'Help' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /What is Spandan/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /Create an account/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Take this page's tour/ })).toBeNull()
  })
})
