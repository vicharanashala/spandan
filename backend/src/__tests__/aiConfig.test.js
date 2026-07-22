import { jest } from '@jest/globals'
import request from 'supertest'
import { clearAiKeyCache } from '../services/aiKeyCache.js'

jest.unstable_mockModule('../middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    req.user = { _id: 'teacher-1', role: 'teacher' }
    next()
  },
  authorize: () => (req, res, next) => next()
}))

const express = (await import('express')).default
const aiConfigRoutes = (await import('../routes/aiConfig.js')).default

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/config/ai', aiConfigRoutes)
  return app
}

describe('AI config routes', () => {
  let app

  beforeEach(() => {
    clearAiKeyCache()
    app = createApp()
  })

  it('saves API keys in memory without a database connection', async () => {
    const response = await request(app)
      .post('/api/config/ai')
      .send({
        provider: 'openai',
        apiKey: 'sk-test'
      })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.providers.openai.hasKey).toBe(true)
    expect(response.body.configured.openai).toBe(true)
  })

  it('returns 400 when no supported key is provided', async () => {
    const response = await request(app)
      .post('/api/config/ai')
      .send({
        keys: {
          unknown: 'ignored',
          openai: ''
        }
      })
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toBe('Provide at least one API key to save')
  })

  it('returns configured statuses from the in-memory cache', async () => {
    await request(app)
      .post('/api/config/ai')
      .send({
        keys: {
          google: 'google-key'
        }
      })
      .expect(200)

    const response = await request(app)
      .get('/api/config/ai')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.providers.google.hasKey).toBe(true)
    expect(response.body.configured.google).toBe(true)
  })
})
