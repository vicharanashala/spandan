import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let mockUser = { _id: 't1', role: 'teacher', isAdmin: false }
let mockAuthed = true
jest.mock('../stores/authStore', () => () => ({ user: mockAuthed ? mockUser : null, isAuthenticated: mockAuthed }))
jest.mock('../hooks/useIsMobile', () => ({ __esModule: true, default: () => false }))
const mockStart = jest.fn()
jest.mock('../stores/tourStore', () => ({ __esModule: true, default: (sel) => sel({ start: mockStart }) }))
import HelpModal from '../components/HelpModal'
import HelpButton from '../components/HelpButton'
import useHelpStore from '../stores/helpStore'

const mount = (path) => render(<MemoryRouter initialEntries={[path]}><HelpButton /><HelpModal /></MemoryRouter>)
const nav = (name) => screen.getByRole('button', { name })

beforeEach(() => { useHelpStore.setState({ isOpen: false, sectionId: null }); mockStart.mockClear(); mockUser = { _id: 't1', role: 'teacher', isAdmin: false }; mockAuthed = true })

describe('HelpButton + HelpModal (centered popup)', () => {
  it('is closed until ⓘ is clicked, then opens on the section for the page with the content on the right', () => {
    mount('/teacher/room/abc')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    expect(screen.getByRole('dialog', { name: 'Help' })).toBeInTheDocument()
    expect(nav(/The live session console/)).toHaveAttribute('aria-current', 'true')
    expect(nav(/Room settings/)).not.toHaveAttribute('aria-current')
    expect(screen.getByText(/This is your control room/)).toBeInTheDocument()
  })

  it('clicking another section swaps the content pane', () => {
    mount('/teacher')
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    fireEvent.click(nav(/Room settings/))
    expect(nav(/Room settings/)).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText(/Segment Time — how long/)).toBeInTheDocument()
    expect(screen.queryByText(/After signing in you land on the dashboard/)).toBeNull()
  })

  it('search filters the section list; Esc closes; ? reopens (not while typing)', () => {
    mount('/teacher')
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    fireEvent.change(screen.getByLabelText('Search help'), { target: { value: 'csv' } })
    expect(nav(/Room history & exporting/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Normal mode/ })).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(window, { key: '?' })
    expect(screen.getByRole('dialog', { name: 'Help' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    const input = document.createElement('input'); document.body.appendChild(input); input.focus()
    fireEvent.keyDown(input, { key: '?' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('"Take this page\'s tour" starts the page tour for teachers AND students, and hides where there is none', () => {
    const first = mount('/teacher/room-history')
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    fireEvent.click(screen.getByRole('button', { name: /Take this page's tour/ }))
    expect(mockStart).toHaveBeenCalledWith('room-history')
    expect(screen.queryByRole('dialog')).toBeNull()
    first.unmount()

    mockUser = { _id: 's1', role: 'student' }
    useHelpStore.setState({ isOpen: false })
    const second = mount('/student/session/ABC')
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    expect(nav(/Answering questions/)).toHaveAttribute('aria-current', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Take this page's tour/ }))
    expect(mockStart).toHaveBeenLastCalledWith('s-session')
    second.unmount()

    useHelpStore.setState({ isOpen: false })
    mount('/auth/callback')
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    expect(screen.queryByRole('button', { name: /Take this page's tour/ })).toBeNull()
  })

  it('signed out (landing page): ⓘ opens the guest guide — register & sign in — with no tour button', () => {
    mockAuthed = false
    mount('/')
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    expect(screen.getByRole('dialog', { name: 'Help' })).toBeInTheDocument()
    expect(nav(/What is Spandan/)).toHaveAttribute('aria-current', 'true')
    expect(nav(/Create an account/)).toBeInTheDocument()
    expect(nav(/Sign in/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /The teacher dashboard/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Take this page's tour/ })).toBeNull()
    fireEvent.click(nav(/Create an account/))
    expect(screen.getByText(/verification code is emailed/)).toBeInTheDocument()
    expect(screen.getByText(/admin approval/)).toBeInTheDocument()
  })

  it('admin-only section appears only for admins', () => {
    mount('/admin')
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    expect(screen.queryByRole('button', { name: /Approving teachers/ })).toBeNull()
    act(() => useHelpStore.getState().close())
    mockUser = { _id: 't1', role: 'teacher', isAdmin: true }
    act(() => useHelpStore.getState().open())
    expect(nav(/Approving teachers/)).toHaveAttribute('aria-current', 'true')
  })
})
