// Polly service — thin client over the self-hosted/hosted Attendee meeting-bot API.
// Lets an admin send a bot into a Zoom/Meet meeting from the Spandan dashboard, post chat, and leave.
// Credentials (Attendee API key + base URL) are supplied per request by the admin, not stored here.
//
// Attendee API: create bot POST /api/v1/bots ; chat POST /api/v1/bots/{id}/send_chat_message ;
// status GET /api/v1/bots/{id} ; leave POST /api/v1/bots/{id}/leave. Auth: `Authorization: Token <key>`.

const DEFAULT_BASE_URL = 'https://app.attendee.dev'

// Attendee chat rejects non-BMP characters (most emoji) with a 400 - strip them.
export function sanitizeChat(text = '') {
  return [...String(text)]
    .filter((ch) => ch.codePointAt(0) <= 0xffff)
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function client({ apiKey, baseUrl }) {
  if (!apiKey) throw new Error('Attendee API key is required')
  const base = `${(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')}/api/v1`
  const headers = { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' }
  return async (method, path, body) => {
    const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { /* non-JSON */ }
    if (!res.ok) {
      const msg = data?.error || data?.detail || text || `HTTP ${res.status}`
      throw new Error(`Attendee ${method} ${path} → ${res.status}: ${msg}`)
    }
    return data
  }
}

/** Send a bot into a meeting. Returns { id, state, ... }. */
export async function createBot({ meetingUrl, botName = 'Polly', apiKey, baseUrl }) {
  if (!meetingUrl) throw new Error('meetingUrl is required')
  const req = client({ apiKey, baseUrl })
  return req('POST', '/bots', { meeting_url: meetingUrl, bot_name: botName })
}

/** Current bot state ({ id, state, transcription_state, ... }). */
export async function getBotStatus({ botId, apiKey, baseUrl }) {
  if (!botId) throw new Error('botId is required')
  return client({ apiKey, baseUrl })('GET', `/bots/${botId}`)
}

/** Post a chat message to everyone in the meeting (emoji stripped). */
export async function sendChat({ botId, message, apiKey, baseUrl }) {
  if (!botId) throw new Error('botId is required')
  return client({ apiKey, baseUrl })('POST', `/bots/${botId}/send_chat_message`, {
    to: 'everyone',
    message: sanitizeChat(message),
  })
}

/** Make the bot leave the meeting. */
export async function leaveBot({ botId, apiKey, baseUrl }) {
  if (!botId) throw new Error('botId is required')
  return client({ apiKey, baseUrl })('POST', `/bots/${botId}/leave`, {})
}
