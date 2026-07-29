import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { sanitizeObject } from '../utils/sanitize.js'

const router = express.Router()

// Ensure only authenticated users can access these routes
router.use(authenticate)

/**
 * GET /api/spandangpt/active-room
 * Fetches the active room for the current teacher.
 * SpandanGPT uses this to know where to push questions.
 */
router.get('/active-room', async (req, res) => {
  try {
    const Room = (await import('../models/Room.js')).default
    
    let activeRoom
    if (req.user.role === 'teacher') {
      activeRoom = await Room.findOne({ 
        teacher: req.user._id, 
        isActive: true 
      })
    } else if (req.user.role === 'student') {
      const RoomMember = (await import('../models/RoomMember.js')).default
      // Find the most recently joined active room
      const membership = await RoomMember.findOne({ studentId: req.user._id }).sort({ joinedAt: -1 })
      if (membership) {
        activeRoom = await Room.findOne({ _id: membership.roomId, isActive: true })
      }
    }

    if (!activeRoom) {
      return res.status(404).json({ success: false, message: 'No active room found' })
    }

    res.json({ success: true, room: activeRoom })
  } catch (error) {
    console.error('[SpandanGPT] API Error (active-room):', error)
    res.status(500).json({ success: false, error: 'Failed to fetch active room' })
  }
})

/**
 * POST /api/spandangpt/launch-poll
 * SpandanGPT calls this to create a question and instantly push it via Socket.io.
 * Expected Body: { roomId, type, question, options, timeToAnswer }
 */
router.post('/launch-poll', authorize('teacher'), async (req, res) => {
  try {
    const Room = (await import('../models/Room.js')).default
    const Question = (await import('../models/Question.js')).default
    
    const { 
      roomId, 
      type, 
      question, 
      options, 
      timeToAnswer = 30, 
      points = 100 
    } = req.body

    if (!roomId || !type || !question || !options) {
      return res.status(400).json({ success: false, error: 'Missing required fields' })
    }

    // Verify room ownership
    const room = await Room.findById(roomId)
    if (!room || room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied or room not found' })
    }

    // Sanitize and save question
    const sanitizedData = sanitizeObject({ 
      roomId, 
      type, 
      question, 
      options, 
      timeToAnswer, 
      points, 
      status: 'approved' 
    })

    const newQuestion = new Question(sanitizedData)
    await newQuestion.save()

    // Return the created question so frontend can emit it via socket
    res.status(201).json({ success: true, question: newQuestion })
  } catch (error) {
    console.error('[SpandanGPT] API Error (launch-poll):', error)
    res.status(500).json({ success: false, error: 'Failed to launch poll' })
  }
})

/**
 * GET /api/spandangpt/poll-status/:questionId
 * SpandanGPT uses this to check real-time response stats.
 */
router.get('/poll-status/:questionId', authorize('teacher'), async (req, res) => {
  try {
    const Question = (await import('../models/Question.js')).default
    const Response = (await import('../models/Response.js')).default

    const question = await Question.findById(req.params.questionId)
    if (!question) {
      return res.status(404).json({ success: false, error: 'Question not found' })
    }

    // Verify teacher owns the room where this question was asked
    const Room = (await import('../models/Room.js')).default
    const room = await Room.findById(question.roomId)
    if (!room || room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' })
    }

    const responses = await Response.find({ questionId: req.params.questionId })
    const totalResponses = responses.length
    const correctCount = responses.filter(r => r.isCorrect).length
    const accuracy = totalResponses > 0 ? (correctCount / totalResponses) * 100 : 0

    // Provide detailed stats for SpandanGPT to reason about
    res.json({
      success: true,
      stats: {
        totalResponses,
        correctCount,
        accuracy: Math.round(accuracy),
        message: `So far, ${totalResponses} students have answered. Accuracy is at ${Math.round(accuracy)}%.`
      }
    })
  } catch (error) {
    console.error('[SpandanGPT] API Error (poll-status):', error)
    res.status(500).json({ success: false, error: 'Failed to fetch poll status' })
  }
})

/**
 * GET /api/spandangpt/global-stats
 * SpandanGPT uses this to answer general queries about what is happening on the website.
 */
