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

function repairTruncatedJson(responseText) {
  const topicMatch = responseText.match(/"topic"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  const titleMatch = responseText.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  const contentStartMatch = responseText.match(/"content"\s*:\s*"/)
  if (!contentStartMatch) return null
  const contentFrom = responseText.slice(contentStartMatch.index + contentStartMatch[0].length)
  const content = contentFrom.replace(/["]\s*\}?\s*$/, '').trim()
  if (!content) return null
  return {
    topic: topicMatch ? topicMatch[1] : 'General Notes',
    title: titleMatch ? titleMatch[1] : 'Class Notes',
    content
  }
}

function repairYamlBlockScalar(jsonStr) {
  return jsonStr.replace(
    /"content"\s*:\s*\|\s*\n([\s\S]*?)(\n\s*\})/,
    (match, content, closing) => {
      const lines = content.split('\n')
      const cleaned = lines
        .map(l => l.trim())
        .filter(Boolean)
        .join('\\n')
        .replace(/"/g, '\\"')
      return `"content": "${cleaned}"${closing}`
    }
  )
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
      try { return JSON.parse(lit) } catch { return lit.slice(1, -1) }
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
    } catch (e1) {
      try {
        parsed = JSON.parse(repairJsonNewlines(candidate))
      } catch (e2) {
        try {
          parsed = JSON.parse(repairJsonNewlines(repairYamlBlockScalar(candidate)))
        } catch (e3) {
          throw new Error('All JSON repair attempts failed')
        }
      }
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
    try {
      const topicMatch = responseText.match(/"topic"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      const titleMatch = responseText.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/)

      const concatenatedContent = extractConcatenatedContent(responseText)
      if (concatenatedContent) {
        return {
          topic: topicMatch ? topicMatch[1] : 'General Notes',
          title: titleMatch ? titleMatch[1] : 'Class Notes',
          content: concatenatedContent
        }
      }

      const contentMatch = responseText.match(/"content"\s*:\s*"([\s\S]*?)"\s*\}/)
      if (contentMatch && contentMatch[1]) {
        const rawContent = contentMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
        return {
          topic: topicMatch ? topicMatch[1] : 'General Notes',
          title: titleMatch ? titleMatch[1] : 'Class Notes',
          content: rawContent
        }
      }

      const truncatedResult = repairTruncatedJson(responseText)
      if (truncatedResult) return truncatedResult

    } catch (regexErr) {
      // fall through to raw-text fallback
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

function summarizeWrongAnswers(question, wrongResponses) {
  const counts = {}
  wrongResponses.forEach(r => {
    const chosen = (r.selectedOptions && r.selectedOptions.length) ? r.selectedOptions : [r.selectedOption]
    chosen.forEach(idx => {
      if (idx === undefined || idx === null) return
      counts[idx] = (counts[idx] || 0) + 1
    })
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([idx, count]) => {
      const opt = question.options?.[idx]
      return opt ? `- "${opt.text}" was picked by ${count} student(s) (incorrect)` : null
    })
    .filter(Boolean)
    .join('\n')
}

export async function generateQuestionFocusedNote(question, wrongResponses, provider) {
  if (!provider) {
    throw new Error('provider is required to generate a question-focused note')
  }

  const topicHint = question.topic || 'Revision Notes'
  const correctAnswers = Array.isArray(question.options)
    ? question.options.filter(o => o.isCorrect).map(o => o.text).join(', ')
    : 'Unknown'
  const allOptions = Array.isArray(question.options)
    ? question.options.map((o, i) => `${i + 1}. ${o.text}${o.isCorrect ? ' (correct)' : ''}`).join('\n')
    : ''
  const mistakePattern = summarizeWrongAnswers(question, wrongResponses)

  const transcriptText = `
We are providing targeted revision notes for students who answered the following question incorrectly.

Question: ${question.question}
All options:
${allOptions}

Correct Answer(s): ${correctAnswers}
${question.explanation ? `Teacher's existing explanation: ${question.explanation}` : ''}

Breakdown of incorrect answers chosen by students:
${mistakePattern || 'Not available'}

Number of students who answered incorrectly: ${wrongResponses.length}

Write clear, encouraging revision notes that:
1. Directly address WHY the specific wrong option(s) above are common misconceptions, not just why the correct answer is right.
2. Explain the underlying concept simply, as if to a student who just got this wrong.
3. End with a one-line memory tip or mnemonic if natural.
Keep it concise (150-250 words) and highly specific to this question — do not give generic advice.
`

  return await generateNoteContent({
    transcriptText,
    topicHint,
    provider
  })
}