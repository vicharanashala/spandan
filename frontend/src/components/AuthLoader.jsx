import React, { useState, useEffect } from 'react'
import useAuthStore from '../stores/authStore'

export default function AuthLoader({ children }) {
  const [hydrated, setHydrated] = useState(false)
  const [checking, setChecking] = useState(true)
  
  // Simple hydration check - wait a bit for zustand to restore from localStorage
  useEffect(() => {
    // Give zustand time to rehydrate from localStorage on page load
    const checkTimer = setTimeout(() => {
      // Check if we have auth state restored
      const state = useAuthStore.getState()
      setHydrated(true)
      setChecking(false)
    }, 50)
    
    return () => clearTimeout(checkTimer)
  }, [])

  if (checking && !hydrated) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#f8f9fb'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid #e5e7eb',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: '#6b7280', fontSize: '14px' }}>Loading...</p>
        </div>
      </div>
    )
  }

  return children
}