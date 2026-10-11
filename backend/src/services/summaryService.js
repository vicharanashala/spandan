import LectureSummary from '../models/LectureSummary.js'
import { cleanTranscript, wordCount } from '../utils/transcriptCleaner.js'
import { config } from '../config.js'

// MiniMax API call
async function generateWithMiniMax(prompt) {
  const response = await fetch('https://api.minimax.io/v1/text/chatcompletion_v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.minimaxApiKey}`
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4000
    })
  })

  if (!response.ok) {
    throw new Error(`MiniMax API error: ${response.status} - ${await response.text()}`)
  }
  const data = await response.json()
  const choice = data.choices?.[0]
  const content = choice?.message?.content || ''
  const reasoning = choice?.message?.reasoning_content || ''
  return content || reasoning
}

// OpenAI API call
async function generateWithOpenAI(prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4000
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} - ${await response.text()}`)
  }
  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

// Anthropic API call
async function generateWithAnthropic(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.7
    })
  })

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} - ${await response.text()}`)
  }
  const data = await response.json()
  return data.content?.[0]?.text || ''
}

// Google API call
async function generateWithGoogle(prompt) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${config.googleApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4000 }
    })
  })

  if (!response.ok) {
    throw new Error(`Google API error: ${response.status} - ${await response.text()}`)
  }
  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function callProvider(provider, prompt) {
  const availableProviders = []
  if (config.googleApiKey) availableProviders.push('google')
  if (config.minimaxApiKey) availableProviders.push('minimax')
  if (config.openaiApiKey) availableProviders.push('openai')
  if (config.anthropicApiKey) availableProviders.push('anthropic')

  if (availableProviders.length === 0) {
    throw new Error('No AI provider configured')
  }

  let providersToTry = [...availableProviders]
  
  if (provider && provider !== 'none') {
    providersToTry = [
      provider,
      ...availableProviders.filter(p => p !== provider)
    ]
  }

  const generators = {
    google: generateWithGoogle,
    minimax: generateWithMiniMax,
    openai: generateWithOpenAI,
    anthropic: generateWithAnthropic
  }

  let lastError = null

  for (const currentProvider of providersToTry) {
    try {
      const generator = generators[currentProvider]
      if (!generator) {
        throw new Error(`Unknown provider: ${currentProvider}`)
      }
      
      if (currentProvider === 'google' && !config.googleApiKey) throw new Error('Google API key not configured')
      if (currentProvider === 'minimax' && !config.minimaxApiKey) throw new Error('MiniMax API key not configured')
      if (currentProvider === 'openai' && !config.openaiApiKey) throw new Error('OpenAI API key not configured')
      if (currentProvider === 'anthropic' && !config.anthropicApiKey) throw new Error('Anthropic API key not configured')

      const text = await generator(prompt)
      return { text, provider: currentProvider }
    } catch (err) {
      console.warn(`${currentProvider.charAt(0).toUpperCase() + currentProvider.slice(1)} provider failed, trying next provider:`, err.message)
      lastError = err
    }
  }

  throw new Error(`All configured AI providers failed. Last error: ${lastError?.message}`)
}

