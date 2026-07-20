import { createClient } from 'redis'

// Phase 2A — optional Redis. If REDIS_URL is set and reachable, the app runs in
// multi-instance mode (socket.io adapter + shared rate-limit store + coordinated live
// broadcaster). If not, it falls back to single-instance in-memory behavior. This keeps
// local dev and prod-before-Redis working unchanged.

let enabled = false
let client = null      // general commands (locks, rank cache)
let pubClient = null   // socket.io adapter pub
let subClient = null   // socket.io adapter sub

export async function initRedis() {
  const REDIS_URL = process.env.REDIS_URL || '' // read at call time (after dotenv.config)
  if (!REDIS_URL) {
    console.log('[redis] REDIS_URL unset — single-instance mode (in-memory).')
    return { enabled: false }
  }
  try {
    const opts = {
      url: REDIS_URL,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => Math.min(retries * 200, 3000)
      }
    }
    client = createClient(opts)
    client.on('error', (e) => console.error('[redis] client error:', e.message))
    await client.connect()
    pubClient = client.duplicate()
    subClient = client.duplicate()
    pubClient.on('error', (e) => console.error('[redis] pub error:', e.message))
    subClient.on('error', (e) => console.error('[redis] sub error:', e.message))
    await pubClient.connect()
    await subClient.connect()
    enabled = true
    console.log(`[redis] connected — multi-instance mode enabled (${REDIS_URL.replace(/\/\/[^@]*@/, '//***@')}).`)
    return { enabled: true, client, pubClient, subClient }
  } catch (e) {
    console.error('[redis] connection failed — falling back to single-instance:', e.message)
    enabled = false
    return { enabled: false }
  }
}

export function isRedisEnabled() { return enabled }
export function getRedisClient() { return client }
