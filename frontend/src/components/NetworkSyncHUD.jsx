import React from 'react'

/**
 * NetworkSyncHUD provides visual feedback to students when network connectivity fluctuates,
 * displaying local vault storage status and background synchronization state.
 */
export function NetworkSyncHUD({
  isOnline = true,
  pendingCount = 0,
  isSyncing = false,
  lastSyncResult = null,
  onManualSync = null
}) {
  // If perfectly online and no items pending, render a subtle indicator or nothing to prevent clutter
  if (isOnline && pendingCount === 0 && !isSyncing && !lastSyncResult?.synced) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderRadius: '10px',
        marginBottom: '16px',
        fontSize: '13px',
        fontWeight: '500',
        transition: 'all 0.3s ease',
        background: !isOnline
          ? 'rgba(245, 158, 11, 0.12)'
          : isSyncing
          ? 'rgba(59, 130, 246, 0.12)'
          : pendingCount > 0
          ? 'rgba(234, 179, 8, 0.12)'
          : 'rgba(16, 185, 129, 0.12)',
        border: `1px solid ${
          !isOnline
            ? '#f59e0b'
            : isSyncing
            ? '#3b82f6'
            : pendingCount > 0
            ? '#eab308'
            : '#10b981'
        }`,
        color: !isOnline
          ? '#d97706'
          : isSyncing
          ? '#2563eb'
          : pendingCount > 0
          ? '#ca8a04'
          : '#059669'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {!isOnline ? (
          <>
            <span style={{ fontSize: '16px' }}>⚡</span>
            <span>
              <strong>Offline Mode:</strong> Connection dropped. Your answers are safely vaulted locally and will auto-sync when online.
            </span>
          </>
        ) : isSyncing ? (
          <>
            <span
              style={{
                display: 'inline-block',
                animation: 'spin 1s linear infinite',
                fontSize: '15px'
              }}
            >
              🔄
            </span>
            <span>
              Syncing {pendingCount} queued answer{pendingCount === 1 ? '' : 's'} with server...
            </span>
          </>
        ) : pendingCount > 0 ? (
          <>
            <span style={{ fontSize: '15px' }}>⏳</span>
            <span>
              {pendingCount} answer{pendingCount === 1 ? '' : 's'} queued locally for sync.
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '15px' }}>✓</span>
            <span>All answers synced successfully with leaderboard!</span>
          </>
        )}
      </div>

      {isOnline && pendingCount > 0 && !isSyncing && onManualSync && (
        <button
          onClick={onManualSync}
          style={{
            background: 'none',
            border: '1px solid currentColor',
            color: 'inherit',
            borderRadius: '6px',
            padding: '4px 10px',
            fontSize: '12px',
            cursor: 'pointer',
            marginLeft: '12px'
          }}
        >
          Sync Now
        </button>
      )}
    </div>
  )
}

export default NetworkSyncHUD
