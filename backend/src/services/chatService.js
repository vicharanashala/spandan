import { getRedisClient, isRedisEnabled } from '../config/redis.js'
import ChatMessage from '../models/ChatMessage.js'
import { registerShutdownTask } from '../utils/shutdown.js'

export const CHAT_FLUSH_MAX = Number(process.env.CHAT_FLUSH_MAX) || 5000
export const CHAT_FLUSH_MS = Number(process.env.CHAT_FLUSH_MS) || 78000
export const MONGO_BATCH_CHUNK = 2000
export const BROADCAST_INTERVAL_MS = 200
export const COOLDOWN_SEC = 10
const TTL_STATE_SEC = 7200 // 2h backstop for room state keys

const KEY_CHAT_ENABLED = (roomId) => `chat:room:${roomId}:enabled`
const KEY_CHAT_COOLDOWN = (roomId, studentId) => `chat:cooldown:${roomId}:${studentId}`
const KEY_CHAT_MESSAGES = (roomId) => `chat:room:${roomId}:messages`
const KEY_ACTIVE_ROOMS = 'chat:active_rooms'

// In-memory fallbacks when Redis is disabled or offline
const memoryChatEnabled = new Map() // roomId -> boolean
const memoryCooldowns = new Map()   // "${roomId}:${studentId}" -> expiryTimestampMs
const broadcastBuffer = new Map()   // roomCode -> Array<messageDoc>

let flushTimer = null
let broadcastTimer = null
let shutdownHooked = false
let redisOverrides = null

/**
 * Test helper for simulating Redis availability and mocked clients in ESM tests.
 */
export function setRedisOverridesForTest(overrides) {
  redisOverrides = overrides
}

function checkRedisEnabled() {
  if (redisOverrides && typeof redisOverrides.isRedisEnabled === 'function') {
    return redisOverrides.isRedisEnabled()
  }
  return isRedisEnabled()
}

function resolveRedisClient() {
  if (redisOverrides && typeof redisOverrides.getRedisClient === 'function') {
    return redisOverrides.getRedisClient()
  }
  return getRedisClient()
}

/**
 * Check if chat is enabled for a given room.
 * Default is true.
 */
export async function getChatEnabled(roomId) {
  const rId = String(roomId)
  if (checkRedisEnabled()) {
    try {
      const client = resolveRedisClient()
      if (client) {
        const val = await client.get(KEY_CHAT_ENABLED(rId))
        if (val !== null && val !== undefined) {
          return val === '1'
        }
        return true
      }
    } catch {
      // Fall through to in-memory fallback
    }
  }
  return memoryChatEnabled.get(rId) ?? true
}

/**
 * Set chat enabled/disabled state for a room.
 */
export async function setChatEnabled(roomId, enabled) {
  const rId = String(roomId)
  const boolVal = Boolean(enabled)
  memoryChatEnabled.set(rId, boolVal)

  if (checkRedisEnabled()) {
    try {
      const client = resolveRedisClient()
      if (client) {
        await client.set(KEY_CHAT_ENABLED(rId), boolVal ? '1' : '0', { EX: TTL_STATE_SEC })
        return true
      }
    } catch {
      // Non-fatal, in-memory state updated
    }
  }
  return true
}

/**
 * Check and apply 10-second student cooldown atomically.
 * Uses atomic single-call `SET key 1 NX EX 10`.
 * Returns { allowed: true } or { allowed: false, retryAfter: number }.
 */
export async function checkAndApplyCooldown(roomId, studentId, cooldownSec = COOLDOWN_SEC) {
  const rId = String(roomId)
  const sId = String(studentId)
  const key = KEY_CHAT_COOLDOWN(rId, sId)

  if (checkRedisEnabled()) {
    try {
      const client = resolveRedisClient()
      if (client) {
        // Atomic single-call SET ... NX EX
        const result = await client.set(key, '1', { NX: true, EX: cooldownSec })
        if (result === 'OK') {
          return { allowed: true }
        }
        // Cooldown key already exists -> query TTL for remaining seconds
        const ttl = await client.ttl(key)
        return { allowed: false, retryAfter: Math.max(1, ttl > 0 ? ttl : cooldownSec) }
      }
    } catch {
      // Fall through to in-memory fallback
    }
  }

  // In-memory fallback
  const memKey = `${rId}:${sId}`
  const now = Date.now()
  const expiry = memoryCooldowns.get(memKey)
  if (expiry && expiry > now) {
    const retryAfter = Math.max(1, Math.ceil((expiry - now) / 1000))
    return { allowed: false, retryAfter }
  }

  memoryCooldowns.set(memKey, now + cooldownSec * 1000)
  return { allowed: true }
}

