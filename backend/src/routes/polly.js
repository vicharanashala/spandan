// Polly routes - admin(teacher)-only, plus a public webhook the Attendee bot calls with transcript
// and active-speaker events. Lets an admin drive the Polly meeting bot from the dashboard: join a
// meeting, manage all meeting/poll settings, run polls (manually or automatically on a timeline),
// send notifications and speaker wrap-up nudges, and remove the bot.
//
// Attendee credentials are provided by the admin. For manual actions they are used per-request only.
// For an AUTOMATIC session they are held in memory for the life of that session (so the timeline can
// act on its own) and dropped when the bot leaves. They are never persisted to disk or logged.

import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { generateQuestions, AI_PROVIDERS } from '../services/questionService.js'
import { createBot, getBotStatus, sendChat, getParticipants, leaveBot } from '../services/pollyService.js'
import { PollySession } from '../services/pollyOrchestrator.js'

export const DEFAULT_SETTINGS = {
  pollMinutes: '12,25', pollTrigger: 'manual', showTimer: true, showCountdown: true, countdownSecs: 15,
  qTypes: { MCQ: true, TF: true, FITB: false },
  notifyMode: 'manual', headsUp: true, headsUpLeadSec: 30, notifyEveryone: true, notifySpeaker: true,
  wrapUpNudge: true, pauseEndGuidance: true,
  breaksEnabled: true, breakEveryMin: 25, breakLengthMin: 5,
}

// Per-bot session state (in-memory; not shared across cluster workers or restarts - MVP).
//   { creds, settings, provider, difficulty, topic, transcript:[], currentSpeaker, session:PollySession|null }
const sessions = new Map()

function headsUpText(s) {
  return `Poll coming up in about ${s.headsUpLeadSec || 30} seconds - please get ready.`
}
function wrapUpText(s) {
  const base = "Heads-up: we'll pause for a quick poll shortly - please find a natural stopping point."
  const guidance = ' To pause: finish your current thought and hand over. To end: sum up your key point in one line.'
  return s.pauseEndGuidance ? base + guidance : base
}
function formatPoll(q) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F']
  const lines = (q.options || []).map((o, i) => `${letters[i]}) ${o.text ?? o}`)
  return [`Poll: ${q.question}`, ...lines].join('\n')
}

// Actions the automatic timeline calls. They close over the live session state so they always use the
// latest settings, transcript, and current speaker.
function buildActions(botId) {
  const S = () => sessions.get(botId)
  return {
    headsUp: async () => {
      const st = S(); if (!st) return
      const msg = headsUpText(st.settings)
      if (st.settings.notifyEveryone) await sendChat({ botId, message: msg, ...st.creds })
      if (st.settings.notifySpeaker && st.currentSpeaker) await sendChat({ botId, message: msg, to: 'specific_user', toUserUuid: st.currentSpeaker, ...st.creds })
    },
    speakerNudge: async () => {
      const st = S(); if (!st || !st.settings.wrapUpNudge) return
      const msg = wrapUpText(st.settings)
      if (st.currentSpeaker && st.settings.notifySpeaker) await sendChat({ botId, message: msg, to: 'specific_user', toUserUuid: st.currentSpeaker, ...st.creds })
      else if (st.settings.notifyEveryone) await sendChat({ botId, message: msg, ...st.creds })
    },
    countdown: async (secs) => {
      const st = S(); if (!st) return
      await sendChat({ botId, message: `Poll starting in about ${secs} seconds - get ready.`, ...st.creds })
    },
    postPoll: async () => {
      const st = S(); if (!st) return
      const source = (st.transcript.join(' ').slice(-4000) || st.topic || '').trim()
      if (!source) return // nothing to generate from yet (no transcript and no topic)
      const [q] = await generateQuestions(source, { numQuestions: 1, difficulty: st.difficulty || 'medium', provider: st.provider })
      if (q) await sendChat({ botId, message: formatPoll(q), ...st.creds })
    },
    announceBreak: async (min) => {
      const st = S(); if (!st) return
      await sendChat({ botId, message: `Time for a short break - back in about ${min} minutes.`, ...st.creds })
    },
  }
}

