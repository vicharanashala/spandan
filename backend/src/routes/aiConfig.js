import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { config } from '../config.js'
import { AI_KEY_PROVIDERS as PROVIDERS, getAiKeyStatus, setAiKeys } from '../services/aiKeyCache.js'

const router = express.Router()

function hasValidKey(value) {
  return typeof value === 'string' && value.trim() !== ''
}

router.use(authenticate)
router.use(authorize('teacher'))

function providerStatus(cachedKeys = {}, envKeys = {}) {
  return PROVIDERS.reduce((acc, provider) => {
    acc[provider] = {
      hasKey: hasValidKey(cachedKeys?.[provider]),
      hasEnvFallback: hasValidKey(envKeys?.[provider])
    }
    return acc
  }, {})
}

function configuredStatus(...providerGroups) {
  return PROVIDERS.reduce((acc, provider) => {
    acc[provider] = providerGroups.some(statuses => (
      statuses?.[provider]?.hasKey ||
      statuses?.[provider]?.hasEnvFallback
    ))
    return acc
  }, {})
}

function getEnvKeys() {
  return {
    minimax: config.minimaxApiKey,
    openai: config.openaiApiKey,
    anthropic: config.anthropicApiKey,
    google: config.googleApiKey
  }
}

function envProviderStatus() {
  return providerStatus({}, getEnvKeys())
}

router.get('/', async (req, res) => {
  try {
    const { roomId } = req.query
    const { providers, roomProviders, globalProviders } = getAiKeyStatus({
      userId: req.user._id,
      roomId
    })
    const envProviders = envProviderStatus()
    const statuses = configuredStatus(providers, roomProviders, globalProviders, envProviders)

    res.json({
      success: true,
      statuses,
      providers,
      roomProviders,
      globalProviders,
      envProviders,
      configured: statuses
    })
  } catch (error) {
    console.error('AI config status error:', error)
    console.error('Detailed Error:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to load AI configuration status'
    })
  }
})

const saveAiConfig = async (req, res) => {
  try {
    const { keys = {}, provider, apiKey, scope = 'personal', roomId } = req.body
    const requestedKeys = provider && apiKey
      ? { [provider]: apiKey }
      : keys
    const cacheKeys = {}

    for (const provider of PROVIDERS) {
      const value = typeof requestedKeys[provider] === 'string' ? requestedKeys[provider].trim() : ''
      if (value) {
        cacheKeys[provider] = value
      }
    }

    if (Object.keys(cacheKeys).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Provide at least one API key to save'
      })
    }

    const ownerId = scope === 'room' ? roomId : req.user._id
    setAiKeys({ scope, ownerId, keys: cacheKeys })

    const { providers, roomProviders, globalProviders } = getAiKeyStatus({
      userId: req.user._id,
      roomId
    })
    const envProviders = envProviderStatus()
    const statuses = configuredStatus(providers, roomProviders, globalProviders, envProviders)

    res.json({
      success: true,
      statuses,
      providers,
      roomProviders,
      globalProviders,
      envProviders,
      configured: statuses
    })
  } catch (error) {
    console.error('AI config save error:', error)
    console.error('Detailed Error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Unable to save AI configuration'
    })
  }
}

router.post('/', saveAiConfig)
router.put('/', saveAiConfig)

export default router