/**
 * Buffer an incoming chat message into Redis durability list (or direct Mongo write if Redis is down).
 * Uses RPUSH return value directly for the size-trigger check (>= CHAT_FLUSH_MAX).
 */
export async function bufferChatMessage(roomId, messageDoc) {
  const rId = String(roomId)
  ensureShutdownHook()
  ensureFlushInterval()

  if (checkRedisEnabled()) {
    try {
      const client = resolveRedisClient()
      if (client) {
        const listLen = await client.rPush(KEY_CHAT_MESSAGES(rId), JSON.stringify(messageDoc))
        await client.sAdd(KEY_ACTIVE_ROOMS, rId)

        if (listLen >= CHAT_FLUSH_MAX) {
          await flushRoomMessages(rId)
        }
        return
      }
    } catch (err) {
      console.error(`[chat-buffer] Redis write error for room ${rId}, falling back to direct Mongo write:`, err?.message)
    }
  }

  // Degraded / fail-open fallback: direct write to MongoDB
  try {
    await ChatMessage.create(messageDoc)
  } catch (err) {
    console.error(`[chat-buffer] direct Mongo write error for room ${rId}:`, err?.message)
  }
}

/**
 * Atomically drain up to CHAT_FLUSH_MAX messages from Redis for a room and persist in batches of 2000.
 */
export async function flushRoomMessages(roomId) {
  const rId = String(roomId)
  if (!checkRedisEnabled()) return 0

  try {
    const client = resolveRedisClient()
    if (!client) return 0

    // Atomic LPOP with count
    const rawResult = typeof client.lPopCount === 'function'
      ? await client.lPopCount(KEY_CHAT_MESSAGES(rId), CHAT_FLUSH_MAX)
      : await client.lPop(KEY_CHAT_MESSAGES(rId), CHAT_FLUSH_MAX)
    const rawItems = Array.isArray(rawResult) ? rawResult : (rawResult ? [rawResult] : [])
    if (!rawItems.length) return 0

    const docs = []
    for (const item of rawItems) {
      try {
        docs.push(typeof item === 'string' ? JSON.parse(item) : item)
      } catch {
        // Ignore unparseable item
      }
    }

    if (!docs.length) return 0

    // Chunk into batches of MONGO_BATCH_CHUNK (2000)
    for (let i = 0; i < docs.length; i += MONGO_BATCH_CHUNK) {
      const chunk = docs.slice(i, i + MONGO_BATCH_CHUNK)
      try {
        await ChatMessage.insertMany(chunk, { ordered: false })
      } catch (err) {
        // Ignore duplicate key errors (code 11000), log other write failures loudly
        const writeErrors = err?.writeErrors || []
        const nonDup = writeErrors.filter(e => (e.code ?? e.err?.code) !== 11000)
        if (!writeErrors.length || nonDup.length) {
          console.error(`[chat-buffer] flush error for room ${rId} (batch of ${chunk.length}):`, err?.message)
        }
      }
    }

    // If queue is now empty, remove room from active rooms set
    const remaining = await client.lLen(KEY_CHAT_MESSAGES(rId))
    if (remaining === 0) {
      await client.sRem(KEY_ACTIVE_ROOMS, rId)
    }

    return docs.length
  } catch (err) {
    console.error(`[chat-buffer] flushRoomMessages error for room ${rId}:`, err?.message)
    return 0
  }
}

/**
 * Dual-trigger periodic timer flush for all active rooms.
 */
export async function flushAllActiveRooms() {
  if (!checkRedisEnabled()) return

  try {
    const client = resolveRedisClient()
    if (!client) return

    const roomIds = await client.sMembers(KEY_ACTIVE_ROOMS)
    if (!roomIds || !roomIds.length) return

    for (const rId of roomIds) {
      await flushRoomMessages(rId)
    }
  } catch (err) {
    console.error('[chat-buffer] flushAllActiveRooms error:', err?.message)
  }
}

/**
 * Flush all remaining messages for a room and clean up its Redis keys & memory state.
 */
