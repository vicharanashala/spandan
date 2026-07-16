import dotenv from 'dotenv'
dotenv.config()
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import Room from '../models/Room.js'
import { config, AI_PROVIDERS } from '../config.js'

// Re-export for convenience
export { AI_PROVIDERS }

export const createQuestion = async (data, createdBy) => {
  const question = new Question({
    roomId: data.roomId,  // Use roomId to match Question model
    question: data.question,
    options: data.options,
    type: data.type || 'MCQ',
    status: data.status || 'pending',  // pending for manual, approved for AI
    segmentIndex: data.segmentIndex || 0,
    timeToAnswer: data.timer || data.timeToAnswer || 30,
    points: data.points || 100,
    createdBy
  })

  await question.save()
  return question
}

export const getQuestionById = async (id) => {
  const question = await Question.findById(id).populate('createdBy', 'name email')
  
  if (!question) {
    throw new Error('Question not found')
  }
  
  return question
}

export const getQuestionsByRoom = async (roomId) => {
  return Question.find({ roomId: roomId }).sort({ createdAt: 1 })
}

export const updateQuestion = async (questionId, updates, userId) => {
  const question = await Question.findById(questionId)
  
  if (!question) {
    throw new Error('Question not found')
  }
  
  // Check ownership
  if (question.createdBy.toString() !== userId.toString()) {
    throw new Error('Not authorized to update this question')
  }
  
  Object.assign(question, updates)
  await question.save()
  
  return question
}

export const deleteQuestion = async (questionId, userId) => {
  const question = await Question.findById(questionId)
  
  if (!question) {
    throw new Error('Question not found')
  }
  
  if (question.createdBy.toString() !== userId.toString()) {
    throw new Error('Not authorized to delete this question')
  }
  
  await Question.findByIdAndDelete(questionId)
  
  // Also delete related responses
  await Response.deleteMany({ questionId: questionId })
  
  return true
}

export const setActiveQuestion = async (roomId, questionId) => {
  // Deactivate all questions in the room
  await Question.updateMany(
    { roomId: roomId },
    { $set: { isActive: false } }
  )
  
  // Activate the specified question
  const question = await Question.findByIdAndUpdate(
    questionId,
    { $set: { isActive: true } },
    { new: true }
  )
  
  if (!question) {
    throw new Error('Question not found')
  }
  
  // Update room's currentQuestion
  await Room.findByIdAndUpdate(roomId, { currentQuestion: questionId })
  
  return question
}

export const submitResponse = async (data, studentId) => {
  const { questionId, selectedOption, responseTime } = data
  
  // Get the question to check correct answer
  const question = await Question.findById(questionId)
  
  if (!question) {
    throw new Error('Question not found')
  }
  
  const isCorrect = selectedOption === question.correctOptionIndex
  
  const response = new Response({
    questionId: questionId,
    roomId: question.roomId,
    studentId: studentId,
    selectedOption,
    isCorrect,
    responseTime
  })

  await response.save()
  
  return response
}

export const getResponsesByQuestion = async (questionId) => {
  return Response.find({ questionId })
    .populate('studentId', 'name email')
    .sort({ createdAt: -1 })
}

export const getResponsesByRoom = async (roomId) => {
  return Response.find({ roomId: roomId })
    .populate('studentId', 'name email')
    .sort({ createdAt: -1 })
}

export const getQuestionResults = async (questionId) => {
  const aggregation = await Response.aggregate([
    { $match: { questionId: new (await import('mongoose')).default.Types.ObjectId(questionId) } },
    {
      $group: {
        _id: '$selectedOption',
        count: { $sum: 1 },
        correctCount: { $sum: { $cond: ['$isCorrect', 1, 0] } }
      }
    }
  ])

  if (aggregation.length === 0) {
    return { totalResponses: 0, results: {}, correctPercentage: 0 }
  }

  const results = {}
  let totalResponses = 0
  let correctCount = 0

  aggregation.forEach(bucket => {
    results[bucket._id] = bucket.count
    totalResponses += bucket.count
    correctCount += bucket.correctCount
  })

  return {
    totalResponses,
    results,
    correctPercentage: Math.round((correctCount / totalResponses) * 100)
  }
}

