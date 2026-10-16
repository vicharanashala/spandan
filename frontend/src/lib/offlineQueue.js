const DB_NAME = 'spandan_offline_vault'
const DB_VERSION = 1
const STORE_NAME = 'pending_responses'
const LOCAL_STORAGE_KEY = 'spandan_offline_pending_responses'

/**
 * Open or upgrade the client-side IndexedDB database.
 */
function openDB() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB not supported'))
  }

  return new Promise((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'))
      request.onblocked = () => reject(new Error('IndexedDB open blocked'))
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Synchronous localStorage helpers for defensive fallback.
 */
function getLocalQueue() {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (err) {
    console.warn('[OfflineQueue] Failed reading localStorage queue:', err)
    return []
  }
}

function setLocalQueue(queue) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(queue))
  } catch (err) {
    console.warn('[OfflineQueue] Failed writing localStorage queue:', err)
  }
}

/**
 * Generate a deterministic idempotent response key.
 */
export function generateResponseKey(roomId, questionId, studentId) {
  return `${roomId}:${questionId}:${studentId}`
}

/**
 * Enqueue a response into the offline vault.
 */
export async function enqueueResponse(response) {
  const { roomId, questionId, studentId, selectedOptions, responseTime } = response
  const id = generateResponseKey(roomId, questionId, studentId)
  const item = {
    id,
    roomId: String(roomId),
    questionId: String(questionId),
    studentId: String(studentId),
    selectedOptions: Array.isArray(selectedOptions) ? selectedOptions : [selectedOptions],
    responseTime: Number(responseTime) || 0,
    queuedAt: Date.now(),
    retryCount: 0
  }

  // Save to localStorage backup first for immediate durability
  const localList = getLocalQueue().filter(q => q.id !== id)
  localList.push(item)
  setLocalQueue(localList)

  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(item)
      req.onsuccess = () => resolve(item)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    // Already in localStorage fallback
  }

  return item
}

/**
 * Retrieve queued responses, optionally filtered by roomId.
 */
export async function getQueuedResponses(roomId = null) {
  let items = []

  try {
    const db = await openDB()
    items = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    items = getLocalQueue()
  }

  // Ensure union with localStorage items in case of partial writes
  const localItems = getLocalQueue()
  const map = new Map()
  for (const item of [...items, ...localItems]) {
    if (item && item.id) {
      map.set(item.id, item)
    }
  }

  const merged = Array.from(map.values())
  if (!roomId) return merged
  return merged.filter(item => String(item.roomId) === String(roomId))
}

/**
 * Remove a specific response from the queue once synced or acknowledged.
 */
export async function removeQueuedResponse(id) {
  // Remove from localStorage
  const localList = getLocalQueue().filter(q => q.id !== id)
  setLocalQueue(localList)

  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    // Handled in localStorage
  }
}

/**
 * Clear queued responses, optionally filtered by roomId.
 */
export async function clearQueuedResponses(roomId = null) {
  if (!roomId) {
    setLocalQueue([])
    try {
      const db = await openDB()
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const req = store.clear()
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    } catch (err) {
      // Ignored
    }
  } else {
    const items = await getQueuedResponses(roomId)
    for (const item of items) {
      await removeQueuedResponse(item.id)
    }
  }
}

/**
 * Get count of pending responses in queue.
 */
export async function getQueuedCount(roomId = null) {
  const items = await getQueuedResponses(roomId)
  return items.length
}
