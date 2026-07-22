// Phase 2D — question-generation worker. Runs as its own process (pm2/systemd), separate from
// the API, so long LLM calls never tie up API connections. Pulls jobs off the BullMQ queue and
// runs the same generateQuestions() the API used to run inline. Requires REDIS_URL.
import dotenv from 'dotenv'
dotenv.config()

import { Worker } from 'bullmq'
import { generateQuestions } from './services/questionService.js'
import { GENERATION_QUEUE, makeBullConnection } from './services/generationQueue.js'

const REDIS_URL = process.env.REDIS_URL
if (!REDIS_URL) {
  console.error('[worker] REDIS_URL is required to run the generation worker. Exiting.')
  process.exit(1)
}

// Bounded concurrency so N teachers generating at once can't overwhelm the LLM provider / memory.
const concurrency = Number(process.env.GENERATION_CONCURRENCY) || 2

const worker = new Worker(
  GENERATION_QUEUE,
  async (job) => {
    const { transcript, config } = job.data
    const questions = await generateQuestions(transcript, config || {})
    return questions
  },
  { connection: makeBullConnection(), concurrency }
)

worker.on('completed', (job) =>
  console.log(`[worker] job ${job.id} done — ${Array.isArray(job.returnvalue) ? job.returnvalue.length : 0} questions`))
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed:`, err?.message))
worker.on('error', (err) => console.error('[worker] error:', err?.message))

console.log(`[worker] question-generation worker started (concurrency ${concurrency})`)
