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

// Mock Stores
jest.mock('../stores/authStore', () => () => ({
  user: { _id: 'teacher-1', name: 'Prof. Miller', email: 'miller@spandan.edu', role: 'teacher' },
  token: 'mock-token'
}))

jest.mock('../stores/socketStore', () => () => ({
  socket: {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  }
}))

// Mock API
jest.mock('../lib/api', () => ({
  classApi: {
    getAll: jest.fn().mockResolvedValue({
      classes: [
        {
          _id: 'class-1',
          name: 'Distributed Systems 2026',
          code: 'DS2026',
          totalSessions: 4,
          totalMembers: 12,
          pendingRequests: 1,
          activeSession: { _id: 'room-1', name: 'Lecture 4: Consensus', code: 'RAFT26' }
        }
      ]
    }),
    getById: jest.fn().mockResolvedValue({
      class: {
        _id: 'class-1',
        name: 'Distributed Systems 2026',
        code: 'DS2026',
        teacher: { _id: 'teacher-1', name: 'Prof. Miller', email: 'miller@spandan.edu' }
      },
      activeSession: { _id: 'room-1', name: 'Lecture 4: Consensus', code: 'RAFT26' },
      stats: { totalSessions: 4, totalMembers: 12, pendingRequests: 1 }
    }),
    getSessions: jest.fn().mockResolvedValue({
      sessions: [
        { _id: 'room-1', name: 'Lecture 4: Consensus', code: 'RAFT26', isActive: true, endedAt: null, questionCount: 2, responseCount: 15 },
        { _id: 'room-2', name: 'Lecture 3: Paxos', code: 'PAX301', isActive: false, endedAt: '2026-10-10', questionCount: 5, responseCount: 40 }
      ]
    }),
    getStats: jest.fn().mockResolvedValue({
      stats: {
        totalSessions: 4,
        totalMembers: 12,
        pendingRequests: 1,
        totalQuestions: 15,
        totalResponses: 150,
        averageAccuracy: 78
      }
    }),
    getMembers: jest.fn().mockResolvedValue({
      active: [
        { _id: 'm1', studentId: 's1', name: 'Alice Smith', email: 'alice@uni.edu', sessionsAttended: 4, sessionsPossible: 4, attendanceRate: 100, pollsAttempted: 15, pollsLaunched: 15, pollsMissed: 0, correctCount: 13, accuracy: 87, status: 'active' },
        { _id: 'm2', studentId: 's2', name: 'Bob Jones', email: 'bob@uni.edu', sessionsAttended: 3, sessionsPossible: 4, attendanceRate: 75, pollsAttempted: 12, pollsLaunched: 15, pollsMissed: 3, correctCount: 9, accuracy: 75, status: 'active' },
        { _id: 'm3', studentId: 's3', name: 'Charlie Brown', email: 'charlie@uni.edu', sessionsAttended: 2, sessionsPossible: 4, attendanceRate: 50, pollsAttempted: 8, pollsLaunched: 10, pollsMissed: 2, correctCount: 4, accuracy: 50, status: 'active' },
        { _id: 'm4', studentId: 's4', name: 'David Lee', email: 'david@uni.edu', sessionsAttended: 1, sessionsPossible: 2, attendanceRate: 50, pollsAttempted: 4, pollsLaunched: 6, pollsMissed: 2, correctCount: 2, accuracy: 50, status: 'active' },
        { _id: 'm5', studentId: 's5', name: 'Emma Wilson', email: 'emma@uni.edu', sessionsAttended: 4, sessionsPossible: 4, attendanceRate: 100, pollsAttempted: 15, pollsLaunched: 15, pollsMissed: 0, correctCount: 15, accuracy: 100, status: 'active' },
        { _id: 'm6', studentId: 's6', name: 'Frank Miller', email: 'frank@uni.edu', sessionsAttended: 3, sessionsPossible: 4, attendanceRate: 75, pollsAttempted: 10, pollsLaunched: 12, pollsMissed: 2, correctCount: 8, accuracy: 80, status: 'active' },
        { _id: 'm7', studentId: 's7', name: 'Grace Hopper', email: 'grace@uni.edu', sessionsAttended: 4, sessionsPossible: 4, attendanceRate: 100, pollsAttempted: 15, pollsLaunched: 15, pollsMissed: 0, correctCount: 14, accuracy: 93, status: 'active' },
        { _id: 'm8', studentId: 's8', name: 'Hank Rearden', email: 'hank@uni.edu', sessionsAttended: 2, sessionsPossible: 4, attendanceRate: 50, pollsAttempted: 7, pollsLaunched: 10, pollsMissed: 3, correctCount: 5, accuracy: 71, status: 'active' },
        { _id: 'm9', studentId: 's9', name: 'Ivy Chen', email: 'ivy@uni.edu', sessionsAttended: 1, sessionsPossible: 2, attendanceRate: 50, pollsAttempted: 3, pollsLaunched: 5, pollsMissed: 2, correctCount: 1, accuracy: 33, status: 'active' }
      ],
      pending: [
        { _id: 'p1', studentId: 'sp1', name: 'Pending Pete', email: 'pete@uni.edu', status: 'pending' }
      ],
      removed: [],
      totalClassSessions: 4,
      avgAttendance: 75
    }),
    getMemberPerformance: jest.fn().mockResolvedValue({
      student: { _id: 's1', name: 'Alice Smith', email: 'alice@uni.edu' },
      status: 'active',
      sessionsAttended: 4,
      sessionsPossible: 4,
      totalClassSessions: 4,
      attendanceRate: 100,
      pollsAttempted: 15,
      pollsLaunched: 15,
      pollsMissed: 0,
      correctCount: 13,
      accuracy: 87,
      sessions: [
        { roomId: 'room-1', roomName: 'Lecture 4: Consensus', date: '2026-10-15', status: 'attended', attended: true, isBeforeJoin: false, totalQuestions: 3, pollsAttempted: 2, pollsMissed: 1, correctCount: 2, accuracy: 100 },
        { roomId: 'room-rem', roomName: 'Lecture 2: Two-Phase Commit', date: '2026-10-08', status: 'during_removal', attended: false, isBeforeJoin: false, isDuringRemoval: true, totalQuestions: 4, pollsAttempted: 0, pollsMissed: 0, correctCount: 0, accuracy: 0 },
        { roomId: 'room-0', roomName: 'Lecture 0: Intro', date: '2026-10-01', status: 'before_join', attended: false, isBeforeJoin: true, totalQuestions: 2, pollsAttempted: 0, pollsMissed: 0, correctCount: 0, accuracy: 0 }
      ]
    }),
    create: jest.fn(),
    join: jest.fn(),
    createSession: jest.fn(),
    updateMember: jest.fn().mockResolvedValue({ success: true }),
    archive: jest.fn().mockResolvedValue({ success: true }),
    restore: jest.fn().mockResolvedValue({ success: true })
  }
}))

