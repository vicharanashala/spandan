import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminPage from '../pages/AdminPage'
import { adminApi } from '../lib/api'

// Mocks
jest.mock('../config.js', () => ({ API_URL: '/spandan/api', BASE_PATH: '/spandan', SOCKET_URL: '' }))
jest.mock('../stores/authStore', () => () => ({
  user: { _id: 'admin1', name: 'Super Admin', email: 'admin@edu.com', isAdmin: true, role: 'teacher' },
  logout: jest.fn()
}))
jest.mock('../stores/themeStore', () => () => ({ isDark: false, toggleTheme: jest.fn() }))
jest.mock('../hooks/useIsMobile', () => () => false)
jest.mock('../components/Sidebar', () => () => <div data-testid="sidebar-stub">Sidebar</div>)
jest.mock('../components/HelpButton', () => () => <button>Help</button>)
jest.mock('../components/ProfileDropdown', () => () => <div>Profile</div>)

jest.mock('../lib/api', () => ({
  adminApi: {
    getStats: jest.fn(),
    listTeacherRequests: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn()
  }
}))

const mockStatsData = {
  teachers: { total: 10, pending: 2, approved: 7, rejected: 1 },
  students: { total: 45 },
  rooms: {
    total: 12,
    active: 2,
    recentActive: [
      {
        _id: 'r1',
        name: 'Calculus I',
        code: 'CALC10',
        teacher: { name: 'Prof. Gauss', email: 'gauss@math.org' },
        settings: { mode: 'normal' },
        createdAt: '2026-10-16T10:00:00.000Z'
      }
    ]
  },
  engagement: { totalQuestions: 150, totalResponses: 890 },
  dailySignups: [
    { _id: '2026-10-15', count: 5, teachers: 1, students: 4 }
  ]
}

describe('AdminPage Overview Dashboard (closes #145)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    adminApi.getStats.mockResolvedValue(mockStatsData)
    adminApi.listTeacherRequests.mockResolvedValue({
      requests: [{ _id: 'req1', name: 'John Doe', email: 'john@edu.com', createdAt: '2026-10-15T00:00:00.000Z' }],
      counts: { pending: 1, approved: 5, rejected: 0 }
    })
  })

  it('renders the Overview KPI cards and active classrooms', async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    )

    // Should fetch admin stats
    expect(adminApi.getStats).toHaveBeenCalledTimes(1)

    // Verify KPI statistics appear
    await waitFor(() => {
      expect(screen.getByText('Platform Overview')).toBeInTheDocument()
      expect(screen.getByText('Total Teachers')).toBeInTheDocument()
      expect(screen.getByText('Total Students')).toBeInTheDocument()
      expect(screen.getByText('Classrooms')).toBeInTheDocument()
      expect(screen.getByText('Total Poll Answers')).toBeInTheDocument()
    })

    // Verify Active Classrooms table
    expect(screen.getByText('Live Active Classrooms')).toBeInTheDocument()
    expect(screen.getByText('Calculus I')).toBeInTheDocument()
    expect(screen.getByText('CALC10')).toBeInTheDocument()
    expect(screen.getByText(/Prof. Gauss/)).toBeInTheDocument()
  })

  it('allows switching to the Teacher Requests tab', async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Platform Overview')).toBeInTheDocument()
    })

    const pendingTab = screen.getByRole('button', { name: /Pending Approvals/i })
    fireEvent.click(pendingTab)

    await waitFor(() => {
      expect(adminApi.listTeacherRequests).toHaveBeenCalledWith('pending')
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })
  })
})
