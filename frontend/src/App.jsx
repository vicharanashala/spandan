import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
import { API_URL } from './config.js'

function App() {
  const { isDark } = useThemeStore()
  const { token, user, setAuth } = useAuthStore()
  const { connect, disconnect } = useSocketStore()
  const [samagamaChecked, setSamagamaChecked] = useState(false)

  // Check for Samagama session on app load (non-blocking)
  useEffect(() => {
    if (token || samagamaChecked) return

    let cancelled = false

    const checkSamagamaSession = async () => {
      try {
        const samagamaToken = localStorage.getItem('samagama_auth_token')

        if (!samagamaToken) {
          setSamagamaChecked(true)
          return
        }

        // Use AbortController with 2s timeout so Samagama doesn't block the app
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 2000)

        const response = await fetch('https://samagama.in/api/auth/me', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${samagamaToken}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        })

        clearTimeout(timeout)

        if (!response.ok || cancelled) {
          setSamagamaChecked(true)
          return
        }

        const data = await response.json()
        const samagamaUser = data.user

        if (!samagamaUser || !samagamaUser.email || cancelled) {
          setSamagamaChecked(true)
          return
        }

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

        if (!spandanResponse.ok || cancelled) {
          setSamagamaChecked(true)
          return
        }

        const spandanData = await spandanResponse.json()
        setAuth(spandanData.user, spandanData.token)

        const dashboard = spandanData.user.role === 'teacher' ? '/teacher' : '/student'
        const redirectUrl = `${window.location.origin}/spandan${dashboard}`
        window.location.href = redirectUrl
      } catch (error) {
        // Silently handle — Samagama is optional
      } finally {
        if (!cancelled) {
          setSamagamaChecked(true)
        }
      }
    }

    checkSamagamaSession()

    return () => { cancelled = true }
  }, [token, samagamaChecked, setAuth])

  // Connect socket when user is authenticated with valid token
  useEffect(() => {
    if (token && user) {
      connect(token, user._id)
    } else {
      disconnect()
    }
  }, [token, user?._id, connect, disconnect])

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
    </BrowserRouter>
  )
}

export default App