function startAuto(botId) {
  const st = sessions.get(botId); if (!st) return
  if (st.session) st.session.stop()
  st.session = new PollySession({ botId, settings: st.settings, actions: buildActions(botId), log: (m) => console.log('[polly]', m) })
  st.session.start()
}
function stopAuto(botId) {
  const st = sessions.get(botId); if (st?.session) { st.session.stop(); st.session = null }
}
const autoWanted = (s) => s.pollTrigger === 'auto' || s.notifyMode === 'auto'

// ---- Public webhook: Attendee posts transcript + active-speaker events here (no auth) ----
export const webhookRouter = express.Router()
webhookRouter.post('/', (req, res) => {
  try {
    const { trigger, data } = req.body || {}
    const st = data?.bot_id && sessions.get(data.bot_id)
    if (st) {
      if (trigger === 'transcript.update') {
        const text = data.transcription?.transcript
        if (text) { st.transcript.push(text); if (st.transcript.length > 300) st.transcript.shift() }
        if (data.speaker_uuid) st.currentSpeaker = data.speaker_uuid
      } else if (trigger === 'participant_events.speech_start_stop') {
        if (!data.event_type || data.event_type === 'speech_start') st.currentSpeaker = data.participant_uuid || st.currentSpeaker
      }
    }
  } catch { /* ignore malformed */ }
  res.json({ ok: true })
})

// ---- Authenticated, teacher-only API ----
const router = express.Router()
router.use(authenticate)
router.use(authorize('teacher'))

const creds = (b) => ({ apiKey: b.attendeeApiKey, baseUrl: b.attendeeBaseUrl })

router.get('/providers', (req, res) => res.json({ success: true, providers: AI_PROVIDERS }))

router.post('/join', async (req, res) => {
  try {
    const { meetingUrl, botName, settings, provider = 'minimax', difficulty = 'medium', topic } = req.body
    if (!meetingUrl) return res.status(400).json({ success: false, error: 'meetingUrl is required' })
    if (!req.body.attendeeApiKey) return res.status(400).json({ success: false, error: 'Attendee API key is required' })

    // A public https URL lets the bot stream transcript + speaker events back for the auto engine.
    const publicUrl = process.env.POLLY_PUBLIC_URL
    const webhookUrl = publicUrl && /^https:\/\//i.test(publicUrl) ? `${publicUrl.replace(/\/$/, '')}/api/polly/webhook` : undefined

    const bot = await createBot({ meetingUrl, botName, webhookUrl, ...creds(req.body) })
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) }
    sessions.set(bot.id, { creds: creds(req.body), settings: merged, provider, difficulty, topic: topic || '', transcript: [], currentSpeaker: null, session: null })
    try { await sendChat({ botId: bot.id, message: "Polly is here - I'll run the live polls.", ...creds(req.body) }) } catch { /* non-fatal */ }
    if (autoWanted(merged)) startAuto(bot.id)

    res.status(201).json({ success: true, bot: { id: bot.id, state: bot.state }, settings: merged, auto: autoWanted(merged), transcription: !!webhookUrl })
  } catch (error) {
    res.status(502).json({ success: false, error: error.message })
  }
})

router.post('/config', (req, res) => {
  const { botId, settings, topic, provider, difficulty } = req.body
  const st = botId && sessions.get(botId)
  if (!st) return res.status(404).json({ success: false, error: 'No active Polly session for that bot' })
  st.settings = { ...st.settings, ...(settings || {}) }
  if (topic !== undefined) st.topic = topic
  if (provider) st.provider = provider
  if (difficulty) st.difficulty = difficulty
  if (autoWanted(st.settings)) startAuto(botId); else stopAuto(botId)
  res.json({ success: true, settings: st.settings, auto: autoWanted(st.settings) })
})

