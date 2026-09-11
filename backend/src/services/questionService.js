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
  await Response.deleteMany({ question: questionId })
  
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
    question: questionId,
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
  return Response.find({ question: questionId })
    .populate('student', 'name email')
    .sort({ createdAt: -1 })
}

export const getResponsesByRoom = async (roomId) => {
  return Response.find({ roomId: roomId })
    .populate('studentId', 'name email')
    .sort({ createdAt: -1 })
}

export const getQuestionResults = async (questionId) => {
  const responses = await Response.find({ question: questionId })
  
  const totalResponses = responses.length
  
  if (totalResponses === 0) {
    return {
      totalResponses: 0,
      results: {},
      correctPercentage: 0
    }
  }
  
  const results = {}
  let correctCount = 0
  
  responses.forEach(response => {
    const option = response.selectedOption
    results[option] = (results[option] || 0) + 1
    
    if (response.isCorrect) {
      correctCount++
    }
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
export function buildQuestionPrompt(transcript, questionTypes, difficulty) {
  const typeInstructions = questionTypes.map((type, index) => {
    switch (type) {
      case 'MCQ':
        return `${index + 1}. MCQ: One-sentence question with 4 options (A–D), exactly ONE correct; the 3 distractors must be plausible misconceptions. Mark the correct answer.`
      case 'TF':
        return `${index + 1}. T/F: A single-sentence statement that is a plausible-sounding but subtly right OR subtly wrong generalization/inference. Mark the correct answer.`
      case 'MSQ':
        return `${index + 1}. MSQ: One-sentence question with 2–4 correct options (out of 4–5); every unmarked option must be a plausible misconception. Mark ALL correct options.`
      default:
        return ''
    }
  }).join('\n')

  // Bloom emphasis follows the teacher-set difficulty (guides the model only; never saved/shown).
  const diff = String(difficulty || 'medium').toLowerCase()
  const bloomEmphasis = diff === 'easy'
    ? 'Since difficulty is EASY, lean toward the Understand and Apply levels — but still test genuine comprehension and simple inference, never rote recall.'
    : diff === 'hard'
      ? 'Since difficulty is HARD, skew toward the Analyze and Evaluate levels — most questions should require multi-step reasoning or spotting a subtly flawed inference.'
      : 'For MEDIUM difficulty, balance across Understand, Apply, Analyze and Evaluate, with a slight lean toward Analyze.'

  return `You are an expert educational assessment designer. Using ONLY the session content below, write ${questionTypes.length} high-quality quiz questions that test understanding and inference — NOT recall.

SESSION CONTENT:
${transcript}

DIFFICULTY: ${difficulty.toUpperCase()}

QUESTION TYPES (produce exactly these, in this order):
${typeInstructions}

HOW TO WRITE GOOD QUESTIONS:
- One sentence each. Answerable in ~15 seconds, but genuinely tough — it must make the student reason, never a simple fact lookup or a restatement of a line.
- Test comprehension, inference and reasoning: rephrase a concept to check real understanding; introduce a NEW example/scenario and test whether the logic still holds; ask WHY something is true or false; or present a plausible generalization that is subtly wrong.
- ${bloomEmphasis} (Bloom levels only guide YOU while writing — do not label or mention them anywhere in the output.)
- Inference beyond what is explicitly stated is encouraged, as long as it is clearly supported by the content's own logic.
- Distractors and false statements must target REAL misconceptions: intuitive and plausible, wrong only on careful thought — never obviously wrong.
- The "explanation" is a brief "why" that TEACHES: state what makes the answer correct and why the tempting alternative is wrong, in one or two sentences.

WORDING:
- Write each question so it stands on its own as a direct subject-knowledge question.
- Do NOT point at the material with lazy stems. Never use the words "source material", "source", "transcript", "transcription", "passage", "text", "excerpt", "recording", "audio", "context", "speaker", "narrator", "presenter", or "author", and never refer to whoever produced the content as "the speaker" in ANY form (e.g. "the speaker said/mentioned/states/explains/argues/concludes", "as per the speaker", "the speaker's point"), nor open with "According to the source/passage/text".
- ONLY when a question is genuinely about HOW an idea was framed or illustrated may you refer to "the session", "the discussion", or "the instructor" — never "the speaker" or "the source material".
  BAD:  "According to the source material, what caused the failure?"
  GOOD: "A single low-cost component caused a total system failure — what does this best demonstrate about complex engineered systems?"

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
- Base every question ONLY on the session content; use no outside knowledge
- Honor the specified DIFFICULTY level, but never drop to pure recall
- For MCQ, the 3 wrong options must be plausible misconceptions (wrong only on careful thought), not obviously wrong
- For MSQ, ensure at least 2 options are correct
- Ensure all options are distinct and that ONLY the marked option(s) are correct; every unmarked option must be a plausible but genuinely incorrect distractor, with no option that could be argued as an alternative correct answer
- For True/False questions, balance the correct answers across the set — roughly half should be correct "True" and half correct "False"; do not make most statements True (or most False)`
}

// Parse questions from AI response
export function parseQuestions(responseText, expectedTypes) {
  try {
    let jsonStr = responseText
    
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }
    
    const objMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!objMatch) {
      throw new Error('No JSON found in response')
    }
    
    const parsed = JSON.parse(objMatch[0])
    const questions = parsed.questions || []
    
    return questions.map((q, index) => ({
      id: `q_${Date.now()}_${index}`,
      type: q.type || expectedTypes[index] || 'MCQ',
      question: q.question || 'Question text missing',
      options: parseOptions(q.options || [], q.type),
      explanation: q.explanation || '',
      segmentIndex: 0,
      createdAt: new Date().toISOString()
    }))
  } catch (error) {
    // Log the RAW model text so a failure is diagnosable instead of a silent []. Truncate huge
    // responses (keep head + tail) so logs stay readable.
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
export function parseOptions(options, type) {
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
async function generateWithMiniMax(prompt, maxTokens = 8000, disableThinking = false) {
  const response = await fetch('https://api.minimax.io/v1/text/chatcompletion_v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.minimaxApiKey}`
    },
    body: JSON.stringify({
      model: 'minimax-m3',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
      // MiniMax-M3 thinks by default, and thinking tokens draw from the same max_tokens budget
      // as the actual answer — with a small budget (e.g. for remediation) the model can burn the
      // whole thing on hidden reasoning and leave nothing for the JSON we actually need (see the
      // "16 chars, no closing JSON" failure this caused). Opt-in only, so full quiz generation
      // (which has room for reasoning within its 8000-token budget) keeps its existing behavior.
      ...(disableThinking ? { thinking: { type: 'disabled' } } : {})
    })
  })


  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`MiniMax API error: ${response.status} - ${errorData}`)
  }

  const data = await response.json()

  // MiniMax's chatcompletion_v2 endpoint can return HTTP 200 even when the request itself failed
  // (bad model name, invalid key, quota, etc.) — the real error lives in base_resp instead of
  // choices. status_code 0 means success; anything else is an error with no choices to parse.
  const baseResp = data.base_resp
  if (baseResp && baseResp.status_code !== 0) {
    throw new Error(`MiniMax API error: ${baseResp.status_code} - ${baseResp.status_msg || 'Unknown error'}`)
  }

  const choice = data.choices?.[0]
  const content = choice?.message?.content || ''
  const reasoning = choice?.message?.reasoning_content || ''
  const finish = choice?.finish_reason
  const usage = data.usage || {}
  console.log(`[gen:minimax] finish=${finish} contentLen=${content.length} reasoningLen=${reasoning.length} completion_tokens=${usage.completion_tokens ?? '?'} reasoning_tokens=${usage.completion_tokens_details?.reasoning_tokens ?? '?'} prompt_tokens=${usage.prompt_tokens ?? '?'}`)
  // The model normally returns the JSON answer in `content`. If `content` is empty (the reasoning
  // model occasionally puts everything in `reasoning_content`), fall back to reasoning so a
  // recoverable answer isn't lost. If BOTH are empty, log the full choice so it's diagnosable.
  // JSON.stringify(undefined) returns undefined (not a string), so guard with a fallback before
  // slicing or a genuinely empty `choice` throws here too.
  const text = content || reasoning
  if (!text) {
    console.error('[gen:minimax] EMPTY response (no content, no reasoning). finish=' + finish +
      ' raw choice: ' + (JSON.stringify(choice) ?? 'undefined').slice(0, 1500) +
      ' raw data keys: ' + Object.keys(data).join(','))
  } else if (!content && reasoning) {
    console.warn(`[gen:minimax] content empty — falling back to reasoning_content (${reasoning.length} chars)`)
  }
  return text
}

