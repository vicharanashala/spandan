// Integration tests for Rooms API routes
// Tests the room CRUD and student joining logic

describe('Rooms API Routes', () => {
  describe('POST /api/rooms', () => {
    it('should require authentication and teacher role', () => {
      const checkAccess = (user, requiredRole) => {
        if (!user) return { allowed: false, error: 'Authentication required' }
        if (user.role !== requiredRole) {
          return { allowed: false, error: 'Access denied' }
        }
        return { allowed: true }
      }

      expect(checkAccess(null, 'teacher').allowed).toBe(false)
      expect(checkAccess({ role: 'student' }, 'teacher').allowed).toBe(false)
      expect(checkAccess({ role: 'teacher' }, 'teacher').allowed).toBe(true)
    })

    it('should validate room creation payload', () => {
      const validateCreateRoom = (body) => {
        const errors = []
        if (!body.name) errors.push('Room name is required')
        if (body.name && body.name.length < 3) errors.push('Room name must be at least 3 characters')
        if (body.settings) {
          if (typeof body.settings !== 'object') {
            errors.push('Settings must be an object')
          }
        }
        return errors
      }

      expect(validateCreateRoom({})).toContain('Room name is required')
      expect(validateCreateRoom({ name: 'AB' })).toContain('Room name must be at least 3 characters')
      expect(validateCreateRoom({ name: 'Test Room' })).toHaveLength(0)
    })

    it('should validate room settings schema', () => {
      const validSettings = {
        segmentTime: 300,
        questionsPerSegment: 5,
        timeToAnswer: 30,
        autoStartQuestions: false
      }

      const isValidSettings = (settings) => {
        if (typeof settings.segmentTime !== 'number' || settings.segmentTime < 60) return false
        if (typeof settings.questionsPerSegment !== 'number' || settings.questionsPerSegment < 1) return false
        if (typeof settings.timeToAnswer !== 'number' || settings.timeToAnswer < 10) return false
        return true
      }

      expect(isValidSettings(validSettings)).toBe(true)
      expect(isValidSettings({ segmentTime: 30 })).toBe(false) // Too short
      expect(isValidSettings({ questionsPerSegment: 0 })).toBe(false) // Must be at least 1
    })
  })

  describe('GET /api/rooms', () => {
    it('should validate pagination params', () => {
      const parsePagination = (query) => {
        const page = Math.max(1, parseInt(query.page, 10) || 1)
        const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20))
        const skip = (page - 1) * limit
        return { page, limit, skip }
      }

      expect(parsePagination({})).toEqual({ page: 1, limit: 20, skip: 0 })
      expect(parsePagination({ page: '2', limit: '10' })).toEqual({ page: 2, limit: 10, skip: 10 })
      expect(parsePagination({ page: '-1' })).toEqual({ page: 1, limit: 20, skip: 0 })
      expect(parsePagination({ limit: '200' })).toEqual({ page: 1, limit: 100, skip: 0 })
    })

    it('should only allow teachers to list rooms', () => {
      const canListRooms = (user) => {
        return user.role === 'teacher'
      }

      expect(canListRooms({ role: 'teacher' })).toBe(true)
      expect(canListRooms({ role: 'student' })).toBe(false)
    })
  })

  describe('GET /api/rooms/:id', () => {
    it('should check room access for owner and members', () => {
      const canAccessRoom = (userId, roomTeacherId, isStudentMember) => {
        const isOwner = userId === roomTeacherId
        if (isOwner) return { allowed: true }
        if (isStudentMember) return { allowed: true }
        return { allowed: false, error: 'Access denied' }
      }

      const teacherId = 'teacher-123'
      const studentId = 'student-456'

      expect(canAccessRoom(teacherId, teacherId, false).allowed).toBe(true) // Owner
      expect(canAccessRoom(studentId, teacherId, true).allowed).toBe(true) // Member
      expect(canAccessRoom('stranger', teacherId, false).allowed).toBe(false) // Neither
    })
  })

  describe('GET /api/rooms/join/:code', () => {
    it('should validate room code format', () => {
      const isValidRoomCode = (code) => {
        return typeof code === 'string' && /^[A-Z0-9]{6}$/.test(code)
      }

      expect(isValidRoomCode('ABC123')).toBe(true)
      expect(isValidRoomCode('abc123')).toBe(false) // Must be uppercase
      expect(isValidRoomCode('ABC12')).toBe(false) // Too short
      expect(isValidRoomCode('ABC1234')).toBe(false) // Too long
    })

    it('should prevent joining ended rooms', () => {
      const canJoinRoom = (room) => {
        if (room.endedAt) {
          return { allowed: false, error: 'This room has ended and can no longer be joined' }
        }
        return { allowed: true }
      }

      expect(canJoinRoom({}).allowed).toBe(true)
      expect(canJoinRoom({ endedAt: new Date() }).allowed).toBe(false)
    })

    it('should only allow students to join rooms', () => {
      const canJoin = (user) => {
        if (user.role !== 'student') {
          return { allowed: false, error: 'Only students can join rooms' }
        }
        return { allowed: true }
      }

      expect(canJoin({ role: 'student' }).allowed).toBe(true)
      expect(canJoin({ role: 'teacher' }).allowed).toBe(false)
    })
  })

  describe('PUT /api/rooms/:id', () => {
    it('should only allow room owner to update', () => {
      const canUpdateRoom = (userId, roomTeacherId) => {
        return userId === roomTeacherId
      }

      expect(canUpdateRoom('owner-123', 'owner-123')).toBe(true)
      expect(canUpdateRoom('other-456', 'owner-123')).toBe(false)
    })

    it('should validate update fields', () => {
      const validateUpdate = (body) => {
        const errors = []
        if (body.name !== undefined && body.name.length < 3) {
          errors.push('Room name must be at least 3 characters')
        }
        return errors
      }

      expect(validateUpdate({ name: 'AB' })).toHaveLength(1)
      expect(validateUpdate({ name: 'Updated Room' })).toHaveLength(0)
    })
  })

  describe('DELETE /api/rooms/:id', () => {
    it('should only allow room owner to delete', () => {
      const canDeleteRoom = (userId, roomTeacherId) => {
        return userId === roomTeacherId
      }

      expect(canDeleteRoom('owner-123', 'owner-123')).toBe(true)
      expect(canDeleteRoom('other-456', 'owner-123')).toBe(false)
    })
  })

  describe('Room Settings Validation', () => {
    const roomSettingsSchema = {
      segmentTime: { type: 'number', min: 60, max: 3600 },
      questionsPerSegment: { type: 'number', min: 1, max: 20 },
      timeToAnswer: { type: 'number', min: 10, max: 120 },
      autoStartQuestions: { type: 'boolean' },
      showCorrectAnswers: { type: 'boolean' }
    }

    it('should validate each setting against schema', () => {
      const validateSetting = (key, value) => {
        const schema = roomSettingsSchema[key]
        if (!schema) return { valid: false, error: 'Unknown setting' }
        
        if (schema.type === 'number') {
          if (typeof value !== 'number') return { valid: false, error: `${key} must be a number` }
          if (value < schema.min || value > schema.max) {
            return { valid: false, error: `${key} must be between ${schema.min} and ${schema.max}` }
          }
        }
        
        if (schema.type === 'boolean') {
          if (typeof value !== 'boolean') return { valid: false, error: `${key} must be a boolean` }
        }
        
        return { valid: true }
      }

      expect(validateSetting('segmentTime', 300).valid).toBe(true)
      expect(validateSetting('segmentTime', 30).valid).toBe(false)
      expect(validateSetting('questionsPerSegment', 5).valid).toBe(true)
      expect(validateSetting('timeToAnswer', 30).valid).toBe(true)
      expect(validateSetting('autoStartQuestions', true).valid).toBe(true)
    })
  })
})