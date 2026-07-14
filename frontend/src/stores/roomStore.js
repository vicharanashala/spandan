import { create } from 'zustand'
import { API_URL } from '../config.js'

export const useRoomStore = create((set, get) => ({
  rooms: [],
  activeRooms: [],
  currentRoom: null,
  isLoading: false,
  error: null,

  setAuthToken: (token) => {
    set({ authToken: token })
  },

  fetchRooms: async () => {
    const { authToken } = get()
    if (!authToken) return

    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_URL}/rooms`, {
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch rooms')
      }

      set({ rooms: data.rooms || [], isLoading: false })
    } catch (error) {
      set({ error: error.message, isLoading: false })
    }
  },

  fetchStudentRoomHistory: async () => {
    const { authToken } = get()
    if (!authToken) return

    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_URL}/rooms/student/room-history`, {
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch room history')
      }

      set({ rooms: data.rooms || [], isLoading: false })
    } catch (error) {
      set({ error: error.message, isLoading: false })
    }
  },

  fetchActiveRooms: async () => {
    const { authToken } = get()
    if (!authToken) return

    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_URL}/rooms/student/active`, {
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch active rooms')
      }

      set({ activeRooms: data.rooms || [], isLoading: false })
    } catch (error) {
      set({ error: error.message, isLoading: false })
    }
  },

  createRoom: async (name, teamsWebhookUrl = '', settings = {}) => {
    const { authToken } = get()
    if (!authToken) throw new Error('Not authenticated')

    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_URL}/rooms`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, teamsWebhookUrl, settings })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create room')
      }

      const { rooms } = get()
      set({ 
        rooms: [data.room, ...rooms],
        currentRoom: data.room,
        isLoading: false 
      })

      return data.room
    } catch (error) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  getRoom: async (roomId) => {
    const { authToken } = get()
    if (!authToken) throw new Error('Not authenticated')

    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_URL}/rooms/${roomId}`, {
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch room')
      }

      set({ currentRoom: data.room, isLoading: false })
      return data.room
    } catch (error) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  joinRoomByCode: async (code) => {
    const { authToken } = get()
    if (!authToken) throw new Error('Not authenticated')

    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`${API_URL}/rooms/join/${code}`, {
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to join room')
      }

      set({ currentRoom: data.room, isLoading: false })
      return data.room
    } catch (error) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  updateRoom: async (roomId, updates) => {
    const { authToken } = get()
    if (!authToken) throw new Error('Not authenticated')

    try {
      const response = await fetch(`${API_URL}/rooms/${roomId}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update room')
      }

      const { rooms, currentRoom } = get()
      set({
        rooms: rooms.map(r => r._id === roomId ? data.room : r),
        currentRoom: currentRoom?._id === roomId ? data.room : currentRoom
      })

      return data.room
    } catch (error) {
      set({ error: error.message })
      throw error
    }
  },

  deleteRoom: async (roomId) => {
    const { authToken } = get()
    if (!authToken) throw new Error('Not authenticated')

    try {
      const response = await fetch(`${API_URL}/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete room')
      }

      const { rooms, currentRoom } = get()
      set({
        rooms: rooms.filter(r => r._id !== roomId),
        currentRoom: currentRoom?._id === roomId ? null : currentRoom
      })
    } catch (error) {
      set({ error: error.message })
      throw error
    }
  },

  clearError: () => set({ error: null })
}))

export default useRoomStore