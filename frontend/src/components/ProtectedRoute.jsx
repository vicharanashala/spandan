import React, { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import { rememberRedirect, clearRedirect } from '../lib/postLoginRedirect'

function ProtectedRoute({ children, allowedRoles }) {
  const { token, user, isAuthenticated } = useAuthStore()
  const location = useLocation()
  const [ hydrated, setHydrated ] = useState(false)
  const signedIn = !!token && isAuthenticated
  const allowed = !allowedRoles || !user || allowedRoles.includes(user.role)

  // A logged-out visitor's target page is saved below; once a protected page renders, it has been used.
  useEffect(() => {
    if (hydrated && signedIn && allowed) clearRedirect()
  }, [hydrated, signedIn, allowed])

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
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
      </div>
    )
  }
  
  // Not authenticated - remember the page (e.g. an invite link) and redirect to login
  if (!signedIn) {
    rememberRedirect(location.pathname + location.search)
    return <Navigate to="/" replace />
  }

  // Check role if specified
  if (!allowed) {
    return <Navigate to="/" replace />
  }
  
  return children
}

export default ProtectedRoute