router.get('/global-stats', authorize('teacher'), async (req, res) => {
  try {
    const Room = (await import('../models/Room.js')).default
    const Question = (await import('../models/Question.js')).default
    const Response = (await import('../models/Response.js')).default

    // Find all active rooms for this teacher
    const activeRooms = await Room.find({ teacher: req.user._id, isActive: true })
    const activeRoomIds = activeRooms.map(r => r._id)

    // Find all questions launched in these active rooms
    const questions = await Question.find({ roomId: { $in: activeRoomIds } })
    const questionIds = questions.map(q => q._id)

    // Find all responses to these questions
    const responses = await Response.find({ questionId: { $in: questionIds } })
    const correctResponses = responses.filter(r => r.isCorrect).length

    const overallAccuracy = responses.length > 0 ? Math.round((correctResponses / responses.length) * 100) : 0

    res.json({
      success: true,
      stats: {
        activeRooms: activeRooms.length,
        totalPolls: questions.length,
        totalResponses: responses.length,
        overallAccuracy,
        message: `You have ${activeRooms.length} active room(s). You've launched ${questions.length} polls today, receiving ${responses.length} total responses with a ${overallAccuracy}% average accuracy.`
      }
    })
  } catch (error) {
    console.error('[SpandanGPT] API Error (global-stats):', error)
    res.status(500).json({ success: false, error: 'Failed to fetch global stats' })
  }
})

/**
 * POST /api/spandangpt/generate
 * SpandanGPT uses this to generate a question from a natural language prompt.
 * If MINIMAX_API_KEY is configured in .env, it uses the real LLM. 
 * Otherwise, it falls back to a simulated mock response for UI testing.
 */
router.post('/generate', authorize('teacher'), async (req, res) => {
  try {
    const { prompt, difficulty = 'Normal' } = req.body

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt is required' })
    }

    let generatedQuestion

    // Check if we have an API key to do real generation
    const { config } = await import('../config.js')
    if (config.minimaxApiKey || process.env.MINIMAX_API_KEY) {
      console.log(`[SpandanGPT] Generating real question via MiniMax for prompt: ${prompt}`)
      const { generateQuestions } = await import('../services/questionService.js')
      
      const generatedQuestionsArray = await generateQuestions(prompt, {
        numQuestions: 1,
        difficulty: difficulty.toLowerCase(),
        provider: 'minimax'
      })

      if (generatedQuestionsArray && generatedQuestionsArray.length > 0) {
        generatedQuestion = generatedQuestionsArray[0]
        generatedQuestion.timeToAnswer = 30 // Set default timer
      } else {
        throw new Error('AI returned empty response')
      }
    } else if (config.groqApiKey || process.env.GROQ_API_KEY) {
      console.log(`[SpandanGPT] Generating real question via Groq for prompt: ${prompt}`)
      const { generateQuestions } = await import('../services/questionService.js')
      
      const generatedQuestionsArray = await generateQuestions(prompt, {
        numQuestions: 1,
        difficulty: difficulty.toLowerCase(),
        provider: 'groq'
      })

      if (generatedQuestionsArray && generatedQuestionsArray.length > 0) {
        generatedQuestion = generatedQuestionsArray[0]
        generatedQuestion.timeToAnswer = 30 // Set default timer
      } else {
        throw new Error('AI returned empty response')
      }
    } else {
      // ── MOCK FALLBACK MODE (If no API key provided) ──
      console.log(`[SpandanGPT] No API key found. Using simulated Mock response.`)
      await new Promise(resolve => setTimeout(resolve, 1500))

      let optionsText = [
        { text: `Basic answer related to: ${prompt}`, isCorrect: false },
        { text: `Detailed correct answer for ${prompt} (${difficulty} mode)`, isCorrect: true },
        { text: `Common misconception about ${prompt}`, isCorrect: false },
        { text: `Unrelated distractor`, isCorrect: false }
      ]
      
      if (difficulty === 'Hard') {
        optionsText = [
          { text: `Complex nuanced answer`, isCorrect: false },
          { text: `Highly specific correct theoretical answer for ${prompt}`, isCorrect: true },
          { text: `Tricky distractor`, isCorrect: false },
          { text: `Another tricky distractor`, isCorrect: false }
        ]
      }

      generatedQuestion = {
        type: 'multiple_choice',
        question: `[${difficulty}] What is the primary concept regarding ${prompt}?`,
        options: optionsText,
        timeToAnswer: 30,
        points: 100
      }
    }

    res.json({ success: true, question: generatedQuestion })
  } catch (error) {
    console.error('[SpandanGPT] API Error (generate):', error)
    res.status(500).json({ success: false, error: error.message || 'Failed to generate question' })
  }
})

