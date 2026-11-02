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
      // Set when the backend (HTTP 403 TERMS_REQUIRED or the socket) says this account has not accepted
      // the current Terms of Use; TermsGate then shows the blocking accept-terms screen.
      termsRequired: false,

      setTermsRequired: (value) => set({ termsRequired: !!value }),

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
        set({ user: null, token: null, isAuthenticated: false, error: null, sessionExpired: true, termsRequired: false })
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
          
          const data = await response.json()
          
          if (!response.ok) {
            throw new Error(data.error || 'Login failed')
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

      // Completes a Google OAuth sign-in. The backend has already minted the Spandan JWT and handed it
      // back through the /auth/callback redirect; we store it, resolve the user with it, and mark the
      // session authenticated (mirrors what login() does after a successful password sign-in).
      completeGoogleLogin: async (token) => {
        set({ isLoading: true, error: null })
        try {
          const response = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
          })
          const data = await response.json()
          if (!response.ok) {
            throw new Error(data.error || 'Sign-in could not be completed')
          }
          set({ user: data.user, token, isAuthenticated: true, isLoading: false, sessionExpired: false })
          return data.user
        } catch (error) {
          set({ user: null, token: null, isAuthenticated: false, isLoading: false, error: error.message })
          throw error
        }
      },

      // Finalizes a FIRST-TIME Google sign-up after the user picks a role. The backend creates the
      // account and returns either a JWT (student -> log straight in) or a pending_teacher status
      // (teacher -> awaiting admin approval, no session). Returns { pendingTeacher: true } for the
      // latter, or the logged-in user for the former.
      completeGoogleSignup: async (reg, role, acceptTerms) => {
        set({ isLoading: true, error: null })
        try {
          const response = await fetch(`${API_URL}/auth/google/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reg, role, acceptTerms })
          })
          const data = await response.json()
          if (!response.ok) {
            throw new Error(data.error || 'Sign-up could not be completed')
          }
          if (data.status === 'pending_teacher') {
            set({ isLoading: false })
            return { pendingTeacher: true }
          }
          // Student: reuse the same session-establishing path as a normal Google login.
          const user = await get().completeGoogleLogin(data.token)
          return { user }
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
          const data = await response.json()
          if (!response.ok) {
            throw new Error(data.error || 'Failed to send verification code')
          }
          set({ isLoading: false })
          return data // { message, expiresInSec }
        } catch (error) {
          set({ error: error.message, isLoading: false })
          throw error
        }
      },

      verifyRegistration: async (name, email, password, role, otp, acceptTerms) => {
        set({ isLoading: true, error: null })
        try {
          const response = await fetch(`${API_URL}/auth/register/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role, otp, acceptTerms })
          })
          const data = await response.json()
          if (!response.ok) {
            throw new Error(data.error || 'Registration failed')
          }
          // Teacher accounts are created pending admin approval: the server returns no token
          // and no session is established. The caller shows the pending message and returns
          // the user to the login screen.
          if (data.pendingApproval || !data.token) {
            set({ isLoading: false })
            return data
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
          sessionExpired: false,
          termsRequired: false
        })
      },

      // Re-read the signed-in user (e.g. a session restored from storage before termsAccepted existed).
      // Unlike fetchUser, a failure never signs the user out: a 401 is already handled by the global
      // fetch interceptor, and a network blip should not end the session.
      refreshUser: async () => {
        const { token } = get()
        if (!token) return null
        try {
          const response = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
          })
          if (!response.ok) return null
          const data = await response.json()
          if (get().token !== token) return null // signed out / switched meanwhile
          set({ user: data.user, termsRequired: data.user?.termsAccepted === false })
          return data.user
        } catch {
          return null
        }
      },

      // Record acceptance of the current Terms of Use for the signed-in account, then re-authenticate the
      // socket (the server left it unauthenticated while the terms were pending).
      acceptTerms: async () => {
        const { token } = get()
        const response = await fetch(`${API_URL}/auth/accept-terms`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ acceptTerms: true })
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.error || 'Could not record acceptance, please try again')
        }
        set({ user: data.user, termsRequired: false })
        const { default: useSocketStore } = await import('./socketStore.js')
        useSocketStore.getState().reauthenticate(token)
        return data.user
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