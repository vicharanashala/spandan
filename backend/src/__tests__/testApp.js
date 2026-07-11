/**
 * Test-only mini-app that mounts just the routes Streak Fire needs.
 *
 * The production src/index.js pulls in src/routes/transcription.js which
 * uses ESM syntax that the project's Jest config (no Babel) cannot parse.
 * This module side-steps that by importing only the routes we actually need
 * for the streak end-to-end suite (auth, rooms, questions, responses).
 *
 * Each route file is loaded via a dynamic import inside a function so any
 * parse error points at the right file and we don't trip Jest's loader at
 * require-time.
 */
import express from 'express'

export async function buildTestApp() {
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  // Load the route modules lazily — if any one fails to parse, we want a
  // clear stack pointing at that file, not a global "syntax error" wrapper.
  const authRoutes     = (await import('../routes/auth.js')).default
  const roomRoutes     = (await import('../routes/rooms.js')).default
  const questionRoutes = (await import('../routes/questions.js')).default
  const responseRoutes = (await import('../routes/responses.js')).default

  app.use('/api/auth',      authRoutes)
  app.use('/api/rooms',     roomRoutes)
  app.use('/api/questions', questionRoutes)
  app.use('/api/responses', responseRoutes)

  return app
}