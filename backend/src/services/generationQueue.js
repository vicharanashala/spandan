import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { isRedisEnabled } from '../config/redis.js'

// Phase 2D — async question generation via a BullMQ queue on Redis. This lets POST /generate
// return a jobId immediately (freeing the HTTP connection) while a separate worker runs the LLM
// call with bounded concurrency. Graceful: when Redis is disabled the route falls back to
// synchronous generation, so nothing here is required for single-instance / no-Redis setups.

export const GENERATION_QUEUE = 'question-generation'

// BullMQ uses ioredis (separate from the node-redis client in config/redis.js). Each Queue/Worker
// gets its own connection. maxRetriesPerRequest:null is required by BullMQ.
export function makeBullConnection() {
  return new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
}

let queue = null
// Returns the generation Queue, or null when Redis is disabled (caller falls back to sync).
export function getGenerationQueue() {
  if (!isRedisEnabled()) return null
  if (!queue) {
    queue = new Queue(GENERATION_QUEUE, { connection: makeBullConnection() })
  }
  return queue
}
