import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { API_URL } from '../config.js'
import { isTokenExpired } from '../lib/jwt.js'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      // Set when a session ends because the token expired (not a manual logout), so the login screen
      // can explain "your session expired, please sign in again" instead of appearing for no reason.
      sessionExpired: false,

      setAuth: (user, token) => {
        set({
          user,
          token,
          isAuthenticated: !!user,
          error: null,
          sessionExpired: false
        })
      },

      // Called when the token is found expired (on load) or the server returns 401 (mid-session), or a
      // socket re-auth reports it expired. Drops the session and flags it so the UI can redirect to the
      // login screen with a clear message. No-op if there was no session to begin with (e.g. a 401 from
      // the login attempt itself), so it never fires spuriously.
      handleSessionExpired: () => {
        if (!get().token && !get().isAuthenticated) return
        set({ user: null, token: null, isAuthenticated: false, error: null, sessionExpired: true })
      },

      clearSessionExpired: () => set({ sessionExpired: false }),

      login: async (email, password) => {
        set({ isLoading: true, error: null })
        try {
          const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          })

          // Guard: proxy/network errors can return an empty or HTML body (e.g. 502 from Vite
          // proxy when backend hasn't started yet). Calling .json() on that throws
          // "Unexpected end of JSON input". Parse safely and fall back to a plain error.
          let data = {}
          try { data = await response.json() } catch { /* non-JSON body — leave data as {} */ }

          if (!response.ok) {
            throw new Error(data.error || `Login failed (${response.status})`)
          }

          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            sessionExpired: false
          })

          return data
        } catch (error) {
          set({ error: error.message, isLoading: false })
          throw error
        }
      },

      // Registration is email-OTP verified (two steps). Step 1 requests a code; step 2 verifies it and
      // creates the account. Only step 2 sets the auth session.
      sendRegistrationOtp: async (name, email) => {
        set({ isLoading: true, error: null })
        try {
          const response = await fetch(`${API_URL}/auth/register/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email })
          })
          let data = {}
          try { data = await response.json() } catch { /* non-JSON body */ }
          if (!response.ok) {
            throw new Error(data.error || `Failed to send verification code (${response.status})`)
          }
          set({ isLoading: false })
          return data
        } catch (error) {
          set({ error: error.message, isLoading: false })
          throw error
        }
      },

      verifyRegistration: async (name, email, password, role, otp) => {
        set({ isLoading: true, error: null })
        try {
          const response = await fetch(`${API_URL}/auth/register/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role, otp })
          })
          let data = {}
          try { data = await response.json() } catch { /* non-JSON body */ }
          if (!response.ok) {
            throw new Error(data.error || `Registration failed (${response.status})`)
          }
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            sessionExpired: false
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
          error: null,
          sessionExpired: false
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

      updateUser: (updatedUser) => {
        set({ user: updatedUser })
      },

      clearError: () => set({ error: null })
    }),
    {
      name: 'spandan-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      }),
      // A token restored from a bookmarked/cached session may already be expired. Do NOT trust the
      // persisted isAuthenticated flag: if the token is past its exp, drop the session right here on
      // load and flag it, so the app shows the login screen (with a reason) instead of a
      // logged-in-looking UI that only fails later at answer-submit time.
      onRehydrateStorage: () => (state) => {
        if (state && state.token && isTokenExpired(state.token)) {
          state.user = null
          state.token = null
          state.isAuthenticated = false
          state.sessionExpired = true
        }
      }
    }
  )
)

export default useAuthStore