// Question Type Mix helper
function getQuestionTypeMix(numQuestions) {
  const types = []
  
  if (numQuestions === 1) {
    types.push('MCQ')
  } else if (numQuestions === 2) {
    types.push('MCQ', 'TF')
  } else if (numQuestions === 3) {
    types.push('MCQ', 'TF', 'MSQ')
  } else {
    const mcqCount = Math.round(numQuestions * 0.5)
    const tfCount = Math.round(numQuestions * 0.3)
    const msqCount = numQuestions - mcqCount - tfCount
    
    for (let i = 0; i < mcqCount; i++) types.push('MCQ')
    for (let i = 0; i < tfCount; i++) types.push('TF')
    for (let i = 0; i < msqCount; i++) types.push('MSQ')
  }
  
  return types.slice(0, numQuestions)
}

// Generate question types from provided mix percentages
function generateFromMix(questionTypeMix, numQuestions) {
  const { MCQ = 0, TF = 100, MSQ = 0 } = questionTypeMix
  const total = MCQ + TF + MSQ

  // Guard against an all-zero mix (avoids divide-by-zero → NaN counts)
  if (total <= 0) {
    return getQuestionTypeMix(numQuestions)
  }

  const mcqCount = Math.round((MCQ / total) * numQuestions)
  const tfCount = Math.round((TF / total) * numQuestions)
  const msqCount = numQuestions - mcqCount - tfCount
  
  const types = []
  for (let i = 0; i < mcqCount; i++) types.push('MCQ')
  for (let i = 0; i < tfCount; i++) types.push('TF')
  for (let i = 0; i < msqCount; i++) types.push('MSQ')
  
  // Shuffle to mix them up nicely
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]]
  }
  
  return types.slice(0, numQuestions)
}

// Build prompt for question generation
function buildQuestionPrompt(transcript, questionTypes, difficulty) {
  const typeInstructions = questionTypes.map((type, index) => {
    switch (type) {
      case 'MCQ':
        return `${index + 1}. MCQ: Create a multiple choice question with ONE correct answer and 3 wrong options (A, B, C, D). Mark the correct answer.`
      case 'TF':
        return `${index + 1}. T/F: Create a True or False question. Mark the correct answer.`
      case 'MSQ':
        return `${index + 1}. MSQ: Create a multiple select question with multiple correct answers (2-4 correct options). Mark ALL correct options.`
      default:
        return ''
    }
  }).join('\n')

  return `You are an expert quiz question generator. Using the source material below, generate ${questionTypes.length} quiz questions.

SOURCE MATERIAL:
${transcript}

DIFFICULTY: ${difficulty.toUpperCase()}

QUESTION TYPES (follow exactly):
${typeInstructions}

OUTPUT FORMAT (respond ONLY with valid JSON):
{
  "questions": [
    {
      "type": "MCQ",
      "question": "The question text here?",
      "options": [
        { "text": "Option A", "isCorrect": true },
        { "text": "Option B", "isCorrect": false },
        { "text": "Option C", "isCorrect": false },
        { "text": "Option D", "isCorrect": false }
      ],
      "explanation": "Brief explanation of the answer"
    },
    {
      "type": "TF",
      "question": "The statement here?",
      "options": [
        { "text": "True", "isCorrect": true },
        { "text": "False", "isCorrect": false }
      ],
      "explanation": "Brief explanation"
    },
    {
      "type": "MSQ",
      "question": "The question here?",
      "options": [
        { "text": "Option A", "isCorrect": true },
        { "text": "Option B", "isCorrect": false },
        { "text": "Option C", "isCorrect": true },
        { "text": "Option D", "isCorrect": false }
      ],
      "explanation": "Brief explanation of which options are correct"
    }
  ]
}

IMPORTANT:
- Respond ONLY with valid JSON, no markdown or additional text
- Make questions clear and unambiguous
- Match the questions to the specified DIFFICULTY level
- Ensure wrong options for MCQ are plausible but clearly wrong
- For MSQ, ensure at least 2 options are correct
- Ensure all options are distinct and that ONLY the marked option(s) are correct; every unmarked option must be a plausible but genuinely incorrect distractor, with no option that could be argued as an alternative correct answer
- For True/False questions, balance the correct answers across the set — roughly half should be correct "True" and half correct "False"; do not make most statements True (or most False)
- Base questions ONLY on the source material provided
- Rely solely on the material given, do not use any outside knowledge
- Questions and options MUST be self-contained and stand on their own as direct subject-knowledge questions
- NEVER refer to the source in the wording. Do NOT use words like "transcript", "transcription", "passage", "text", "excerpt", "recording", "lecture", "session", "audio", or "context", and do NOT use phrases such as "According to the transcript", "As per the transcript", "Based on the passage", "In the text", "the speaker said", or "mentioned above"
- Write each question as if directly testing the concept itself, not a document`
}

