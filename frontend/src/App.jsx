import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import useThemeStore from './stores/themeStore'
import useAuthStore from './stores/authStore'
import useSocketStore from './stores/socketStore'
import useSidebarStore from './stores/sidebarStore'
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

function AnimatedRoutes() {
  const location = useLocation()
  const { isCollapsed } = useSidebarStore()

  // Sync sidebar width CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', isCollapsed ? '60px' : '240px')
  }, [isCollapsed])

  return (
    <div className="page-transition" key={location.pathname}>
      <Routes location={location}>
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
      </Routes>
    </div>
  )
}

function App() {
  const { isDark } = useThemeStore()
  const { token, isAuthenticated } = useAuthStore()
  const { connect, disconnect } = useSocketStore()

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
    <BrowserRouter basename={import.meta.env.VITE_BASE_PATH || "/"}>
      <AnimatedRoutes />
    </BrowserRouter>
  )
}

export default App