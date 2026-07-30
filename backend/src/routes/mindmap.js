import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { generateWithMiniMax } from '../services/questionService.js'

const router = express.Router()

// Apply authentication to all routes
router.use(authenticate)

// POST /api/mindmap/generate
// Authorization: teacher only
router.post('/generate', authorize('teacher'), async (req, res) => {
  try {
    const { transcript } = req.body

    if (!transcript || transcript.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Transcript is required'
      })
    }

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

    console.log('[mindmap] Calling Minimax API...')
    let markdown = await generateWithMiniMax(prompt)

    // Clean up potential markdown formatting from LLM
    markdown = markdown.replace(/```mermaid/g, '').replace(/```/g, '').trim()
    
    // Ensure it starts with mindmap
    if (!markdown.startsWith('mindmap')) {
      markdown = 'mindmap\n' + markdown
    }

    res.json({
      success: true,
      markdown
    })

  } catch (error) {
    console.error('Mindmap generation error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate mind map'
    })
  }
})

export default router