/**
 * GET /api/spandangpt/teacher/history
 * Fetch past rooms and poll statistics for the teacher's history panel.
 */
router.get('/teacher/history', authorize('teacher'), async (req, res) => {
  try {
    const Room = (await import('../models/Room.js')).default
    const Question = (await import('../models/Question.js')).default
    
    const rooms = await Room.find({ teacher: req.user._id }).sort({ createdAt: -1 }).limit(10)
    
    const history = await Promise.all(rooms.map(async (room) => {
      const questions = await Question.find({ roomId: room._id })
      return {
        _id: room._id,
        name: room.name,
        code: room.code,
        date: room.createdAt,
        pollCount: questions.length
      }
    }))
    
    res.json({ success: true, history })
  } catch (error) {
    console.error('[SpandanGPT] API Error (teacher-history):', error)
    res.status(500).json({ success: false, error: 'Failed to fetch teacher history' })
  }
})

/**
 * GET /api/spandangpt/student/history
 * Fetch past responses for the student to review.
 */
router.get('/student/history', authorize('student'), async (req, res) => {
  try {
    const Response = (await import('../models/Response.js')).default
    const Question = (await import('../models/Question.js')).default
    const Room = (await import('../models/Room.js')).default

    const responses = await Response.find({ student: req.user._id }).sort({ submittedAt: -1 }).limit(15)
    
    const history = await Promise.all(responses.map(async (r) => {
      const q = await Question.findById(r.questionId)
      if (!q) return null
      const room = await Room.findById(q.roomId)
      
      const correctOption = q.options.find(opt => opt.isCorrect)
      const selectedOption = q.options[r.selectedOption] || { text: 'Unknown' }
      
      return {
        _id: r._id,
        roomName: room ? room.name : 'Unknown Room',
        question: q.question,
        isCorrect: r.isCorrect,
        selectedOption: selectedOption.text,
        correctOption: correctOption ? correctOption.text : 'Unknown',
        date: r.submittedAt
      }
    }))
    
    res.json({ success: true, history: history.filter(Boolean) })
  } catch (error) {
    console.error('[SpandanGPT] API Error (student-history):', error)
    res.status(500).json({ success: false, error: 'Failed to fetch student history' })
  }
})

/**
 * POST /api/spandangpt/student/chat
 * Student study assistant.
 */