// Fix common JSON issues from AI responses (trailing commas, etc.)
function fixJsonString(str) {
  // Remove trailing commas before ] or }
  let fixed = str.replace(/,\s*([}\]])/g, '$1')
  // Remove any control characters except newlines/tabs
  fixed = fixed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  return fixed
}

// Parse questions from AI response
function parseQuestions(responseText, expectedTypes) {
  try {
    let jsonStr = responseText
    
    // Try extracting from markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }
    
    // Find the JSON object
    const objMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!objMatch) {
      throw new Error('No JSON found in response')
    }
    
    let jsonCandidate = objMatch[0]
    
    // Try parsing as-is first
    let parsed
    try {
      parsed = JSON.parse(jsonCandidate)
    } catch (e) {
      // If it fails, try fixing common issues
      console.log('Initial JSON parse failed, attempting to fix...')
      jsonCandidate = fixJsonString(jsonCandidate)
      parsed = JSON.parse(jsonCandidate)
    }
    
    const questions = parsed.questions || []
    
    if (questions.length === 0) {
      console.warn('AI returned empty questions array. Raw response:', responseText.slice(0, 500))
    }
    
    // Normalize AI type variants to valid enum values
    const normalizeType = (t) => {
      if (!t) return null
      const upper = t.toUpperCase().trim()
      if (upper === 'MCQ' || upper === 'MULTIPLE CHOICE' || upper === 'MULTIPLE-CHOICE') return 'MCQ'
      if (upper === 'TF' || upper === 'T/F' || upper === 'TRUE/FALSE' || upper === 'TRUE FALSE' || upper === 'BOOLEAN') return 'TF'
      if (upper === 'MSQ' || upper === 'MULTIPLE SELECT' || upper === 'MULTIPLE-SELECT' || upper === 'MULTI-SELECT') return 'MSQ'
      return t // return as-is if unknown, will be caught by enum validation
    }

    return questions.map((q, index) => ({
      id: `q_${Date.now()}_${index}`,
      type: normalizeType(q.type) || expectedTypes[index] || 'MCQ',
      question: q.question || 'Question text missing',
      options: parseOptions(q.options || [], normalizeType(q.type) || expectedTypes[index]),
      explanation: q.explanation || '',
      segmentIndex: 0,
      createdAt: new Date().toISOString()
    }))
  } catch (error) {
    const raw = typeof responseText === 'string' ? responseText : String(responseText ?? '')
    const shown = raw.length > 2000
      ? raw.slice(0, 1000) + `\n…[${raw.length - 2000} chars truncated]…\n` + raw.slice(-1000)
      : raw
    console.error('Failed to parse questions:', error?.message || error)
    console.error(`[gen:parse-fail] raw model response (${raw.length} chars): ${shown}`)
    return []
  }
}