import TeacherClassesPage from '../pages/TeacherClassesPage'
import TeacherClassDetailPage from '../pages/TeacherClassDetailPage'
import StudentClassesPage from '../pages/StudentClassesPage'
import StudentClassDetailPage from '../pages/StudentClassDetailPage'
import { classApi } from '../lib/api'

describe('TeacherClassesPage', () => {
  it('renders classes list with code, live pill, and overview statistics', async () => {
    render(
      <MemoryRouter initialEntries={['/teacher/classes']}>
        <Routes>
          <Route path="/teacher/classes" element={<TeacherClassesPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Distributed Systems 2026')).toBeInTheDocument()
    })

    expect(screen.getByText('DS2026')).toBeInTheDocument()
    expect(screen.getByText('Live Session')).toBeInTheDocument()
    expect(screen.getByText('1 pending')).toBeInTheDocument()
    expect(screen.getByText('Total classes')).toBeInTheDocument()
  })
})

describe('TeacherClassDetailPage', () => {
  it('renders compact student table with columns: Avatar+Name, Email, Sessions attended, Polls attempted, Correct, Actions', async () => {
    render(
      <MemoryRouter initialEntries={['/teacher/classes/class-1']}>
        <Routes>
          <Route path="/teacher/classes/:id" element={<TeacherClassDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    })

    // Enforce Rule 1: message "End the current live session first" appears when session is live
    expect(screen.getByText(/End the current live session first/)).toBeInTheDocument()

    // Requirement 3: Session list and live banner do NOT expose room codes
    expect(screen.queryByText('RAFT26')).not.toBeInTheDocument()
    expect(screen.queryByText('PAX301')).not.toBeInTheDocument()

    // Switch to Performance tab
    const perfTabButton = screen.getByRole('button', { name: /Performance/i })
    fireEvent.click(perfTabButton)

    // Check performance table headers
    expect(screen.getByText('Student')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Sessions Attended')).toBeInTheDocument()
    expect(screen.getByText('Polls Attempted')).toBeInTheDocument()
    expect(screen.getByText('Correct (Count + %)')).toBeInTheDocument()
    expect(screen.getAllByText('Actions').length).toBeGreaterThanOrEqual(1)

    // Primary action: Export CSV button in Performance tab
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument()

    // Enforce Rule 3: Compact list with Show More toggle (only first 7 students rendered initially)
    expect(screen.getByText(/Show more \(2 more\)/)).toBeInTheDocument()
    expect(screen.queryByText('Ivy Chen')).not.toBeInTheDocument() // 9th student initially hidden

    // Click "Show more"
    fireEvent.click(screen.getByText(/Show more/))
    expect(screen.getByText('Ivy Chen')).toBeInTheDocument() // Now visible
    expect(screen.getByText(/Show less/)).toBeInTheDocument()
  })

  it('renders pending requests section with Approve and Reject buttons', async () => {
    render(
      <MemoryRouter initialEntries={['/teacher/classes/class-1']}>
        <Routes>
          <Route path="/teacher/classes/:id" element={<TeacherClassDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Pending Pete')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /Approve/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reject/ })).toBeInTheDocument()
  })

  it('opens person-wise performance panel when clicking View on a student row', async () => {
    render(
      <MemoryRouter initialEntries={['/teacher/classes/class-1']}>
        <Routes>
          <Route path="/teacher/classes/:id" element={<TeacherClassDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    })

    const viewButtons = screen.getAllByRole('button', { name: /View/ })
    fireEvent.click(viewButtons[0]) // Click first student's View

    await waitFor(() => {
      expect(screen.getByText('Class Performance Summary')).toBeInTheDocument()
    })

    expect(screen.getByText('Per-Session Breakdown')).toBeInTheDocument()
    expect(screen.getAllByText('Lecture 4: Consensus').length).toBeGreaterThanOrEqual(1)

    // Check enriched poll stats in summary cards
    expect(screen.getByText('Polls Answered')).toBeInTheDocument()
    expect(screen.getByText('Polls Missed')).toBeInTheDocument()

    // Check pre-join and removal session labels
    expect(screen.getByText('Before joined')).toBeInTheDocument()
    expect(screen.getByText('Not enrolled yet')).toBeInTheDocument()
    expect(screen.getByText('Removed')).toBeInTheDocument()
    expect(screen.getByText('Not in class')).toBeInTheDocument()
    expect(screen.getByText(/2 \/ 3 answered/)).toBeInTheDocument()
    expect(screen.getByText(/1 missed/)).toBeInTheDocument()
  })

  it('handles archiving and restoring classes with confirmation and state updates', async () => {
    // When class is active and no session is live
    classApi.getById.mockResolvedValueOnce({
      class: {
        _id: 'class-1',
        name: 'Distributed Systems 2026',
        code: 'DS2026',
        isActive: true,
        teacher: { _id: 'teacher-1', name: 'Prof. Miller' }
      },
      activeSession: null,
      stats: { totalSessions: 4, totalMembers: 12, pendingRequests: 0 }
    })
    classApi.getAll.mockResolvedValueOnce({
      classes: []
    })

    const { unmount } = render(
      <MemoryRouter initialEntries={['/teacher/classes/class-1']}>
        <Routes>
          <Route path="/teacher/classes/:id" element={<TeacherClassDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Archive class/i })).toBeInTheDocument()
    })

    // Click "Archive class" to open confirm dialog
    fireEvent.click(screen.getByRole('button', { name: /Archive class/i }))

    expect(screen.getByText('Archive Class Series?')).toBeInTheDocument()
    expect(screen.getByText(/Archiving ends this class series without deleting any data/i)).toBeInTheDocument()

    // Confirm archive
    const confirmButtons = screen.getAllByRole('button', { name: /Archive class/i })
    fireEvent.click(confirmButtons[confirmButtons.length - 1])

    await waitFor(() => {
      expect(classApi.archive).toHaveBeenCalledWith('class-1')
    })

    unmount()

    // Now render archived class
    classApi.getById.mockResolvedValueOnce({
      class: {
        _id: 'class-1',
        name: 'Distributed Systems 2026',
        code: 'DS2026',
        isActive: false,
        teacher: { _id: 'teacher-1', name: 'Prof. Miller' }
      },
      activeSession: null,
      stats: { totalSessions: 4, totalMembers: 12, pendingRequests: 0 }
    })

    render(
      <MemoryRouter initialEntries={['/teacher/classes/class-1']}>
        <Routes>
          <Route path="/teacher/classes/:id" element={<TeacherClassDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getAllByText('Archived').length).toBeGreaterThanOrEqual(1)
    })

    // Should show "Restore class" and "Class Series Archived" banner
    expect(screen.getByText('Class Series Archived')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start New Session/i })).not.toBeInTheDocument()

    const restoreButtons = screen.getAllByRole('button', { name: /Restore class/i })
    expect(restoreButtons.length).toBeGreaterThanOrEqual(1)

    // Click "Restore class"
    fireEvent.click(restoreButtons[0])

    await waitFor(() => {
      expect(classApi.restore).toHaveBeenCalledWith('class-1')
    })
  })
})