router.post('/auto/start', (req, res) => {
  const st = req.body.botId && sessions.get(req.body.botId)
  if (!st) return res.status(404).json({ success: false, error: 'No active Polly session' })
  startAuto(req.body.botId)
  res.json({ success: true, auto: true })
})
router.post('/auto/stop', (req, res) => {
  stopAuto(req.body.botId)
  res.json({ success: true, auto: false })
})

router.post('/status', async (req, res) => {
  try {
    const bot = await getBotStatus({ botId: req.body.botId, ...creds(req.body) })
    const st = sessions.get(req.body.botId)
    res.json({ success: true, bot: { id: bot.id, state: bot.state, transcriptionState: bot.transcription_state }, auto: !!st?.session?.isRunning(), currentSpeaker: st?.currentSpeaker || null })
  } catch (error) {
    res.status(502).json({ success: false, error: error.message })
  }
})

router.post('/participants', async (req, res) => {
  try {
    const participants = await getParticipants({ botId: req.body.botId, ...creds(req.body) })
    res.json({ success: true, participants })
  } catch (error) {
    res.status(502).json({ success: false, error: error.message })
  }
})

// Manual notification / speaker nudge (honours settings).
router.post('/notify', async (req, res) => {
  try {
    const { botId, kind, speakerUuid } = req.body
    const st = sessions.get(botId) || { settings: DEFAULT_SETTINGS }
    const s = st.settings
    const c = creds(req.body)
    const target = speakerUuid || st.currentSpeaker
    const sent = []
    if (kind === 'wrapup') {
      if (!s.wrapUpNudge) return res.json({ success: true, sent, note: 'Speaker nudge is turned off in settings' })
      const message = wrapUpText(s)
      if (target && s.notifySpeaker) { await sendChat({ botId, message, to: 'specific_user', toUserUuid: target, ...c }); sent.push('speaker') }
      else if (s.notifyEveryone) { await sendChat({ botId, message, ...c }); sent.push('everyone') }
    } else {
      if (!s.headsUp) return res.json({ success: true, sent, note: 'Heads-up is turned off in settings' })
      const message = headsUpText(s)
      if (s.notifyEveryone) { await sendChat({ botId, message, ...c }); sent.push('everyone') }
      if (s.notifySpeaker && target) { await sendChat({ botId, message, to: 'specific_user', toUserUuid: target, ...c }); sent.push('speaker') }
    }
    res.json({ success: true, sent })
  } catch (error) {
    res.status(502).json({ success: false, error: error.message })
  }
})

// Generate a poll now and post it to chat (uses the given topic/transcript, else the session transcript).
router.post('/poll', async (req, res) => {
  try {
    const { botId, transcript, topic, provider = 'minimax', difficulty = 'medium' } = req.body
    const st = sessions.get(botId)
    const source = (transcript || topic || (st ? st.transcript.join(' ').slice(-4000) : '') || (st && st.topic) || '').trim()
    if (!botId) return res.status(400).json({ success: false, error: 'botId is required' })
    if (!source) return res.status(400).json({ success: false, error: 'Provide a topic or transcript (or wait for live transcription) to generate a poll' })

    const [question] = await generateQuestions(source, { numQuestions: 1, difficulty, provider })
    if (!question) return res.status(500).json({ success: false, error: 'No question generated' })
    await sendChat({ botId, message: formatPoll(question), ...creds(req.body) })
    res.json({ success: true, question })
  } catch (error) {
    res.status(502).json({ success: false, error: error.message })
  }
})

router.post('/leave', async (req, res) => {
  try {
    stopAuto(req.body.botId)
    await leaveBot({ botId: req.body.botId, ...creds(req.body) })
    sessions.delete(req.body.botId)
    res.json({ success: true })
  } catch (error) {
    res.status(502).json({ success: false, error: error.message })
  }
})

export default router
