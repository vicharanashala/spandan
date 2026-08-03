import { canJoinRoom } from '../services/roomJoinAuthz.js'

describe('canJoinRoom — socket room:join authorization', () => {
  const owner = '507f1f77bcf86cd799439011'
  const other = '507f1f77bcf86cd799439099'

  it('rejects when the room does not exist', () => {
    const r = canJoinRoom({ role: 'student', userId: owner, room: null })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not found/i)
  })

  it('lets a teacher join a room they own (raw ObjectId teacher)', () => {
    expect(canJoinRoom({ role: 'teacher', userId: owner, room: { teacher: owner } }).ok).toBe(true)
  })

  it("blocks a teacher from joining another teacher's room", () => {
    const r = canJoinRoom({ role: 'teacher', userId: other, room: { teacher: owner } })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not authorized/i)
  })

  it('handles a populated teacher document for the ownership check', () => {
    expect(canJoinRoom({ role: 'teacher', userId: owner, room: { teacher: { _id: owner } } }).ok).toBe(true)
    expect(canJoinRoom({ role: 'teacher', userId: other, room: { teacher: { _id: owner } } }).ok).toBe(false)
  })

  it('lets a student join an active room by code', () => {
    expect(canJoinRoom({ role: 'student', userId: other, room: { teacher: owner, endedAt: null } }).ok).toBe(true)
  })

  it('blocks a student from joining an ended room', () => {
    const r = canJoinRoom({ role: 'student', userId: other, room: { teacher: owner, endedAt: new Date() } })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/ended/i)
  })

  it('rejects an unknown or missing role', () => {
    expect(canJoinRoom({ role: undefined, userId: owner, room: { teacher: owner } }).ok).toBe(false)
    expect(canJoinRoom({ role: 'ghost', userId: owner, room: { teacher: owner } }).ok).toBe(false)
  })
})
