/**
 * Broadcast Throttle Service
 * Limits how frequently we broadcast events to a room.
 * Prevents flooding when thousands of students answer simultaneously.
 *
 * Strategy:
 * - response:new → NEVER broadcast to full room (students already know their own answer)
 * - points:updated → Throttled per-student (only that student receives their points)
 * - leaderboard:updated → Debounced per-room (max 1 broadcast per N seconds)
 * - question:started → Always broadcast immediately (teacher action)
 * - question:ended → Always broadcast immediately (teacher action)
 */

// Per-room broadcast timers
const roomBroadcastTimers = new Map()

// Store latest participant count per room (used at broadcast time, not call time)
const latestParticipantCounts = new Map()

// Config
const LEADERBOARD_THROTTLE_MS = 3000  // Max 1 leaderboard broadcast per 3 seconds per room
const PARTICIPANT_THROTTLE_MS = 5000  // Max 1 participant count update per 5 seconds per room

/**
 * Throttled leaderboard broadcast.
 * Coalesces rapid updates into a single broadcast per room.
 *
 * @param {Object} io - Socket.IO server instance
 * @param {string} roomCode - The room code to broadcast to
 * @param {Object} data - The leaderboard data to send
 * @param {Function} getDataFn - Async function to get the latest leaderboard data
 */
export function throttledLeaderboardBroadcast(io, roomCode, data, getDataFn) {
  const key = `leaderboard:${roomCode}`

  if (roomBroadcastTimers.has(key)) {
    // Timer already pending — skip this broadcast (it will use the latest data)
    return
  }

  roomBroadcastTimers.set(key, setTimeout(async () => {
    roomBroadcastTimers.delete(key)

    try {
      // Get the freshest data at broadcast time
      const latestData = getDataFn ? await getDataFn() : data
      io.to(roomCode).emit('leaderboard:updated', latestData)
    } catch (err) {
      console.error('Leaderboard broadcast error:', err.message)
    }
  }, LEADERBOARD_THROTTLE_MS))
}

/**
 * Throttled participant count broadcast.
 * Coalesces rapid join/leave events.
 * Stores the latest count and broadcasts it when the timer fires.
 */
export function throttledParticipantBroadcast(io, roomCode, participantCount) {
  const key = `participants:${roomCode}`

  // Always store the latest count — timer will use this
  latestParticipantCounts.set(roomCode, participantCount)

  if (roomBroadcastTimers.has(key)) {
    return
  }

  roomBroadcastTimers.set(key, setTimeout(() => {
    roomBroadcastTimers.delete(key)
    const latestCount = latestParticipantCounts.get(roomCode) ?? participantCount
    latestParticipantCounts.delete(roomCode)
    io.to(roomCode).emit('participants:updated', { participants: latestCount })
  }, PARTICIPANT_THROTTLE_MS))
}

/**
 * Broadcast response to individual student only (not to full room).
 * This is the key optimization: instead of O(N) broadcast per response,
 * we only send to the 1 student who answered.
 *
 * @param {Object} io - Socket.IO server instance
 * @param {string} studentSocketId - The specific socket to send to
 * @param {Object} data - The response data
 */
export function broadcastToStudent(io, studentSocketId, data) {
  io.to(studentSocketId).emit('response:saved', data)
}

/**
 * Broadcast response count update to teacher only (not full room).
 * Teacher's dashboard needs to know how many students have answered.
 */
export function broadcastResponseCount(io, roomCode, count) {
  const key = `responsecount:${roomCode}`

  if (roomBroadcastTimers.has(key)) {
    return
  }

  roomBroadcastTimers.set(key, setTimeout(() => {
    roomBroadcastTimers.delete(key)
    io.to(roomCode).emit('response:count', { count })
  }, 1000)) // 1 second throttle for response counts
}

/**
 * Cleanup timers for a room (when room ends)
 */
export function cleanupRoomTimers(roomCode) {
  const keysToDelete = []
  for (const [key, timer] of roomBroadcastTimers) {
    if (key.includes(roomCode)) {
      clearTimeout(timer)
      keysToDelete.push(key)
    }
  }
  keysToDelete.forEach(key => roomBroadcastTimers.delete(key))
}

/**
 * Get stats about active broadcast timers (for monitoring)
 */
export function getBroadcastStats() {
  return {
    activeTimers: roomBroadcastTimers.size
  }
}
