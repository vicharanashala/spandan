import { config } from '../config.js'
import Note from '../models/Note.js'
import Transcript from '../models/Transcript.js'
import {
  generateWithMiniMax,
  generateWithOpenAI,
  generateWithAnthropic,
  generateWithGoogle,
  generateWithOllama
} from './questionService.js'

function buildNotePrompt(transcriptText, topicHint) {
  const topicInstruction = topicHint
    ? `The topic of these notes is exactly: "${topicHint}". Use this for the topic field.`
    : `Determine an appropriate, concise topic label for this segment.`

  return `You are an expert educator creating clear, well-structured revision notes for students based on a classroom transcript.

TRANSCRIPTION:
${transcriptText}

INSTRUCTIONS:
1. Extract the key educational points from the transcript.
2. Structure the content with Markdown (e.g., headings, bullet points, bold text). Make it readable and helpful for students to revise.
3. Determine a clear, short title for these notes.
4. ${topicInstruction}

OUTPUT FORMAT (respond ONLY with valid JSON):
{
  "topic": "The topic string here",
  "title": "The short title here",
  "content": "The markdown-formatted note content here"
}

IMPORTANT:
- Respond ONLY with valid JSON, no markdown blocks enclosing the JSON, no additional text.
- The "content" field MUST be a single continuous JSON string value. Do NOT split it into multiple quoted string fragments on separate lines (e.g. NEVER write "content": "line1\\n" "line2\\n" — this is invalid JSON). Use \\n inside the ONE string for line breaks instead.
- Do not make up information that is not in the transcript.`
}

function repairJsonNewlines(jsonStr) {
  let result = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i]
    if (escaped) {
      result += ch
      escaped = false
      continue
    }
    if (ch === '\\') {
      result += ch
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      result += ch
      continue
    }
    if (inString && (ch === '\n' || ch === '\r')) {
      result += '\\n'
      continue
    }
    result += ch
  }
  return result
}

// Handles the case where the model emits the content field as multiple adjacent
// quoted string literals instead of one JSON string, e.g.:
//   "content": "line1\n"
//              "line2\n"
//              "line3"
// This is valid JS/Python string concatenation but INVALID JSON, so JSON.parse
// fails on it. We detect the pattern and join the fragments ourselves.
function extractConcatenatedContent(responseText) {
  const keyMatch = responseText.match(/"content"\s*:\s*/)
  if (!keyMatch) return null

  const remainder = responseText.slice(keyMatch.index + keyMatch[0].length)
  const fragmentBlock = remainder.match(/^(\s*"(?:[^"\\]|\\.)*"\s*)+/)
  if (!fragmentBlock) return null

  const literals = fragmentBlock[0].match(/"(?:[^"\\]|\\.)*"/g) || []
  if (literals.length === 0) return null

  return literals
    .map(lit => {
      try {
        return JSON.parse(lit)
      } catch {
        return lit.slice(1, -1)
      }
    })
    .join('')
}

