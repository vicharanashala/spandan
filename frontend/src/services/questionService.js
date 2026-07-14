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
  const body = { transcript, config }

  const provider = config?.provider

  if (provider === 'grok') {
    const grokApiKey = localStorage.getItem('grok_api_key')
    const grokModel = config.grokModel || localStorage.getItem('grok_model') || 'grok-4'
    body.config = { ...config, grokApiKey: grokApiKey || undefined, grokModel }
  } else if (provider === 'google') {
    const geminiApiKey = localStorage.getItem('gemini_api_key')
    const geminiModel = config.geminiModel || localStorage.getItem('gemini_model') || 'gemini-2.0-flash'
    body.config = { ...config, geminiApiKey: geminiApiKey || undefined, geminiModel }
  } else if (provider === 'groq') {
    const groqApiKey = localStorage.getItem('groq_api_key')
    const groqModel = config.groqModel || localStorage.getItem('groq_model') || 'llama-3.3-70b-versatile'
    body.config = { ...config, groqApiKey: groqApiKey || undefined, groqModel }
  }

  const response = await fetch(`${API_URL}/questions/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${useAuthStore.getState().token}`
    },
    body: JSON.stringify(body)
  })
  return response.json()
}

// Generic API key helpers for client-side providers
function makeKeyHelpers(prefix) {
  const keyKey = `${prefix}_api_key`
  const modelKey = `${prefix}_model`
  return {
    getKey: () => localStorage.getItem(keyKey) || '',
    setKey: (key) => {
      if (key) localStorage.setItem(keyKey, key)
      else localStorage.removeItem(keyKey)
    },
    removeKey: () => {
      localStorage.removeItem(keyKey)
      localStorage.removeItem(modelKey)
    }
  }
}

export const {
  getKey: getGrokApiKey,
  setKey: setGrokApiKey,
  removeKey: removeGrokApiKey
} = makeKeyHelpers('grok')

export const {
  getKey: getGeminiApiKey,
  setKey: setGeminiApiKey,
  removeKey: removeGeminiApiKey
} = makeKeyHelpers('gemini')

export const {
  getKey: getGroqApiKey,
  setKey: setGroqApiKey,
  removeKey: removeGroqApiKey
} = makeKeyHelpers('groq')
