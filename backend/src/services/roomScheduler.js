import { Queue, Worker } from 'bullmq'
import { isRedisEnabled } from '../config/redis.js'
import { makeBullConnection } from './generationQueue.js'
import Room from '../models/Room.js'

export const ROOM_SCHEDULER_QUEUE = 'room-scheduler'

const inMemoryTimers = new Map() // roomId -> setTimeout handle
let schedulerQueue = null
let schedulerWorker = null
let ioInstance = null

export function setSchedulerIO(io) {
  ioInstance = io
}

export function getRoomSchedulerQueue() {
  if (!isRedisEnabled()) return null
  if (!schedulerQueue) {
    try {
      schedulerQueue = new Queue(ROOM_SCHEDULER_QUEUE, { connection: makeBullConnection() })
    } catch (err) {
      console.error('[roomScheduler] Failed to initialize BullMQ queue:', err.message)
      return null
    }
  }
  return schedulerQueue
}

export async function autoStartRoom(roomId, roomCodeOverride = null) {
  try {
    const room = await Room.findById(roomId)
    if (!room) return null
    if (room.endedAt || room.status === 'ENDED') return room

    if (room.status === 'SCHEDULED') {
      room.status = 'ACTIVE'
      await room.save()
      console.log(`[roomScheduler] Auto-started room ${room.code || room._id}`)
    }

    const code = roomCodeOverride || room.code
    if (ioInstance && code) {
      ioInstance.to(code).emit('room:started', {
        roomId: room._id,
        status: 'ACTIVE',
        videoUrl: room.settings?.videoUrl || ''
      })
    }

    return room
  } catch (error) {
    console.error(`[roomScheduler] Error auto-starting room ${roomId}:`, error.message)
    return null
  }
}

export async function scheduleRoomAutoStart(roomId, scheduledStartTime) {
  if (!scheduledStartTime) return

  const startTimeMs = new Date(scheduledStartTime).getTime()
  if (isNaN(startTimeMs)) return

  const delay = startTimeMs - Date.now()
  const idStr = String(roomId)

  // Cancel any existing timer for this room
  cancelScheduledRoom(idStr)

  if (delay <= 0) {
    // Already due — auto start immediately
    await autoStartRoom(roomId)
    return
  }

  const queue = getRoomSchedulerQueue()
  if (queue) {
    try {
      await queue.add(
        'autoStartRoom',
        { roomId: idStr },
        {
          delay,
          jobId: `autostart:${idStr}`,
          removeOnComplete: true,
          removeOnFail: { age: 3600 }
        }
      )
      console.log(`[roomScheduler] Scheduled BullMQ job for room ${idStr} in ${Math.round(delay / 1000)}s`)
      return
    } catch (err) {
      console.error('[roomScheduler] Error scheduling BullMQ job, falling back to setTimeout:', err.message)
    }
  }

  // Fallback: In-memory timer
  const timer = setTimeout(async () => {
    inMemoryTimers.delete(idStr)
    await autoStartRoom(roomId)
  }, delay)

  inMemoryTimers.set(idStr, timer)
  console.log(`[roomScheduler] Scheduled in-memory timer for room ${idStr} in ${Math.round(delay / 1000)}s`)
}

export function cancelScheduledRoom(roomId) {
  const idStr = String(roomId)
  if (inMemoryTimers.has(idStr)) {
    clearTimeout(inMemoryTimers.get(idStr))
    inMemoryTimers.delete(idStr)
  }

  const queue = getRoomSchedulerQueue()
  if (queue) {
    queue.remove(`autostart:${idStr}`).catch(() => {})
  }
}

export async function initScheduledRooms(io) {
  if (io) setSchedulerIO(io)

  // Setup BullMQ worker if Redis is enabled
  if (isRedisEnabled() && !schedulerWorker) {
    try {
      schedulerWorker = new Worker(
        ROOM_SCHEDULER_QUEUE,
        async (job) => {
          const { roomId } = job.data
          await autoStartRoom(roomId)
        },
        { connection: makeBullConnection() }
      )

      schedulerWorker.on('completed', (job) => {
        console.log(`[roomScheduler] BullMQ job ${job.id} completed successfully`)
      })
      schedulerWorker.on('failed', (job, err) => {
        console.error(`[roomScheduler] BullMQ job ${job?.id} failed:`, err?.message)
      })
    } catch (err) {
      console.error('[roomScheduler] Failed to initialize Worker:', err.message)
    }
  }

  // Bootstrap pending scheduled rooms from MongoDB
  try {
    const scheduledRooms = await Room.find({ status: 'SCHEDULED', isActive: true })
    console.log(`[roomScheduler] Bootstrapping ${scheduledRooms.length} scheduled rooms`)

    for (const room of scheduledRooms) {
      await scheduleRoomAutoStart(room._id, room.scheduledStartTime)
    }
  } catch (err) {
    console.error('[roomScheduler] Error bootstrapping scheduled rooms:', err.message)
  }
}