// Parse options ensuring correct structure
function parseOptions(options, type) {
  if (type === 'TF') {
    // For True/False, use AI-provided options if valid
    if (Array.isArray(options) && options.length === 2) {
      const trueIdx = options.findIndex(o => (o.text || '').toLowerCase().startsWith('true'))
      const falseIdx = options.findIndex(o => (o.text || '').toLowerCase().startsWith('false'))
      
      if (trueIdx !== -1 && falseIdx !== -1) {
        // Return with correct marking preserved
        return [
          { text: 'True', isCorrect: !!options[trueIdx].isCorrect },
          { text: 'False', isCorrect: !!options[falseIdx].isCorrect }
        ]
      }
    }
    // Default TF - mark first as correct if AI didn't specify
    return [
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false }
    ]
  }

  if (!Array.isArray(options) || options.length < 2) {
    return [
      { text: 'Option A', isCorrect: true },
      { text: 'Option B', isCorrect: false },
      { text: 'Option C', isCorrect: false },
      { text: 'Option D', isCorrect: false }
    ]
  }

  return options.map(opt => ({
    text: opt.text || opt.option || 'Unknown',
    isCorrect: opt.isCorrect || opt.correct || false
  }))
}

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
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 8000
    })
  })


  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`MiniMax API error: ${response.status} - ${errorData}`)
  }

  const data = await response.json()
  const choice = data.choices?.[0]
  const content = choice?.message?.content || ''
  const reasoning = choice?.message?.reasoning_content || ''
  const finish = choice?.finish_reason
  const usage = data.usage || {}
  console.log(`[gen:minimax] finish=${finish} contentLen=${content.length} reasoningLen=${reasoning.length} completion_tokens=${usage.completion_tokens ?? '?'} reasoning_tokens=${usage.completion_tokens_details?.reasoning_tokens ?? '?'} prompt_tokens=${usage.prompt_tokens ?? '?'}`)
  // The model normally returns the JSON answer in `content`. If `content` is empty (the reasoning
  // model occasionally puts everything in `reasoning_content`), fall back to reasoning so a
  // recoverable answer isn't lost. If BOTH are empty, log the full choice so it's diagnosable.
  const text = content || reasoning
  if (!text) {
    console.error('[gen:minimax] EMPTY response (no content, no reasoning). finish=' + finish +
      ' raw choice: ' + JSON.stringify(choice).slice(0, 1500))
  } else if (!content && reasoning) {
    console.warn(`[gen:minimax] content empty — falling back to reasoning_content (${reasoning.length} chars)`)
  }
  return text
}

// OpenAI API call
async function generateWithOpenAI(prompt, model = 'gpt-4o-mini') {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 8000
    })
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`OpenAI API error: ${response.status} - ${errorData}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

// Anthropic (Claude) API call
async function generateWithAnthropic(prompt, model = 'claude-sonnet-4-20250514') {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 8000,
      temperature: 0.7
    })
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Anthropic API error: ${response.status} - ${errorData}`)
  }

  const data = await response.json()
  return data.content?.[0]?.text || ''
}

