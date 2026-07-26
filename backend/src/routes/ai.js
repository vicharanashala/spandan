import express from 'express'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

// POST /api/ai/socratic - Generate a socratic response
router.post('/socratic', authenticate, async (req, res) => {
  try {
    const { questionText, correctAnswer, wrongAnswer } = req.body

    if (!questionText || !correctAnswer || !wrongAnswer) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY
    if (!MINIMAX_API_KEY) {
      // Fallback if no AI key
      return res.json({ 
        message: `Think about why you chose "${wrongAnswer}". Consider the core concepts of "${correctAnswer}". What might you have missed?` 
      })
    }

    const prompt = `You are a helpful Socratic AI tutor for a student. 
    The student was asked: "${questionText}"
    The correct answer is: "${correctAnswer}"
    The student incorrectly chose: "${wrongAnswer}"
    
    Do NOT give away the correct answer directly. Instead, ask a single, short, guiding question that helps them realize why their choice was wrong and guides them toward the correct concept. Keep it under 2 sentences.`

    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`
      },
      body: JSON.stringify({
        model: 'abab6.5s-chat',
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await response.json()
    const tutorMessage = data?.choices?.[0]?.message?.content || 'Think carefully about your answer and try again!'

    res.json({ message: tutorMessage })
  } catch (error) {
    console.error('Error generating Socratic response:', error)
    res.status(500).json({ error: 'Failed to generate Socratic response' })
  }
})

export default router
