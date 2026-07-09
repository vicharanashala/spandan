import { create } from 'zustand'

/**
 * Manages offline answer submissions
 * Stores answers locally both in state and localStorage
 * Persists across page refreshes and reconnections
 */
export const usePendingAnswersStore = create((set, get) => {
  // Initialize from localStorage
  const getInitialQueue = () => {
    try {
      const stored = localStorage.getItem('pendingAnswers')
      return stored ? JSON.parse(stored) : []
    } catch (err) {
      console.error('Failed to load pending answers from localStorage:', err)
      return []
    }
  }

  const persistToLocalStorage = (queue) => {
    try {
      localStorage.setItem('pendingAnswers', JSON.stringify(queue))
    } catch (err) {
      console.error('Failed to persist pending answers to localStorage:', err)
    }
  }

  return {
    pendingAnswers: getInitialQueue(),
    isSyncing: false,

    /**
     * Add an answer to the queue (for offline submissions)
     * @param {string} roomId - Room ID
     * @param {string} questionId - Question ID
     * @param {number[]} selectedOptions - Selected option indices
     * @param {string} roomCode - Room code for socket emission
     * @param {string} studentId - Student ID
     * @param {number} responseTime - Time taken to answer
     */
    addPendingAnswer: (roomId, questionId, selectedOptions, roomCode, studentId, responseTime) => {
      const newAnswer = {
        id: `${questionId}-${studentId}-${Date.now()}`, // Unique local ID
        roomId,
        questionId,
        selectedOptions,
        roomCode,
        studentId,
        responseTime,
        timestamp: Date.now(),
        attemptCount: 0 // Track retry attempts
      }

      set((state) => {
        const updated = [...state.pendingAnswers, newAnswer]
        persistToLocalStorage(updated)
        return { pendingAnswers: updated }
      })
    },

    /**
     * Mark an answer as synced/submitted
     * @param {string} answerId - The local answer ID
     */
    removePendingAnswer: (answerId) => {
      set((state) => {
        const updated = state.pendingAnswers.filter((a) => a.id !== answerId)
        persistToLocalStorage(updated)
        return { pendingAnswers: updated }
      })
    },

    /**
     * Increment attempt count for retry tracking
     * @param {string} answerId - The local answer ID
     */
    incrementAttemptCount: (answerId) => {
      set((state) => {
        const updated = state.pendingAnswers.map((a) =>
          a.id === answerId ? { ...a, attemptCount: a.attemptCount + 1 } : a
        )
        persistToLocalStorage(updated)
        return { pendingAnswers: updated }
      })
    },

    /**
     * Get all pending answers
     */
    getPendingAnswers: () => {
      return get().pendingAnswers
    },

    /**
     * Set syncing state
     */
    setSyncing: (isSyncing) => {
      set({ isSyncing })
    },

    /**
     * Clear all pending answers (after successful sync or manual clear)
     */
    clearAll: () => {
      set({ pendingAnswers: [] })
      persistToLocalStorage([])
    }
  }
})
