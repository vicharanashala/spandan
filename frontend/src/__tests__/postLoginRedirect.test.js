import { rememberRedirect, redirectAfterLogin, clearRedirect } from '../lib/postLoginRedirect'

describe('postLoginRedirect', () => {
  afterEach(() => clearRedirect())

  it('falls back to the role dashboard when nothing was saved', () => {
    expect(redirectAfterLogin('student')).toBe('/student')
    expect(redirectAfterLogin('teacher')).toBe('/teacher')
  })
  it('returns the saved page, query included, for the matching role', () => {
    rememberRedirect('/student/join-room?code=ABC123')
    expect(redirectAfterLogin('student')).toBe('/student/join-room?code=ABC123')
  })
  it('ignores pages that belong to another role', () => {
    rememberRedirect('/student/join-room?code=ABC123')
    expect(redirectAfterLogin('teacher')).toBe('/teacher')
  })
  it('ignores off-site and look-alike paths', () => {
    rememberRedirect('//evil.example/student')
    expect(redirectAfterLogin('student')).toBe('/student')
    rememberRedirect('/studentevil')
    expect(redirectAfterLogin('student')).toBe('/student')
  })
  it('forgets the page once cleared', () => {
    rememberRedirect('/student/join-room?code=ABC123')
    clearRedirect()
    expect(redirectAfterLogin('student')).toBe('/student')
  })
})
