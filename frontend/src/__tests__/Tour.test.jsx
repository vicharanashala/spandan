import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

jest.mock('../config.js', () => ({ API_URL: '/spandan/api', BASE_PATH: '/spandan', SOCKET_URL: '' }))
const mockUpdateUser = jest.fn()
let mockAuth = { token: 'tok', user: { _id: 't1', role: 'teacher', tourSeen: {} }, updateUser: mockUpdateUser }
jest.mock('../stores/authStore', () => {
  const hook = () => ({ user: mockAuth.user, isAuthenticated: !!mockAuth.token })
  hook.getState = () => mockAuth
  return { __esModule: true, default: hook }
})
import { MemoryRouter } from 'react-router-dom'
import Tour from '../components/Tour'
import useTourStore, { hasSeenTour, markTourSeen } from '../stores/tourStore'

// A fake dashboard: sidebar, create-room and help-button present; active-rooms (step 3) optional.
const Page = ({ withActiveRooms = false }) => (
  <div>
    <nav data-tour="sidebar">menu</nav>
    <div data-tour="create-room">create</div>
    {withActiveRooms && <h2 data-tour="active-rooms">rooms</h2>}
    <button data-tour="help-button">i</button>
  </div>
)

beforeEach(() => {
  window.localStorage.clear()
  jest.useFakeTimers()
  useTourStore.setState({ active: null, step: 0, direction: 1 })
  mockUpdateUser.mockClear()
  mockAuth = { token: 'tok', user: { _id: 't1', role: 'teacher', tourSeen: {} }, updateUser: mockUpdateUser }
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { _id: 't1', role: 'teacher', tourSeen: { dashboard: 'x' } } }) })
  Element.prototype.getBoundingClientRect = () => ({ top: 100, left: 50, width: 200, height: 40, bottom: 140, right: 250 })
})
afterEach(() => { jest.useRealTimers() })

