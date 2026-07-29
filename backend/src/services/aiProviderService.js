// aiProviderService.js
// Pure I/O layer: knows how to call each AI provider with a prompt and
// return raw text. Nothing here knows about questions, quotas, or scoring.

import { config } from '../config.js'

const FETCH_TIMEOUT_MS = 45000
function withTimeout() {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

async function generateWithMiniMax(prompt) {
  const key = (config.minimaxApiKey || '').trim().replace(/^['"]|['"]$/g, '')
  if (!key) throw new Error('MiniMax API key not configured')
  console.log(`MiniMax key prefix: "${key.slice(0, 6)}..." (len ${key.length})`)
  
  const t = withTimeout()
  const response = await fetch('https://api.minimax.io/v1/text/chatcompletion_v2', {
    method: 'POST',
    signal: t.signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'MiniMax-Text-01',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000
    })
  })
  t.clear()
  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`MiniMax API error: ${response.status} - ${errorData}`)
  }
  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''
  if (!content) {
    console.warn('MiniMax returned 200 with empty content. Full response:', JSON.stringify(data))
  }
  return content
}

async function generateWithOpenAI(prompt, model = 'gpt-4o-mini') {
  const t = withTimeout()
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: t.signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000
    })
  })
  t.clear()
  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`OpenAI API error: ${response.status} - ${errorData}`)
  }
  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

async function generateWithAnthropic(prompt, model = 'claude-sonnet-4-20250514') {
  const t = withTimeout()
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: t.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.7
    })
  })
  t.clear()
  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Anthropic API error: ${response.status} - ${errorData}`)
  }
  const data = await response.json()
  return data.content?.[0]?.text || ''
}

async function generateWithGoogle(prompt, model = 'gemini-2.0-flash') {
  const t = withTimeout()
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.googleApiKey}`, {
    method: 'POST',
    signal: t.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
    })
  })
  t.clear()
  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Google API error: ${response.status} - ${errorData}`)
  }
  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}



const PROVIDER_HANDLERS = {
  minimax: { keyName: 'minimaxApiKey', run: generateWithMiniMax },
  openai: { keyName: 'openaiApiKey', run: generateWithOpenAI },
  anthropic: { keyName: 'anthropicApiKey', run: generateWithAnthropic },
  google: { keyName: 'googleApiKey', run: generateWithGoogle }
}

const PROVIDER_LABELS = {
  minimax: 'MiniMax',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google'
}

export async function callProvider(provider, prompt) {
  const handler = PROVIDER_HANDLERS[provider]
  if (!handler) throw new Error(`Unknown provider: ${provider}`)
  if (!config[handler.keyName]) throw new Error(`${PROVIDER_LABELS[provider] || provider} API key not configured`)
  try {
    return await handler.run(prompt)
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${PROVIDER_LABELS[provider] || provider} timed out after ${FETCH_TIMEOUT_MS / 1000}s`)
    throw err
  }
}

export { PROVIDER_HANDLERS }