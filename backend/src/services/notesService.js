import Note from '../models/Note.js'
import Transcript from '../models/Transcript.js'

/**
 * Generate notes from a transcript using the existing AI generation endpoint logic.
 * Currently reuses the same mock generation that /notes/generate uses.
 * In production replace with real AI service call.
 */
export async function generateNotesFromTranscript(roomId, title) {
  // Get the latest transcript for the room
  const latest = await Transcript.findOne({ roomId })
    .sort({ segmentIndex: -1 })
    .lean()

  const transcript = latest ? latest.text : ''

  // Reuse the same mock AI logic as notes.js generate endpoint
  let generatedContent = `# ${title || 'Class Notes'}\n\n`
  if (transcript) {
    generatedContent += `## Overview\nBased on the provided transcript, here are the key points discussed:\n\n`
    generatedContent += `- Introduction to the topic.\n`
    generatedContent += `- Key concepts discussed in the transcript.\n`
    generatedContent += `- Summary of main arguments.\n`
  } else {
    generatedContent += `## Overview\nNo transcript was provided, so here is a general template for ${title}.\n\n`
    generatedContent += `- Point 1\n- Point 2\n- Point 3\n`
  }
  generatedContent += `\n## Detailed Notes\n\n*Review and edit these generated notes before publishing.*`

  // Persist the generated note (draft) tied to the room
  const note = new Note({
    title,
    content: generatedContent,
    status: 'draft',
    teacher: null, // will be set by the caller (middleware provides req.user)
    roomId,
    topic: ''
  })

  await note.save()
  return note
}

/**
 * Retrieve notes for a specific room filtered by a topic.
 * If topic is empty, returns all notes for the room.
 */
export async function getTopicNotes(roomId, topic = '') {
  const query = { roomId }
  if (topic) query.topic = topic
  const notes = await Note.find(query).sort({ createdAt: -1 }).lean()
  return notes
}
