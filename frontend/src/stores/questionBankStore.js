import { create } from 'zustand'
import { questionBankApi } from '../lib/api'
import useAuthStore from './authStore'

// localStorage key is namespaced per user so shared computers don't leak
// staged questions between teacher accounts.
const pendingKey = () => {
  const userId = useAuthStore.getState().user?._id || 'anon'
  return `spandan:questionBank:pending:${userId}`
}

// Track questions saved in this session to prevent accidental duplicates
const sessionSavedIds = new Set()

// ---- Input validation helpers ----
const VALID_TYPES = new Set(['MCQ', 'TF', 'MSQ'])
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard'])

const isValidRoomQuestion = (q) => {
  if (!q || typeof q !== 'object') return false
  if (!VALID_TYPES.has(q.type)) return false
  if (typeof q.question !== 'string' || q.question.trim().length === 0) return false
  if (q.question.length > 5000) return false
  if (!Array.isArray(q.options) || q.options.length === 0 || q.options.length > 10) return false
  return true
}

// Read staged queue safely (handles corrupted JSON)
const readStagedQueue = () => {
  try {
    const raw = localStorage.getItem(pendingKey())
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const useQuestionBankStore = create((set, get) => ({
  items: [],
  total: 0,
  topics: [],
  isLoading: false,
  error: '',
  sessionSavedIds: new Set(),

  fetchList: async (filters = {}) => {
    set({ isLoading: true, error: '' })
    try {
      const data = await questionBankApi.list(filters)
      set({ items: data.items || [], total: data.total || 0, isLoading: false })
      return data
    } catch (e) {
      set({ error: e.message, isLoading: false })
      throw e
    }
  },

  fetchTopics: async () => {
    try {
      const data = await questionBankApi.getTopics()
      set({ topics: data.topics || [] })
    } catch {
      // non-critical
    }
  },

  // ONE-CLICK SAVE: validate first, then send. Returns { ok, question?, error? }
  saveFromRoomQuestion: async (roomQuestion, roomId, meta = {}) => {
    // Frontend validation gate so we don't even hit the API with bad data
    if (!isValidRoomQuestion(roomQuestion)) {
      const err = 'Question is missing required fields'
      set({ error: err })
      return { ok: false, error: err }
    }
    const difficulty = VALID_DIFFICULTIES.has(meta.difficulty) ? meta.difficulty : 'medium'

    try {
      const data = await questionBankApi.saveFromRoomQuestion({
        roomQuestion,
        roomId: roomId || null,
        topic: typeof meta.topic === 'string' ? meta.topic : '',
        tags: Array.isArray(meta.tags) ? meta.tags.filter(t => typeof t === 'string').slice(0, 20) : [],
        difficulty
      })
      // Track this in-session so the UI can disable the Save button
      const newId = data.question?._id
      if (newId) sessionSavedIds.add(newId)
      set((s) => ({
        items: [data.question, ...s.items.filter(q => q._id !== newId)],
        total: s.total + 1,
        sessionSavedIds: new Set(sessionSavedIds)
      }))
      return { ok: true, question: data.question }
    } catch (e) {
      const err = e.message || 'Failed to save question'
      set({ error: err })
      return { ok: false, error: err }
    }
  },

  // Returns true if this question was saved to the bank earlier this session
  isAlreadySaved: (bankId) => sessionSavedIds.has(bankId),

  // ONE-CLICK IMPORT: returns the cleaned payload from the server.
  // Validate the shape before returning so a hostile server response can't
  // inject garbage into the room.
  prepareImport: async (bankId) => {
    const data = await questionBankApi.prepareImport(bankId)
    const q = data.question
    if (!q || !isValidRoomQuestion(q)) {
      throw new Error('Server returned an invalid question payload')
    }
    return q
  },

  // Stage a question for the next room the user opens
  stageForImport: (bankQuestion) => {
    if (!isValidRoomQuestion(bankQuestion)) return false
    const queue = readStagedQueue()
    // De-dupe by sourceBankId so clicking twice doesn't double-stage
    const filtered = queue.filter(q => q.sourceBankId !== bankQuestion.sourceBankId)
    filtered.push(bankQuestion)
    localStorage.setItem(pendingKey(), JSON.stringify(filtered))
    return true
  },

  getStagedQueue: () => readStagedQueue(),

  clearStagedQueue: () => {
    localStorage.removeItem(pendingKey())
  },

  // Soft-archive a question
  archive: async (id) => {
    if (!id) return
    await questionBankApi.archive(id)
    sessionSavedIds.delete(id)
    set((s) => ({
      items: s.items.filter((q) => q._id !== id),
      total: Math.max(0, s.total - 1),
      sessionSavedIds: new Set(sessionSavedIds)
    }))
  },

  // Clear the per-user staged queue (call on logout)
  clearAllOnLogout: () => {
    sessionSavedIds.clear()
    set({ items: [], total: 0, topics: [], sessionSavedIds: new Set() })
  },

  clearError: () => set({ error: '' })
}))

export default useQuestionBankStore