import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore.js'
import { safeParseJson } from '../utils/apiUtils.js'

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
    try {
      return await safeParseJson(response)
    } catch (error) {
      if (error.status === 401) {
        useAuthStore.getState().logout()
      }
      throw error
    }
  }
}

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (name, email, password, role) => api.post('/auth/register', { name, email, password, role }),
  getMe: () => api.get('/auth/me'),
  checkEmail: (email) => api.get(`/auth/check-email/${email}`)
}

export const roomApi = {
  create: (name, settings) => api.post('/rooms', { name, settings }),
  getAll: () => api.get('/rooms'),
  getById: (id) => api.get(`/rooms/${id}`),
  joinByCode: (code) => api.get(`/rooms/join/${code}`),
  update: (id, data) => api.put(`/rooms/${id}`, data),
  delete: (id) => api.delete(`/rooms/${id}`),
  getStudentRoomHistory: () => api.get('/rooms/student/room-history'),
  getActiveRoomsByStudent: () => api.get('/rooms/student/active')
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

export const questionBankApi = {
  list: (filters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    const qs = params.toString()
    return api.get(`/question-bank${qs ? `?${qs}` : ''}`)
  },
  saveFromRoomQuestion: (data) => api.post('/question-bank/from-room-question', data),
  prepareImport: (id) => api.get(`/question-bank/${id}/import-ready`),
  getRoomSavedIds: (roomId) => api.get(`/question-bank/room/${roomId}/saved`),
  reuse: (id, sessionId) => api.post(`/question-bank/${id}/reuse`, { sessionId }),
  importByCode: (id, roomCode) => api.post(`/question-bank/${id}/import-by-code`, { roomCode }),
  archive: (id) => api.delete(`/question-bank/${id}`),
  getTopics: () => api.get('/question-bank/meta/topics'),
  getFolders: () => api.get('/question-bank/folders'),

}

export default api