describe('Student Class Views - Archived State', () => {
  it('renders Archived badge on student class list when class is archived', async () => {
    classApi.getAll.mockResolvedValueOnce({
      classes: [
        {
          _id: 'class-archived',
          name: 'Computer Networks',
          code: 'NET101',
          isActive: false,
          memberStatus: 'active',
          totalSessions: 5,
          teacher: { name: 'Prof. Alice' }
        }
      ]
    })

    render(
      <MemoryRouter initialEntries={['/student/classes']}>
        <Routes>
          <Route path="/student/classes" element={<StudentClassesPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Computer Networks')).toBeInTheDocument()
    })

    expect(screen.getByText('Archived')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Join Live Session/i })).not.toBeInTheDocument()
  })

  it('renders informative banner and Archived badge on student class detail when archived', async () => {
    classApi.getById.mockResolvedValueOnce({
      class: {
        _id: 'class-archived',
        name: 'Computer Networks',
        code: 'NET101',
        isActive: false,
        teacher: { name: 'Prof. Alice' }
      },
      activeSession: null
    })
    classApi.getMemberPerformance.mockResolvedValueOnce({
      student: { _id: 's1', name: 'Alice Smith' },
      status: 'active',
      sessionsAttended: 3,
      totalClassSessions: 5,
      pollsAttempted: 10,
      correctCount: 8,
      accuracy: 80,
      sessions: []
    })

    render(
      <MemoryRouter initialEntries={['/student/classes/class-archived']}>
        <Routes>
          <Route path="/student/classes/:id" element={<StudentClassDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('This class series has ended')).toBeInTheDocument()
    })

    expect(screen.getByText(/Your teacher has archived this class/i)).toBeInTheDocument()
    expect(screen.getByText('Archived')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Join Live Session/i })).not.toBeInTheDocument()
  })

  it('renders Before joined badge for sessions held prior to student joining', async () => {
    classApi.getById.mockResolvedValueOnce({
      class: {
        _id: 'class-late',
        name: 'Operating Systems',
        code: 'OS101',
        isActive: true,
        teacher: { name: 'Prof. Miller' }
      },
      activeSession: null
    })
    classApi.getMemberPerformance.mockResolvedValueOnce({
      student: { _id: 's1', name: 'Alice Smith' },
      status: 'active',
      sessionsAttended: 1,
      sessionsPossible: 1,
      totalClassSessions: 2,
      attendanceRate: 100,
      pollsAttempted: 3,
      correctCount: 2,
      accuracy: 67,
      sessions: [
        { roomId: 'r3', roomName: 'Lecture 3: Schedulers', date: '2026-10-25', status: 'attended', attended: true, isBeforeJoin: false, totalQuestions: 0, pollsAttempted: 0, pollsMissed: 0, correctCount: 0, accuracy: 0 },
        { roomId: 'r2', roomName: 'Lecture 2: Threads', date: '2026-10-20', status: 'attended', attended: true, isBeforeJoin: false, totalQuestions: 3, pollsAttempted: 3, pollsMissed: 0, correctCount: 2, accuracy: 67 },
        { roomId: 'r-rem', roomName: 'Lecture 1.5: Kernel', date: '2026-10-10', status: 'during_removal', attended: false, isBeforeJoin: false, isDuringRemoval: true, totalQuestions: 2, pollsAttempted: 0, pollsMissed: 0, correctCount: 0, accuracy: 0 },
        { roomId: 'r1', roomName: 'Lecture 1: Intro', date: '2026-10-01', status: 'before_join', attended: false, isBeforeJoin: true, totalQuestions: 4, pollsAttempted: 0, pollsMissed: 0, correctCount: 0, accuracy: 0 }
      ]
    })

    render(
      <MemoryRouter initialEntries={['/student/classes/class-late']}>
        <Routes>
          <Route path="/student/classes/:id" element={<StudentClassDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Lecture 2: Threads')).toBeInTheDocument()
    })

    expect(screen.getByText('Before joined')).toBeInTheDocument()
    expect(screen.getByText('Not enrolled yet')).toBeInTheDocument()
    expect(screen.getByText('Removed')).toBeInTheDocument()
    expect(screen.getByText('Not in class')).toBeInTheDocument()
    expect(screen.getByText('No polls in this session')).toBeInTheDocument()
    expect(screen.getByText(/3 \/ 3 answered/)).toBeInTheDocument()
    expect(screen.getAllByText('Attended').length).toBeGreaterThanOrEqual(1)
  })
})
