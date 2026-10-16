import { useState, useEffect, useCallback, useRef } from 'react'
import { getQueuedCount } from '../lib/offlineQueue.js'
import { syncPendingResponses, isSyncInProgress } from '../lib/offlineSync.js'

/**
 * Custom React hook to monitor network connectivity, manage queued poll responses,
 * and automatically sync them when connection is restored.
 */
export function useOfflineSync({ token, roomId, onSyncSuccess } = {}) {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState(null)
  const onSyncSuccessRef = useRef(onSyncSuccess)
  onSyncSuccessRef.current = onSyncSuccess

  const refreshCount = useCallback(async () => {
    try {
      const count = await getQueuedCount(roomId)
      setPendingCount(count)
      return count
    } catch {
      return 0
    }
  }, [roomId])

  const triggerSync = useCallback(async () => {
    if (!token || isSyncInProgress()) return
    setIsSyncing(true)

    try {
      const result = await syncPendingResponses({
        token,
        roomId,
        onSyncSuccess: (item, data) => {
          if (onSyncSuccessRef.current) {
            onSyncSuccessRef.current(item, data)
          }
        }
      })

      if (!result.skipped) {
        setLastSyncResult(result)
      }
    } finally {
      setIsSyncing(false)
      await refreshCount()
    }
  }, [token, roomId, refreshCount])

  useEffect(() => {
    refreshCount()

    const handleOnline = () => {
      setIsOnline(true)
      triggerSync()
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    }

    // Auto-sync if currently online and items are pending
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      triggerSync()
    }

    // Polling interval every 8 seconds if there are pending responses
    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        refreshCount().then(count => {
          if (count > 0) {
            triggerSync()
          }
        })
      }
    }, 8000)

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
      clearInterval(interval)
    }
  }, [refreshCount, triggerSync])

  return {
    isOnline,
    pendingCount,
    isSyncing,
    lastSyncResult,
    refreshCount,
    triggerSync
  }
}

export default useOfflineSync