export const createAndSummarize = async ({ title, rawText, teacherId, roomId, provider }) => {
  const cleanedText = cleanTranscript(rawText)
  
  if (cleanedText.length < 80) {
    throw new Error('Transcript is too short after cleaning (must be at least 80 characters)')
  }

  // Soft-cap at ~120k chars
  const cappedText = cleanedText.length > 120000 ? cleanedText.slice(0, 120000) + '... (truncated)' : cleanedText

  const prompt = `You are an expert AI assistant that summarizes lecture transcripts.
Read the following transcript and generate a summary containing exactly one executive overview paragraph and 4 to 6 structured key takeaways.

OUTPUT FORMAT:
You MUST respond ONLY with valid JSON. Do not include markdown formatting or additional text outside the JSON.
{
  "overview": "A single paragraph summarizing the main topic and purpose of the lecture.",
  "keyTakeaways": [
    "First key takeaway...",
    "Second key takeaway...",
    "Third key takeaway...",
    "Fourth key takeaway..."
  ]
}

TRANSCRIPT:
${cappedText}`

  const summary = new LectureSummary({
    title,
    teacherId,
    roomId: roomId || null,
    originalText: rawText,
    cleanedText,
    wordCount: wordCount(cleanedText),
    status: 'draft'
  })

  await summary.save()

  try {
    const response = await callProvider(provider, prompt)
    summary.provider = response.provider
    
    // Parse response
    let jsonStr = response.text
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }
    
    const objMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!objMatch) {
      throw new Error('No JSON object found in response')
    }
    
    const parsed = JSON.parse(objMatch[0])
    
    if (!parsed.overview || !Array.isArray(parsed.keyTakeaways)) {
      throw new Error('Invalid JSON structure: missing overview or keyTakeaways')
    }
    
    summary.overview = parsed.overview
    summary.keyTakeaways = parsed.keyTakeaways
    summary.status = 'ready'
    
    await summary.save()
    return summary
  } catch (error) {
    summary.status = 'failed'
    summary.errorMessage = error.message || 'Unknown error during summarization'
    await summary.save()
    return summary
  }
}

export const listForTeacher = async (teacherId) => {
  return LectureSummary.find({ teacherId })
    .select('-originalText -cleanedText')
    .sort({ createdAt: -1 })
}

export const listPublished = async () => {
  return LectureSummary.find({ published: true, status: 'ready' })
    .select('-originalText -cleanedText')
    .populate('teacherId', 'name email')
    .sort({ createdAt: -1 })
}

export const getByIdForUser = async (id, user) => {
  const summary = await LectureSummary.findById(id).populate('teacherId', 'name email')
  if (!summary) {
    throw new Error('Summary not found')
  }

  const isOwner = user.role === 'teacher' && summary.teacherId._id.toString() === user._id.toString()
  const isPublishedAndReady = summary.published && summary.status === 'ready'

  if (!isOwner && !isPublishedAndReady) {
    throw new Error('Not authorized to view this summary')
  }

  return summary
}

export const setPublished = async (id, teacherId, published) => {
  const summary = await LectureSummary.findById(id)
  if (!summary) {
    throw new Error('Summary not found')
  }
  
  if (summary.teacherId.toString() !== teacherId.toString()) {
    throw new Error('Not authorized to publish this summary')
  }

  if (published && summary.status !== 'ready') {
    throw new Error('Can only publish ready summaries')
  }

  summary.published = published
  await summary.save()
  
  return summary
}

export const deleteSummary = async (id, teacherId) => {
  const summary = await LectureSummary.findById(id)
  if (!summary) {
    throw new Error('Summary not found')
  }

  if (summary.teacherId.toString() !== teacherId.toString()) {
    throw new Error('Not authorized to delete this summary')
  }

  await LectureSummary.findByIdAndDelete(id)
  return true
}

export const askQuestionAboutLecture = async ({ summaryId, user, question, provider }) => {
  await getByIdForUser(summaryId, user)
  
  const summary = await LectureSummary.findById(summaryId).select('+cleanedText +originalText')
  if (!summary) {
    throw new Error('Summary not found')
  }

  const text = summary.cleanedText || summary.originalText || ''
  if (!text) {
    throw new Error('No transcript available for this lecture')
  }

  const cappedText = text.length > 120000 ? text.slice(0, 120000) + '... (truncated)' : text
  
  const prompt = `You are an expert academic course tutor answering a student question.
Answer the question accurately and concisely based strictly on the lecture transcript provided below.
If the topic is not mentioned or cannot be inferred from the transcript, politely state that it was not covered in this lecture.

TRANSCRIPT CONTEXT:
${cappedText}

STUDENT QUESTION:
${question.trim()}`

  const response = await callProvider(provider, prompt)
  
  return {
    answer: response.text,
    provider: response.provider
  }
}
