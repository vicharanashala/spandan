import { create } from 'zustand'
import { API_URL } from '../config.js'
import useAuthStore from './authStore'
import { tourSteps } from '../content/tours'

// Seen = on the user record (cross-device truth) OR a per-browser memo written the moment a tour ends.
// The memo covers the short window in which GET /auth/me can still serve a cached user without the
// flag (the API caches authenticated users briefly per instance), so a reload never replays a tour.
const memoKey = (id) => `spandan.tourSeen.${id}`
const memoSeen = (id) => { try { return localStorage.getItem(memoKey(id)) === '1' } catch (e) { return false } }
export const hasSeenTour = (user, id) => !!user?.tourSeen?.[id] || memoSeen(id)

// Persist "seen" on the user record (teachers and students) via PUT /auth/profile. Optimistic: the
// local user is updated first so the tour never re-fires in this session even if the request fails.
export async function markTourSeen(id) {
  const { token, user, updateUser } = useAuthStore.getState()
  if (!token || !user) return
  const seenAt = new Date().toISOString()
  try { localStorage.setItem(memoKey(id), '1') } catch (e) { /* ignore */ }
  updateUser({ ...user, tourSeen: { ...(user.tourSeen || {}), [id]: seenAt } })
  try {
    const res = await fetch(`${API_URL}/auth/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tourSeen: { [id]: seenAt } })
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.user) updateUser(data.user)
    }
  } catch (e) { /* offline — the optimistic update already stops repeats for this session */ }
}

export const useTourStore = create((set, get) => ({
  active: null,     // tour id | null
  step: 0,
  direction: 1,     // which way to skip when a step's target is missing
  start: (id) => { if (tourSteps(id)) set({ active: id, step: 0, direction: 1 }) },
  next: () => {
    const { active, step } = get()
    if (!active) return
    if (step >= tourSteps(active).length - 1) return get().stop('finished')
    set({ step: step + 1, direction: 1 })
  },
  back: () => { const { step } = get(); if (step > 0) set({ step: step - 1, direction: -1 }) },
  stop: (reason = 'skipped') => {
    const id = get().active
    set({ active: null, step: 0, direction: 1 })
    if (id) markTourSeen(id)
    return reason
  },
}))

export default useTourStore