router.post('/student/chat', authorize('student'), async (req, res) => {
  try {
    const { prompt } = req.body
    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' })

    const { config } = await import('../config.js')
    
    // Fallback logic
    const generateSmartMock = (promptText) => {
      if (promptText.includes('Explain briefly (max 3 lines) why my answer was wrong')) {
        return `[Mock Insight] Your answer was incorrect because you missed a key detail. The correct concept focuses on the core principles we discussed in class. Review Chapter 3 for a deeper understanding!`
      }
      return `[Mock AI] That is a great question. Based on your recent classes, the professor emphasized core algorithms. Keep practicing!`
    }

    if (config.groqApiKey || process.env.GROQ_API_KEY) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.groqApiKey || process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: 'You are a helpful study assistant for students. When explaining concepts, keep your answer brief, direct, and STRICTLY under 3 sentences/lines.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 300
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        const reply = data.choices?.[0]?.message?.content || 'I could not process your request right now.'
        return res.json({ success: true, reply })
      } else {
        const errorText = await response.text()
        return res.json({ success: true, reply: `[Groq API Error: ${response.status}] ` + generateSmartMock(prompt) })
      }
    } else if (config.googleApiKey || process.env.GOOGLE_API_KEY) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.googleApiKey || process.env.GOOGLE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: 'System: You are a helpful study assistant for students. When explaining concepts, keep your answer brief, direct, and STRICTLY under 3 sentences/lines.\n\nUser: ' + prompt }]
          }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
        })
      })
      if (response.ok) {
        const data = await response.json()
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not process your request right now.'
        return res.json({ success: true, reply })
      } else {
        return res.json({ success: true, reply: `[Google API Error: ${response.status}] ` + generateSmartMock(prompt) })
      }
    } else if (config.minimaxApiKey || process.env.MINIMAX_API_KEY) {
      const response = await fetch('https://samagama.in/platform/proxy/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.minimaxApiKey || process.env.MINIMAX_API_KEY}`
        },
        body: JSON.stringify({
          model: 'MiniMaxAI/MiniMax-M2.7',
          messages: [
            { role: 'system', content: 'You are a helpful study assistant for students. When explaining concepts, keep your answer brief, direct, and STRICTLY under 3 sentences/lines.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 300
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.base_resp && data.base_resp.status_code !== 0) {
           return res.json({ success: true, reply: `[API Error: ${data.base_resp.status_msg}] ` + generateSmartMock(prompt) })
        }
        if (data.type === 'error') {
           return res.json({ success: true, reply: `[API Error: ${data.error?.message}] ` + generateSmartMock(prompt) })
        }
        const reply = data.choices?.[0]?.message?.content || 'I could not process your request right now.'
        return res.json({ success: true, reply })
      } else {
        const errorText = await response.text()
        return res.json({ success: true, reply: `[MiniMax API Error: ${response.status}] ` + generateSmartMock(prompt) })
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 1000))
      res.json({ success: true, reply: generateSmartMock(prompt) })
    }
  } catch (error) {
    console.error('[SpandanGPT] API Error (student-chat):', error)
    res.status(500).json({ success: false, error: 'Failed to process chat' })
  }
})

/**
 * POST /api/spandangpt/teacher/chat
 * Teacher insight generator. Uses AI to analyze current classroom stats.
 */
