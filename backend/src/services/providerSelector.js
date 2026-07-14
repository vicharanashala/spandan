import { config } from '../config.js'

// Priority order for AI providers
const PROVIDER_PRIORITY = [
  { id: 'google',  envKey: 'GEMINI_API_KEY', name: 'Google Gemini', icon: '🔷' },
  { id: 'grok',    envKey: 'GROK_API_KEY',   name: 'Grok (xAI)',   icon: '🔴' },
  { id: 'openrouter', envKey: 'OPENROUTER_API_KEY', name: 'OpenRouter', icon: '🟢' },
  { id: 'groq',    envKey: 'GROQ_API_KEY',   name: 'Groq',          icon: '🟣' }
]

let selectedProvider = null

function getEnv(key) {
  const envVal = process.env[key]
  if (envVal) return envVal
  // Map env key names to config property names
  const configMap = {
    GEMINI_API_KEY: 'googleApiKey',
    GROK_API_KEY: 'grokApiKey',
    OPENROUTER_API_KEY: 'openrouterApiKey',
    GROQ_API_KEY: 'groqApiKey'
  }
  const configKey = configMap[key]
  return configKey ? (config[configKey] || '') : ''
}

export function detectAvailableProviders() {
  return PROVIDER_PRIORITY.map(p => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    available: !!getEnv(p.envKey)
  }))
}

export function selectProvider() {
  for (const p of PROVIDER_PRIORITY) {
    if (getEnv(p.envKey)) {
      selectedProvider = p
      console.log(`[ProviderSelector] Selected: ${p.name} (${p.id})`)
      return p
    }
  }
  console.log('[ProviderSelector] No AI provider configured — will use local generator')
  return { id: 'local', name: 'Local Question Generator', icon: '🖥️' }
}

export function getSelectedProvider() {
  if (selectedProvider) return selectedProvider
  return selectProvider()
}

export function clearProviderCache() {
  selectedProvider = null
}

export async function generateWithFallback(transcript, questionTypes, difficulty, generationFn) {
  const errors = []

  for (const p of PROVIDER_PRIORITY) {
    const apiKey = getEnv(p.envKey)
    if (!apiKey) continue

    try {
      console.log(`[ProviderSelector] Trying ${p.name}...`)
      const result = await generationFn(p.id, apiKey, transcript, questionTypes, difficulty)
      console.log(`[ProviderSelector] ${p.name} succeeded`)
      return { provider: p, questions: result }
    } catch (error) {
      console.warn(`[ProviderSelector] ${p.name} failed: ${error.message}`)
      errors.push({ provider: p.id, error: error.message })
    }
  }

  console.log('[ProviderSelector] All AI providers failed, using local generator')
  return { provider: { id: 'local', name: 'Local Question Generator', icon: '🖥️' }, questions: null, errors }
}

export default {
  detectAvailableProviders,
  selectProvider,
  getSelectedProvider,
  clearProviderCache,
  generateWithFallback,
  PROVIDER_PRIORITY
}
