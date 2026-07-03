// transcriptWindowService.js
// Tracks how much of the running transcript has already been used for
// question generation, so the same chunk never gets re-sent (no duplicate
// questions at the 12min / 24min marks etc).
// Pure state — no API calls.

let state = {
  lastProcessedIndex: 0,   // character index up to which transcript has been processed
  lastWindowId: 0,         // increments every time a new window is processed
  lastGenerationTimestamp: null
}

export function getState() {
  return state
}

// Given the full running transcript, return only the new text since last processed.
export function getNewTranscript(fullTranscript = '') {
  if (!fullTranscript) return ''
  const newText = fullTranscript.slice(state.lastProcessedIndex)
  return newText.trim()
}

// Call after a transcript chunk has been successfully sent for generation.
export function markProcessed(fullTranscript = '') {
  state = {
    lastProcessedIndex: fullTranscript.length,
    lastWindowId: state.lastWindowId + 1,
    lastGenerationTimestamp: Date.now()
  }
  return state
}

export function getWindowMetadata() {
  return { ...state }
}

// Reset on new segment / new room session.
export function reset() {
  state = { lastProcessedIndex: 0, lastWindowId: 0, lastGenerationTimestamp: null }
}