import { config } from '../config.js'
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
- Do not make up information that is not in the transcript.`
}

function parseNoteResponse(responseText) {
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
    return JSON.parse(objMatch[0])
  } catch (error) {
    console.error('Failed to parse note JSON:', error)
    throw new Error('Failed to parse AI response into JSON.')
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
