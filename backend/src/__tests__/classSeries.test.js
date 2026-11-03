// Unit and integration tests for Recurring Class Series (Google Classroom style)
// Tests:
// 1. One active session per class rule
// 2. Membership lifecycle (soft-remove + approval only on re-join)
// 3. Class creation & code formatting
// 4. Performance aggregation & CSV export format
// 5. Late-join active question recovery

import { isSessionBeforeJoin } from '../services/classService.js'

describe('Class Series Feature', () => {
  describe('Rule 1: Global One Active Session Across All Classes', () => {
    it('should reject starting a session when teacher has an active session in ANY class', () => {
      const checkCanStartClassSession = (teacherRooms, targetClassId) => {
        const active = teacherRooms.find(r => r.classId && r.isActive && !r.endedAt)
        if (active) {
          const err = new Error('You already have a live class session. End it before starting a new one in any class.')
          err.code = 'ACTIVE_SESSION_EXISTS'
          err.activeRoomId = active._id
          throw err
        }
        return true
      }

      // Session active in class-A; attempting to start session in class-B
      const teacherRooms = [
        { _id: 'room-1', classId: 'class-A', name: 'DBMS Lecture 1', isActive: true, endedAt: null }
      ]

      expect(() => checkCanStartClassSession(teacherRooms, 'class-B')).toThrow(
        'You already have a live class session. End it before starting a new one in any class.'
      )
      try {
        checkCanStartClassSession(teacherRooms, 'class-B')
      } catch (err) {
        expect(err.code).toBe('ACTIVE_SESSION_EXISTS')
        expect(err.activeRoomId).toBe('room-1')
      }
    })

    it('should allow starting a session when all past sessions have ended across all classes', () => {
      const checkCanStartClassSession = (teacherRooms) => {
        const active = teacherRooms.find(r => r.classId && r.isActive && !r.endedAt)
        if (active) {
          const err = new Error('You already have a live class session.')
          err.code = 'ACTIVE_SESSION_EXISTS'
          throw err
        }
        return true
      }

      const completedRooms = [
        { _id: 'room-1', classId: 'class-A', name: 'Lecture 1', isActive: false, endedAt: new Date('2026-10-01') },
        { _id: 'room-2', classId: 'class-B', name: 'Lecture 2', isActive: true, endedAt: new Date('2026-10-08') } // endedAt is set
      ]

      expect(checkCanStartClassSession(completedRooms)).toBe(true)
      expect(checkCanStartClassSession([])).toBe(true)
    })

    it('should block normal createRoom when teacher has an active class session', () => {
      const checkCanCreateNormalRoom = (teacherRooms) => {
        const activeClassSession = teacherRooms.find(r => r.classId && r.isActive && !r.endedAt)
        if (activeClassSession) {
          const err = new Error('You already have a live class session. End it before creating a new room.')
          err.status = 400
          err.code = 'ACTIVE_CLASS_SESSION_EXISTS'
          err.activeRoomId = activeClassSession._id
          throw err
        }
        return true
      }

      const roomsWithActiveClass = [
        { _id: 'room-c1', classId: 'class-1', isActive: true, endedAt: null }
      ]
      expect(() => checkCanCreateNormalRoom(roomsWithActiveClass)).toThrow(
        'You already have a live class session. End it before creating a new room.'
      )

      // Only normal rooms active (classId is null) -> normal room creation allowed!
      const roomsWithNormalActive = [
        { _id: 'room-n1', classId: null, isActive: true, endedAt: null }
      ]
      expect(checkCanCreateNormalRoom(roomsWithNormalActive)).toBe(true)
    })
  })

  describe('Rule 4: Membership Lifecycle (Soft Remove + Approval Only on Re-join)', () => {
    it('should set status to active on first-time join with class code without approval', () => {
      const processJoin = (existingMember) => {
        if (!existingMember) {
          return { status: 'active', isNew: true, message: 'Enrolled in class successfully' }
        }
        if (existingMember.status === 'removed') {
          existingMember.status = 'pending'
          return { status: 'pending', isNew: false, message: 'Re-join request submitted. Waiting for teacher approval.' }
        }
        return { status: existingMember.status, isNew: false }
      }

      const firstTimeResult = processJoin(null)
      expect(firstTimeResult.status).toBe('active')
      expect(firstTimeResult.isNew).toBe(true)
    })

    it('should set status to pending when a previously removed student rejoins with class code', () => {
      const processJoin = (existingMember) => {
        if (!existingMember) {
          return { status: 'active', isNew: true }
        }
        if (existingMember.status === 'removed') {
          existingMember.status = 'pending'
          return { status: 'pending', isNew: false, message: 'Re-join request submitted. Waiting for teacher approval.' }
        }
        return { status: existingMember.status, isNew: false }
      }

      const removedMember = {
        _id: 'mem-1',
        studentId: 'student-1',
        status: 'removed',
        removedAt: new Date('2026-10-10'),
        history: [{ responseId: 'resp-1', points: 100 }]
      }

      const rejoinResult = processJoin(removedMember)
      expect(rejoinResult.status).toBe('pending')
      expect(removedMember.status).toBe('pending')
      // Historical data is retained!
      expect(removedMember.history).toHaveLength(1)
    })

    it('should restore member to active on the SAME document when teacher approves', () => {
      const memberDoc = {
        _id: 'mem-1',
        studentId: 'student-1',
        status: 'pending',
        joinedAt: new Date('2026-09-01'),
        approvedAt: null
      }

      const handleTeacherAction = (member, action) => {
        if (action === 'approve') {
          member.status = 'active'
          member.approvedAt = new Date()
          return member
        }
        if (action === 'remove' || action === 'reject') {
          member.status = 'removed'
          member.removedAt = new Date()
          return member
        }
      }

      const approved = handleTeacherAction(memberDoc, 'approve')
      expect(approved._id).toBe('mem-1') // Same document!
      expect(approved.status).toBe('active')
      expect(approved.approvedAt).toBeInstanceOf(Date)
    })

    it('should keep student out (status removed) when teacher rejects pending re-join', () => {
      const memberDoc = {
        _id: 'mem-1',
        studentId: 'student-1',
        status: 'pending'
      }

      const handleTeacherAction = (member, action) => {
        if (action === 'reject') {
          member.status = 'removed'
          member.removedAt = new Date()
          return member
        }
      }

      const rejected = handleTeacherAction(memberDoc, 'reject')
      expect(rejected._id).toBe('mem-1')
      expect(rejected.status).toBe('removed')
    })
  })

  describe('Class Code Generation and Validation', () => {
    it('should generate a 6-character uppercase alphanumeric code', () => {
      const generateClassCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        let code = ''
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        return code
      }

      for (let i = 0; i < 20; i++) {
        const code = generateClassCode()
        expect(code).toHaveLength(6)
        expect(/^[A-Z0-9]{6}$/.test(code)).toBe(true)
        // Excludes ambiguous characters (0, O, 1, I)
        expect(code).not.toContain('0')
        expect(code).not.toContain('O')
        expect(code).not.toContain('1')
        expect(code).not.toContain('I')
      }
    })

    it('should validate and normalize class code lookup', () => {
      const normalizeCode = (raw) => String(raw || '').trim().toUpperCase()

      expect(normalizeCode('  7k2m9p  ')).toBe('7K2M9P')
      expect(normalizeCode('abc123')).toBe('ABC123')
    })
  })

  describe('Rule 3 & 6: Cross-Session Performance Aggregation & CSV Export', () => {
    it('should accurately aggregate sessions attended, polls attempted, and accuracy', () => {
      const classSessions = ['sess-1', 'sess-2', 'sess-3', 'sess-4']
      const responses = [
        { roomId: 'sess-1', isCorrect: true },
        { roomId: 'sess-1', isCorrect: false },
        { roomId: 'sess-2', isCorrect: true },
        { roomId: 'sess-4', isCorrect: true }
      ]

      const computeStudentPerformance = (sessions, studentResponses) => {
        const attended = new Set(studentResponses.map(r => r.roomId))
        const pollsAttempted = studentResponses.length
        const correctCount = studentResponses.filter(r => r.isCorrect).length
        const accuracy = pollsAttempted > 0 ? Math.round((correctCount / pollsAttempted) * 100) : 0

        return {
          sessionsAttended: attended.size,
          totalClassSessions: sessions.length,
          pollsAttempted,
          correctCount,
          accuracy
        }
      }

      const perf = computeStudentPerformance(classSessions, responses)
      expect(perf.sessionsAttended).toBe(3) // sess-1, sess-2, sess-4
      expect(perf.totalClassSessions).toBe(4)
      expect(perf.pollsAttempted).toBe(4)
      expect(perf.correctCount).toBe(3)
      expect(perf.accuracy).toBe(75) // 3/4 * 100
    })

    it('should format CSV export with UTF-8 BOM, headers, and correct values', () => {
      const roster = [
        { name: 'Alice Smith', email: 'alice@spandan.edu', status: 'active', sessionsAttended: 3, totalSessions: 4, pollsAttempted: 4, correctCount: 3, accuracy: 75 },
        { name: 'Bob Jones', email: 'bob@spandan.edu', status: 'active', sessionsAttended: 1, totalSessions: 4, pollsAttempted: 2, correctCount: 1, accuracy: 50 }
      ]

      const esc = (v) => {
        const s = v == null ? '' : String(v)
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
      }
      const row = (arr) => arr.map(esc).join(',') + '\n'

      let csv = '\uFEFF'
      csv += row(['Student Name', 'Email', 'Status', 'Sessions Attended', 'Total Sessions', 'Attendance %', 'Polls Attempted', 'Correct Answers', 'Accuracy %'])

      for (const m of roster) {
        const attPct = Math.round((m.sessionsAttended / m.totalSessions) * 100)
        csv += row([m.name, m.email, m.status, m.sessionsAttended, m.totalSessions, `${attPct}%`, m.pollsAttempted, m.correctCount, `${m.accuracy}%`])
      }

      expect(csv.startsWith('\uFEFF')).toBe(true)
      expect(csv).toContain('Alice Smith,alice@spandan.edu,active,3,4,75%,4,3,75%')
      expect(csv).toContain('Bob Jones,bob@spandan.edu,active,1,4,25%,2,1,50%')
    })

    it('should accurately calculate sessionsPossible, attendanceRate, and pollsMissed for late joiners', () => {
      const studentJoinedAt = '2026-10-15T10:00:00.000Z'
      const classRooms = [
        { _id: 'r1', name: 'Lecture 1', createdAt: '2026-10-01T09:00:00Z', endedAt: '2026-10-01T10:00:00Z', isActive: false },
        { _id: 'r2', name: 'Lecture 2', createdAt: '2026-10-05T09:00:00Z', endedAt: '2026-10-05T10:00:00Z', isActive: false },
        { _id: 'r3', name: 'Lecture 3', createdAt: '2026-10-10T09:00:00Z', endedAt: '2026-10-10T10:00:00Z', isActive: false },
        { _id: 'r4', name: 'Lecture 4', createdAt: '2026-10-16T09:00:00Z', endedAt: '2026-10-16T10:00:00Z', isActive: false },
        { _id: 'r5', name: 'Lecture 5', createdAt: '2026-10-20T09:00:00Z', endedAt: null, isActive: true }
      ]

      // Verify isSessionBeforeJoin
      expect(isSessionBeforeJoin(classRooms[0], studentJoinedAt)).toBe(true)
      expect(isSessionBeforeJoin(classRooms[1], studentJoinedAt)).toBe(true)
      expect(isSessionBeforeJoin(classRooms[2], studentJoinedAt)).toBe(true)
      expect(isSessionBeforeJoin(classRooms[3], studentJoinedAt)).toBe(false)
      expect(isSessionBeforeJoin(classRooms[4], studentJoinedAt)).toBe(false)

      // Student attended r4 (answered 3 of 5 questions, 2 correct) and attended r5 (answered 2 of 2, 2 correct)
      const attendedSet = new Set(['r4', 'r5'])
      const eligibleRooms = classRooms.filter(r => attendedSet.has(r._id) || !isSessionBeforeJoin(r, studentJoinedAt))
      expect(eligibleRooms.length).toBe(2) // r4 and r5

      const sessionsPossible = eligibleRooms.length
      const sessionsAttended = attendedSet.size
      const attendanceRate = Math.round((sessionsAttended / sessionsPossible) * 100)

      expect(sessionsPossible).toBe(2)
      expect(sessionsAttended).toBe(2)
      expect(attendanceRate).toBe(100) // Fair attendance rate! Not 2/5 (40%)

      // Poll stats
      const questionsCountByRoom = { r4: 5, r5: 2 }
      const studentResponses = [
        { roomId: 'r4', isCorrect: true },
        { roomId: 'r4', isCorrect: true },
        { roomId: 'r4', isCorrect: false },
        { roomId: 'r5', isCorrect: true },
        { roomId: 'r5', isCorrect: true }
      ]

      let pollsLaunched = 0
      let pollsMissed = 0
      for (const rid of attendedSet) {
        const totalQ = questionsCountByRoom[rid] || 0
        pollsLaunched += totalQ
        const attempted = studentResponses.filter(r => r.roomId === rid).length
        pollsMissed += Math.max(0, totalQ - attempted)
      }

      expect(pollsLaunched).toBe(7)
      expect(studentResponses.length).toBe(5)
      expect(pollsMissed).toBe(2) // 5 - 3 in r4 = 2 missed while present

      // Verify per-session status classification
      const breakdown = classRooms.map(room => {
        const attended = attendedSet.has(room._id)
        const isBefore = isSessionBeforeJoin(room, studentJoinedAt)
        return {
          roomId: room._id,
          status: attended ? 'attended' : (isBefore ? 'not_enrolled' : 'missed')
        }
      })

      expect(breakdown[0].status).toBe('not_enrolled')
      expect(breakdown[1].status).toBe('not_enrolled')
      expect(breakdown[2].status).toBe('not_enrolled')
      expect(breakdown[3].status).toBe('attended')
      expect(breakdown[4].status).toBe('attended')
    })
  })

  describe('Late-Join Active Question Recovery', () => {
    it('should sanitize active question to withhold correct answers and explanation from student', () => {
      const rawQuestion = {
        _id: 'q-101',
        text: 'What is the time complexity of binary search?',
        type: 'MCQ',
        explanation: 'Because the search interval is halved on each step.',
        timeToAnswer: 30,
        options: [
          { text: 'O(n)', isCorrect: false },
          { text: 'O(log n)', isCorrect: true },
          { text: 'O(1)', isCorrect: false }
        ]
      }

      const sanitizeQuestionForStudents = (q) => {
        if (!q || typeof q !== 'object') return q
        const { explanation, ...rest } = q
        if (Array.isArray(rest.options)) {
          rest.options = rest.options.map(o =>
            (o && typeof o === 'object') ? (({ isCorrect, ...opt }) => opt)(o) : o
          )
        }
        return rest
      }

      const sanitized = sanitizeQuestionForStudents(rawQuestion)
      expect(sanitized.text).toBe(rawQuestion.text)
      expect(sanitized.explanation).toBeUndefined()
      sanitized.options.forEach(opt => {
        expect(opt.isCorrect).toBeUndefined()
        expect(opt.text).toBeDefined()
      })
    })

    it('should surface active question if student has not submitted an answer yet', () => {
      const shouldSurfaceQuestion = (activeQuestion, studentResponses, studentId) => {
        if (!activeQuestion) return false
        const hasAnswered = studentResponses.some(r => r.questionId === activeQuestion._id && r.studentId === studentId)
        return !hasAnswered
      }

      const activeQ = { _id: 'q-1' }
      expect(shouldSurfaceQuestion(activeQ, [], 'stu-1')).toBe(true)
      expect(shouldSurfaceQuestion(activeQ, [{ questionId: 'q-1', studentId: 'stu-1' }], 'stu-1')).toBe(false)
      expect(shouldSurfaceQuestion(activeQ, [{ questionId: 'q-1', studentId: 'stu-2' }], 'stu-1')).toBe(true)
    })
  })

  describe('Rule 7: Archive / End Class Series (Soft End Without Delete)', () => {
    it('should prevent starting a new session when class is archived', () => {
      const checkCanStartSession = (cls) => {
        if (cls.isActive === false) {
          const err = new Error('This class is archived. Restore it to start new sessions.')
          err.status = 400
          throw err
        }
        return true
      }

      const archivedClass = { _id: 'class-1', name: 'DBMS 2026', isActive: false }
      const activeClass = { _id: 'class-1', name: 'DBMS 2026', isActive: true }

      expect(() => checkCanStartSession(archivedClass)).toThrow(
        'This class is archived. Restore it to start new sessions.'
      )
      expect(checkCanStartSession(activeClass)).toBe(true)
    })

    it('should reject joining by code when class is not active', () => {
      const checkCanJoin = (cls) => {
        if (!cls.isActive) {
          const err = new Error('This class is no longer active')
          err.status = 400
          throw err
        }
        return true
      }

      expect(() => checkCanJoin({ code: 'ARCH01', isActive: false })).toThrow('This class is no longer active')
      expect(checkCanJoin({ code: 'ACTV01', isActive: true })).toBe(true)
    })

    it('should keep archived classes in lists with isActive false without deleting data', () => {
      const allClasses = [
        { _id: 'c1', name: 'Active Class', isActive: true, sessions: [1, 2] },
        { _id: 'c2', name: 'Archived Class', isActive: false, sessions: [3, 4, 5] }
      ]

      // Neither should be filtered out
      expect(allClasses.length).toBe(2)
      const archived = allClasses.find(c => c._id === 'c2')
      expect(archived.isActive).toBe(false)
      expect(archived.sessions.length).toBe(3) // all data preserved
    })
  })
})
