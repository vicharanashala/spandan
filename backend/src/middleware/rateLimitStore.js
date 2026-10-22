// Rate-limit store that survives a Redis outage.
//
// With Redis up, limits are counted in Redis so they are global across backend instances. If Redis
// goes away at runtime, a plain RedisStore would queue every command in the client's offline queue
// and EVERY /api request would hang until Redis came back. This store checks the connection first
// and, when Redis is down, slow (> timeoutMs) or erroring, counts in this process's memory instead.
//
// Security: limits are never switched off (fail-over, not fail-open). During an outage each
// instance enforces the same limit on its own, so the effective limit is at most N x looser for N
// instances, and it returns to the shared Redis counts as soon as the client reconnects.

import { MemoryStore } from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'

const withTimeout = (p, ms) => {
  let timer
  return Promise.race([p, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`redis timeout after ${ms} ms`)), ms) })])
    .finally(() => clearTimeout(timer))
}

export class FailoverStore {
  constructor({ prefix, client, timeoutMs = 500 }) {
    this.prefix = prefix
    this.localKeys = false // counts are shared through Redis whenever it is up
    this.client = client
    this.timeoutMs = timeoutMs
    this.redis = new RedisStore({ prefix, sendCommand: (...args) => client.sendCommand(args) })
    this.memory = new MemoryStore()
    this.degraded = false
  }

  init(options) {
    this.redis.init(options)
    this.memory.init(options)
  }

  // Run on Redis when connected; otherwise (or on error/timeout) on memory. Logs once per outage,
  // not per request, so an outage can't flood the logs.
  async run(op, key) {
    if (this.client?.isReady) {
      try {
        const out = await withTimeout(this.redis[op](key), this.timeoutMs)
        if (this.degraded) { this.degraded = false; console.log(`[rate-limit] ${this.prefix} back on Redis`) }
        return out
      } catch (e) {
        this.markDegraded(e.message)
      }
    } else {
      this.markDegraded('redis not connected')
    }
    return this.memory[op](key)
  }

  markDegraded(reason) {
    if (this.degraded) return
    this.degraded = true
    console.error(`[rate-limit] ${this.prefix} Redis unavailable (${reason}), counting in memory`)
  }

  get(key) { return this.run('get', key) }
  increment(key) { return this.run('increment', key) }
  decrement(key) { return this.run('decrement', key) }
  resetKey(key) { return this.run('resetKey', key) }
  resetAll() { return this.memory.resetAll() } // RedisStore has no resetAll
  shutdown() { this.memory.shutdown() }
}
