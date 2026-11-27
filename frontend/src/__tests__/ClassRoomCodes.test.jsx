import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

jest.mock('../config.js', () => ({
  API_URL: '/spandan/api',
  BASE_PATH: '/spandan',
  SOCKET_URL: ''
}))

window.matchMedia = window.matchMedia || (() => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {}
}))

// Mock fetch
global.fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, questions: [] }),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob(['']))
  })
)

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn().mockResolvedValue()
  }
})

// Mock audio unlock & sound
jest.mock('../lib/sounds', () => {
  let enabled = true
  return {
    SOUND_CHANGE_EVENT: 'spandan:sound',
    isSoundEnabled: () => enabled,
    setSoundEnabled: jest.fn((on) => { enabled = on }),
    toggleSound: jest.fn(),
    installUnlockOnInteraction: jest.fn(),
    playStudentQuestion: jest.fn().mockResolvedValue('ok'),
    playTeacherCountdown: jest.fn().mockResolvedValue('ok'),
    unlockAudio: jest.fn().mockResolvedValue()
  }
})

jest.mock('../stores/authStore', () => () => ({
  user: { _id: 'user-1', name: 'Prof. Miller', email: 'miller@spandan.edu', role: 'teacher' },
  token: 'mock-token'
}))

const mockSocket = {
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
}

jest.mock('../stores/socketStore', () => () => ({
  socket: mockSocket,
  isConnected: true,
  joinRoom: jest.fn(),
  leaveRoom: jest.fn()
}))

const mockGetRoom = jest.fn()
const mockJoinRoomByCode = jest.fn()

jest.mock('../stores/roomStore', () => () => ({
  getRoom: mockGetRoom,
  joinRoomByCode: mockJoinRoomByCode,
  updateRoom: jest.fn(),
  setAuthToken: jest.fn(),
  rooms: [],
  isLoading: false
}))

jest.mock('../services/questionService', () => ({
  fetchAllRoomQuestions: jest.fn().mockResolvedValue([])
}))
jest.mock('../services/serverTranscriptionService', () => ({
  getTranscriptionStatus: jest.fn().mockResolvedValue({ status: 'ready' })
}))

jest.mock('../components/Sidebar', () => () => null)
jest.mock('../components/ThemeToggle', () => () => null)
jest.mock('../components/ProfileDropdown', () => () => null)
jest.mock('../components/Leaderboard', () => () => null)
jest.mock('../components/YouTubeVideo', () => ({ __esModule: true, default: () => null, extractYouTubeId: () => null }))

jest.mock('../lib/api', () => ({
  classApi: {
    getAll: jest.fn().mockResolvedValue({ classes: [] }),
    getById: jest.fn().mockResolvedValue({
      class: { _id: 'class-1', name: 'Algorithms 101', code: 'ALGO99' }
    }),
    getSessions: jest.fn().mockResolvedValue({
      sessions: [
        { _id: 'sess-1', name: 'Graph Theory', code: 'GPH123', isActive: true, endedAt: null }
      ]
    }),
    getStats: jest.fn().mockResolvedValue({ stats: {} }),
    getMembers: jest.fn().mockResolvedValue({ active: [], pending: [], removed: [] })
  }
}))

import RoomDetailPage from '../pages/RoomDetailPage'
import StudentRoomPage from '../pages/StudentRoomPage'

describe('Class Series Room Code Privacy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Teacher Live Console (RoomDetailPage)', () => {
    it('shows CLASS code instead of room code for class sessions and copies class code', async () => {
      mockGetRoom.mockResolvedValueOnce({
        _id: 'room-c1',
        name: 'Lecture 1: Intro',
        code: 'SECRET_ROOM_CODE_1',
        classId: { _id: 'class-1', name: 'Algorithms 101', code: 'ALGO99' },
        isActive: true,
        endedAt: null,
        participants: 5,
        settings: { mode: 'normal' }
      })

      render(
        <MemoryRouter initialEntries={['/teacher/room/room-c1']}>
          <Routes>
            <Route path="/teacher/room/:roomId" element={<RoomDetailPage />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('ALGO99')).toBeInTheDocument()
      })

      // Must show "Class Code" label
      expect(screen.getByText('Class Code')).toBeInTheDocument()

      // MUST NOT render room code
      expect(screen.queryByText('SECRET_ROOM_CODE_1')).not.toBeInTheDocument()

      // Copy button must copy the CLASS code, NOT room code
      const copyBtn = screen.getByRole('button', { name: /Copy/i })
      fireEvent.click(copyBtn)

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ALGO99')
      expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith('SECRET_ROOM_CODE_1')
    })

    it('shows and copies ROOM code for normal (non-class) rooms', async () => {
      mockGetRoom.mockResolvedValueOnce({
        _id: 'room-normal',
        name: 'Public Standup',
        code: 'PUBLIC1',
        classId: null,
        isActive: true,
        endedAt: null,
        participants: 2,
        settings: { mode: 'normal' }
      })

      render(
        <MemoryRouter initialEntries={['/teacher/room/room-normal']}>
          <Routes>
            <Route path="/teacher/room/:roomId" element={<RoomDetailPage />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('PUBLIC1')).toBeInTheDocument()
      })

      // Must not show "Class Code" label
      expect(screen.queryByText('Class Code')).not.toBeInTheDocument()

      const copyBtn = screen.getByRole('button', { name: /Copy/i })
      fireEvent.click(copyBtn)

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('PUBLIC1')
    })
  })

  describe('Student Live Room (StudentRoomPage)', () => {
    it('hides room code for class session and shows class name/code', async () => {
      mockJoinRoomByCode.mockResolvedValueOnce({
        _id: 'room-c1',
        name: 'Lecture 1: Intro',
        code: 'SECRET_ROOM_CODE_2',
        classId: { _id: 'class-1', name: 'Algorithms 101', code: 'ALGO99' },
        isActive: true,
        endedAt: null,
        settings: { mode: 'normal' }
      })

      render(
        <MemoryRouter initialEntries={['/student/session/SECRET_ROOM_CODE_2']}>
          <Routes>
            <Route path="/student/session/:roomCode" element={<StudentRoomPage />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('Algorithms 101')).toBeInTheDocument()
      })

      // Must show class code in header subtitle
      expect(screen.getByText('ALGO99')).toBeInTheDocument()

      // MUST NOT show room code anywhere
      expect(screen.queryByText('SECRET_ROOM_CODE_2')).not.toBeInTheDocument()
    })

    it('shows room code for normal (non-class) room', async () => {
      mockJoinRoomByCode.mockResolvedValueOnce({
        _id: 'room-normal',
        name: 'Open Discussion',
        code: 'NORMAL9',
        classId: null,
        isActive: true,
        endedAt: null,
        settings: { mode: 'normal' }
      })

      render(
        <MemoryRouter initialEntries={['/student/session/NORMAL9']}>
          <Routes>
            <Route path="/student/session/:roomCode" element={<StudentRoomPage />} />
          </Routes>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('NORMAL9')).toBeInTheDocument()
      })
    })
  })
})
