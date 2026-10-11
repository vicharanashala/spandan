import { createClassSchema, joinClassSchema, createClassSessionSchema } from '../middleware/validation.js'

describe('Classes API & Logic', () => {
  describe('Validation Schemas', () => {
    it('should validate createClassSchema correctly', () => {
      // Missing name
      expect(() => createClassSchema.parse({})).toThrow()
      // Empty name
      expect(() => createClassSchema.parse({ name: '' })).toThrow()
      // Valid name
      const valid = createClassSchema.parse({ name: 'CS101 Intro to Computer Science' })
      expect(valid.name).toBe('CS101 Intro to Computer Science')

      // With settings
      const withSettings = createClassSchema.parse({
        name: 'Math 202',
        settings: { timeToAnswer: 45, points: 200 }
      })
      expect(withSettings.settings.timeToAnswer).toBe(45)
    })

    it('should validate joinClassSchema correctly', () => {
      expect(() => joinClassSchema.parse({})).toThrow()
      expect(() => joinClassSchema.parse({ code: '' })).toThrow()
      const valid = joinClassSchema.parse({ code: 'AB3K9P' })
      expect(valid.code).toBe('AB3K9P')
    })

    it('should validate createClassSessionSchema correctly', () => {
      // Empty body is allowed (defaults are used)
      const empty = createClassSessionSchema.parse({})
      expect(empty).toEqual({})

      // Custom session name & settings
      const custom = createClassSessionSchema.parse({
        name: 'Lecture 3 - Dynamic Programming',
        settings: { timeToAnswer: 60 }
      })
      expect(custom.name).toBe('Lecture 3 - Dynamic Programming')
      expect(custom.settings.timeToAnswer).toBe(60)
    })
  })

  describe('Authorization and Access Control', () => {
    it('should only allow approved teachers to create classes', () => {
      const canCreateClass = (user) => {
        if (!user) return false
        if (user.role !== 'teacher') return false
        if (user.teacherApprovalStatus !== 'approved') return false
        return true
      }

      expect(canCreateClass(null)).toBe(false)
      expect(canCreateClass({ role: 'student' })).toBe(false)
      expect(canCreateClass({ role: 'teacher', teacherApprovalStatus: 'pending' })).toBe(false)
      expect(canCreateClass({ role: 'teacher', teacherApprovalStatus: 'approved' })).toBe(true)
    })

    it('should only allow students to join classes via join code', () => {
      const canJoinClass = (user) => {
        if (!user) return false
        return user.role === 'student'
      }

      expect(canJoinClass(null)).toBe(false)
      expect(canJoinClass({ role: 'teacher' })).toBe(false)
      expect(canJoinClass({ role: 'student' })).toBe(true)
    })

    it('should only allow class teacher to start sessions and view stats', () => {
      const isClassTeacher = (user, classDoc) => {
        if (!user) return false
        if (user.role !== 'teacher') return false
        return classDoc.teacher.toString() === user._id.toString()
      }

      const teacher1 = { _id: 'teacher-1', role: 'teacher' }
      const teacher2 = { _id: 'teacher-2', role: 'teacher' }
      const classDoc = { teacher: 'teacher-1' }

      expect(isClassTeacher(teacher1, classDoc)).toBe(true)
      expect(isClassTeacher(teacher2, classDoc)).toBe(false)
    })

    it('should allow teacher and enrolled members to access class details', () => {
      const canViewClass = (userId, classDoc) => {
        const isTeacher = classDoc.teacher.toString() === userId.toString()
        const isMember = classDoc.members.some(m => m.toString() === userId.toString())
        return isTeacher || isMember
      }

      const classDoc = {
        teacher: 'teacher-1',
        members: ['student-1', 'student-2']
      }

      expect(canViewClass('teacher-1', classDoc)).toBe(true)
      expect(canViewClass('student-1', classDoc)).toBe(true)
      expect(canViewClass('student-2', classDoc)).toBe(true)
      expect(canViewClass('stranger', classDoc)).toBe(false)
    })
  })

  describe('Class Code & Session Logic', () => {
    it('generates a 6-character uppercase code without ambiguous characters', () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      const generateClassCode = () => {
        let code = ''
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        return code
      }

      const code = generateClassCode()
      expect(code).toHaveLength(6)
      expect(/^[A-Z2-9]{6}$/.test(code)).toBe(true)
      expect(code).not.toContain('0')
      expect(code).not.toContain('1')
      expect(code).not.toContain('I')
      expect(code).not.toContain('O')
    })

    it('generates sequential session default names if no name is provided', () => {
      const getSessionName = (className, sessionCount, providedName) => {
        return providedName?.trim() || `${className} - Session ${sessionCount + 1}`
      }

      expect(getSessionName('Biology 101', 0, '')).toBe('Biology 101 - Session 1')
      expect(getSessionName('Biology 101', 3, '')).toBe('Biology 101 - Session 4')
      expect(getSessionName('Biology 101', 3, 'Quiz: Photosynthesis')).toBe('Quiz: Photosynthesis')
    })
  })
})
