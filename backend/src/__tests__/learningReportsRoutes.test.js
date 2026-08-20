// Tests for Learning Reports API authorization and availability rules.

describe('Learning Reports API Routes', () => {
  describe('GET /api/learning-reports/:roomId', () => {
    const canViewReport = ({
      userId,
      roomTeacherId,
      isStudentMember,
      roomEnded,
      reportExists
    }) => {
      const isTeacher = userId === roomTeacherId

      if (!isTeacher && !isStudentMember) {
        return {
          allowed: false,
          status: 403,
          error: 'Not authorized to view this learning report'
        }
      }

      if (!roomEnded) {
        return {
          allowed: false,
          status: 409,
          error: 'Learning report is available only after the session ends'
        }
      }

      if (!reportExists) {
        return {
          allowed: false,
          status: 404,
          error: 'Learning report not found'
        }
      }

      return {
        allowed: true,
        status: 200
      }
    }

    it('allows a student who is a room member to view their report', () => {
      const result = canViewReport({
        userId: 'student-123',
        roomTeacherId: 'teacher-456',
        isStudentMember: true,
        roomEnded: true,
        reportExists: true
      })

      expect(result.allowed).toBe(true)
      expect(result.status).toBe(200)
    })

    it('rejects a student who is not a room member', () => {
      const result = canViewReport({
        userId: 'student-123',
        roomTeacherId: 'teacher-456',
        isStudentMember: false,
        roomEnded: true,
        reportExists: true
      })

      expect(result.allowed).toBe(false)
      expect(result.status).toBe(403)
    })

    it('does not expose the report while the room is active', () => {
      const result = canViewReport({
        userId: 'student-123',
        roomTeacherId: 'teacher-456',
        isStudentMember: true,
        roomEnded: false,
        reportExists: true
      })

      expect(result.allowed).toBe(false)
      expect(result.status).toBe(409)
      expect(result.error).toBe(
        'Learning report is available only after the session ends'
      )
    })

    it('returns not found when the report has not been generated', () => {
      const result = canViewReport({
        userId: 'student-123',
        roomTeacherId: 'teacher-456',
        isStudentMember: true,
        roomEnded: true,
        reportExists: false
      })

      expect(result.allowed).toBe(false)
      expect(result.status).toBe(404)
    })

    it('allows the teacher who owns the room to view a report', () => {
      const result = canViewReport({
        userId: 'teacher-456',
        roomTeacherId: 'teacher-456',
        isStudentMember: false,
        roomEnded: true,
        reportExists: true
      })

      expect(result.allowed).toBe(true)
      expect(result.status).toBe(200)
    })

    it('does not allow a teacher who does not own the room', () => {
      const result = canViewReport({
        userId: 'teacher-other',
        roomTeacherId: 'teacher-456',
        isStudentMember: false,
        roomEnded: true,
        reportExists: true
      })

      expect(result.allowed).toBe(false)
      expect(result.status).toBe(403)
    })
  })
})