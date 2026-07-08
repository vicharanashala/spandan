import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import User from '../models/User.js'
import GlobalConfig from '../models/GlobalConfig.js'
import { encryptString } from '../utils/crypto.js'
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

function configuredStatus(personalProviders = {}, globalProviders = {}) {
  return PROVIDERS.reduce((acc, provider) => {
    const personalStatus = personalProviders[provider] || {}
    const globalStatus = globalProviders[provider] || {}
    acc[provider] = !!(
      personalStatus.hasKey ||
      personalStatus.hasEnvFallback ||
      globalStatus.hasKey ||
      globalStatus.hasEnvFallback
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

router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+encryptedAiKeys').lean()
    const globalConfig = await GlobalConfig.findOne({ key: 'default' }).lean()

    const providers = providerStatus(user?.encryptedAiKeys, getEnvKeys())
    const globalProviders = providerStatus(globalConfig?.encryptedAiKeys, {})

    res.json({
      success: true,
      providers,
      globalProviders,
      configured: configuredStatus(providers, globalProviders)
    })
  } catch (error) {
    console.error('AI config status error:', error)
    res.status(500).json({
      success: false,
      error: 'Unable to load AI configuration status'
    })
  }
})

const saveAiConfig = async (req, res) => {
  try {
    const { keys = {}, scope = 'personal' } = req.body
    const encryptedUpdates = {}

    for (const provider of PROVIDERS) {
      const value = typeof keys[provider] === 'string' ? keys[provider].trim() : ''
      if (value) {
        encryptedUpdates[`encryptedAiKeys.${provider}`] = encryptString(value)
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
        { upsert: true, new: true }
      )
    } else {
      await User.findByIdAndUpdate(req.user._id, { $set: encryptedUpdates })
    }

    const user = await User.findById(req.user._id).select('+encryptedAiKeys').lean()
    const globalConfig = await GlobalConfig.findOne({ key: 'default' }).lean()

    const providers = providerStatus(user?.encryptedAiKeys, getEnvKeys())
    const globalProviders = providerStatus(globalConfig?.encryptedAiKeys, {})

    res.json({
      success: true,
      providers,
      globalProviders,
      configured: configuredStatus(providers, globalProviders)
    })
  } catch (error) {
    console.error('AI config save error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Unable to save AI configuration'
    })
  }
}

router.post('/', saveAiConfig)
router.put('/', saveAiConfig)

export default router
