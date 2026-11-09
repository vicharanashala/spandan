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

  async patch(endpoint, data) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'PATCH',
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

  async postFormData(endpoint, formData) {
    const { token } = useAuthStore.getState()
    const headers = {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData
    })
    return this.handleResponse(response)
  },

  async downloadBlob(endpoint, fallbackFilename = 'download') {
    const { token } = useAuthStore.getState()
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    })
    if (!response.ok) {
      let errMsg = 'Download failed'
      try {
        const errJson = await response.json()
        errMsg = errJson.error || errMsg
      } catch (e) {}
      throw new Error(errMsg)
    }

    const disposition = response.headers.get('Content-Disposition')
    let filename = fallbackFilename
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
      if (match && match[1]) {
        filename = match[1].replace(/['"]/g, '').trim()
      }
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    return { success: true, filename }
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

export const classApi = {
  create: (name, settings) => api.post('/classes', { name, settings }),
  getAll: () => api.get('/classes'),
  getById: (id) => api.get(`/classes/${id}`),
  join: (code) => api.post('/classes/join', { code }),
  getSessions: (id) => api.get(`/classes/${id}/sessions`),
  createSession: (id, data) => api.post(`/classes/${id}/sessions`, data),
  getStats: (id) => api.get(`/classes/${id}/stats`),
  getMembers: (id) => api.get(`/classes/${id}/members`),
  getMemberPerformance: (id, studentId) => api.get(`/classes/${id}/members/${studentId}/performance`),
  updateMember: (id, studentId, action) => api.patch(`/classes/${id}/members/${studentId}`, { action }),
  archive: (id) => api.post(`/classes/${id}/archive`),
  restore: (id) => api.post(`/classes/${id}/restore`),
  exportCsv: (id, filename) => api.downloadBlob(`/classes/${id}/export`, filename)
}

export default api