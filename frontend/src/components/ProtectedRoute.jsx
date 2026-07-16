import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

function ProtectedRoute({ children, allowedRoles }) {
  const { token, user, isAuthenticated } = useAuthStore()
  const [ hydrated, setHydrated ] = useState(false)
  
  // Wait for Zustand persistence to rehydrate
  useEffect(() => {
    // Zustand with persist sets a rehydrate key
    // We give it one tick to settle
    const timer = setTimeout(() => setHydrated(true), 0)
    return () => clearTimeout(timer)
  }, [])
  
  // Show nothing until hydrated
  if (!hydrated) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-primary)'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--border-color)',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
      </div>
    )
  }
  
  // Not authenticated - redirect to login
  if (!token) {
    return <Navigate to="/" replace />
  }
  
  // Token exists but user not loaded yet - show loading (wait for auth rehydration)
  if (!user) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-primary)'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--border-color)',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
      </div>
    )
  }
  
  // Check role if specified
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />
  }
  
  return children
}

export default ProtectedRoute