function parseNoteResponse(responseText) {
  try {
    if (!responseText || !responseText.trim()) {
      throw new Error('Empty AI response')
    }
    let jsonStr = responseText.trim()

    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    }

    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No JSON found in response')
    }
    const candidate = jsonStr.slice(firstBrace, lastBrace + 1)

    let parsed
    try {
      parsed = JSON.parse(candidate)
    } catch (parseErr) {
      parsed = JSON.parse(repairJsonNewlines(candidate))
    }

    if (!parsed.content) {
      throw new Error('Missing content field')
    }

    return {
      topic: parsed.topic || 'General Notes',
      title: parsed.title || 'Class Notes',
      content: parsed.content
    }
  } catch (error) {
    // Second-pass: try to regex-extract the three fields individually from the raw text.
    // This handles cases where JSON.parse fails due to unescaped newlines/quotes inside
    // the content string but the surrounding structure is otherwise correct.
    try {
      const topicMatch = responseText.match(/"topic"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      const titleMatch = responseText.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/)

      // First: handle the "multiple adjacent quoted strings" pattern (see
      // extractConcatenatedContent above) — this is what's causing the current failures.
      const concatenatedContent = extractConcatenatedContent(responseText)
      if (concatenatedContent) {
        return {
          topic: topicMatch ? topicMatch[1] : 'General Notes',
          title: titleMatch ? titleMatch[1] : 'Class Notes',
          content: concatenatedContent
        }
      }

      // Fallback: content as a single quoted string spanning many lines.
      const contentMatch = responseText.match(/"content"\s*:\s*"([\s\S]*?)"\s*\}/)

      if (contentMatch && contentMatch[1]) {
        const rawContent = contentMatch[1]
          .replace(/\\n/g, '\n')   // unescape \n
          .replace(/\\t/g, '\t')   // unescape \t
          .replace(/\\"/g, '"')    // unescape \"
          .replace(/\\\\/g, '\\')  // unescape \\
        return {
          topic: topicMatch ? topicMatch[1] : 'General Notes',
          title: titleMatch ? titleMatch[1] : 'Class Notes',
          content: rawContent
        }
      }
    } catch (regexErr) {
      // fall through to raw-text fallback below
    }

    console.warn('Failed to parse note JSON, falling back to raw text:', error.message)
    return {
      topic: '',
      title: 'Class Notes (needs formatting)',
      content: `*Note: the AI response could not be parsed as structured notes. Showing raw AI output below — please edit before releasing.*\n\n${responseText}`
    }
  }
}


export async function generateNoteContent({ transcriptText, topicHint, provider = 'minimax' }) {
  if (!transcriptText || transcriptText.trim().length === 0) {
    throw new Error('Transcript text is required to generate notes')
  }

  const prompt = buildNotePrompt(transcriptText, topicHint)
  console.log(`Generating notes with ${provider}...`)

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
    case 'ollama':
      responseText = await generateWithOllama(prompt)
      break
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }

  return parseNoteResponse(responseText)
}

export async function generateAutoNoteForRoom(roomId, teacherId) {
  const transcripts = await Transcript.find({ roomId }).sort({ segmentIndex: 1 }).lean()
  const transcriptText = transcripts.map(t => t.text).filter(Boolean).join('\n\n')

  if (!transcriptText.trim()) {
    console.log(`[auto-note] room ${roomId} has no transcript, skipping`)
    return null
  }

  let generated
  try {
    generated = await generateNoteContent({
      transcriptText,
      provider: config.defaultNoteProvider
    })
  } catch (err) {
    console.warn(`[auto-note] AI formatting failed for room ${roomId}, saving raw transcript instead:`, err.message)
    generated = {
      topic: 'General Notes',
      title: 'Class Notes (auto-generated, needs formatting)',
      content: `*Note: AI formatting failed, showing raw transcript below. Please edit before releasing.*\n\n${transcriptText}`
    }
  }

  const note = new Note({
    roomId,
    teacherId,
    topic: generated.topic || 'General Notes',
    title: generated.title || 'Class Notes',
    transcriptSource: 'auto',
    sourceText: transcriptText,
    content: generated.content,
    status: 'pending_review'
  })

  await note.save()
  console.log(`[auto-note] generated note ${note._id} for room ${roomId}`)
  return note
}

export async function generateQuestionFocusedNote(question, wrongStudentCount, provider = 'minimax') {
  const topicHint = question.topic || 'Revision Notes'
  const correctAnswers = Array.isArray(question.options)
    ? question.options.filter(o => o.isCorrect).map(o => o.text).join(', ')
    : 'Unknown'

  const transcriptText = `
We are providing targeted revision notes for students who struggled with the following question.
Question: ${question.question}
Correct Answer(s): ${correctAnswers}
Context/Topic: ${question.topic || 'General'}
Number of students who answered incorrectly: ${wrongStudentCount}

Please generate clear, encouraging, and helpful revision notes explaining the core concepts behind this question. Focus on why the correct answer is correct, clarify the underlying principles, and address common misconceptions. Keep it concise but highly educational.
`

  return await generateNoteContent({
    transcriptText,
    topicHint,
    provider
  })
}