describe('Tour', () => {
  it('renders nothing until started, then shows step 1 with Next and Skip (no Back)', () => {
    render(<MemoryRouter initialEntries={['/nowhere']}><Page withActiveRooms /><Tour /></MemoryRouter>)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => useTourStore.getState().start('dashboard'))
    expect(screen.getByRole('dialog', { name: /step 1 of 4/i })).toBeInTheDocument()
    expect(screen.getByText('Your menu')).toBeInTheDocument()
    expect(screen.queryByText('Back')).toBeNull()
    expect(screen.getByText('Next')).toBeInTheDocument()
  })

  it('Next / Back move through steps; Done on the last step ends the tour and marks it seen', async () => {
    render(<MemoryRouter initialEntries={['/nowhere']}><Page withActiveRooms /><Tour /></MemoryRouter>)
    act(() => useTourStore.getState().start('dashboard'))
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByRole('dialog', { name: /step 2 of 4/i })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByRole('dialog', { name: /step 1 of 4/i })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Next')); fireEvent.click(screen.getByText('Next')); fireEvent.click(screen.getByText('Next'))
    expect(screen.getByRole('dialog', { name: /step 4 of 4/i })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Done'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useTourStore.getState().active).toBeNull()
    // optimistic local flag + persisted via PUT /auth/profile
    expect(mockUpdateUser).toHaveBeenCalledWith(expect.objectContaining({ tourSeen: expect.objectContaining({ dashboard: expect.any(String) }) }))
    expect(global.fetch).toHaveBeenCalledWith('/spandan/api/auth/profile', expect.objectContaining({ method: 'PUT' }))
    await act(async () => {}) // let the fetch resolve
    expect(mockUpdateUser).toHaveBeenLastCalledWith(expect.objectContaining({ tourSeen: { dashboard: 'x' } }))
  })

  it('skips a step whose target is not on the page (after a short retry window)', () => {
    render(<MemoryRouter initialEntries={['/nowhere']}><Page withActiveRooms={false} /><Tour /></MemoryRouter>)
    act(() => useTourStore.getState().start('dashboard'))
    fireEvent.click(screen.getByText('Next'))           // → step 2 (create-room, present)
    fireEvent.click(screen.getByText('Next'))           // → step 3 (active-rooms) is missing
    act(() => { jest.advanceTimersByTime(250 * 21) })    // retries exhausted → auto-advance
    expect(screen.getByRole('dialog', { name: /step 4 of 4/i })).toBeInTheDocument()
  })

  it('treats a target that is slid off-screen (mobile sidebar drawer) or zero-sized as missing and skips it', () => {
    const rects = { sidebar: { top: 0, left: -240, width: 240, height: 600, bottom: 600, right: 0 } }   // translateX(-100%)
    Element.prototype.getBoundingClientRect = function () {
      const key = this.getAttribute && this.getAttribute('data-tour')
      return rects[key] || { top: 100, left: 50, width: 200, height: 40, bottom: 140, right: 250 }
    }
    render(<MemoryRouter initialEntries={['/nowhere']}><Page withActiveRooms /><Tour /></MemoryRouter>)
    act(() => useTourStore.getState().start('dashboard'))
    act(() => { jest.advanceTimersByTime(250 * 21) })    // step 1 (sidebar) invisible → skipped
    expect(screen.getByRole('dialog', { name: /step 2 of 4/i })).toBeInTheDocument()
    expect(screen.getByText('Create your first room')).toBeInTheDocument()
  })

  it('Skip tour and Esc end the tour and mark it seen', () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/nowhere']}><Page withActiveRooms /><Tour /></MemoryRouter>)
    act(() => useTourStore.getState().start('dashboard'))
    fireEvent.click(screen.getByText('Skip tour'))
    expect(useTourStore.getState().active).toBeNull()
    expect(mockUpdateUser).toHaveBeenCalledTimes(1)
    unmount()
    render(<MemoryRouter initialEntries={['/nowhere']}><Page withActiveRooms /><Tour /></MemoryRouter>)
    act(() => useTourStore.getState().start('console'))  // no console targets here → will retry then skip through
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useTourStore.getState().active).toBeNull()
  })

  it('hasSeenTour reads the user record OR the per-browser memo; markTourSeen works for students too, not logged-out', async () => {
    expect(hasSeenTour({ tourSeen: { dashboard: '2026-10-14' } }, 'dashboard')).toBe(true)
    expect(hasSeenTour({ tourSeen: {} }, 'dashboard')).toBe(false)
    expect(hasSeenTour(null, 'console')).toBe(false)
    await markTourSeen('console')                      // teacher: writes the memo + the record
    expect(hasSeenTour({ tourSeen: {} }, 'console')).toBe(true)   // stale user object, memo wins
    expect(hasSeenTour({ tourSeen: {} }, 'dashboard')).toBe(false)
    global.fetch.mockClear(); mockUpdateUser.mockClear()
    mockAuth = { token: 'tok', user: { _id: 's1', role: 'student', tourSeen: {} }, updateUser: mockUpdateUser }
    await markTourSeen('s-session')
    expect(global.fetch).toHaveBeenCalledWith('/spandan/api/auth/profile', expect.objectContaining({ method: 'PUT' }))
    global.fetch.mockClear(); mockUpdateUser.mockClear()
    mockAuth = { token: null, user: null, updateUser: mockUpdateUser }
    await markTourSeen('s-session')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('auto-starts the page tour on first visit (teacher dashboard), not when already seen, and for students too', () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/teacher']}><Page withActiveRooms /><Tour /></MemoryRouter>)
    expect(useTourStore.getState().active).toBeNull()
    act(() => { jest.advanceTimersByTime(800) })
    expect(useTourStore.getState().active).toBe('dashboard')
    act(() => useTourStore.getState().stop('skipped'))
    unmount()

    mockAuth = { token: 'tok', user: { _id: 't1', role: 'teacher', tourSeen: { dashboard: '2026-10-14' } }, updateUser: mockUpdateUser }
    window.localStorage.clear()
    const r2 = render(<MemoryRouter initialEntries={['/teacher']}><Page withActiveRooms /><Tour /></MemoryRouter>)
    act(() => { jest.advanceTimersByTime(1000) })
    expect(useTourStore.getState().active).toBeNull()
    r2.unmount()

    mockAuth = { token: 'tok', user: { _id: 's1', role: 'student', tourSeen: {} }, updateUser: mockUpdateUser }
    render(<MemoryRouter initialEntries={['/student/join-room']}><div data-tour="join-code" /><Tour /></MemoryRouter>)
    act(() => { jest.advanceTimersByTime(800) })
    expect(useTourStore.getState().active).toBe('s-join-room')
    expect(screen.getByRole('dialog', { name: /step 1 of 2/i })).toBeInTheDocument()
  })
})
