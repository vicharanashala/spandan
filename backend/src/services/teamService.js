import Team from '../models/Team.js'
import RoomMember from '../models/RoomMember.js'
import Response from '../models/Response.js'

// Fun team names & emojis
const TEAM_NAMES = [
  'Whisper Wizards', 'Binary Beasts', 'Cyber Knights', 'Pixel Pirates',
  'Code Cobras', 'Data Dragons', 'Quantum Foxes', 'Neon Ninjas',
  'Storm Riders', 'Blaze Hawks'
]
const TEAM_EMOJIS = ['🧙‍♂️', '🦁', '⚔️', '🏴‍☠️', '🐍', '🐉', '🦊', '🥷', '⛈️', '🦅']

/**
 * Create teams for a room using the specified grouping mode.
 * Implements all edge cases: zero-students guard, fewer-than-teamSize override,
 * orphan cleanup, and serpentine distribution with index guard.
 */
export const createTeams = async (roomId, groupingMode, teamSize) => {
  // 1. Get all students currently in the room
  const memberships = await RoomMember.find({ roomId })
  const studentIds = memberships.map(m => m.studentId.toString())

  // Condition A: No students in room
  if (studentIds.length === 0) {
    throw new Error('Cannot start Team Battle. No students have joined the room yet.')
  }

  // Delete any old teams for this room
  await Team.deleteMany({ roomId })

  // Condition B: Fewer students than teamSize → override to single team
  let effectiveTeamSize = teamSize
  if (studentIds.length < teamSize) {
    effectiveTeamSize = studentIds.length
  }

  let sortedStudentIds = [...studentIds]

  if (groupingMode === 'performance-mixed') {
    // Mixed Performance Algorithm: rank students by accuracy, then serpentine distribute
    const studentPerformance = await Promise.all(studentIds.map(async (id) => {
      const responses = await Response.find({ studentId: id })
      const correctCount = responses.filter(r => r.isCorrect).length
      const accuracy = responses.length > 0 ? (correctCount / responses.length) : 0.5
      return { id, accuracy }
    }))
    // Sort best to worst
    studentPerformance.sort((a, b) => b.accuracy - a.accuracy)
    sortedStudentIds = studentPerformance.map(sp => sp.id)
  } else if (groupingMode === 'random') {
    // Fisher-Yates shuffle for true randomness
    for (let i = sortedStudentIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[sortedStudentIds[i], sortedStudentIds[j]] = [sortedStudentIds[j], sortedStudentIds[i]]
    }
  }
  // 'student-choice' mode: keep original order, students will be assigned to open slots

  // 3. Calculate number of teams
  const numTeams = Math.max(1, Math.ceil(sortedStudentIds.length / effectiveTeamSize))

  // Build empty team data structures
  const teamsData = Array.from({ length: numTeams }, (_, i) => ({
    name: TEAM_NAMES[i % TEAM_NAMES.length] + (i >= TEAM_NAMES.length ? ' ' + (Math.floor(i / TEAM_NAMES.length) + 1) : ''),
    avatar: TEAM_EMOJIS[i % TEAM_EMOJIS.length],
    roomId,
    members: []
  }))

  // Condition D: Serpentine distribution for performance-mixed
  if (groupingMode === 'performance-mixed' && numTeams > 1) {
    let forward = true
    let teamIdx = 0
    for (const studentId of sortedStudentIds) {
      teamsData[teamIdx].members.push(studentId)
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
  } else if (groupingMode === 'random') {
    // Standard round-robin distribution
    sortedStudentIds.forEach((studentId, index) => {
      const teamIdx = index % numTeams
      teamsData[teamIdx].members.push(studentId)
    })
  }
  // For 'student-choice', we leave teams empty initially so students can join voluntarily

  // Condition C: Orphan cleanup — merge any team with < 2 members into smallest other team
  if (groupingMode !== 'student-choice' && teamsData.length > 1) {
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

  // Save teams to MongoDB
  const savedTeams = await Team.insertMany(teamsData)
  // Return populated teams
  return Team.find({ roomId }).populate('members', 'name email profileImage')
}

/**
 * Assign a late-joining student to the team with the fewest members.
 * Rule 8: Late-joiner catch-all
 */
export const assignLateJoiner = async (roomId, studentId) => {
  // Check if student already has a team
  const existingTeam = await Team.findOne({ roomId, members: studentId })
  if (existingTeam) return existingTeam

  // Find the team with the fewest members
  const teams = await Team.find({ roomId })
  if (teams.length === 0) return null

  const smallestTeam = teams.reduce((min, t) =>
    t.members.length < min.members.length ? t : min
  , teams[0])

  // Add student to smallest team
  smallestTeam.members.push(studentId)
  await smallestTeam.save()

  return Team.findById(smallestTeam._id).populate('members', 'name email profileImage')
}

/**
 * Get all teams for a room, populated with member details.
 */
export const getTeamsByRoom = async (roomId) => {
  return Team.find({ roomId }).populate('members', 'name email profileImage').sort({ points: -1 })
}

/**
 * Get the team a specific student belongs to in a room.
 */
export const getStudentTeam = async (roomId, studentId) => {
  return Team.findOne({ roomId, members: studentId }).populate('members', 'name email profileImage')
}

/**
 * Delete all teams for a room (reset).
 */
export const deleteTeamsByRoom = async (roomId) => {
  return Team.deleteMany({ roomId })
}
