import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const API_URL = '/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setAuth: (user, token) => {
        set({ 
          user, 
          token, 
          isAuthenticated: !!user,
          error: null 
        })
      },

      login: async (email, password) => {
        set({ isLoading: true, error: null })
        try {
          const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          })
          
          const data = await response.json()
          
          if (!response.ok) {
            throw new Error(data.error || 'Login failed')
          }
          
          set({ 
            user: data.user, 
            token: data.token, 
            isAuthenticated: true,
            isLoading: false 
          })
          
          return data
        } catch (error) {
          set({ error: error.message, isLoading: false })
          throw error
        }
      },

      register: async (name, email, password, role) => {
        set({ isLoading: true, error: null })
        try {
          const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role })
          })
          
          const data = await response.json()
          
          if (!response.ok) {
            throw new Error(data.error || 'Registration failed')
          }
          
          set({ 
            user: data.user, 
            token: data.token, 
            isAuthenticated: true,
            isLoading: false 
          })
          
          return data
        } catch (error) {
          set({ error: error.message, isLoading: false })
          throw error
        }
      },

      logout: () => {
        set({ 
          user: null, 
          token: null, 
          isAuthenticated: false,
          error: null 
        })
      },

      fetchUser: async () => {
        const { token } = get()
        if (!token) return null
        
        try {
          const response = await fetch(`${API_URL}/auth/me`, {
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (!response.ok) {
            throw new Error('Session expired')
          }
          
          const data = await response.json()
          set({ user: data.user })
          return data.user
        } catch (error) {
          get().logout()
          return null
        }
      },

      updateRole: (newRole) => {
        set({ 
          user: { ...get().user, role: newRole }
        })
      },

      clearError: () => set({ error: null })
    }),
    {
      name: 'spandan-auth',
      partialize: (state) => ({ 
        user: state.user, 
        token: state.token,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)

export default useAuthStore