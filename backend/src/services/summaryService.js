import { config } from '../config.js'

const cleanTextOffline = (text) => {
  if (!text) return ''
  return text
    .replace(/\[[A-Z0-9_\s-]+\]/gi, '') // Remove [BLANK_AUDIO], [COUGH] etc.
    .replace(/\s+/g, ' ')               // Normalize whitespace
    .trim()
}

// Google Gemini API call
async function summarizeWithGoogle(text, model = 'gemini-2.0-flash') {
  const prompt = `Create a concise, structured bullet-point summary of the following lecture transcript segment. Clean up any grammatical errors, spoken filler words, or audio artifacts. Respond only with the summary, no introductory remarks.\n\nTRANSCRIPT:\n${text}`
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.googleApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 500 }
    })
  })
  if (!response.ok) throw new Error(`Google API error: ${response.status}`)
  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// OpenAI API call
async function summarizeWithOpenAI(text, model = 'gpt-4o-mini') {
  const prompt = `Create a concise, structured bullet-point summary of the following lecture transcript segment. Clean up any grammatical errors, spoken filler words, or audio artifacts. Respond only with the summary, no introductory remarks.\n\nTRANSCRIPT:\n${text}`
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 500
    })
  })
  if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`)
  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

// MiniMax API call
async function summarizeWithMiniMax(text) {
  const prompt = `Create a concise, structured bullet-point summary of the following lecture transcript segment. Clean up any grammatical errors, spoken filler words, or audio artifacts. Respond only with the summary, no introductory remarks.\n\nTRANSCRIPT:\n${text}`
  const response = await fetch('https://api.minimax.io/v1/text/chatcompletion_v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.minimaxApiKey}`
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 500
    })
  })
  if (!response.ok) throw new Error(`MiniMax API error: ${response.status}`)
  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

// Anthropic API call
async function summarizeWithAnthropic(text, model = 'claude-sonnet-4-20250514') {
  const prompt = `Create a concise, structured bullet-point summary of the following lecture transcript segment. Clean up any grammatical errors, spoken filler words, or audio artifacts. Respond only with the summary, no introductory remarks.\n\nTRANSCRIPT:\n${text}`
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.5
    })
  })
  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`)
  const data = await response.json()
  return data.content?.[0]?.text || ''
}

/**
 * Main summary function
 * Cleans the raw transcript and uses AI if credentials exist, otherwise falls back to a clean text structure.
 */
export const generateSummary = async (transcriptText) => {
  const cleaned = cleanTextOffline(transcriptText)
  if (!cleaned) return ''

  try {
    if (config.googleApiKey) {
      return await summarizeWithGoogle(cleaned)
    }
    if (config.openaiApiKey) {
      return await summarizeWithOpenAI(cleaned)
    }
    if (config.minimaxApiKey) {
      return await summarizeWithMiniMax(cleaned)
    }
    if (config.anthropicApiKey) {
      return await summarizeWithAnthropic(cleaned)
    }
  } catch (err) {
    console.error('[summaryService] AI summarization failed, returning offline cleaned text:', err)
  }

  // Offline formatting fallback if no keys are found
  return cleaned
}
