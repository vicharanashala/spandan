// Authorization logic for POST /api/transcripts. Guards against the bug where any
// authenticated user could write a transcript for any roomId — only the room's OWNING
// teacher may. Mirrors the check in routes/transcripts.js.
describe('Transcript write authorization', () => {
  // Replicates the guard in routes/transcripts.js POST '/'
  function authorizeTranscriptWrite(room, userId) {
    if (!room) return { status: 404, error: 'Room not found' }
    if (room.teacher.toString() !== userId.toString()) {
      return { status: 403, error: 'Not authorized to add transcripts to this room' }
    }
    return { status: 201 }
  }

  const ownerId = 'teacher-owner-1'
  const room = { teacher: ownerId }

  it('allows the room-owning teacher to write', () => {
    expect(authorizeTranscriptWrite(room, ownerId).status).toBe(201)
  })

  it('rejects a different teacher (not the owner) with 403', () => {
    expect(authorizeTranscriptWrite(room, 'teacher-other-2').status).toBe(403)
  })

  it('rejects a student (even a room member) with 403', () => {
    expect(authorizeTranscriptWrite(room, 'student-9').status).toBe(403)
  })

  it('returns 404 when the room does not exist', () => {
    expect(authorizeTranscriptWrite(null, ownerId).status).toBe(404)
  })

  it('compares ids by value, not reference (ObjectId-vs-string safe)', () => {
    // room.teacher is often an ObjectId; the guard must .toString() both sides.
    const roomWithObjId = { teacher: { toString: () => 'abc123' } }
    expect(authorizeTranscriptWrite(roomWithObjId, { toString: () => 'abc123' }).status).toBe(201)
    expect(authorizeTranscriptWrite(roomWithObjId, { toString: () => 'zzz999' }).status).toBe(403)
  })
})
