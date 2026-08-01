import { checkRoomOwnership } from '../utils/roomOwnership.js'

describe('checkRoomOwnership — teacher-write room guard', () => {
  const owner = '507f1f77bcf86cd799439011'
  const other = '507f1f77bcf86cd799439099'

  it('returns 404 when the room does not exist', () => {
    const r = checkRoomOwnership(null, owner)
    expect(r.ok).toBe(false)
    expect(r.status).toBe(404)
  })

  it('allows the owning teacher (raw ObjectId teacher)', () => {
    expect(checkRoomOwnership({ teacher: owner }, owner).ok).toBe(true)
  })

  it('rejects a different teacher with 403', () => {
    const r = checkRoomOwnership({ teacher: owner }, other)
    expect(r.ok).toBe(false)
    expect(r.status).toBe(403)
  })

  it('handles a populated teacher document', () => {
    expect(checkRoomOwnership({ teacher: { _id: owner } }, owner).ok).toBe(true)
    expect(checkRoomOwnership({ teacher: { _id: owner } }, other).ok).toBe(false)
  })

  it('compares by value, not reference (ObjectId-vs-string safe)', () => {
    const room = { teacher: { toString: () => 'abc123' } }
    expect(checkRoomOwnership(room, { toString: () => 'abc123' }).ok).toBe(true)
    expect(checkRoomOwnership(room, { toString: () => 'zzz999' }).ok).toBe(false)
  })
})
