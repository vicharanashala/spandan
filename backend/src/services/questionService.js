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
  const { MCQ = 50, TF = 30, MSQ = 20 } = questionTypeMix
  const total = MCQ + TF + MSQ
  
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

  return `You are an expert quiz question generator. Based on the following transcription, generate ${questionTypes.length} quiz questions.

TRANSCRIPTION:
${transcript}

DIFFICULTY: ${difficulty.toUpperCase()}

QUESTION TYPES (follow exactly):
${typeInstructions}

OUTPUT FORMAT (respond ONLY with valid JSON):
{
  "questions": [
        {
      "type": "MCQ",
      "topic": "Photosynthesis",
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
      "topic": "Newton's 1st Law",
      "question": "The statement here?",
      "options": [
        { "text": "True", "isCorrect": true },
        { "text": "False", "isCorrect": false }
      ],
      "explanation": "Brief explanation"
    },
        {
      "type": "MSQ",
      "topic": "Algebra",
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
- Ensure wrong options for MCQ are plausible but clearly wrong
- For MSQ, ensure at least 2 options are correct
- Questions should be based ONLY on the transcription content`
}

// Parse questions from AI response
function parseQuestions(responseText, expectedTypes) {
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
    
    // NAYA — TAWM: Extract topic from AI response (with validation)
    return questions.map((q, index) => ({
      id: `q_${Date.now()}_${index}`,
      type: q.type || expectedTypes[index] || 'MCQ',
      topic: (q.topic && typeof q.topic === 'string' && q.topic.trim()) ? q.topic.trim() : null,
      question: q.question || 'Question text missing',
      options: parseOptions(q.options || [], q.type),
      explanation: q.explanation || '',
      segmentIndex: 0,
      createdAt: new Date().toISOString()
    }))
  } catch (error) {
    console.error('Failed to parse questions:', error)
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
      max_tokens: 2000
    })
  })


  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`MiniMax API error: ${response.status} - ${errorData}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
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
      max_tokens: 2000
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
      max_tokens: 2000,
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
async function generateWithGoogle(prompt, model = 'gemini-2.0-flash') {
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
        maxOutputTokens: 2000
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

  console.log(`Generating ${numQuestions} questions with ${provider}...`)

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

  const questions = parseQuestions(responseText, questionTypes)
  console.log(`Generated ${questions.length} questions successfully`)

  return questions
}