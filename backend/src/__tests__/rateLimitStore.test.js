// FailoverStore: rate limits stay ENFORCED (never switched off) and requests never hang, whether
// Redis is working, disconnected, hanging or erroring.
import express from 'express'
import request from 'supertest'
import rateLimit from 'express-rate-limit'
import { FailoverStore } from '../middleware/rateLimitStore.js'

// Fake node-redis client. mode: 'ok' (counts in its own map), 'hang' (never answers), 'error'.
function fakeClient({ isReady = true, mode = 'ok' } = {}) {
  const counts = new Map()
  const client = {
    isReady,
    calls: 0,
    counts,
    sendCommand: async (args) => {
      if (args[0] === 'SCRIPT') return 'sha1'
      client.calls += 1
      if (mode === 'hang') return new Promise(() => {})
      if (mode === 'error') throw new Error('connection reset')
      if (args[0] === 'EVALSHA') { const k = args[3]; const n = (counts.get(k) || 0) + 1; counts.set(k, n); return [n, 60000] }
      if (args[0] === 'DECR') { counts.set(args[1], (counts.get(args[1]) || 0) - 1); return 0 }
      if (args[0] === 'DEL') { counts.delete(args[1]); return 1 }
      return null
    }
  }
  return client
}

function appWith(store, max = 3) {
  const app = express()
  app.use(rateLimit({ store, windowMs: 60000, max, message: { error: 'Too many requests' } }))
  app.get('/x', (req, res) => res.json({ ok: true }))
  return app
}

async function statuses(app, n) {
  const out = []
  for (let i = 0; i < n; i++) out.push((await request(app).get('/x')).status)
  return out
}

describe('FailoverStore', () => {
  let errSpy, logSpy
  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => { errSpy.mockRestore(); logSpy.mockRestore() })

  it('Redis working: counts in Redis and enforces the limit', async () => {
    const client = fakeClient()
    const store = new FailoverStore({ prefix: 'rl:t1:', client })
    expect(await statuses(appWith(store), 4)).toEqual([200, 200, 200, 429])
    expect([...client.counts.values()]).toEqual([4])
    expect(errSpy).not.toHaveBeenCalled()
  })

  it('Redis disconnected: no Redis call, limit still enforced from memory', async () => {
    const client = fakeClient({ isReady: false })
    const store = new FailoverStore({ prefix: 'rl:t2:', client })
    expect(await statuses(appWith(store), 4)).toEqual([200, 200, 200, 429])
    expect(client.calls).toBe(0)
    expect(errSpy).toHaveBeenCalledTimes(1) // one log per outage, not per request
  })

  it('Redis hanging: requests finish within the timeout and the limit is still enforced', async () => {
    const client = fakeClient({ mode: 'hang' })
    const store = new FailoverStore({ prefix: 'rl:t3:', client, timeoutMs: 30 })
    const t0 = Date.now()
    expect(await statuses(appWith(store), 4)).toEqual([200, 200, 200, 429])
    expect(Date.now() - t0).toBeLessThan(2000)
  })

  it('Redis erroring: falls back to memory and still enforces the limit', async () => {
    const store = new FailoverStore({ prefix: 'rl:t4:', client: fakeClient({ mode: 'error' }) })
    expect(await statuses(appWith(store), 4)).toEqual([200, 200, 200, 429])
  })

  it('returns to Redis once it reconnects', async () => {
    const client = fakeClient({ isReady: false })
    const store = new FailoverStore({ prefix: 'rl:t5:', client })
    const app = appWith(store, 100)
    await statuses(app, 2)
    client.isReady = true
    await statuses(app, 2)
    expect([...client.counts.values()]).toEqual([2])
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('back on Redis'))
  })
})
