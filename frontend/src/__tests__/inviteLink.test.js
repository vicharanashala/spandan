import { buildInviteLink, readInviteCode, cleanRoomCode } from '../lib/inviteLink'

describe('inviteLink', () => {
  it('builds a join-room link under the app basename', () => {
    expect(buildInviteLink('abc123', 'https://spandan.fun')).toBe('https://spandan.fun/spandan/student/join-room?code=ABC123')
  })
  it('reads and cleans the code from a query string', () => {
    expect(readInviteCode('?code=abc123')).toBe('ABC123')
    expect(readInviteCode('?code=ab-c1 23xyz')).toBe('ABC123')
    expect(readInviteCode('?other=1')).toBe('')
    expect(readInviteCode('')).toBe('')
  })
  it('cleans like the join input does', () => {
    expect(cleanRoomCode(null)).toBe('')
    expect(cleanRoomCode('<script>')).toBe('SCRIPT')
  })
})
