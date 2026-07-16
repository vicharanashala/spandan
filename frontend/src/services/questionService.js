import { API_URL } from '../config.js'
import api from '../lib/api'
import useAuthStore from '../stores/authStore.js'

// Get available AI providers
export const getAIProviders = async () => {
  const token = useAuthStore.getState().token
  const response = await fetch(`${API_URL}/questions/providers`, {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch AI providers: ${response.statusText}`)
  }
  const data = await response.json()
  return data
}

// Request question generation and return { success, questions } | { success:false, error }.
// The backend may respond either SYNCHRONOUSLY (no Redis) with the questions, or ASYNCHRONOUSLY
// (Phase 2D) with a jobId — in which case we POLL the job here, ONLY for the lifetime of this
// call (i.e. only while the caller is showing its "Generating…" UI). Polling tears itself down
// as soon as the job completes/fails/times out; one request in flight at a time; an optional
// AbortSignal cancels it (e.g. on unmount). No background polling ever runs.
export const requestQuestionGeneration = async (transcript, config, opts = {}) => {
  const token = useAuthStore.getState().token
  const authHeader = { 'Authorization': `Bearer ${token}` }
  const { signal } = opts
  const pollIntervalMs = opts.pollIntervalMs || 2500
  const maxWaitMs = opts.maxWaitMs || 6 * 60 * 1000

  const res = await fetch(`${API_URL}/questions/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify({ transcript, config }),
    signal
  })
  const data = await res.json()

  // Sync path (no Redis): questions returned directly.
  if (!data.async || !data.jobId) return data

  // Async path: poll the job until done. Await each poll so only one request is in flight.
  const jobId = data.jobId
  const start = Date.now()
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (Date.now() - start > maxWaitMs) return { success: false, error: 'Generation timed out' }
    await new Promise((r) => setTimeout(r, pollIntervalMs))
    let s
    try {
      const sres = await fetch(`${API_URL}/questions/jobs/${jobId}`, { headers: authHeader, signal })
      s = await sres.json()
    } catch (e) {
      if (signal?.aborted) throw e
      continue // transient network error — keep polling until the ceiling
    }
    if (s.status === 'completed') return { success: true, questions: s.questions || [] }
    if (s.status === 'failed') return { success: false, error: s.error || 'Generation failed' }
    // 'processing' / transient 'not_found' — keep polling
  }
}

// Backward-compatible wrapper — now normalizes async↔sync via requestQuestionGeneration.
export const generateQuestions = async (transcript, config) => requestQuestionGeneration(transcript, config)