// Google Gemini API call
export async function generateWithGoogle(prompt) {
  const model = config.googleModel || 'gemini-2.0-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.googleApiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8000
      }
    })
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Google API error: ${response.status} - ${errorData}`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// Generic provider dispatch — used by both question generation and knowledge engine
export async function generateWithProvider(provider, prompt) {
  switch (provider) {
    case 'minimax':
      if (!config.minimaxApiKey) throw new Error('MiniMax API key not configured')
      return await generateWithMiniMax(prompt)
    case 'openai':
      if (!config.openaiApiKey) throw new Error('OpenAI API key not configured')
      return await generateWithOpenAI(prompt)
    case 'anthropic':
      if (!config.anthropicApiKey) throw new Error('Anthropic API key not configured')
      return await generateWithAnthropic(prompt)
    case 'google':
      if (!config.googleApiKey) throw new Error('Google API key not configured')
      return await generateWithGoogle(prompt)
    default:
      throw new Error(`Unknown AI provider: ${provider}`)
  }
}

// Split transcript into chunks that fit within LLM context
// Each chunk ~3000 chars (~500 words) to stay well under token limits
const MAX_CHUNK_CHARS = 3000

function splitTranscript(transcript) {
  if (transcript.length <= MAX_CHUNK_CHARS) {
    return [transcript]
  }

  const chunks = []
  const sentences = transcript.split(/(?<=[.!?])\s+/)
  let currentChunk = ''

  for (const sentence of sentences) {
    if ((currentChunk + ' ' + sentence).length > MAX_CHUNK_CHARS && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      currentChunk = sentence
    } else {
      currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

// Main question generation function with transcript chunking
export async function generateQuestions(transcript, cfg) {
  const { numQuestions = 2, difficulty = 'medium', provider = 'minimax', questionTypeMix = null } = cfg || {}

  if (!transcript || transcript.trim().length === 0) {
    throw new Error('Transcript is required')
  }

  // Hard limit: max 15000 chars (~2500 words) to prevent API abuse
  const trimmedTranscript = transcript.trim().slice(0, 15000)
  if (trimmedTranscript.length < transcript.trim().length) {
    console.log(`Transcript truncated from ${transcript.trim().length} to ${trimmedTranscript.length} chars`)
  }

  const chunks = splitTranscript(trimmedTranscript)
  console.log(`Transcript split into ${chunks.length} chunk(s) for question generation`)

  // If only 1 chunk, generate all questions from it (fast path)
  if (chunks.length === 1) {
    return generateFromChunk(trimmedTranscript, numQuestions, difficulty, provider, questionTypeMix)
  }

  // Multi-chunk: distribute questions across chunks
  const allQuestions = []
  const questionsPerChunk = Math.ceil(numQuestions / chunks.length)

  for (let i = 0; i < chunks.length; i++) {
    const remaining = numQuestions - allQuestions.length
    if (remaining <= 0) break

    const count = Math.min(questionsPerChunk, remaining)
    const chunkTypes = questionTypeMix
      ? generateFromMix(questionTypeMix, count)
      : getQuestionTypeMix(count)

    let questions = []
    const maxRetries = 2
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        questions = await generateFromChunk(chunks[i], count, difficulty, provider, null, chunkTypes)
        if (questions.length >= count || attempt === maxRetries) break
        console.log(`Chunk ${i + 1} returned ${questions.length}/${count}, retrying... (attempt ${attempt + 2})`)
      } catch (err) {
        console.error(`Chunk ${i + 1} generation failed (attempt ${attempt + 1}):`, err.message)
        if (attempt === maxRetries) break
      }
    }
    allQuestions.push(...questions)
  }

  console.log(`Total questions generated: ${allQuestions.length}/${numQuestions}`)
  return allQuestions.slice(0, numQuestions)
}

// Generate questions from a single chunk
async function generateFromChunk(transcript, numQuestions, difficulty, provider, questionTypeMix = null, fixedTypes = null) {
  const questionTypes = fixedTypes || (questionTypeMix
    ? generateFromMix(questionTypeMix, numQuestions)
    : getQuestionTypeMix(numQuestions))
  const prompt = buildQuestionPrompt(transcript, questionTypes, difficulty)

  console.log(`Generating ${numQuestions} questions with ${provider} from a ${transcript.length}-char transcript...`)

  let responseText

  switch (provider) {
    case 'minimax':
      if (!config.minimaxApiKey) throw new Error('MiniMax API key not configured')
      responseText = await generateWithMiniMax(prompt)
      break
    case 'openai':
      if (!config.openaiApiKey) throw new Error('OpenAI API key not configured')
      responseText = await generateWithOpenAI(prompt)
      break
    case 'anthropic':
      if (!config.anthropicApiKey) throw new Error('Anthropic API key not configured')
      responseText = await generateWithAnthropic(prompt)
      break
    case 'google':
      if (!config.googleApiKey) throw new Error('Google API key not configured')
      responseText = await generateWithGoogle(prompt)
      break
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }

  console.log(`[gen] ${provider} returned ${responseText?.length || 0} chars; preview: ${JSON.stringify((responseText || '').slice(0, 140))}`)
  const questions = parseQuestions(responseText, questionTypes)
  if (questions.length === 0) {
    console.error(`[gen] parsed 0 questions from a ${responseText?.length || 0}-char ${provider} response (numQuestions=${numQuestions}, transcript=${transcript.length} chars) — see [gen:parse-fail] above for the raw text`)
  } else {
    console.log(`Generated ${questions.length} questions successfully`)
  }

  return questions
}