// OpenAI API call
async function generateWithOpenAI(prompt, model = 'gpt-4o-mini', maxTokens = 8000) {
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
      max_tokens: maxTokens
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
async function generateWithAnthropic(prompt, model = 'claude-sonnet-4-20250514', maxTokens = 8000) {
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
      max_tokens: maxTokens,
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
async function generateWithGoogle(prompt, model = 'gemini-3.5-flash', maxTokens = 8000) {
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
        maxOutputTokens: maxTokens
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

// Main question generation function
export async function generateQuestions(transcript, cfg) {
  const { numQuestions = 2, difficulty = 'medium', provider = 'minimax', questionTypeMix = null } = cfg || {}

  if (!transcript || transcript.trim().length === 0) {
    throw new Error('Transcript is required')
  }

  // Use provided questionTypeMix or generate default based on numQuestions
  const questionTypes = questionTypeMix 
    ? generateFromMix(questionTypeMix, numQuestions)
    : getQuestionTypeMix(numQuestions)
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

// --- Remediation question generation ----------------------------------------------------------
//
// Dispatches a single raw prompt to the given provider. Exported so worker.js can call it from
// inside the BullMQ 'generate-remediation' job processor — concurrency across both quiz generation
// and remediation generation is bounded by that Worker's single `concurrency` option (see
// worker.js), the same queue+worker infrastructure quiz generation already uses, rather than a
// separate in-process semaphore living here.
export async function callProviderRaw(provider, prompt, maxTokens = 8000) {
  switch (provider) {
    case 'minimax':
      if (!config.minimaxApiKey) throw new Error('MiniMax API key not configured')
      return await generateWithMiniMax(prompt, maxTokens)
    case 'openai':
      if (!config.openaiApiKey) throw new Error('OpenAI API key not configured')
      return await generateWithOpenAI(prompt, undefined, maxTokens)
    case 'anthropic':
      if (!config.anthropicApiKey) throw new Error('Anthropic API key not configured')
      return await generateWithAnthropic(prompt, undefined, maxTokens)
    case 'google':
      if (!config.googleApiKey) throw new Error('Google API key not configured')
      return await generateWithGoogle(prompt, undefined, maxTokens)
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504])
const RETRYABLE_MESSAGE_PATTERN = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|fetch failed|network/i
export const LLM_MAX_ATTEMPTS = Number(process.env.REMEDIATION_LLM_MAX_ATTEMPTS) || 4

export function isRetryableProviderError(err) {
  const message = err?.message || ''
  const statusMatch = message.match(/API error:\s*(\d+)/)
  if (statusMatch && RETRYABLE_STATUS_CODES.has(Number(statusMatch[1]))) return true
  return RETRYABLE_MESSAGE_PATTERN.test(message)
}

// Sync fallback used only when Redis/BullMQ is disabled (see generateRemediationQuestion below) —
// retries transient failures with backoff, same policy as the queued path, just running inline on
// the API process instead of behind the worker's concurrency cap.
async function callProviderWithRetrySync(provider, prompt, maxTokens = 8000) {
  let lastErr
  for (let attempt = 1; attempt <= LLM_MAX_ATTEMPTS; attempt++) {
    try {
      return await callProviderRaw(provider, prompt, maxTokens)
    } catch (err) {
      lastErr = err
      if (!isRetryableProviderError(err) || attempt === LLM_MAX_ATTEMPTS) throw err
      const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 10000) + Math.random() * 500
      console.warn(`[remediation] Provider call failed (attempt ${attempt}/${LLM_MAX_ATTEMPTS}), retrying in ${Math.round(backoffMs)}ms: ${err.message}`)
      await new Promise(r => setTimeout(r, backoffMs))
    }
  }
  throw lastErr
}

// Build prompt for remediation question generation
export function buildRemediationPrompt(originalQuestion, correctAnswer, mostPickedWrongAnswer, wrongAnswerText, explanation) {
  return `You are an expert educational assessment designer. A student answered a question incorrectly.

ORIGINAL QUESTION: ${originalQuestion}
CORRECT ANSWER: ${correctAnswer}
MOST COMMON WRONG ANSWER: ${wrongAnswerText}
EXPLANATION OF CORRECT ANSWER: ${explanation || 'Not provided'}

The student chose the wrong answer, suggesting a specific misconception. Generate exactly ONE follow-up MCQ question that:
1. Targets Bloom's Taxonomy Level 3 (Application) or Level 4 (Analysis) — NOT recall or comprehension
2. Frames a short, concrete scenario or case (1-3 sentences) that makes the student APPLY or ANALYSE the concept in a new context — not just remember a definition
3. Is designed to CORRECT the specific misconception implied by choosing "${wrongAnswerText}"
4. Does NOT reference the original question — write it as a completely standalone question
5. Has 4 options with exactly ONE correct answer and 3 plausible distractors

Keep the scenario brief — this is a quick follow-up question, not a long case study. Respond immediately with ONLY the JSON below. No reasoning, no preamble, no text outside the JSON.

OUTPUT FORMAT (respond ONLY with valid JSON):
{
  "questions": [
    {
      "type": "MCQ",
      "question": "The remediation question text here?",
      "options": [
        { "text": "Option A", "isCorrect": true },
        { "text": "Option B", "isCorrect": false },
        { "text": "Option C", "isCorrect": false },
        { "text": "Option D", "isCorrect": false }
      ],
      "explanation": "Brief explanation of why the correct answer is right and what misconception it targets"
    }
  ]
}`
}

// Remediation generates ONE MCQ, but per the Bloom's Taxonomy Level 3/4 requirement in
// buildRemediationPrompt (a concrete scenario that specifically targets a misconception), this is
// a genuinely harder writing task than plain recall — a reasoning model will spend real thinking
// tokens working it out before answering. 1200 was too tight for that and caused truncated,
// unparseable JSON (content cut off at "16 chars" with no closing brace). This is generous enough
// to avoid that while still being well under the 8000 a full multi-question quiz needs.
// Configurable in case a given provider/model needs more (or can get away with less).
const REMEDIATION_MAX_TOKENS = Number(process.env.REMEDIATION_MAX_TOKENS) || 4000

export async function generateRemediationQuestion(originalQuestion, correctAnswer, wrongAnswerText, explanation, provider = 'minimax') {
  const prompt = buildRemediationPrompt(originalQuestion, correctAnswer, null, wrongAnswerText, explanation)

  // Routed through the same BullMQ queue + worker that quiz generation uses (see
  // generationQueue.js / worker.js), instead of a separate in-process concurrency limiter — this
  // is what protects against the rate-limit stampede when many distinct questions all need
  // generation within the same few seconds of a room ending, while keeping the app to ONE
  // concurrency-control system for LLM calls. Falls back to a synchronous in-process call with the
  // same retry policy when Redis is disabled, mirroring generateQuestions()'s sync fallback above.
  const { getGenerationQueue, getGenerationQueueEvents } = await import('./generationQueue.js')
  const queue = getGenerationQueue()

  let responseText
  if (queue) {
    const job = await queue.add(
      'generate-remediation',
      { provider, prompt, maxTokens: REMEDIATION_MAX_TOKENS },
      {
        attempts: 1, // retries are handled inside the worker's job processor (see worker.js), so
                     // BullMQ doesn't also retry the whole job on top of that
        removeOnComplete: { age: 900 },
        removeOnFail: { age: 900 }
      }
    )
    const queueEvents = getGenerationQueueEvents()
    responseText = await job.waitUntilFinished(queueEvents, Number(process.env.REMEDIATION_JOB_WAIT_MS) || 120000)
  } else {
    responseText = await callProviderWithRetrySync(provider, prompt, REMEDIATION_MAX_TOKENS)
  }

  const parsed = parseQuestions(responseText, ['MCQ'])
  if (!parsed || parsed.length === 0) throw new Error('Failed to parse remediation question')
  return parsed[0]
}

// --- Race-safe remediation generation ---------------------------------------------------
//
// Problem: at room end, many students can hit /generate within the same second. Without
// coordination, students who all see "no remediation question exists yet for this parent
// question" each fire their own LLM call and each save their own copy — duplicate rows, wasted
// LLM spend, and no guarantee everyone ends up seeing the same remediation question.
//
// Fix: use the DB as the lock. The unique partial index on (roomId, parentQuestionId) for
// isRemediation:true documents (see models/Question.js) means only one caller can ever
// successfully INSERT a placeholder doc for a given parent question. That caller "wins" and is
// responsible for calling the LLM and filling the placeholder in. Everyone else's insert fails
// with a duplicate-key error (11000) — they catch that, look up the doc the winner is
// populating, and poll it briefly until it flips to 'ready' (or 'failed').
//
// This DB-level lock is solving a different problem than the BullMQ queue above: it's deduping
// the SAME remediation question across many students hitting /generate at once, so only one LLM
// call ever happens per parent question — the queue then bounds how many of those (already-deduped)
// LLM calls run concurrently process-wide.
//
// Crash recovery: if the winning process dies (OOM, deploy, crash) between claiming the
// placeholder and finishing the LLM call, the doc is stuck in 'pending' forever — nothing ever
// flips it to 'failed', so the normal failed-doc reclaim path never kicks in, and every future
// caller would just poll it to a timeout and silently fail. generationStartedAt (set whenever a
// placeholder is claimed/reclaimed) lets us tell "someone is actively generating this" apart from
// "the claimant died a while ago" — a 'pending' doc older than REMEDIATION_STALL_MS is treated as
// abandoned and reclaimed the same way a 'failed' doc is.
const REMEDIATION_POLL_INTERVAL_MS = 400
// Application/Analysis-level MCQs need real reasoning time (read a short scenario + weigh 4
// options), not just recall — but the parent question's own timer isn't a reliable signal for
// that: it could've been a quick 10-15s recall item, which would leave a remediation question far
// too little time. Flat and independent of the parent since every remediation question is the same
// shape by design (short scenario + 4-option MCQ). Tunable without touching the create() call below.
const REMEDIATION_TIME_SECONDS = Number(process.env.REMEDIATION_TIME_SECONDS) || 30
// With retries + the concurrency queue above, a single generation can now legitimately take much
// longer than a bare LLM call (queue wait + up to LLM_MAX_ATTEMPTS retries with backoff). At scale
// (100s of students, many distinct questions queued behind a small concurrency cap) that queue
// wait can be real, so this is deliberately generous — better to make a waiting student wait than
// to give up and show them nothing. Configurable since the right value depends on class size.
const REMEDIATION_POLL_TIMEOUT_MS = Number(process.env.REMEDIATION_POLL_TIMEOUT_MS) || 90000
// Well past any single generation (including retries and queue wait) — a 'pending' doc still
// unclaimed after this long almost certainly means its owning process died, not that it's slow.
const REMEDIATION_STALL_MS = REMEDIATION_POLL_TIMEOUT_MS + 30000

function isStalledPending(doc) {
  if (!doc || doc.generationStatus !== 'pending') return false
  const startedAt = doc.generationStartedAt ? new Date(doc.generationStartedAt).getTime() : 0
  // No generationStartedAt at all means it predates this field — treat as stalled rather than
  // waiting on it forever with no way to ever reclaim it.
  return !startedAt || (Date.now() - startedAt > REMEDIATION_STALL_MS)
}

async function waitForRemediationReady(questionId, timeoutMs = REMEDIATION_POLL_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const doc = await Question.findById(questionId).lean()
    if (!doc) return null
    if (doc.generationStatus === 'ready') return doc
    if (doc.generationStatus === 'failed') return null
    await new Promise(r => setTimeout(r, REMEDIATION_POLL_INTERVAL_MS))
  }
  console.warn(`[remediation] Timed out waiting for question ${questionId} to finish generating`)
  return null
}

// Class-wide "most commonly picked wrong option" for a parent question — used as LLM context so
// the remediation question targets the actual misconception rather than just "got it wrong".
// Shared by both the pre-generation path (question:ended) and the on-demand path (/generate).
async function getMostPickedWrongOption(roomId, parentQuestion) {
  const wrongResponsesForQ = await Response.find({
    roomId,
    questionId: parentQuestion._id,
    isCorrect: false
  }).lean()

  if (wrongResponsesForQ.length === 0) return null

  const optionCounts = {}
  for (const r of wrongResponsesForQ) {
    optionCounts[r.selectedOption] = (optionCounts[r.selectedOption] || 0) + 1
  }
  const mostPickedWrongIdx = Object.entries(optionCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0]

  const correctOption = parentQuestion.options.find(o => o.isCorrect)
  const wrongOption = parentQuestion.options[mostPickedWrongIdx]
  if (!correctOption || !wrongOption) return null

  return { correctOption, wrongOption }
}

// Ensures a remediation question exists (or is being generated) for the given parent question,
// and returns it once ready — calling the LLM only if THIS call is the one that wins the race to
// create it. Returns null if there's nothing to remediate (no wrong answers yet), or generation
// failed/timed out — callers should treat that as "no remediation question for this one" rather
// than blow up, so one bad generation doesn't take down the rest of the batch.
export async function ensureRemediationQuestion(roomId, parentQuestion, provider = 'minimax') {
  // Fast path: already generated. This is the common case once pre-generation (triggered at
  // question:ended, see index.js) has had time to run before the student reaches /generate.
  const existing = await Question.findOne({
    roomId,
    isRemediation: true,
    parentQuestionId: parentQuestion._id
  }).lean()

  if (existing) {
    if (existing.generationStatus === 'ready') return existing
    if (existing.generationStatus === 'pending' && !isStalledPending(existing)) {
      return waitForRemediationReady(existing._id)
    }
    // 'failed', OR a 'pending' doc old enough that its claimant almost certainly crashed — fall
    // through and try to reclaim it for a (re)try, below.
  }

  const wrongAnswerInfo = await getMostPickedWrongOption(roomId, parentQuestion)
  if (!wrongAnswerInfo) return null
  const { correctOption, wrongOption } = wrongAnswerInfo

  let placeholder
  if (existing && (existing.generationStatus === 'failed' || isStalledPending(existing))) {
    // Reclaim a failed doc OR an abandoned pending doc for a retry. Atomic on _id + the exact
    // status/timestamp we just read, so if several callers land here at once — or the original
    // claimant is actually still alive and just slow, not dead — only one of them wins the
    // reclaim; everyone else falls through to the null branch below and waits on the doc instead.
    placeholder = await Question.findOneAndUpdate(
      {
        _id: existing._id,
        $or: [
          { generationStatus: 'failed' },
          { generationStatus: 'pending', generationStartedAt: existing.generationStartedAt ?? null }
        ]
      },
      { $set: { generationStatus: 'pending', generationStartedAt: new Date() } },
      { new: true }
    )
    if (!placeholder) {
      // Someone else reclaimed it (or the "dead" claimant actually finished) a moment before us —
      // ride along with whatever's there now instead of retrying blind.
      return waitForRemediationReady(existing._id)
    }
  } else {
    try {
      placeholder = await Question.create({
        roomId,
        type: 'MCQ',
        question: '(generating…)',
        options: [],
        segmentIndex: parentQuestion.segmentIndex,
        timeToAnswer: REMEDIATION_TIME_SECONDS,
        points: Math.round((parentQuestion.points || 100) * 0.5), // half points for remediation
        status: 'approved',
        isRemediation: true,
        parentQuestionId: parentQuestion._id,
        createdBy: parentQuestion.createdBy,
        generationStatus: 'pending',
        generationStartedAt: new Date()
      })
    } catch (err) {
      if (err.code === 11000) {
        // Someone else won the insert race a moment ago — wait on their doc instead of retrying.
        const winner = await Question.findOne({
          roomId, isRemediation: true, parentQuestionId: parentQuestion._id
        }).lean()
        if (!winner) return null
        // The doc that won the insert race can itself be an abandoned claim (its creator crashed
        // right after inserting it) — recurse once so it gets reclaimed instead of every future
        // caller polling it to a timeout forever. The recursive call re-reads it fresh, so this
        // terminates as soon as it's reclaimed (generationStartedAt resets to "now").
        if (isStalledPending(winner)) return ensureRemediationQuestion(roomId, parentQuestion, provider)
        return waitForRemediationReady(winner._id)
      }
      throw err
    }
  }

  // We won the race (or the retry) — we're the one who actually calls the LLM.
  try {
    const generated = await generateRemediationQuestion(
      parentQuestion.question,
      correctOption.text,
      wrongOption.text,
      parentQuestion.explanation,
      provider
    )
    placeholder.question = generated.question
    placeholder.options = generated.options
    placeholder.explanation = generated.explanation || ''
    placeholder.generationStatus = 'ready'
    await placeholder.save()
    return placeholder.toObject()
  } catch (err) {
    console.error('[remediation] Failed to generate for question:', parentQuestion._id, err.message)
    placeholder.generationStatus = 'failed'
    await placeholder.save().catch(() => {})
    return null
  }
}