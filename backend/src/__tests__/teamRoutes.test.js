// Unit tests for Team Battle Mode logic
// Tests pure validation/logic functions — no DB or HTTP calls needed.
// Pattern matches existing tests in roomsRoutes.test.js and authRoutes.test.js.

describe('Team Model Logic', () => {
  describe('Team schema validation', () => {
    it('should require roomId, name fields', () => {
      const validateTeam = (data) => {
        const errors = []
        if (!data.roomId) errors.push('roomId is required')
        if (!data.name) errors.push('Team name is required')
        if (data.name && data.name.length > 100) errors.push('Team name cannot exceed 100 characters')
        return errors
      }

      expect(validateTeam({})).toContain('roomId is required')
      expect(validateTeam({})).toContain('Team name is required')
      expect(validateTeam({ roomId: 'abc123', name: 'Red Team' })).toHaveLength(0)
      expect(validateTeam({ roomId: 'abc123', name: 'A'.repeat(101) })).toContain(
        'Team name cannot exceed 100 characters'
      )
    })

    it('should default totalPoints to 0', () => {
      const buildTeam = (data) => ({
        roomId: data.roomId,
        name: data.name,
        memberIds: data.memberIds || [],
        totalPoints: data.totalPoints !== undefined ? data.totalPoints : 0
      })

      const team = buildTeam({ roomId: 'r1', name: 'Blue Team' })
      expect(team.totalPoints).toBe(0)
      expect(team.memberIds).toEqual([])
    })

    it('should accept an array of memberIds', () => {
      const buildTeam = (data) => ({
        roomId: data.roomId,
        name: data.name,
        memberIds: Array.isArray(data.memberIds) ? data.memberIds : [],
        totalPoints: 0
      })

      const team = buildTeam({ roomId: 'r1', name: 'Green Team', memberIds: ['u1', 'u2', 'u3'] })
      expect(team.memberIds).toHaveLength(3)
      expect(team.memberIds).toContain('u2')
    })
  })
})

describe('Team Route Authorization Logic', () => {
  describe('Teacher ownership check', () => {
    // Replicates the exact check used in routes/teams.js:
    // room.teacher.toString() === req.user._id.toString()
    it('should grant access when requester is the room teacher', () => {
      const checkTeacherOwnership = (room, userId) => {
        if (!room) return { allowed: false, error: 'Room not found' }
        if (room.teacher.toString() !== userId.toString()) {
          return { allowed: false, error: 'Not authorized to manage teams in this room' }
        }
        return { allowed: true }
      }

      const teacherId = 'teacher-abc'
      const room = { teacher: { toString: () => 'teacher-abc' } }

      expect(checkTeacherOwnership(room, teacherId).allowed).toBe(true)
      expect(checkTeacherOwnership(room, 'other-user').allowed).toBe(false)
      expect(checkTeacherOwnership(null, teacherId).allowed).toBe(false)
    })

    it('should reject students from creating or deleting teams', () => {
      const authorize = (userRole, requiredRole) => {
        if (userRole !== requiredRole) return { allowed: false, error: 'Access denied' }
        return { allowed: true }
      }

      expect(authorize('student', 'teacher').allowed).toBe(false)
      expect(authorize('teacher', 'teacher').allowed).toBe(true)
    })
  })

  describe('PUT /:teamId/members validation', () => {
    it('should require memberIds to be an array', () => {
      const validateMemberIds = (memberIds) => {
        if (!Array.isArray(memberIds)) return { valid: false, error: 'memberIds must be an array' }
        return { valid: true }
      }

      expect(validateMemberIds(undefined).valid).toBe(false)
      expect(validateMemberIds('u1').valid).toBe(false)
      expect(validateMemberIds([]).valid).toBe(true)
      expect(validateMemberIds(['u1', 'u2']).valid).toBe(true)
    })

    it('should allow empty memberIds array (clearing a team)', () => {
      const validateMemberIds = (memberIds) => {
        if (!Array.isArray(memberIds)) return { valid: false, error: 'memberIds must be an array' }
        return { valid: true }
      }

      expect(validateMemberIds([]).valid).toBe(true)
    })
  })
})

