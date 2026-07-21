import { create } from 'zustand'
import { API_URL } from '../config.js'

export const useTeamStore = create((set, get) => ({
  teams: [],
  myTeam: null,
  teamMessages: [],
  partnerChoices: {},
  isLoading: false,
  error: null,
  consensusCelebration: false,

  // Create teams for a room (teacher action)
  createTeams: async (roomId, teamSize, groupingMode) => {
    const { default: useAuthStore } = await import('./authStore.js')
    const token = useAuthStore.getState().token
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_URL}/teams/create`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, teamSize, groupingMode })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to create teams')
      set({ teams: data.teams, isLoading: false })
      return data.teams
    } catch (error) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  // Fetch all teams for a room
  fetchTeams: async (roomId) => {
    const { default: useAuthStore } = await import('./authStore.js')
    const token = useAuthStore.getState().token
    set({ isLoading: true })
    try {
      const response = await fetch(`${API_URL}/teams/${roomId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch teams')
      set({ teams: data.teams || [], isLoading: false })
      return data.teams
    } catch (error) {
      set({ error: error.message, isLoading: false })
      return []
    }
  },

  // Fetch my team (student)
  fetchMyTeam: async (roomId) => {
    const { default: useAuthStore } = await import('./authStore.js')
    const token = useAuthStore.getState().token
    try {
      const response = await fetch(`${API_URL}/teams/my-team/${roomId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (!response.ok) return null
      set({ myTeam: data.team })
      return data.team
    } catch (error) {
      return null
    }
  },

  // Delete teams (teacher)
  deleteTeams: async (roomId) => {
    const { default: useAuthStore } = await import('./authStore.js')
    const token = useAuthStore.getState().token
    try {
      await fetch(`${API_URL}/teams/${roomId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      set({ teams: [], myTeam: null })
    } catch (error) {
      set({ error: error.message })
    }
  },

  // Add a chat message (keep last 100)
  addMessage: (msg) => {
    set(state => ({ teamMessages: [...state.teamMessages.slice(-99), msg] }))
  },

  // Update partner choice overlay
  setPartnerChoice: (studentId, selectedOption) => {
    set(state => ({ partnerChoices: { ...state.partnerChoices, [studentId]: selectedOption } }))
  },

  // Clear partner choices (on new question)
  clearPartnerChoices: () => set({ partnerChoices: {} }),

  // Update a team's score
  updateTeamScore: (teamId, points, streakCount, consensusBonus) => {
    set(state => ({
      teams: state.teams.map(t => t._id === teamId ? { ...t, points, streakCount } : t),
      myTeam: state.myTeam?._id === teamId ? { ...state.myTeam, points, streakCount } : state.myTeam,
      consensusCelebration: consensusBonus
    }))
    if (consensusBonus) {
      setTimeout(() => set({ consensusCelebration: false }), 3000)
    }
  },

  // Clear messages
  clearMessages: () => set({ teamMessages: [] }),

  // Set teams list and automatically find & set my team
  setTeamsAndFindMyTeam: (teams, studentId) => {
    const myTeam = teams.find(t => t.members.some(m => {
      const id = m._id || m
      const sId = studentId?._id || studentId
      return id?.toString() === sId?.toString()
    })) || null
    set({ teams, myTeam })
  },

  // Full reset
  reset: () => set({
    teams: [], myTeam: null, teamMessages: [], partnerChoices: {},
    consensusCelebration: false, error: null, isLoading: false
  })
}))

export default useTeamStore
