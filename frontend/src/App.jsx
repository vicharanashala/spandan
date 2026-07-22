import React, { useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import useThemeStore from './stores/themeStore'
import useAuthStore from './stores/authStore'
import { BASE_PATH } from './config'
import ProtectedRoute from './components/ProtectedRoute'

// Eagerly loaded for faster initial paint
import AuthPage from './pages/AuthPage'

// Lazy loaded routes
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'))
const RoomDetailPage = lazy(() => import('./pages/RoomDetailPage'))
const StudentRoomPage = lazy(() => import('./pages/StudentRoomPage'))
const CreateRoomPage = lazy(() => import('./pages/CreateRoomPage'))
const ManageRoomPage = lazy(() => import('./pages/ManageRoomPage'))
const JoinRoomPage = lazy(() => import('./pages/JoinRoomPage'))
const RoomHistoryPage = lazy(() => import('./pages/RoomHistoryPage'))
const RoomResultsPage = lazy(() => import('./pages/RoomResultsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const DemoPollPage = lazy(() => import('./pages/DemoPollPage'))

// Loading Fallback Component
const PageLoader = () => (
  <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)' }}>
    <div style={{
      width: '40px',
      height: '40px',
      border: '3px solid var(--border-color)',
      borderTop: '3px solid var(--accent-primary)',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }}></div>
  </div>
)

function App() {
  const { isDark } = useThemeStore()
  const { token, isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [isDark])

  return (
    <BrowserRouter
      basename={BASE_PATH || '/'}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route path="/demo-poll" element={<DemoPollPage />} />
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
      </Suspense>
    </BrowserRouter>
  )
}

export default App