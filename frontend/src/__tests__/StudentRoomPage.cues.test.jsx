// Smoke: the real StudentRoomPage, mounted with fake stores and a fake socket. A 'questions:ready'
// event must play the student chime; when the browser blocks it, the "Enable sound" button appears
// and one tap enables it. The 🔔 toggle sits in the Connected/Leave row.
import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const mockListeners = {}
const mockSocket = {
  on: jest.fn((ev, fn) => { (mockListeners[ev] ||= []).push(fn) }),
  off: jest.fn((ev, fn) => { mockListeners[ev] = (mockListeners[ev] || []).filter(f => f !== fn) }),
  emit: jest.fn(),
  connected: true
}
const fire = (ev, data) => (mockListeners[ev] || []).forEach(fn => fn(data))

jest.mock('../stores/authStore', () => () => ({ user: { _id: 'stu1', name: 'Smoke Student', role: 'student' }, token: 'tok', logout: jest.fn() }))
jest.mock('../stores/socketStore', () => () => ({ socket: mockSocket, isConnected: true, joinRoom: jest.fn(), leaveRoom: jest.fn() }))
jest.mock('../stores/roomStore', () => () => ({
  joinRoomByCode: jest.fn().mockResolvedValue({ _id: 'room1', code: 'ABC123', name: 'Smoke room', settings: { mode: 'normal' } }),
  setAuthToken: jest.fn()
}))
jest.mock('../config.js', () => ({ BASE_PATH: '/spandan', API_URL: '/spandan/api', SOCKET_URL: 'http://localhost' }))
jest.mock('../components/Sidebar', () => () => null)
jest.mock('../components/ThemeToggle', () => () => null)
jest.mock('../components/ProfileDropdown', () => () => null)
jest.mock('../components/Leaderboard', () => () => null)
jest.mock('../components/YouTubeVideo', () => ({ __esModule: true, default: () => null, extractYouTubeId: () => null }))
jest.mock('../hooks/useIsMobile', () => ({ __esModule: true, default: () => false }))
jest.mock('../lib/sounds', () => {
  let enabled = true
  return {
    SOUND_CHANGE_EVENT: 'spandan:sound',
    isSoundEnabled: () => enabled,
    setSoundEnabled: jest.fn((on) => { enabled = on }),
    unlockAudio: jest.fn().mockResolvedValue(true),
    playPreview: jest.fn().mockResolvedValue('played'),
    installUnlockOnInteraction: jest.fn(),
    playStudentQuestion: jest.fn().mockResolvedValue('played')
  }
})
import { playStudentQuestion, installUnlockOnInteraction, unlockAudio } from '../lib/sounds'
import StudentRoomPage from '../pages/StudentRoomPage'

const mount = () => render(
  <MemoryRouter initialEntries={['/student/room/ABC123']}>
    <Routes><Route path="/student/room/:roomCode" element={<StudentRoomPage />} /></Routes>
  </MemoryRouter>
)

beforeEach(() => {
  jest.clearAllMocks()
  for (const k of Object.keys(mockListeners)) delete mockListeners[k]
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ responses: [] }) })
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})

describe('StudentRoomPage — question-time cue', () => {
  it('plays the chime on questions:ready, once per event, and installs the autoplay unlock', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Smoke room' })
    await act(async () => { fire('room:joined', { roomCode: 'ABC123' }) })
    expect(installUnlockOnInteraction).toHaveBeenCalled()
    expect(mockSocket.on).toHaveBeenCalledWith('questions:ready', expect.any(Function))

    await act(async () => { fire('questions:ready') })
    expect(playStudentQuestion).toHaveBeenCalledTimes(1)
    await act(async () => { fire('questions:ready') })
    expect(playStudentQuestion).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/Enable sound/)).toBeNull()
  })

  it('shows "Enable sound" when the browser blocked the chime; one tap enables it', async () => {
    playStudentQuestion.mockResolvedValueOnce('blocked')
    mount()
    await screen.findByRole('heading', { name: 'Smoke room' })
    await act(async () => { fire('room:joined', { roomCode: 'ABC123' }) })

    await act(async () => { fire('questions:ready') })
    const btn = await screen.findByText(/Enable sound/)
    fireEvent.click(btn)
    await waitFor(() => expect(unlockAudio).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText(/Enable sound/)).toBeNull())
    expect(playStudentQuestion).toHaveBeenCalledTimes(2) // the blocked one + the enabling tap
  })

  it('renders the 🔔 toggle in the Connected/Leave row, left of Leave', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Smoke room' })
    const leave = screen.getByText('Leave')
    const bell = screen.getByRole('button', { name: /Sound on/ })
    expect(bell.querySelector('svg')).not.toBeNull()                    // the bell icon
    expect(leave.parentElement).toBe(bell.parentElement)                 // same flex row
    const siblings = Array.from(leave.parentElement.children)
    expect(siblings.indexOf(bell)).toBeLessThan(siblings.indexOf(leave)) // bell before Leave
    const row = leave.parentElement.parentElement
    expect(row).toHaveTextContent('Connected')
  })

  it('unsubscribes the cue listener on unmount', async () => {
    const { unmount } = mount()
    await screen.findByRole('heading', { name: 'Smoke room' })
    unmount()
    expect(mockSocket.off).toHaveBeenCalledWith('questions:ready', expect.any(Function))
  })
})
