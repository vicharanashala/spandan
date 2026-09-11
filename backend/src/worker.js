// Phase 2D — question-generation worker. Runs as its own process (pm2/systemd), separate from
// the API, so long LLM calls never tie up API connections. Pulls jobs off the BullMQ queue and
// runs the same generateQuestions() the API used to run inline. Requires REDIS_URL.
import dotenv from 'dotenv'
dotenv.config()

import { Worker } from 'bullmq'
import { generateQuestions, callProviderRaw, isRetryableProviderError, LLM_MAX_ATTEMPTS } from './services/questionService.js'
import { GENERATION_QUEUE, makeBullConnection } from './services/generationQueue.js'

const REDIS_URL = process.env.REDIS_URL
if (!REDIS_URL) {
  console.error('[worker] REDIS_URL is required to run the generation worker. Exiting.')
  process.exit(1)
}

// Bounded concurrency so N teachers generating at once (quiz generation) plus every remediation
// question generating in the background at room-end can't overwhelm the LLM provider / memory.
// Both job types below share this single cap instead of remediation running its own separate
// in-process semaphore on top of it.
const concurrency = Number(process.env.GENERATION_CONCURRENCY) || 2

// Retries a single remediation prompt with exponential backoff + jitter on transient provider
// errors (rate limits, timeouts, etc.), failing fast on non-retryable ones (bad API key, invalid
// model) instead of wasting attempts on something that will never succeed. Runs inside this job's
// slot, so it's already bounded by the Worker's `concurrency` above — no separate limiter needed.
async function generateRemediationWithRetry(provider, prompt, maxTokens) {
  let lastErr
  for (let attempt = 1; attempt <= LLM_MAX_ATTEMPTS; attempt++) {
    try {
      return await callProviderRaw(provider, prompt, maxTokens)
    } catch (err) {
      lastErr = err
      if (!isRetryableProviderError(err) || attempt === LLM_MAX_ATTEMPTS) throw err
      const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 10000) + Math.random() * 500
      console.warn(`[worker] Remediation provider call failed (attempt ${attempt}/${LLM_MAX_ATTEMPTS}), retrying in ${Math.round(backoffMs)}ms: ${err.message}`)
      await new Promise(r => setTimeout(r, backoffMs))
    }
  }
  throw lastErr
}

const worker = new Worker(
  GENERATION_QUEUE,
  async (job) => {
    if (job.name === 'generate-remediation') {
      const { provider, prompt, maxTokens } = job.data
      return await generateRemediationWithRetry(provider, prompt, maxTokens)
    }
    // Default / 'generate' — quiz generation from a transcript.
    const { transcript, config } = job.data
    const questions = await generateQuestions(transcript, config || {})
    return questions
  },
  { connection: makeBullConnection(), concurrency }
)

worker.on('completed', (job) => {
  if (job.name === 'generate-remediation') {
    console.log(`[worker] job ${job.id} (remediation) done — ${job.returnvalue?.length || 0} chars`)
  } else {
    console.log(`[worker] job ${job.id} done — ${Array.isArray(job.returnvalue) ? job.returnvalue.length : 0} questions`)
  }
})
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed:`, err?.message))
worker.on('error', (err) => console.error('[worker] error:', err?.message))

console.log(`[worker] question-generation worker started (concurrency ${concurrency})`)