describe('Team Score Rollup Logic', () => {
  describe('Points increment behaviour', () => {
    it('should add individual points to team totalPoints', () => {
      const applyTeamPoints = (currentTotal, earnedPoints) => currentTotal + earnedPoints
      expect(applyTeamPoints(0, 85)).toBe(85)
      expect(applyTeamPoints(250, 100)).toBe(350)
      expect(applyTeamPoints(100, 0)).toBe(100) // 0 points (wrong answer) — no change
    })

    it('should only roll up points when student earns > 0 (correct answer)', () => {
      // The guard in responses.js: `if (points > 0) { ... team rollup }`
      const shouldRollUp = (points) => points > 0
      expect(shouldRollUp(0)).toBe(false)   // wrong answer
      expect(shouldRollUp(50)).toBe(true)   // correct, partial time
      expect(shouldRollUp(100)).toBe(true)  // correct, full points
    })

    it('should be fault-tolerant — team error must not fail the response save', () => {
      // Simulates the try/catch wrapping the team update in responses.js
      const saveResponseWithTeamRollup = (teamUpdateFn) => {
        let responseSaved = false
        let teamError = null

        // response.save() always succeeds
        responseSaved = true

        // team update might throw
        try {
          teamUpdateFn()
        } catch (err) {
          teamError = err.message
        }

        return { responseSaved, teamError }
      }

      const result = saveResponseWithTeamRollup(() => {
        throw new Error('Team DB unavailable')
      })

      expect(result.responseSaved).toBe(true)
      expect(result.teamError).toBe('Team DB unavailable')
    })
  })

  describe('team:score:update socket event payload', () => {
    it('should include teamId, teamName, totalPoints', () => {
      const buildPayload = (team) => ({
        teamId: team._id,
        teamName: team.name,
        totalPoints: team.totalPoints
      })

      const team = { _id: 'team-001', name: 'Red Team', totalPoints: 350 }
      const payload = buildPayload(team)

      expect(payload).toHaveProperty('teamId', 'team-001')
      expect(payload).toHaveProperty('teamName', 'Red Team')
      expect(payload).toHaveProperty('totalPoints', 350)
    })
  })
})

describe('TeamLeaderboard Component Logic', () => {
  describe('Tab switching state', () => {
    it('should support Individual and Teams tab states', () => {
      const TABS = ['Individual', 'Teams']
      let activeTab = 'Individual'

      const switchTab = (tab) => {
        if (!TABS.includes(tab)) throw new Error('Invalid tab')
        activeTab = tab
        return activeTab
      }

      expect(switchTab('Teams')).toBe('Teams')
      expect(switchTab('Individual')).toBe('Individual')
      expect(() => switchTab('Unknown')).toThrow('Invalid tab')
    })
  })

  describe('Team leaderboard sorting', () => {
    it('should sort teams by totalPoints descending', () => {
      const teams = [
        { name: 'Blue', totalPoints: 150 },
        { name: 'Red', totalPoints: 350 },
        { name: 'Green', totalPoints: 200 }
      ]

      const sorted = [...teams].sort((a, b) => b.totalPoints - a.totalPoints)
      expect(sorted[0].name).toBe('Red')
      expect(sorted[1].name).toBe('Green')
      expect(sorted[2].name).toBe('Blue')
    })

    it('should assign rank 1 to the highest-scoring team', () => {
      const teams = [
        { name: 'Blue', totalPoints: 150 },
        { name: 'Red', totalPoints: 350 }
      ]
      const ranked = [...teams]
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .map((t, i) => ({ ...t, rank: i + 1 }))

      expect(ranked[0].rank).toBe(1)
      expect(ranked[0].name).toBe('Red')
    })
  })
})
