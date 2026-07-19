import React, { useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import useThemeStore from './stores/themeStore'
import useAuthStore from './stores/authStore'
import useSocketStore from './stores/socketStore'
import ProtectedRoute from './components/ProtectedRoute'
import AuthPage from './pages/AuthPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import DashboardPage from './pages/DashboardPage'
import StudentDashboard from './pages/StudentDashboard'
import RoomDetailPage from './pages/RoomDetailPage'
import StudentRoomPage from './pages/StudentRoomPage'
import CreateRoomPage from './pages/CreateRoomPage'
import ManageRoomPage from './pages/ManageRoomPage'
import JoinRoomPage from './pages/JoinRoomPage'
import RoomHistoryPage from './pages/RoomHistoryPage'
import RoomResultsPage from './pages/RoomResultsPage'
import ProfilePage from './pages/ProfilePage'
import StudentRiskHistory from './pages/StudentRiskHistory'
import StudentRiskTrend from './pages/StudentRiskTrend'
import { API_URL } from './config.js'

// Samagama auto-login has known side effects when a user is ALREADY
// authenticated into Spandan as a different role (it would clobber
// the in-memory auth state with the Samagama-cached user). We guard
// against that by:
//   1. Skipping if zustand says we're authenticated (covers the
//      rehydrated-on-first-render case)
//   2. Skipping if a `spandan-auth` entry already exists in localStorage
//      (covers the race where persist hasn't rehydrated yet)
//   3. Persisting the resolved flag in localStorage so additional tabs
//      opened later in this browser don't re-run the check and
//      re-issue a `window.open(_blank)` on top of existing tabs.
const SAMAGAMA_RESOLVED_KEY = 'spandan_samagama_resolved'
const SPANDAN_AUTH_KEY = 'spandan-auth'

function App() {
  const { isDark } = useThemeStore()
  const { token, isAuthenticated, setAuth } = useAuthStore()
  const { connect, disconnect } = useSocketStore()
  const navigate = useNavigate()

  // Check for Samagama session on app load — but only when there is no
  // existing Spandan session in this browser. Two checks:
  //   - zustand rehydrated state (isAuthenticated from persist)
  //   - raw localStorage key (handles the pre-rehydration race)
  // And we mark a permanent localStorage flag once resolved, so future
  // tabs on the same browser skip the check entirely.
  useEffect(() => {
    // Already authenticated via Spandan — nothing to do.
    if (isAuthenticated) return

    // Race-safe: peek at the persist key directly.
    let hasSpandanAuth = false
    try {
      hasSpandanAuth = !!localStorage.getItem(SPANDAN_AUTH_KEY)
    } catch (_) {
      // localStorage unavailable (private mode) — fall through
    }
    if (hasSpandanAuth) return

    // Already resolved in a previous tab on this browser — skip.
    try {
      if (localStorage.getItem(SAMAGAMA_RESOLVED_KEY) === '1') return
    } catch (_) {}

    let cancelled = false
    const markResolved = () => {
      try { localStorage.setItem(SAMAGAMA_RESOLVED_KEY, '1') } catch (_) {}
    }

    const checkSamagamaSession = async () => {
      const samagamaToken = (() => {
        try { return localStorage.getItem('samagama_auth_token') }
        catch (_) { return null }
      })()
      console.log('[Spandan] Samagama token found:', !!samagamaToken)

      if (!samagamaToken) {
        markResolved()
        return
      }

      try {
        const response = await fetch('https://samagama.in/api/auth/me', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${samagamaToken}`,
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) { markResolved(); return }
        if (cancelled) return

        const data = await response.json()
        const samagamaUser = data.user
        console.log('[Spandan] Samagama user:', samagamaUser?.email)

        if (!samagamaUser || !samagamaUser.email) {
          markResolved()
          return
        }

        // Send to Spandan backend for auto-provisioning
        const spandanResponse = await fetch(`${API_URL}/auth/samagama-auto-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: samagamaUser.email,
            name: samagamaUser.name,
            isAdmin: samagamaUser.isAdmin || false,
            isSuperAdmin: samagamaUser.isSuperAdmin || false
          })
        })

        if (!spandanResponse.ok) { markResolved(); return }
        if (cancelled) return

        const spandanData = await spandanResponse.json()

        // Last-second guard: if persist rehydrated while we were fetching
        // and the user is now authenticated as someone else, don't clobber.
        const currentAuth = (() => {
          try { return !!localStorage.getItem(SPANDAN_AUTH_KEY) } catch (_) { return false }
        })()
        if (currentAuth) {
          console.log('[Spandan] Skipping Samagama setAuth: existing Spandan session detected')
          markResolved()
          return
        }

        setAuth(spandanData.user, spandanData.token)
        // Navigate in this tab instead of opening another one.
        const dashboard = spandanData.user.role === 'teacher' ? '/teacher' : '/student'
        navigate(dashboard)
      } catch (error) {
        console.error('[Spandan] Samagama session check failed:', error)
      } finally {
        markResolved()
      }
    }

    checkSamagamaSession()
    return () => { cancelled = true }
  }, [isAuthenticated, setAuth])

  // Connect socket when user is authenticated with valid token
  useEffect(() => {
    if (token && isAuthenticated) {
      console.log('App: connecting socket with token')
      connect(token)
    } else {
      console.log('App: disconnecting socket')
      disconnect()
    }
  }, [token, isAuthenticated, connect, disconnect])

  // Cleanup socket on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [isDark])

  return (
    <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/teacher" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <DashboardPage />
          </ProtectedRoute>
        } />
        <Route path="/teacher/create-room" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <CreateRoomPage />
          </ProtectedRoute>
        } />
        <Route path="/teacher/manage-room" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <ManageRoomPage />
          </ProtectedRoute>
        } />
        <Route path="/teacher/profile" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <ProfilePage />
          </ProtectedRoute>
        } />
        <Route path="/teacher/room-history" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <RoomHistoryPage />
          </ProtectedRoute>
        } />
        <Route path="/teacher/room/:roomId" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <RoomDetailPage />
          </ProtectedRoute>
        } />
        <Route path="/teacher/room/:roomId/results" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <RoomResultsPage />
          </ProtectedRoute>
        } />
        <Route path="/student" element={
          <ProtectedRoute allowedRoles={['student']}>
            <StudentDashboard />
          </ProtectedRoute>
        } />
        <Route path="/student/join-room" element={
          <ProtectedRoute allowedRoles={['student']}>
            <JoinRoomPage />
          </ProtectedRoute>
        } />
        <Route path="/student/room-history" element={
          <ProtectedRoute allowedRoles={['student']}>
            <RoomHistoryPage />
          </ProtectedRoute>
        } />
        <Route path="/student/profile" element={
          <ProtectedRoute allowedRoles={['student']}>
            <ProfilePage />
          </ProtectedRoute>
        } />
        <Route path="/student/room/:roomId/results" element={
          <ProtectedRoute allowedRoles={['student']}>
            <RoomResultsPage />
          </ProtectedRoute>
        } />
        <Route path="/student/session/:roomCode" element={
          <ProtectedRoute allowedRoles={['student']}>
            <StudentRoomPage />
          </ProtectedRoute>
        } />
        <Route path="/student/risk-history" element={
          <ProtectedRoute allowedRoles={['student']}>
            <StudentRiskHistory />
          </ProtectedRoute>
        } />
        <Route path="/teacher/risk-trend" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <StudentRiskTrend />
          </ProtectedRoute>
        } />
    </Routes>
  )
}

export default App