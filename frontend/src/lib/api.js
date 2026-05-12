import useAuthStore from '../stores/authStore'

const API_URL = '/api'

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
  getMe: () => api.get('/auth/me'),
  checkEmail: (email) => api.get(`/auth/check-email/${email}`)
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