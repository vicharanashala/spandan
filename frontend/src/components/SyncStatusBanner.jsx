import React, { useEffect, useState } from 'react'
import { usePendingAnswersStore } from '../stores/pendingAnswersStore'

/**
 * Banner that shows sync status and pending answers count
 * Displayed when there are pending answers or during syncing
 */
export default function SyncStatusBanner() {
  const { pendingAnswers, isSyncing } = usePendingAnswersStore()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(pendingAnswers.length > 0 || isSyncing)
  }, [pendingAnswers.length, isSyncing])

  if (!isVisible) {
    return null
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        padding: '12px 20px',
        background: pendingAnswers.length > 0 && !isSyncing 
          ? 'linear-gradient(135deg, #f59e0b, #f97316)' // Orange for pending
          : isSyncing
          ? 'linear-gradient(135deg, #3b82f6, #2563eb)' // Blue for syncing
          : 'linear-gradient(135deg, #10b981, #059669)', // Green for synced
        color: 'white',
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: '500',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
      }}
    >
      {isSyncing ? (
        <>
          <span style={{ fontSize: '16px' }}>🔄</span>
          <span>Syncing {pendingAnswers.length} pending answer{pendingAnswers.length !== 1 ? 's' : ''}...</span>
        </>
      ) : pendingAnswers.length > 0 ? (
        <>
          <span style={{ fontSize: '16px' }}>💾</span>
          <span>{pendingAnswers.length} answer{pendingAnswers.length !== 1 ? 's' : ''} saved. Will sync when reconnected.</span>
        </>
      ) : (
        <>
          <span style={{ fontSize: '16px' }}>✓</span>
          <span>All answers synced successfully</span>
        </>
      )}
    </div>
  )
}
