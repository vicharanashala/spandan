import express from 'express'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()
router.use(authenticate)

// GET /api/settings/providers - Get provider status and detection info
router.get('/providers', async (req, res) => {
  try {
    const { detectAvailableProviders, selectProvider } = await import('../services/providerSelector.js')
    const available = detectAvailableProviders()
    const active = selectProvider()
    res.json({ success: true, availableProviders: available, activeProvider: active })
  } catch (error) {
    console.error('Error fetching provider status:', error)
    res.status(500).json({ success: false, error: 'Failed to check providers' })
  }
})

// POST /api/settings/providers/test - Test a specific provider connection
router.post('/providers/test', async (req, res) => {
  try {
    const { provider } = req.body
    if (!provider) return res.status(400).json({ success: false, error: 'Provider ID is required' })

    const config = (await import('../config.js')).default
    const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`] || config[`${provider}ApiKey`] || ''

    if (!apiKey) {
      return res.json({ success: false, available: false, message: `No API key configured for ${provider}` })
    }

    // Test the connection with a simple API call
    let result
    switch (provider) {
      case 'google': {
        const genAI = (await import('@google/generative-ai')).GoogleGenerativeAI
        const ai = new genAI(apiKey)
        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' })
        const resp = await model.generateContent('Reply with just: OK')
        result = resp.response.text()
        break
      }
      case 'grok': {
        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'grok-1', messages: [{ role: 'user', content: 'Reply with just: OK' }], max_tokens: 10 })
        })
        const data = await resp.json()
        result = data.choices?.[0]?.message?.content || ''
        break
      }
      case 'groq': {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'Reply with just: OK' }], max_tokens: 10 })
        })
        const data = await resp.json()
        result = data.choices?.[0]?.message?.content || ''
        break
      }
      case 'openrouter': {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': 'http://localhost:3000' },
          body: JSON.stringify({ model: 'openai/gpt-3.5-turbo', messages: [{ role: 'user', content: 'Reply with just: OK' }], max_tokens: 10 })
        })
        const data = await resp.json()
        result = data.choices?.[0]?.message?.content || ''
        break
      }
      default:
        return res.json({ success: false, available: false, message: `Unknown provider: ${provider}` })
    }

    const available = result && result.includes('OK')
    res.json({ success: true, available, message: available ? 'Connected successfully' : 'Unexpected response', provider })
  } catch (error) {
    console.error(`Provider test error for ${req.body.provider}:`, error.message)
    res.json({ success: false, available: false, message: error.message, provider: req.body.provider })
  }
})

export default router
