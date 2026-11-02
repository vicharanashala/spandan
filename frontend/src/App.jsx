
import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useThemeStore from './stores/themeStore'
import useAuthStore from './stores/authStore'
import useSocketStore from './stores/socketStore'
import ProtectedRoute from './components/ProtectedRoute'
import AuthPage from './pages/AuthPage'
import AuthCallback from './pages/AuthCallback'
import ResetPasswordPage from './pages/ResetPasswordPage'
import DashboardPage from './pages/DashboardPage'
import StudentDashboard from './pages/StudentDashboard'
import StudentPerformancePage from './pages/StudentPerformancePage'
import RoomDetailPage from './pages/RoomDetailPage'
import StudentRoomPage from './pages/StudentRoomPage'
import CreateRoomPage from './pages/CreateRoomPage'
import ManageRoomPage from './pages/ManageRoomPage'
import JoinRoomPage from './pages/JoinRoomPage'
import RoomHistoryPage from './pages/RoomHistoryPage'
import RoomResultsPage from './pages/RoomResultsPage'
import ProfilePage from './pages/ProfilePage'
import HelpModal from './components/HelpModal'
import Tour from './components/Tour'
import AdminPage from './pages/AdminPage'
import TeacherClassesPage from './pages/TeacherClassesPage'
import TeacherClassDetailPage from './pages/TeacherClassDetailPage'
import StudentClassesPage from './pages/StudentClassesPage'
import StudentClassDetailPage from './pages/StudentClassDetailPage'
import TermsPage from './pages/TermsPage'
import TermsGate from './components/TermsGate'
import { isTokenExpired } from './lib/jwt.js'

function App() {
  const { isDark } = useThemeStore()
  const { token, isAuthenticated } = useAuthStore()
  const { connect, disconnect } = useSocketStore()

  useEffect(() => {
    const { token: t } = useAuthStore.getState()
    if (t && isTokenExpired(t)) {
      useAuthStore.getState().handleSessionExpired()
    }
  }, [])

  useEffect(() => {
    if (token && isAuthenticated) {
      console.log('App: connecting socket with token')
      connect(token)
    } else {
      console.log('App: disconnecting socket')
      disconnect()
    }
  }, [token, isAuthenticated, connect, disconnect])

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
      <HelpModal />
      <Tour />
      {/* Blocking accept-terms screen for signed-in accounts that have not accepted the current terms. */}
      <TermsGate />

      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/terms" element={<TermsPage />} />

        {/* Teacher routes */}
        <Route
          path="/teacher"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/classes"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <TeacherClassesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/classes/:id"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <TeacherClassDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/create-room"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <CreateRoomPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/manage-room"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <ManageRoomPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/profile"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/room-history"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <RoomHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/room/:roomId"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <RoomDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/room/:roomId/results"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <RoomResultsPage />
            </ProtectedRoute>
          }
        />
        {/* Old sidebar Manual pages are gone (help lives in the ⓘ popup); keep bookmarks working. */}
        <Route path="/teacher/help" element={<Navigate to="/teacher" replace />} />
        <Route path="/student/help" element={<Navigate to="/student" replace />} />

        {/* Admin-only: teacher approval. Guarded to teachers here and isAdmin inside the page + API. */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['teacher']}>
              <AdminPage />
            </ProtectedRoute>
          }
        />

        {/* Student routes */}
        <Route
          path="/student"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/classes"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentClassesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/classes/:id"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentClassDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/performance"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentPerformancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/join-room"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <JoinRoomPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/room-history"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <RoomHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/profile"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/room/:roomId/results"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <RoomResultsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/session/:roomCode"
          element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentRoomPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
