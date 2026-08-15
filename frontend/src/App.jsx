import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import useThemeStore from './stores/themeStore'
import useAuthStore from './stores/authStore'
import useSocketStore from './stores/socketStore'
import ProtectedRoute from './components/ProtectedRoute'
import AuthPage from './pages/AuthPage'
import AuthCallback from './pages/AuthCallback'
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
import HelpPage from './pages/HelpPage'
import AdminPage from './pages/AdminPage'
import { isTokenExpired } from './lib/jwt.js'

function App() {
  const { isDark } = useThemeStore()
  const { token, isAuthenticated } = useAuthStore()
  const { connect, disconnect } = useSocketStore()

  // On load, if the persisted token is already expired (e.g. the app was opened from a bookmark with a
  // cached session), drop it immediately so the user lands on the login screen with a clear message
  // instead of a logged-in-looking UI that only fails when they try to answer. This backs up the
  // onRehydrateStorage check in authStore for any timing edge.
  useEffect(() => {
    const { token: t } = useAuthStore.getState()
    if (t && isTokenExpired(t)) {
      useAuthStore.getState().handleSessionExpired()
    }
  }, [])

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
    <BrowserRouter basename="/spandan">
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
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
        <Route path="/teacher/help" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <HelpPage />
          </ProtectedRoute>
        } />
        {/* Admin-only: teacher approval page. Guarded to teachers here and to isAdmin inside the page + API. */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <AdminPage />
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
        <Route path="/student/help" element={
          <ProtectedRoute allowedRoles={['student']}>
            <HelpPage />
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
      </Routes>
    </BrowserRouter>
  )
}

export default App