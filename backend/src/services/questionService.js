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

    // Some reasoning models (e.g. MiniMax-M3) put their chain-of-thought inline in the same text as
    // the final answer, wrapped in <think>...</think>, BEFORE the actual JSON. The greedy brace
    // match below grabs from the first "{" to the last "}" in the whole string — if the reasoning
    // text happens to mention a "{" anywhere (e.g. describing example JSON, or just prose), that
    // greedy match swallows the reasoning too and produces invalid JSON. Strip any <think> blocks
    // first so extraction only ever sees the actual answer.
    jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/gi, '')

    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
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
// NOTE: if MINIMAX_API_KEY is a samagama.in gateway key (not a direct MiniMax key), it must be
// called through samagama's own OpenAI-compatible proxy endpoint, not api.minimax.io directly —
// hitting api.minimax.io with a gateway key returns an empty "login fail" response. Point this at
// whichever endpoint your key actually belongs to, and use the exact model string your gateway
// listed under "API Keys" (e.g. samagama.in shows it as "MiniMaxAI/MiniMax-M2.7", not "MiniMax-M2.7").
const MINIMAX_ENDPOINT = process.env.MINIMAX_ENDPOINT || 'https://api.minimax.io/v1/text/chatcompletion_v2'
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2.7'

async function generateWithMiniMax(prompt) {
  const response = await fetch(MINIMAX_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.minimaxApiKey}`
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      // MiniMax-M2.7 is a reasoning model: chain-of-thought + final JSON answer share this budget.
      // 8000 was enough for the answer alone but hit the cap (finish=length, 0 content chars) once
      // reasoning ran long. Raised well above reasoning+answer needs.
      max_tokens: 16000
    })
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`MiniMax API error: ${response.status} - ${errorData}`)
  }

  const data = await response.json()
  const choice = data.choices?.[0]
  const content = choice?.message?.content || ''
  // MiniMax's actual field for the reasoning-model's chain-of-thought is `reasoning` (confirmed from
  // the raw response body), not `reasoning_content` as originally assumed — check both defensively.
  const reasoning = choice?.message?.reasoning_content || choice?.message?.reasoning || ''
  const finish = choice?.finish_reason
  const usage = data.usage || {}
  console.log(`[gen:minimax] finish=${finish} contentLen=${content.length} reasoningLen=${reasoning.length} completion_tokens=${usage.completion_tokens ?? '?'} reasoning_tokens=${usage.completion_tokens_details?.reasoning_tokens ?? '?'} prompt_tokens=${usage.prompt_tokens ?? '?'}`)
  // The model normally returns the JSON answer in `content`. If `content` is empty (the reasoning
  // model occasionally puts everything in `reasoning_content`), fall back to reasoning so a
  // recoverable answer isn't lost. If BOTH are empty, log the full choice so it's diagnosable.
  const text = content || reasoning
  if (!text) {
    // Guard: JSON.stringify(undefined) returns undefined (not a string), so calling .slice() on it
    // used to crash here — masking the real "why is MiniMax returning nothing" diagnostic with an
    // unrelated TypeError. Fall back to a plain string describing what we got instead.
    const choiceDump = choice !== undefined ? JSON.stringify(choice).slice(0, 1500) : '(no choices[0] at all — check data.choices / full response below)'
    console.error('[gen:minimax] EMPTY response (no content, no reasoning). finish=' + finish + ' raw choice: ' + choiceDump)
    console.error('[gen:minimax] full response body: ' + JSON.stringify(data).slice(0, 2000))
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
// google-2.0-flash was retired; "gemini-flash-latest" is Google's rolling alias for the current
// recommended Flash model, so this stays valid across future Google model retirements without
// needing another code change. Override with GOOGLE_MODEL in .env if you want a pinned version.
async function generateWithGoogle(prompt, model = process.env.GOOGLE_MODEL || 'gemini-flash-latest') {
  return withTransientRetry(async () => {
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
  }, (err) => /Google API error: 503/.test(err.message), { label: 'google' })
}

// Map of provider key -> its generateWithX call function, so a review pass can dispatch to
// whichever provider it picks without a switch statement duplicated in two places.
const PROVIDER_CALLERS = {
  minimax: generateWithMiniMax,
  openai: generateWithOpenAI,
  anthropic: generateWithAnthropic,
  google: generateWithGoogle
}

// Which providers currently have an API key configured (same check AI_PROVIDERS uses), in a fixed
// preference order. Used to pick a REVIEWER for the second pass.
function enabledProviders() {
  return Object.entries(AI_PROVIDERS).filter(([, p]) => p.enabled).map(([key]) => key)
}

// Pick which provider should REVIEW a batch of questions generated by `generatedByProvider`.
// Prefers a DIFFERENT enabled provider — a model rarely catches its own mistakes, so a second,
// different model is a genuine second opinion. Falls back to the same provider (still worthwhile:
// it can catch issues a fresh, uncommitted read surfaces even from the same model) if no other
// provider is configured. Returns null only if no provider at all is enabled (caller must handle).
export function pickReviewerProvider(generatedByProvider) {
  const enabled = enabledProviders()
  if (enabled.length === 0) return null
  const alternative = enabled.find(p => p !== generatedByProvider)
  return alternative || generatedByProvider
}

// Build the prompt for the second-pass review. Reuses the exact JSON schema from the generation
// prompt so the same parseQuestions() can parse the reviewed output.
function buildReviewPrompt(questions, transcript, difficulty) {
  return `You are a strict quality reviewer for an educational quiz. Below is a JSON array of quiz questions generated from a session transcript, plus the transcript itself. Check EACH question for:
- Ambiguity: could a reasonable student argue for more than one option?
- Correctness: is the marked correct answer actually correct given the transcript, with no other option also arguably correct?
- Distractor quality: are the wrong options genuinely plausible misconceptions, not obviously wrong or near-duplicates of each other?
- Recall vs. reasoning: does the question test real understanding rather than a verbatim lookup?
- Self-containment: does the question stand alone (never referencing "the source", "the speaker", "the transcript", etc.)?
- Difficulty match: does it fit the requested ${String(difficulty || 'medium').toUpperCase()} difficulty?

If a question already meets all of the above, keep it UNCHANGED. If it has a fixable issue, rewrite ONLY that question (question text, options, and/or explanation) to fix it while preserving its type and general topic. If a question is unsalvageable (e.g. no correct-per-transcript answer exists), replace it with a new question of the same type that IS well-supported by the transcript.

Return exactly the same number of questions, in the same order, in the same JSON schema you were given — respond ONLY with valid JSON, no markdown or extra text:
{
  "questions": [
    { "type": "MCQ", "question": "...", "options": [ { "text": "...", "isCorrect": true }, ... ], "explanation": "..." }
  ]
}

TRANSCRIPT (for fact-checking only — do not quote it or reference it in question wording):
${transcript}

QUESTIONS TO REVIEW:
${JSON.stringify(questions.map(q => ({ type: q.type, question: q.question, options: q.options, explanation: q.explanation })), null, 2)}`
}

// Second-pass review: re-checks a generated batch for ambiguity, wrong/arguable correct answers,
// weak distractors, and recall-only phrasing, fixing or replacing questions as needed. Best-effort —
// on any failure (no provider available, API error, unparsable response) it falls back to the
// original, unreviewed batch rather than failing the whole generation.
export async function reviewQuestions(questions, transcript, { difficulty = 'medium', generatedByProvider = 'minimax' } = {}) {
  if (!Array.isArray(questions) || questions.length === 0) return questions

  const reviewerProvider = pickReviewerProvider(generatedByProvider)
  const caller = reviewerProvider && PROVIDER_CALLERS[reviewerProvider]
  if (!caller) {
    console.warn('[gen:review] no provider available for review pass — skipping, returning pass-1 questions as-is')
    return questions
  }

  try {
    const prompt = buildReviewPrompt(questions, transcript, difficulty)
    console.log(`[gen:review] reviewing ${questions.length} questions with ${reviewerProvider} (generated by ${generatedByProvider})...`)
    const responseText = await caller(prompt)
    const reviewed = parseQuestions(responseText, questions.map(q => q.type))
    if (reviewed.length !== questions.length) {
      console.warn(`[gen:review] reviewer returned ${reviewed.length} questions, expected ${questions.length} — keeping pass-1 questions`)
      return questions
    }
    console.log(`[gen:review] review pass complete (${reviewerProvider})`)
    return reviewed
  } catch (err) {
    console.error('[gen:review] review pass failed, falling back to unreviewed questions:', err.message)
    return questions
  }
}

// Main question generation function
export async function generateQuestions(transcript, cfg) {
  const { numQuestions = 2, difficulty = 'medium', provider = 'minimax', questionTypeMix = null, twoPass = false } = cfg || {}

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
    return questions
  }
  console.log(`Generated ${questions.length} questions successfully`)

  // Second layer: optional quality-review pass (see reviewQuestions above). Off by default since it
  // roughly doubles generation latency/cost (a second LLM call); the teacher opts in via room settings.
  if (!twoPass) return questions
  return reviewQuestions(questions, transcript, { difficulty, generatedByProvider: provider })
}

// "Compare & choose" mode: generate a FULL independent set of questions from two different
// providers in parallel (not a review of one by the other — two genuinely separate generations),
// then pair them up index-by-index so the teacher can pick whichever provider's version they
// prefer for each question slot, or reject the pair entirely. Question-type sequencing (MCQ/TF/MSQ
// per index) is derived from cfg alone (see getQuestionTypeMix / questionTypeMix above), not from
// the provider, so providerA's question[i] and providerB's question[i] are always the same TYPE —
// safe to present side-by-side as alternatives for the same slot.
//
// Returns { pairs, providerA, providerB } where pairs[i] = { index, type, options: [
//   { provider, question }, { provider, question } ] } — never a flat `questions` array, so callers
// must check for `pairs` vs `questions` in the response shape (see routes/questions.js).
export async function generateQuestionsCompare(transcript, cfg) {
  const { providerA, providerB } = cfg || {}
  if (!providerA || !providerB) throw new Error('generateQuestionsCompare requires both providerA and providerB')
  if (providerA === providerB) throw new Error('Compare mode needs two DIFFERENT providers, got the same one twice')

  console.log(`[gen:compare] generating independently from ${providerA} and ${providerB} in parallel...`)

  // twoPass never applies inside compare mode — each side is a single, independent generation;
  // reviewing would blur which provider's own judgment produced which question.
  const [resultA, resultB] = await Promise.all([
    generateQuestions(transcript, { ...cfg, provider: providerA, twoPass: false }),
    generateQuestions(transcript, { ...cfg, provider: providerB, twoPass: false })
  ])

  const pairCount = Math.min(resultA.length, resultB.length)
  if (pairCount === 0) {
    throw new Error(`Compare mode got no usable questions from at least one provider (${providerA}: ${resultA.length}, ${providerB}: ${resultB.length})`)
  }
  if (resultA.length !== resultB.length) {
    console.warn(`[gen:compare] ${providerA} returned ${resultA.length}, ${providerB} returned ${resultB.length} — pairing only the first ${pairCount}`)
  }

  const pairs = []
  for (let i = 0; i < pairCount; i++) {
    pairs.push({
      index: i,
      type: resultA[i].type,
      options: [
        { provider: providerA, question: resultA[i] },
        { provider: providerB, question: resultB[i] }
      ]
    })
  }

  console.log(`[gen:compare] built ${pairs.length} pairs (${providerA} vs ${providerB})`)
  return { pairs, providerA, providerB }
}