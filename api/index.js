import { app, ensureDbConnected } from '../backend/src/index.js'

export default async function handler(req, res) {
  try {
    await ensureDbConnected()
    return app(req, res)
  } catch (err) {
    console.error('Vercel Handler Error:', err)
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal Server Error', message: err.message })
    }
  }
}
