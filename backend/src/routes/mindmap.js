import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { generateWithMiniMax } from '../services/questionService.js'

const router = express.Router()

// Apply authentication to all routes
router.use(authenticate)

// POST /api/mindmap/generate
// Authorization: teacher only
router.post('/generate', authorize('teacher'), async (req, res) => {
  const { transcript, roomCode } = req.body

  if (!transcript || transcript.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Transcript is required'
    })
  }
  
  if (!roomCode) {
    return res.status(400).json({
      success: false,
      error: 'roomCode is required'
    })
  }

  // Respond immediately so the teacher's UI doesn't hang
  res.status(202).json({
    success: true,
    message: 'Mind map generation started in the background'
  })

  // Process asynchronously
  setImmediate(async () => {
    try {
      const prompt = `You are an expert educational content structurer. Based on the following transcript, generate a Mind Map using Mermaid.js syntax.

RULES:
1. Output ONLY valid mermaid.js mindmap syntax.
2. Start the output with "mindmap"
3. Do NOT wrap the output in markdown code blocks (no \`\`\`mermaid)
4. Do NOT include any explanations or other text.
5. Use proper indentation (2 spaces per level) to indicate hierarchy.
6. The root node should be the main topic of the lecture.
7. Avoid using special characters or emojis in node titles.
8. Example format:
mindmap
  root((Main Topic))
    Concept 1
      Detail A
      Detail B
    Concept 2
      Detail C

TRANSCRIPT:
${transcript}`

      console.log('[mindmap] Calling Minimax API in background...')
      let markdown = await generateWithMiniMax(prompt)

      // Clean up potential markdown formatting from LLM
      markdown = markdown.replace(/```mermaid/g, '').replace(/```/g, '').trim()
      
      // Ensure it starts with mindmap
      if (!markdown.startsWith('mindmap')) {
        markdown = 'mindmap\n' + markdown
      }
      
      const { io } = await import('../index.js')
      io.to(roomCode).emit('mindmap_shared', { markdown })
      console.log(`[mindmap] Background generation complete, broadcasted to room ${roomCode}.`)

    } catch (error) {
      console.error('Mindmap background generation error:', error)
    }
  })
})

export default router
