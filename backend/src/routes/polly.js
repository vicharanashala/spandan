// Polly routes - admin(teacher)-only. Lets an admin drive the Polly meeting bot from the dashboard:
// send it into a meeting, manage the meeting/poll settings, post AI-generated poll questions, send
// notifications and speaker wrap-up nudges via chat, and remove the bot.
// Every route requires the 'teacher' role (Spandan's privileged/admin role), so students never see it.
//
// Attendee credentials (API key + base URL) are provided by the admin in the request body and used
// transiently - they are never stored or logged.

import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { generateQuestions, AI_PROVIDERS } from '../services/questionService.js'
import { createBot, getBotStatus, sendChat, getParticipants, leaveBot } from '../services/pollyService.js'

const router = express.Router()

router.use(authenticate)
router.use(authorize('teacher')) // admin-only for the whole feature

// Default meeting/poll settings the panel manages. Stored per bot for the life of the session.
export const DEFAULT_SETTINGS = {
  pollMinutes: '12,25',      // which meeting minutes to run polls at
  pollTrigger: 'manual',     // 'auto' | 'manual' - fire polls on schedule or by hand
  showTimer: true,           // show an always-on meeting timer
  showCountdown: true,       // show a poll countdown (e.g. 15/10/5s)
  countdownSecs: 15,
  qTypes: { MCQ: true, TF: true, FITB: false }, // question types the AI may produce
  notifyMode: 'manual',      // 'auto' | 'manual' - send notifications on schedule or by hand
  headsUp: true,             // broadcast a "poll coming soon" heads-up
  headsUpLeadSec: 30,
  notifyEveryone: true,      // send notifications to everyone in chat
  notifySpeaker: true,       // also send them privately to the current speaker
  wrapUpNudge: true,         // privately nudge the current speaker to wrap up before a poll
  pauseEndGuidance: true,    // include "how to pause / end" guidance in the speaker nudge
  breaksEnabled: true,       // schedule breaks
  breakEveryMin: 25,
  breakLengthMin: 5,
}

// In-memory settings per bot. (MVP - not persisted across restarts or shared across cluster workers.)
const botSettings = new Map()

const creds = (b) => ({ apiKey: b.attendeeApiKey, baseUrl: b.attendeeBaseUrl })

function headsUpText(s) {
  return `Poll coming up in about ${s.headsUpLeadSec || 30} seconds - please get ready.`
}
function wrapUpText(s) {
  const base = "Heads-up: we'll pause for a quick poll shortly - please find a natural stopping point."
  const guidance = ' To pause: finish your current thought and hand over. To end: sum up your key point in one line.'
  return s.pauseEndGuidance ? base + guidance : base
}

// Render a generated question as a plain-text poll for the meeting chat.
function formatPoll(q) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F']
  const lines = (q.options || []).map((o, i) => `${letters[i]}) ${o.text ?? o}`)
  return [`Poll: ${q.question}`, ...lines].join('\n')
}

// AI providers the server has keys for.
router.get('/providers', (req, res) => {
  res.json({ success: true, providers: AI_PROVIDERS })
})

// Send the bot into a meeting (optionally with settings).
router.post('/join', async (req, res) => {
  try {
    const { meetingUrl, botName, settings } = req.body
    if (!meetingUrl) return res.status(400).json({ success: false, error: 'meetingUrl is required' })
    if (!req.body.attendeeApiKey) return res.status(400).json({ success: false, error: 'Attendee API key is required' })

    const bot = await createBot({ meetingUrl, botName, ...creds(req.body) })
    botSettings.set(bot.id, { ...DEFAULT_SETTINGS, ...(settings || {}) })
    try { await sendChat({ botId: bot.id, message: "Polly is here - I'll run the live polls.", ...creds(req.body) }) } catch { /* non-fatal */ }

    res.status(201).json({ success: true, bot: { id: bot.id, state: bot.state }, settings: botSettings.get(bot.id) })
  } catch (error) {
    res.status(502).json({ success: false, error: error.message })
  }
})

// Read/update the settings for a running bot.
router.post('/config', (req, res) => {
  const { botId, settings } = req.body
  if (!botId) return res.status(400).json({ success: false, error: 'botId is required' })
  const merged = { ...DEFAULT_SETTINGS, ...(botSettings.get(botId) || {}), ...(settings || {}) }
  botSettings.set(botId, merged)
  res.json({ success: true, settings: merged })
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

// List meeting participants (to pick the current speaker for a private nudge).
router.post('/participants', async (req, res) => {
  try {
    const participants = await getParticipants({ botId: req.body.botId, ...creds(req.body) })
    res.json({ success: true, participants })
  } catch (error) {
    res.status(502).json({ success: false, error: error.message })
  }
})

// Send a notification / speaker nudge, honouring the stored settings.
//   kind = 'headsup' : broadcast a "poll coming soon" heads-up (to everyone and/or the speaker)
//   kind = 'wrapup'  : privately nudge the current speaker to wrap up (with pause/end guidance)
router.post('/notify', async (req, res) => {
  try {
    const { botId, kind, speakerUuid } = req.body
    if (!botId) return res.status(400).json({ success: false, error: 'botId is required' })
    const s = botSettings.get(botId) || DEFAULT_SETTINGS
    const c = creds(req.body)
    const sent = []

    if (kind === 'wrapup') {
      if (!s.wrapUpNudge) return res.json({ success: true, sent, note: 'Speaker nudge is turned off in settings' })
      const message = wrapUpText(s)
      if (speakerUuid && s.notifySpeaker) { await sendChat({ botId, message, to: 'specific_user', toUserUuid: speakerUuid, ...c }); sent.push('speaker') }
      else if (s.notifyEveryone) { await sendChat({ botId, message, ...c }); sent.push('everyone') }
    } else {
      // heads-up
      if (!s.headsUp) return res.json({ success: true, sent, note: 'Heads-up is turned off in settings' })
      const message = headsUpText(s)
      if (s.notifyEveryone) { await sendChat({ botId, message, ...c }); sent.push('everyone') }
      if (s.notifySpeaker && speakerUuid) { await sendChat({ botId, message, to: 'specific_user', toUserUuid: speakerUuid, ...c }); sent.push('speaker') }
    }
    res.json({ success: true, sent })
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
    botSettings.delete(req.body.botId)
    res.json({ success: true })
  } catch (error) {
    res.status(502).json({ success: false, error: error.message })
  }
})

export default router
