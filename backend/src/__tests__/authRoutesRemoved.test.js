// Two endpoints were removed because they were unreachable from the app and dangerous from a
// script: PUT /auth/role let any account promote itself to teacher, and GET /auth/check-email/:email
// answered "is this address registered?" to anyone. Neither had a caller in the frontend. This pins
// their absence so re-adding either is a deliberate act with a failing test to explain itself to.
import express from 'express'
import request from 'supertest'
import authRoutes from '../routes/auth.js'

const app = express()
app.use(express.json())
app.use('/api/auth', authRoutes)

describe('Removed auth endpoints', () => {
  it('has no self-service role change', async () => {
    const res = await request(app).put('/api/auth/role').send({ role: 'teacher' })
    expect(res.status).toBe(404)
  })

  it('has no public email-existence oracle', async () => {
    const res = await request(app).get('/api/auth/check-email/someone@example.com')
    expect(res.status).toBe(404)
  })
})