export async function flushAndCleanRoom(roomId) {
  const rId = String(roomId)

  // 1. Drain all remaining buffered messages in Redis until empty
  if (checkRedisEnabled()) {
    try {
      const client = resolveRedisClient()
      if (client) {
        let flushed = 0
        do {
          flushed = await flushRoomMessages(rId)
        } while (flushed > 0)

        // 2. Delete Redis keys for this room
        await client.del(KEY_CHAT_MESSAGES(rId))
        await client.del(KEY_CHAT_ENABLED(rId))
        await client.sRem(KEY_ACTIVE_ROOMS, rId)

        // 3. Delete any user upload quota keys for this room using non-blocking SCAN
        let cursor = '0'
        const quotaKeys = []
        do {
          const reply = await client.scan(cursor, { MATCH: `chat:quota:${rId}:*`, COUNT: 100 })
          cursor = typeof reply === 'object' && reply.cursor !== undefined ? String(reply.cursor) : (Array.isArray(reply) ? String(reply[0]) : '0')
          const found = typeof reply === 'object' && reply.keys !== undefined ? reply.keys : (Array.isArray(reply) ? reply[1] : [])
          if (found && found.length) {
            quotaKeys.push(...found)
          }
        } while (cursor !== '0' && cursor !== '')

        if (quotaKeys.length > 0) {
          await client.del(quotaKeys)
        }
      }
    } catch (err) {
      console.error(`[chat-buffer] flushAndCleanRoom error for room ${rId}:`, err?.message)
    }
  }

  // 3. Clean up in-memory state
  memoryChatEnabled.delete(rId)
  for (const key of memoryCooldowns.keys()) {
    if (key.startsWith(`${rId}:`)) {
      memoryCooldowns.delete(key)
    }
  }
}

/**
 * Add a message to the in-memory per-room broadcast queue for batched Socket.IO emitting.
 */
export function enqueueBroadcast(roomCode, messageDoc) {
  const code = String(roomCode).toUpperCase()
  if (!broadcastBuffer.has(code)) {
    broadcastBuffer.set(code, [])
  }
  broadcastBuffer.get(code).push(messageDoc)
}

/**
 * Start the 200ms batched broadcast loop.
 */
export function startBroadcastLoop(io) {
  if (broadcastTimer || !io) return

  broadcastTimer = setInterval(() => {
    if (!broadcastBuffer.size) return

    for (const [roomCode, messages] of broadcastBuffer.entries()) {
      if (messages && messages.length > 0) {
        io.to(roomCode).emit('chat:messages', { messages })
        broadcastBuffer.set(roomCode, [])
      }
    }
  }, BROADCAST_INTERVAL_MS)

  if (broadcastTimer.unref) broadcastTimer.unref()
}

/**
 * Start the periodic dual-trigger interval (78s) for background flushes.
 */
export function ensureFlushInterval() {
  if (flushTimer) return
  flushTimer = setInterval(() => {
    flushAllActiveRooms().catch(e => console.error('[chat-buffer] interval flush error:', e?.message))
  }, CHAT_FLUSH_MS)
  if (flushTimer.unref) flushTimer.unref()
}

/**
 * Register graceful shutdown hook via centralized coordinator to force-flush active buffers before exit.
 */
export function ensureShutdownHook() {
  if (shutdownHooked) return
  shutdownHooked = true
  registerShutdownTask('chatService', flushAllActiveRooms)
}

/**
 * Read chat history for a room (persisted MongoDB messages + un-flushed Redis buffer).
 */
export async function getRoomChatHistory(roomId) {
  const rId = String(roomId)
  const [mongoMessages, enabled] = await Promise.all([
    ChatMessage.find({ roomId: rId }).sort({ createdAt: 1 }).lean(),
    getChatEnabled(rId)
  ])

  let pendingMessages = []
  if (checkRedisEnabled()) {
    try {
      const client = resolveRedisClient()
      if (client) {
        const raw = await client.lRange(KEY_CHAT_MESSAGES(rId), 0, -1)
        if (raw && raw.length) {
          pendingMessages = raw.map(r => (typeof r === 'string' ? JSON.parse(r) : r))
        }
      }
    } catch {
      // Non-fatal, return MongoDB messages
    }
  }

  // Deduplicate by _id if any message was flushed between queries
  const seenIds = new Set(mongoMessages.map(m => String(m._id)))
  const combined = [...mongoMessages]

  for (const msg of pendingMessages) {
    if (msg?._id && !seenIds.has(String(msg._id))) {
      combined.push(msg)
      seenIds.add(String(msg._id))
    }
  }

  return {
    enabled,
    messages: combined
  }
}
