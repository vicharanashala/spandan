import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import User from '../models/User.js'
import GlobalConfig from '../models/GlobalConfig.js'
import { encrypt } from '../utils/crypto.js'
import { config } from '../config.js'

const router = express.Router()
const PROVIDERS = ['minimax', 'openai', 'anthropic', 'google']

router.use(authenticate)
router.use(authorize('teacher'))

function providerStatus(encryptedAiKeys = {}, envKeys = {}) {
  return PROVIDERS.reduce((acc, provider) => {
    acc[provider] = {
      hasKey: !!encryptedAiKeys?.[provider],
      hasEnvFallback: !!envKeys?.[provider]
    }
    return acc
  }, {})
}

function getPersonalKeys(user = {}) {
  return {
    ...(user?.encryptedAiKeys || {}),
    ...(user?.encryptedPersonalAiKeys || {})
  }
}

function configuredStatus(personalProviders = {}, globalProviders = {}, envProviders = {}) {
  return PROVIDERS.reduce((acc, provider) => {
    const personalStatus = personalProviders[provider] || {}
    const globalStatus = globalProviders[provider] || {}
    const envStatus = envProviders[provider] || {}
    acc[provider] = !!(
      personalStatus.hasKey ||
      personalStatus.hasEnvFallback ||
      globalStatus.hasKey ||
      globalStatus.hasEnvFallback ||
      envStatus.hasKey ||
      envStatus.hasEnvFallback
    )
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
    const user = await User.findById(req.user._id)
      .select('+encryptedPersonalAiKeys +encryptedAiKeys')
      .lean()
    const globalConfig = await GlobalConfig.findOne({ key: 'default' }).lean()

    const providers = providerStatus(getPersonalKeys(user), {})
    const globalProviders = providerStatus(globalConfig?.encryptedAiKeys, {})
    const envProviders = envProviderStatus()

    res.json({
      success: true,
      providers,
      globalProviders,
      envProviders,
      configured: configuredStatus(providers, globalProviders, envProviders)
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
    const { keys = {}, provider, apiKey, scope = 'personal' } = req.body
    const requestedKeys = provider && apiKey
      ? { [provider]: apiKey }
      : keys
    const encryptedUpdates = {}

    for (const provider of PROVIDERS) {
      const value = typeof requestedKeys[provider] === 'string' ? requestedKeys[provider].trim() : ''
      if (value) {
        const fieldPrefix = scope === 'global' ? 'encryptedAiKeys' : 'encryptedPersonalAiKeys'
        encryptedUpdates[`${fieldPrefix}.${provider}`] = encrypt(value)
      }
    }

    if (Object.keys(encryptedUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Provide at least one API key to save'
      })
    }

    if (scope === 'global') {
      await GlobalConfig.findOneAndUpdate(
        { key: 'default' },
        { $set: { ...encryptedUpdates, updatedBy: req.user._id } },
        { upsert: true, new: true, runValidators: true }
      )
    } else {
      await User.findByIdAndUpdate(
        req.user._id,
        { $set: encryptedUpdates },
        { new: true, runValidators: true }
      )
    }

    const user = await User.findById(req.user._id)
      .select('+encryptedPersonalAiKeys +encryptedAiKeys')
      .lean()
    const globalConfig = await GlobalConfig.findOne({ key: 'default' }).lean()

    const providers = providerStatus(getPersonalKeys(user), {})
    const globalProviders = providerStatus(globalConfig?.encryptedAiKeys, {})
    const envProviders = envProviderStatus()

    res.json({
      success: true,
      providers,
      globalProviders,
      envProviders,
      configured: configuredStatus(providers, globalProviders, envProviders)
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
