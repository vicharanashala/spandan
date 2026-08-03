import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { generateWithMiniMax, generateWithGroq } from '../services/questionService.js'
import { fixMultiArgNodes } from '../services/termService.js'
import { config } from '../config.js'
import Mindmap from '../models/Mindmap.js'

const router = express.Router()

// Apply authentication to all routes
router.use(authenticate)

// POST /api/mindmap/generate
// Authorization: teacher only
router.post('/generate', authorize('teacher'), async (req, res) => {
  const { transcript, roomCode, roomId, segmentIndex } = req.body
  // Grab io from the Express app now, while we still have `req` — avoids the
  // circular `await import('../index.js')` inside the async background block.
  const io = req.app.get('io')

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
8. CRITICAL — each node has EXACTLY ONE label. NEVER put multiple comma-separated
   values inside one node's parentheses (e.g. "factors(\"a\", \"b\")" is INVALID).
   If a concept has multiple related items, give it its own line and list each
   item as a separate nested child node underneath instead.
9. Example format:
mindmap
  root((Main Topic))
    Concept 1
      Detail A
      Detail B
    Concept 2
      Detail C

TRANSCRIPT:
${transcript}`

      // Prefer Groq if configured (free tier, no billing needed); fall back to MiniMax.
      const useGroq = !!config.groqApiKey
      console.log(`[mindmap] Calling ${useGroq ? 'Groq' : 'MiniMax'} API in background...`)
      let markdown = useGroq ? await generateWithGroq(prompt) : await generateWithMiniMax(prompt)

      // Clean up potential markdown formatting from LLM
      markdown = markdown.replace(/```mermaid/g, '').replace(/```/g, '').trim()
      
      // Ensure it starts with mindmap
      if (!markdown.startsWith('mindmap')) {
        markdown = 'mindmap\n' + markdown
      }
      markdown = fixMultiArgNodes(markdown)
      
      // Persist BEFORE broadcasting — so if a student's fetch-on-join races the
      // socket event, the DB copy is already there to catch them.
      if (roomId) {
        try {
          // Default expiry is 24 hours. When the room ends, roomService will update this to 5 hours.
          const defaultExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
          await Mindmap.create({ roomId, markdown, segmentIndex, expiresAt: defaultExpiresAt })
        } catch (saveErr) {
          console.error('[mindmap] Failed to save mindmap to DB:', saveErr.message)
          // Don't block the broadcast just because persistence failed — students
          // currently in the room should still get it live.
        }
      }

      // io was captured from req.app above — no circular import needed.
      io.to(roomCode).emit('mindmap_shared', { markdown, segmentIndex })
      console.log(`[mindmap] Background generation complete, broadcasted to room ${roomCode}.`)

    } catch (error) {
      console.error('Mindmap background generation error:', error)
    }
  })
})

// ---------------------------------------------------------------------------
// GET /api/mindmap/room/:roomId
// Fetch mindmaps already generated for this room — used on page load/join so
// a student who joins AFTER a mindmap was generated still sees it, instead of
// relying purely on the live 'mindmap_shared' socket event.
// ---------------------------------------------------------------------------
router.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params
    const mindmaps = await Mindmap.find({ roomId }).sort({ segmentIndex: 1, createdAt: 1 })
    res.json({ success: true, mindmaps: mindmaps.map(m => m.markdown) })
  } catch (error) {
    console.error('[mindmap] Failed to fetch room mindmaps:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch mindmaps' })
  }
})

export default router