router.post('/teacher/chat', authorize('teacher'), async (req, res) => {
  try {
    const { prompt } = req.body
    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' })

    const { config } = await import('../config.js')
    
    // 1. Gather live classroom stats
    const Room = (await import('../models/Room.js')).default
    const Question = (await import('../models/Question.js')).default
    const Response = (await import('../models/Response.js')).default

    const activeRooms = await Room.find({ teacher: req.user._id, isActive: true })
    const activeRoomIds = activeRooms.map(r => r._id)
    const activeRoomsData = activeRooms.map(r => `"${r.name}" (Code: ${r.code})`).join(', ')

    const questions = await Question.find({ roomId: { $in: activeRoomIds } })
    const questionIds = questions.map(q => q._id)

    const responses = await Response.find({ questionId: { $in: questionIds } })
    const correctResponses = responses.filter(r => r.isCorrect).length
    const overallAccuracy = responses.length > 0 ? Math.round((correctResponses / responses.length) * 100) : 0

    // 2. Build the context prompt
    const systemPrompt = `You are a helpful, professional, and clear teaching assistant named 'Spandan AI'.
The teacher is asking for insights about their live classroom.
Here are the real-time stats:
- Active Rooms: ${activeRooms.length} (${activeRoomsData || 'None'})
- Total Polls Launched: ${questions.length}
- Total Responses Received: ${responses.length}
- Overall Class Accuracy: ${overallAccuracy}%

Respond to the teacher's query naturally, simply, and cleanly based on these stats. Do not use rigid templates.`

    // 3. Call the AI API (Groq first, then MiniMax Proxy)
    if (config.groqApiKey || process.env.GROQ_API_KEY) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.groqApiKey || process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      })

      // Helper to generate a smart mock response when proxy fails
      const generateSmartMock = (promptText) => {
        const lower = promptText.toLowerCase()
        if (lower.includes('hello') || lower.includes('hi ') || lower.trim() === 'hi' || lower.includes('hey')) {
          return `Hello! I am Spandan AI, your teaching assistant. How can I help you manage your classroom today?`
        } else if (lower.includes('stat') || lower.includes('update') || lower.includes('happen')) {
          return `Here's your live update: You have ${activeRooms.length} active room(s) running and ${questions.length} polls launched. Your class accuracy is currently ${overallAccuracy}%.`
        } else {
          return `I am your Spandan AI assistant! (Proxy unavailable for full AI response). You have ${activeRooms.length} active room(s). How else can I assist?`
        }
      }

      if (response.ok) {
        const data = await response.json()
        const reply = data.choices?.[0]?.message?.content || 'I could not generate an insight right now.'
        return res.json({ success: true, reply })
      } else {
        // Fallback for API failure
        return res.json({ success: true, reply: `[Groq API Error: ${response.status}] ` + generateSmartMock(prompt) })
      }
    } else if (config.googleApiKey || process.env.GOOGLE_API_KEY) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.googleApiKey || process.env.GOOGLE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: `System: ${systemPrompt}\n\nUser: ${prompt}` }]
          }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
        })
      })
      if (response.ok) {
        const data = await response.json()
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not generate an insight right now.'
        return res.json({ success: true, reply })
      } else {
        // Fallback for API failure
        const generateSmartMock = (promptText) => {
          const lower = promptText.toLowerCase()
          if (lower.includes('hello') || lower.includes('hi ') || lower.trim() === 'hi' || lower.includes('hey')) {
            return `Hello! I am Spandan AI, your teaching assistant. How can I help you manage your classroom today?`
          } else if (lower.includes('stat') || lower.includes('update') || lower.includes('happen')) {
            return `Here's your live update: You have active room(s) running and polls launched.`
          } else {
            return `I am your Spandan AI assistant! (Proxy unavailable for full AI response). How else can I assist?`
          }
        }
        return res.json({ success: true, reply: `[Google API Error: ${response.status}] ` + generateSmartMock(prompt) })
      }
    } else if (config.minimaxApiKey || process.env.MINIMAX_API_KEY) {
      const response = await fetch('https://samagama.in/platform/proxy/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.minimaxApiKey || process.env.MINIMAX_API_KEY}`
        },
        body: JSON.stringify({
          model: 'MiniMaxAI/MiniMax-M2.7',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      })

        // Helper to generate a smart mock response when proxy fails
        const generateSmartMock = (promptText) => {
          const lower = promptText.toLowerCase()
          if (lower.includes('hello') || lower.includes('hi ') || lower.trim() === 'hi' || lower.includes('hey')) {
            return `Hello! I am Spandan AI, your teaching assistant. How can I help you manage your classroom today?`
          } else if (lower.includes('stat') || lower.includes('update') || lower.includes('happen')) {
            return `Here's your live update: You have ${activeRooms.length} active room(s) running and ${questions.length} polls launched. Your class accuracy is currently ${overallAccuracy}%.`
          } else {
            return `I am your Spandan AI assistant! (Proxy unavailable for full AI response). You have ${activeRooms.length} active room(s). How else can I assist?`
          }
        }

      if (response.ok) {
        const data = await response.json()
        if (data.base_resp && data.base_resp.status_code !== 0) {
           return res.json({ success: true, reply: `[API Error: ${data.base_resp.status_msg}] ` + generateSmartMock(prompt) })
        }
        if (data.type === 'error') {
           return res.json({ success: true, reply: `[API Error: ${data.error?.message}] ` + generateSmartMock(prompt) })
        }
        const reply = data.choices?.[0]?.message?.content || 'I could not generate an insight right now.'
        return res.json({ success: true, reply })
      } else {
        // Fallback for API failure
        return res.json({ success: true, reply: `[MiniMax API Error: ${response.status}] ` + generateSmartMock(prompt) })
      }
    } else {
      // Helper to generate a smart mock response when no API key
      const generateSmartMock = (promptText) => {
        const lower = promptText.toLowerCase()
        if (lower.includes('hello') || lower.includes('hi ') || lower.trim() === 'hi' || lower.includes('hey')) {
          return `Hello! I am Spandan AI, your teaching assistant. How can I help you manage your classroom today?`
        } else if (lower.includes('stat') || lower.includes('update') || lower.includes('happen')) {
          return `Here's your live update: You have ${activeRooms.length} active room(s) running and ${questions.length} polls launched. Your class accuracy is currently ${overallAccuracy}%.`
        } else {
          return `I am your Spandan AI assistant! You have ${activeRooms.length} active room(s). How else can I assist?`
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000))
      res.json({ success: true, reply: generateSmartMock(prompt) })
    }
  } catch (error) {
    console.error('[SpandanGPT] API Error (teacher-chat):', error)
    res.status(500).json({ success: false, error: 'Failed to process chat' })
  }
})

export default router
