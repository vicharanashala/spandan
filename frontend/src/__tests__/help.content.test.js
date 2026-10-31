import { HELP_SECTIONS, sectionsForRole, sectionForPath, searchSections } from '../content/help'
import { TOURS, tourForPath } from '../content/tours'

// Every logged-in route in App.jsx must resolve to a sensible section for its role.
const TEACHER_ROUTES = {
  '/teacher': 'dashboard', '/teacher/create-room': 'creating-a-room', '/teacher/manage-room': 'dashboard',
  '/teacher/profile': 'account-profile', '/teacher/room-history': 'history-export',
  '/teacher/room/abc123': 'live-console', '/teacher/room/abc123/results': 'results', '/admin': 'approvals',
}
const STUDENT_ROUTES = {
  '/student': 's-dashboard', '/student/join-room': 'joining', '/student/room-history': 's-history',
  '/student/profile': 'account-profile', '/student/room/abc123/results': 's-results', '/student/session/ABC123': 'answering',
}

describe('help content', () => {
  it('has unique ids and non-empty bodies', () => {
    const ids = HELP_SECTIONS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of HELP_SECTIONS) { expect(s.body.length).toBeGreaterThan(0); expect(s.title).toBeTruthy() }
  })

  it.each(Object.entries(TEACHER_ROUTES))('teacher route %s → %s', (path, id) => {
    expect(sectionForPath(path, 'teacher', { isAdmin: true }).id).toBe(id)
  })

  it.each(Object.entries(STUDENT_ROUTES))('student route %s → %s', (path, id) => {
    expect(sectionForPath(path, 'student').id).toBe(id)
  })

  it('signed-out guests get only the landing-page guide, opening on "What is Spandan?"', () => {
    const ids = sectionsForRole('guest').map(s => s.id)
    expect(ids).toEqual(['guest-welcome', 'guest-register', 'guest-signin'])
    expect(sectionForPath('/', 'guest').id).toBe('guest-welcome')
    expect(sectionsForRole('teacher').map(s => s.id)).not.toContain('guest-register')
    const guestText = sectionsForRole('guest').flatMap(s => s.body).join(' ')
    expect(guestText).toMatch(/verification code/)
    expect(guestText).toMatch(/admin approval/)
    expect(guestText).toMatch(/Continue with Google/)
  })

  it('hides the admin section from non-admin teachers and all student sections from teachers', () => {
    const plain = sectionsForRole('teacher', { isAdmin: false }).map(s => s.id)
    expect(plain).not.toContain('approvals')
    expect(plain).not.toContain('answering')
    expect(sectionsForRole('teacher', { isAdmin: true }).map(s => s.id)).toContain('approvals')
    expect(sectionsForRole('student').map(s => s.id)).toContain('account-profile') // shared
    expect(sectionForPath('/admin', 'teacher', { isAdmin: false }).id).toBe('getting-started') // fallback
  })

  it('search matches titles and body text, case-insensitively', () => {
    const t = sectionsForRole('teacher')
    expect(searchSections(t, 'ANONYMITY').map(s => s.id)).toEqual(expect.arrayContaining(['room-settings']))
    const csv = searchSections(t, 'csv').map(s => s.id)
    expect(csv).toContain('history-export')
    expect(csv).not.toContain('normal-mode')
    expect(searchSections(t, '')).toBe(t)
    expect(searchSections(t, 'zzzznothing')).toEqual([])
  })

  it('documents the recent features (segment time 1-15, chime, bell, ⓘ)', () => {
    const all = HELP_SECTIONS.flatMap(s => s.body).join(' ')
    expect(all).toMatch(/1 to 15/)
    expect(all).toMatch(/five-second chime/)
    expect(all).toMatch(/bell button/)
    expect(all).toMatch(/ⓘ/)
    expect(all).not.toMatch(/"Manual"|Manual item|Manual page/)
  })
})

describe('tours', () => {
  it('every tour has a role, a path and non-empty steps with unique targets', () => {
    for (const [id, t] of Object.entries(TOURS)) {
      expect(['teacher', 'student', 'both']).toContain(t.role)
      expect(t.path).toBeInstanceOf(RegExp)
      expect(t.steps.length).toBeGreaterThan(0)
      const targets = t.steps.map(s => s.target)
      expect(new Set(targets).size).toBe(targets.length)
      for (const s of t.steps) { expect(s.title).toBeTruthy(); expect(s.body).toBeTruthy() }
      expect(id).toMatch(/^[a-z0-9-]{1,40}$/)
    }
  })
  it('keeps the agreed dashboard and console steps', () => {
    expect(TOURS.dashboard.steps.map(s => s.target)).toEqual(['sidebar', 'create-room', 'active-rooms', 'help-button'])
    expect(TOURS.console.steps.map(s => s.target)).toEqual(['room-code', 'settings', 'start-capture', 'transcript', 'paste-generate', 'end-room'])
  })
  it.each([
    ['/teacher', 'teacher', 'dashboard'], ['/teacher/create-room', 'teacher', 'create-room'], ['/teacher/manage-room', 'teacher', 'manage-room'],
    ['/teacher/room-history', 'teacher', 'room-history'], ['/teacher/room/abc', 'teacher', 'console'], ['/teacher/room/abc/results', 'teacher', 'results'],
    ['/admin', 'teacher', 'admin'], ['/teacher/profile', 'teacher', 'profile'],
    ['/student', 'student', 's-dashboard'], ['/student/join-room', 'student', 's-join-room'], ['/student/session/ABC', 'student', 's-session'],
    ['/student/room-history', 'student', 's-room-history'], ['/student/room/abc/results', 'student', 's-results'], ['/student/profile', 'student', 'profile'],
  ])('%s as %s → %s tour', (path, role, id) => expect(tourForPath(path, role)).toBe(id))
  it('has no tour for the other role\'s pages or unknown pages', () => {
    expect(tourForPath('/teacher', 'student')).toBeNull()
    expect(tourForPath('/student', 'teacher')).toBeNull()
    expect(tourForPath('/auth/callback', 'teacher')).toBeNull()
  })
})
