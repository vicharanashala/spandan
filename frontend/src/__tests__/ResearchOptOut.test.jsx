// Research opt-out (Terms of Use, Section 8): the one-time research notice shows after the terms are
// accepted (never over a live session, never twice), and the sidebar button above the profile card opens a
// dialog that reads and flips the user's own choice with a single button. Uses the REAL auth store.
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

jest.mock('../config.js', () => ({ API_URL: '/spandan/api', BASE_PATH: '/spandan', SOCKET_URL: '' }))
jest.mock('../hooks/useIsMobile', () => ({ __esModule: true, default: () => false }))
jest.mock('../stores/socketStore.js', () => ({ __esModule: true, default: { getState: () => ({ reauthenticate: jest.fn() }) } }))
import useAuthStore from '../stores/authStore'
import ResearchNoticeGate from '../components/ResearchNoticeGate'
import ResearchOptOutDialog from '../components/ResearchOptOutDialog'
import useResearchOptOutStore from '../stores/researchOptOutStore'
import Sidebar from '../components/Sidebar'
import { TERMS_SECTIONS, TERMS_CHECKBOX_LABEL } from '../content/terms.js'

const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, clone: () => ({ json: async () => body }) })
const student = (tourSeen = {}) => ({ _id: 'u1', name: 'A Student', email: 'a@example.com', role: 'student', termsAccepted: true, tourSeen })
const signIn = (user) => useAuthStore.setState({ user, token: 'tok', isAuthenticated: true, termsRequired: false, sessionExpired: false })

beforeEach(() => {
  // jsdom has no matchMedia; the sidebar reads it for its mobile layout.
  window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }))
  window.localStorage.clear()
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false, termsRequired: false, sessionExpired: false })
  global.fetch = jest.fn().mockResolvedValue(resp(200, {}))
  useResearchOptOutStore.setState({ isOpen: false })
})

describe('research notice', () => {
  const renderGate = (path) => render(<MemoryRouter initialEntries={[path]}><ResearchNoticeGate /></MemoryRouter>)

  it('shows once after the terms are accepted, and closing it marks it seen', async () => {
    signIn(student())
    renderGate('/student')
    expect(screen.getByRole('dialog', { name: 'Research on Spandan sessions' })).toBeInTheDocument()
    expect(screen.getByText(/opt out at any time until 30 days after your programme or course ends/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(global.fetch).toHaveBeenCalledWith('/spandan/api/auth/profile', expect.objectContaining({ method: 'PUT' }))
    expect(useAuthStore.getState().user.tourSeen['research-notice']).toBeTruthy()
  })

  it('is not shown when already seen, before the terms are accepted, or over a live session', () => {
    signIn(student({ 'research-notice': '2026-11-26' }))
    const a = renderGate('/student')
    expect(screen.queryByRole('dialog')).toBeNull()
    a.unmount()

    signIn({ ...student(), termsAccepted: false })
    const b = renderGate('/student')
    expect(screen.queryByRole('dialog')).toBeNull()
    b.unmount()

    signIn(student())
    const c = renderGate('/student/session/ABC123')
    expect(screen.queryByRole('dialog')).toBeNull()
    c.unmount()

    signIn({ ...student(), role: 'teacher' })
    renderGate('/teacher/room/r1')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('sidebar button and opt-out dialog', () => {
  const renderSidebar = (user) => render(<MemoryRouter><Sidebar user={user} /><ResearchOptOutDialog /></MemoryRouter>)

  it('shows the Research opt-out button for every account, not as a menu page', () => {
    for (const role of ['student', 'teacher']) {
      const { unmount } = renderSidebar({ ...student(), role })
      const btn = screen.getByRole('button', { name: 'Research opt-out' })
      expect(btn.closest('nav')).toBeNull() // sits with the profile card, outside the menu
      unmount()
    }
  })

  it('opens the dialog, opts out and back in with one button, and Cancel closes it', async () => {
    signIn(student({ 'research-notice': 'x' }))
    let optedOut = false
    global.fetch = jest.fn((url, opts = {}) => {
      if (String(url).endsWith('/auth/research-opt-out')) {
        if (opts.method === 'PUT') optedOut = JSON.parse(opts.body).optOut
        return Promise.resolve(resp(200, { optedOut, optedOutAt: optedOut ? '2026-11-26T10:00:00Z' : null }))
      }
      return Promise.resolve(resp(200, {}))
    })
    renderSidebar(student())
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Research opt-out' }))
    expect(screen.getByRole('dialog', { name: 'Research on Spandan sessions' })).toBeInTheDocument()

    expect(await screen.findByText(/You are included in the research/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Opt out of research' }))
    expect(await screen.findByText(/You have opted out/)).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/spandan/api/auth/research-opt-out', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ optOut: true }) }))

    fireEvent.click(screen.getByRole('button', { name: 'Opt back in to research' }))
    expect(await screen.findByText(/You are included in the research/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows an error and keeps the button disabled when the choice cannot be loaded', async () => {
    signIn(student({ 'research-notice': 'x' }))
    global.fetch = jest.fn().mockResolvedValue(resp(500, {}))
    renderSidebar(student())
    fireEvent.click(screen.getByRole('button', { name: 'Research opt-out' }))
    expect(await screen.findByText(/Could not load your research choice/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Opt out of research' })).toBeDisabled()
  })

  it('the one-time notice opens the same dialog', () => {
    signIn(student())
    render(<MemoryRouter initialEntries={['/student']}><ResearchNoticeGate /><ResearchOptOutDialog /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Research opt-out' }))
    expect(useResearchOptOutStore.getState().isOpen).toBe(true)
  })
})

describe('Terms version 2.0 wording', () => {
  it('no longer treats the terms as research consent', () => {
    expect(TERMS_CHECKBOX_LABEL).not.toMatch(/Research Use/)
    const research = TERMS_SECTIONS.find((s) => s.id === 'research').paragraphs.join(' ')
    expect(research).not.toMatch(/consent/i)
    expect(research).toMatch(/Research opt-out button/)
    const retention = TERMS_SECTIONS.find((s) => s.id === 'retention').paragraphs.join(' ')
    expect(retention).not.toMatch(/Withdrawing consent ends your use/)
  })
})
