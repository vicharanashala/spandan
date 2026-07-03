// questionQueueService.js
// Pure state service for the teacher-side question queue.
// No API calls here — generation/filtering happens in backend services.
// React components subscribe via subscribe() and re-render on change.

let state = {
  queue: [],          // array of question objects waiting for teacher review
  activeQuestion: null // currently launched question (or null)
}

const listeners = new Set()

function notify() {
  listeners.forEach((cb) => cb(state))
}

export function subscribe(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export function getState() {
  return state
}

// Replace the queue with a fresh batch (e.g. top 4 from questionQualityService)
export function setQuestions(questions = []) {
  state = { ...state, queue: [...questions] }
  notify()
  return state.queue
}

// Add more candidates to the existing queue without wiping it
export function addQuestions(questions = []) {
  state = { ...state, queue: [...state.queue, ...questions] }
  notify()
  return state.queue
}

// Pop the next question off the queue and mark it active
export function launchNext() {
  if (state.queue.length === 0) return null
  const [next, ...rest] = state.queue
  state = { ...state, queue: rest, activeQuestion: next }
  notify()
  return next
}

// Remove a specific question from the queue without launching it
export function dismiss(questionId) {
  state = { ...state, queue: state.queue.filter((q) => q._id !== questionId && q.id !== questionId) }
  notify()
  return state.queue
}

// Clear the active question (e.g. when its timer ends)
export function clearActive() {
  state = { ...state, activeQuestion: null }
  notify()
}

// Reset everything (e.g. room ended / new session)
export function clear() {
  state = { queue: [], activeQuestion: null }
  notify()
}