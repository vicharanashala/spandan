import { API_URL } from '../config.js'
import api from '../lib/api'
import useAuthStore from '../stores/authStore.js'

// Get available AI providers
export const getAIProviders = async () => {
  const token = useAuthStore.getState().token
  const response = await fetch(`${API_URL}/questions/providers`, {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
  })
  const data = await response.json()
  return data
}

// Generate questions from transcript
export const generateQuestions = async (transcript, config) => {
  const response = await fetch(`${API_URL}/questions/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${useAuthStore.getState().token}`
    },
    body: JSON.stringify({ transcript, config })
  })
  return response.json()
}

export const getQuestionBank = async (search = '', tags = []) => {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  tags.forEach((tag) => params.append('tags', tag))

  const response = await fetch(`${API_URL}/questions/bank?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${useAuthStore.getState().token}`
    }
  })

  return response.json()
}

export const saveQuestionToBank = async (payload) => {
  const response = await fetch(`${API_URL}/questions/bank`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${useAuthStore.getState().token}`
    },
    body: JSON.stringify(payload)
  })

  return response.json()
}

export const reuseQuestionFromBank = async (questionId, roomId) => {
  const response = await fetch(`${API_URL}/questions/bank/reuse/${questionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${useAuthStore.getState().token}`
    },
    body: JSON.stringify({ roomId })
  })

  return response.json()
}