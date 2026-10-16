import { API_URL } from '../config.js'
import { getQueuedResponses, removeQueuedResponse } from './offlineQueue.js'

let isSyncing = false

/**
 * Flush and sync all pending queued responses for a room.
 * Safely handles 200/201 (success), 409 (conflict/closed), and network interruptions.
 */
export async function syncPendingResponses({ token, roomId = null, onSyncSuccess, onSyncError } = {}) {
  if (isSyncing) {
    return { skipped: true, reason: 'sync_already_in_progress' }
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { skipped: true, reason: 'device_offline' }
  }

  const items = await getQueuedResponses(roomId)
  if (!items || items.length === 0) {
    return { synced: 0, dropped: 0, failed: 0 }
  }

  isSyncing = true
  let synced = 0
  let dropped = 0
  let failed = 0

  try {
    for (const item of items) {
      try {
        const response = await fetch(`${API_URL}/responses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            roomId: item.roomId,
            questionId: item.questionId,
            selectedOptions: item.selectedOptions,
            responseTime: item.responseTime
          })
        })

        if (response.ok) {
          const data = await response.json().catch(() => ({}))
          await removeQueuedResponse(item.id)
          synced++
          if (onSyncSuccess) {
            onSyncSuccess(item, data)
          }
        } else if (response.status === 409) {
          // 409: Duplicate submission or poll_closed.
          // The server has finalized this answer or poll; drop it to avoid infinite retry loops.
          await removeQueuedResponse(item.id)
          dropped++
        } else if (response.status === 401 || response.status === 403) {
          // Auth failed — leave in queue or let auth interceptor handle session expiry
          failed++
          break
        } else {
          // 500 or other transient server error
          failed++
        }
      } catch (networkErr) {
        // Network drop during flush — stop loop and preserve remaining items for next reconnect
        failed++
        if (onSyncError) {
          onSyncError(networkErr, item)
        }
        break
      }
    }
  } finally {
    isSyncing = false
  }

  return { synced, dropped, failed }
}

export function isSyncInProgress() {
  return isSyncing
}
