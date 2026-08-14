import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore.js'

const getHeaders = () => {
  const { token } = useAuthStore.getState()
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}

export const api = {
  async get(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'GET',
      headers: getHeaders()
    })
    return this.handleResponse(response)
  },

  async post(endpoint, data) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data)
    })
    return this.handleResponse(response)
  },

  async put(endpoint, data) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data)
    })
    return this.handleResponse(response)
  },

  async delete(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: getHeaders()
    })
    return this.handleResponse(response)
  },

  async handleResponse(response) {
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Request failed')
    }

    return data
  }
}

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (name, email, password, role) => api.post('/auth/register', { name, email, password, role }),
  getMe: () => api.get('/auth/me')
}

export const adminApi = {
  listTeacherRequests: (status = 'pending') => api.get(`/admin/teacher-requests?status=${status}`),
  approve: (id) => api.post(`/admin/teacher-requests/${id}/approve`, {}),
  reject: (id, reason = '') => api.post(`/admin/teacher-requests/${id}/reject`, { reason })
}

export const roomApi = {
  create: (name, settings) => api.post('/rooms', { name, settings }),
  getAll: () => api.get('/rooms'),
  getById: (id) => api.get(`/rooms/${id}`),
  joinByCode: (code) => api.get(`/rooms/join/${code}`),
  update: (id, data) => api.put(`/rooms/${id}`, data),
  delete: (id) => api.delete(`/rooms/${id}`)
}

export const questionApi = {
  create: (data) => api.post('/questions', data),
  getByRoom: (roomId) => api.get(`/questions/room/${roomId}`),
  getById: (id) => api.get(`/questions/${id}`),
  update: (id, data) => api.put(`/questions/${id}`, data),
  delete: (id) => api.delete(`/questions/${id}`),
  activate: (id, roomId) => api.post(`/questions/${id}/activate`, { roomId }),
  submitResponse: (data) => api.post('/questions/response', data),
  getResponses: (id) => api.get(`/questions/${id}/responses`),
  getResults: (id) => api.get(`/questions/${id}/results`)
}

export default api
// Contextual Doubt-Anchored Polling API
export const doubtApi = {
  // Existing
  record: (roomId, segmentIndex, transcriptOffsetMs) =>
    api.post('/doubts', { roomId, segmentIndex, transcriptOffsetMs }),
  retract: (roomId) => api.post('/doubts/retract', { roomId }),
  getForRoom: (roomId) => api.get(`/doubts/room/${roomId}`),
  getSpikes: (roomId, minMarkCount) =>
    api.get(`/doubts/room/${roomId}/spikes${minMarkCount ? `?minMarkCount=${minMarkCount}` : ''}`),
  getForQuestion: (roomId, questionId) =>
    api.get(`/doubts/room/${roomId}/question/${questionId}`),
  // NEW: session clock + time-anchored queries
  startSession: (roomId) => api.post(`/doubts/room/${roomId}/session/start`),
  getSession: (roomId) => api.get(`/doubts/room/${roomId}/session`),
  getTimelineSpikes: (roomId, opts = {}) => {
    const params = new URLSearchParams()
    if (opts.bucketMs) params.set('bucketMs', opts.bucketMs)
    if (opts.minMarkCount) params.set('minMarkCount', opts.minMarkCount)
    const q = params.toString()
    return api.get(`/doubts/room/${roomId}/spikes/timeline${q ? `?${q}` : ''}`)
  },
  getSignals: (roomId, limit = 200) =>
    api.get(`/doubts/room/${roomId}/signals?limit=${limit}`),
  // NEW: full record with timing context (replaces record())
  recordWithContext: (payload) =>
    api.post('/doubts', {
      roomId: payload.roomId,
      segmentIndex: payload.segmentIndex || 0,
      transcriptOffsetMs: payload.transcriptOffsetMs || 0,
      recordingOffsetMs: payload.recordingOffsetMs ?? null,
      utteranceSnapshot: payload.utteranceSnapshot || '',
      clientSentAt: payload.clientSentAt || Date.now()
    })
}

// Topic markers API -- teacher sets "what we were on at this time"
export const topicApi = {
  set: (roomId, payload) => api.post(`/topics/room/${roomId}`, payload),
  remove: (roomId, markerId) => api.delete(`/topics/room/${roomId}/${markerId}`),
  list: (roomId) => api.get(`/topics/room/${roomId}`)
}

// Confusion events API -- one live alert per (room, topic).
// Topic-Aware Confusion: replaces per-spike rows with a single card
// that re-renders live as students keep pressing "I'm Lost".
export const confusionApi = {
  getActive: (roomId) => api.get(`/confusion/room/${roomId}/active`),
  getLatest: (roomId) => api.get(`/confusion/room/${roomId}/latest`),
  getHistory: (roomId, limit = 50) => api.get(`/confusion/room/${roomId}?limit=${limit}`),
  getHeatmap: (roomId, opts = {}) => api.get(`/confusion/room/${roomId}/heatmap?bucketMs=${opts.bucketMs || 60000}&windowMs=${opts.windowMs || 600000}`),
  getTopicHeat: (roomId, topN = 10) => api.get(`/confusion/room/${roomId}/topic-heat?topN=${topN}`),
  // RECOVERY FLOW: teacher requests student feedback on an active event
  requestFeedback: (eventId) => api.post(`/confusion/event/${eventId}/request-feedback`),
  // RECOVERY FLOW: student responds with understood / still_confused
  submitFeedback: (eventId, answer) => api.post(`/confusion/event/${eventId}/feedback`, { answer })
}