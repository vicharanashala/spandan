// Polly routes — admin(teacher)-only. Lets an admin send the Polly bot into a meeting from the
// dashboard, post AI-generated poll questions into the meeting chat, and remove it.
// Every route requires the 'teacher' role (Spandan's privileged/admin role), so students never see it.
//
// Attendee credentials (API key + base URL) are provided by the admin in the request body and used
// transiently — they are never stored or logged.

import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { generateQuestions, AI_PROVIDERS } from '../services/questionService.js'
import { createBot, getBotStatus, sendChat, leaveBot } from '../services/pollyService.js'

const router = express.Router()

router.use(authenticate)
router.use(authorize('teacher')) // admin-only for the whole feature

// Which AI providers the server has keys for — the panel uses this to offer the same AI the admin
// uses elsewhere in Spandan.
router.get('/providers', (req, res) => {
  res.json({ success: true, providers: AI_PROVIDERS })
})

const creds = (b) => ({ apiKey: b.attendeeApiKey, baseUrl: b.attendeeBaseUrl })

// Render a generated question as a plain-text poll for the meeting chat.
function formatPoll(q) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F']
  const lines = (q.options || []).map((o, i) => `${letters[i]}) ${o.text ?? o}`)
  return [`Poll: ${q.question}`, ...lines].join('\n')
}

// Send the bot into a meeting.
router.post('/join', async (req, res) => {
  try {
    const { meetingUrl, botName } = req.body
    if (!meetingUrl) return res.status(400).json({ success: false, error: 'meetingUrl is required' })
    if (!req.body.attendeeApiKey) return res.status(400).json({ success: false, error: 'Attendee API key is required' })

    const bot = await createBot({ meetingUrl, botName, ...creds(req.body) })
    // Friendly hello so it's clear Polly joined.
    try { await sendChat({ botId: bot.id, message: "Polly is here — I'll run the live polls.", ...creds(req.body) }) } catch { /* non-fatal */ }

    res.status(201).json({ success: true, bot: { id: bot.id, state: bot.state } })
  } catch (error) {
    res.status(502).json({ success: false, error: error.message })
  }
})

// Poll the bot's state.
router.post('/status', async (req, res) => {
  try {
    const bot = await getBotStatus({ botId: req.body.botId, ...creds(req.body) })
    res.json({ success: true, bot: { id: bot.id, state: bot.state, transcriptionState: bot.transcription_state } })
  } catch (error) {
    res.status(502).json({ success: false, error: error.message })
  }
})

// Generate a poll with the admin's AI provider and post it into the meeting chat.
router.post('/poll', async (req, res) => {
  try {
    const { botId, transcript, topic, provider = 'minimax', difficulty = 'medium' } = req.body
    const source = (transcript || topic || '').trim()
    if (!botId) return res.status(400).json({ success: false, error: 'botId is required' })
    if (!source) return res.status(400).json({ success: false, error: 'Provide a topic or transcript to generate a poll from' })

    const [question] = await generateQuestions(source, { numQuestions: 1, difficulty, provider })
    if (!question) return res.status(500).json({ success: false, error: 'No question generated' })

    await sendChat({ botId, message: formatPoll(question), ...creds(req.body) })
    res.json({ success: true, question })
  } catch (error) {
    res.status(502).json({ success: false, error: error.message })
  }
})

// Remove the bot from the meeting.
router.post('/leave', async (req, res) => {
  try {
    await leaveBot({ botId: req.body.botId, ...creds(req.body) })
    res.json({ success: true })
  } catch (error) {
    res.status(502).json({ success: false, error: error.message })
  }
})

export default router
