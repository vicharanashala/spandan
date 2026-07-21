// Unit tests for Collaborative Team Battle Mode logic
import { teamBattleConfigSchema } from '../middleware/validation.js'

describe('Team Battle Configuration & Logic', () => {
  describe('Schema Validation (teamBattleConfigSchema)', () => {
    it('should validate complete team battle configuration', () => {
      const data = {
        roomId: '507f1f77bcf86cd799439011',
        teamSize: 3,
        groupingMode: 'random'
      }

      const result = teamBattleConfigSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('should reject invalid team size (< 2 or > 50)', () => {
      const dataLow = {
        roomId: '507f1f77bcf86cd799439011',
        teamSize: 1,
        groupingMode: 'random'
      }

      const dataHigh = {
        roomId: '507f1f77bcf86cd799439011',
        teamSize: 51,
        groupingMode: 'random'
      }

      expect(teamBattleConfigSchema.safeParse(dataLow).success).toBe(false)
      expect(teamBattleConfigSchema.safeParse(dataHigh).success).toBe(false)
    })

    it('should reject invalid grouping mode', () => {
      const dataInvalidMode = {
        roomId: '507f1f77bcf86cd799439011',
        teamSize: 3,
        groupingMode: 'unknown'
      }

      expect(teamBattleConfigSchema.safeParse(dataInvalidMode).success).toBe(false)
    })
  })

  describe('Serpentine Distribution Algorithm', () => {
    it('should distribute students in a serpentine (zigzag) order', () => {
      // Mock performance mixed list (sorted by accuracy: best to worst)
      const sortedStudents = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']
      const numTeams = 2
      
      // Expected:
      // Index 0 (S1) -> Team 0 (teamIdx=0)
      // Index 1 (S2) -> Team 1 (teamIdx=1)
      // Index 2 (S3) -> Team 1 (teamIdx=1) (reverses direction)
      // Index 3 (S4) -> Team 0 (teamIdx=0)
      // Index 4 (S5) -> Team 0 (teamIdx=0) (reverses direction)
      // Index 5 (S6) -> Team 1 (teamIdx=1)
      
      const teams = [
        { name: 'Team A', members: [] },
        { name: 'Team B', members: [] }
      ]

      let forward = true
      let teamIdx = 0
      for (const student of sortedStudents) {
        teams[teamIdx].members.push(student)
        if (forward) {
          teamIdx++
          if (teamIdx >= numTeams) {
            teamIdx = numTeams - 1
            forward = false
          }
        } else {
          teamIdx--
          if (teamIdx < 0) {
            teamIdx = 0
            forward = true
          }
        }
      }

      expect(teams[0].members).toEqual(['S1', 'S4', 'S5'])
      expect(teams[1].members).toEqual(['S2', 'S3', 'S6'])
    })
  })

  describe('Orphan Team Cleanup Logic', () => {
    it('should dissolve teams with fewer than 2 members and merge them into the smallest other team', () => {
      // Setup mock teams
      let teamsData = [
        { name: 'Wizards', members: ['S1', 'S2', 'S3'] },
        { name: 'Beasts', members: ['S4', 'S5'] },
        { name: 'Knights', members: ['S6'] } // Orphan team (< 2 members)
      ]

      // Simulation of condition C (Orphan cleanup)
      if (teamsData.length > 1) {
        let changed = true
        while (changed) {
          changed = false
          const orphanIdx = teamsData.findIndex(t => t.members.length < 2)
          if (orphanIdx !== -1 && teamsData.length > 1) {
            const orphanMembers = teamsData[orphanIdx].members
            teamsData.splice(orphanIdx, 1) // Remove orphan team

            // Find the smallest remaining team and merge orphan members into it
            for (const member of orphanMembers) {
              const smallestTeam = teamsData.reduce((min, t) =>
                t.members.length < min.members.length ? t : min
              , teamsData[0])
              smallestTeam.members.push(member)
            }
            changed = true
          }
        }
      }

      // Check results: 'Knights' should be dissolved and 'S6' merged into 'Beasts' (which had 2 members vs Wizards' 3)
      expect(teamsData).toHaveLength(2)
      expect(teamsData.find(t => t.name === 'Knights')).toBeUndefined()
      expect(teamsData.find(t => t.name === 'Beasts').members).toContain('S6')
      expect(teamsData.find(t => t.name === 'Beasts').members).toHaveLength(3)
    })
  })

  describe('Late Joiner Auto Assignment', () => {
    it('should assign a late-joining student to the team with the fewest members', () => {
      const teams = [
        { name: 'Wizards', members: ['S1', 'S2', 'S3'] },
        { name: 'Beasts', members: ['S4', 'S5'] }
      ]

      const lateStudent = 'S6'

      // Simulation of late joiner assignment
      const smallestTeam = teams.reduce((min, t) =>
        t.members.length < min.members.length ? t : min
      , teams[0])

      smallestTeam.members.push(lateStudent)

      expect(teams.find(t => t.name === 'Beasts').members).toContain('S6')
      expect(teams.find(t => t.name === 'Beasts').members).toHaveLength(3)
    })
  })

  describe('Consensus Bonus Point Calculations', () => {
    it('should award a 1.5x points multiplier if all team members answer correctly and choose the same option', () => {
      // Mock team
      const team = { name: 'Wizards', members: ['S1', 'S2', 'S3'], points: 0 }

      // Scenario 1: All answered, same option, all correct
      const responses = [
        { studentId: 'S1', selectedOption: 1, isCorrect: true, points: 100 },
        { studentId: 'S2', selectedOption: 1, isCorrect: true, points: 80 },
        { studentId: 'S3', selectedOption: 1, isCorrect: true, points: 90 }
      ]

      const checkConsensus = (teamMembers, responsesList) => {
        const allAnswered = responsesList.length >= teamMembers.length
        if (!allAnswered) return { consensus: false, pointsToAdd: 0 }

        const firstOption = responsesList[0].selectedOption
        const allSelectedSame = responsesList.every(r => r.selectedOption === firstOption)
        const allCorrect = responsesList.every(r => r.isCorrect)

        const totalIndividualPoints = responsesList.reduce((sum, r) => sum + r.points, 0)

        if (allSelectedSame && allCorrect) {
          const bonusPoints = Math.round(totalIndividualPoints * 0.5)
          return { consensus: true, pointsToAdd: totalIndividualPoints + bonusPoints }
        }
        return { consensus: false, pointsToAdd: totalIndividualPoints }
      }

      const result = checkConsensus(team.members, responses)
      expect(result.consensus).toBe(true)
      expect(result.pointsToAdd).toBe(405) // (100 + 80 + 90) * 1.5 = 270 * 1.5 = 405
    })

    it('should not award consensus bonus if answers differ', () => {
      const team = { name: 'Wizards', members: ['S1', 'S2', 'S3'], points: 0 }

      // Scenario 2: Different options selected, all correct
      const responses = [
        { studentId: 'S1', selectedOption: 1, isCorrect: true, points: 100 },
        { studentId: 'S2', selectedOption: 2, isCorrect: true, points: 80 },
        { studentId: 'S3', selectedOption: 1, isCorrect: true, points: 90 }
      ]

      const checkConsensus = (teamMembers, responsesList) => {
        const allAnswered = responsesList.length >= teamMembers.length
        if (!allAnswered) return { consensus: false, pointsToAdd: 0 }

        const firstOption = responsesList[0].selectedOption
        const allSelectedSame = responsesList.every(r => r.selectedOption === firstOption)
        const allCorrect = responsesList.every(r => r.isCorrect)

        const totalIndividualPoints = responsesList.reduce((sum, r) => sum + r.points, 0)

        if (allSelectedSame && allCorrect) {
          const bonusPoints = Math.round(totalIndividualPoints * 0.5)
          return { consensus: true, pointsToAdd: totalIndividualPoints + bonusPoints }
        }
        return { consensus: false, pointsToAdd: totalIndividualPoints }
      }

      const result = checkConsensus(team.members, responses)
      expect(result.consensus).toBe(false)
      expect(result.pointsToAdd).toBe(270) // 100 + 80 + 90 = 270 (no bonus)
    })
  })
})
