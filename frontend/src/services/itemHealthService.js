import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore.js'

// Fetch the per-question Item Health report for a room (teacher-only; the backend 403s any
// other caller). Never throws on a non-2xx or network error — always resolves to
// { success, itemHealth } | { success: false, error }, so callers can treat this as an optional
// enhancement (see RoomResultsPage) without wrapping every call in try/catch.
export const fetchItemHealth = async (roomId) => {
  const token = useAuthStore.getState().token
  const authHeader = token ? { 'Authorization': `Bearer ${token}` } : {}
  try {
    const res = await fetch(`${API_URL}/responses/room/${roomId}/item-health`, {
      headers: authHeader
    })
    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data.error || 'Failed to fetch item health' }
    }
    return data
  } catch (err) {
    return { success: false, error: err.message || 'Failed to fetch item health' }
  }
}
