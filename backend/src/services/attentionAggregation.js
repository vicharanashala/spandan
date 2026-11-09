// Per-user attention aggregation for one room.
//
// Every tab of a student is a separate socket. The server counts the student present while ANY tab
// is active; presence is closed only when every tab is away. Two safety rules keep a stale socket
// from holding the student present forever:
//
// 1. Tracked sockets are authoritative. Once at least one socket has reported attention, untracked
//    siblings (a duplicated connection, a stale tab, an older cached bundle) are ignored.
// 2. An untracked socket is only trusted for ATTENTION_UNTRACKED_GRACE_MS after it joined the room.
//    After that it no longer counts; a modern client re-establishes tracking with its first
//    update/heartbeat.
//
// This module is pure (no IO/Mongo) so the aggregation rules can be unit tested directly.

// A tracked socket that promised to heartbeat but has been silent this long is a frozen tab.
export const ATTENTION_STALE_MS = Number(process.env.ATTENTION_STALE_MS) || 30000
export const ATTENTION_UNTRACKED_GRACE_MS = Number(process.env.ATTENTION_UNTRACKED_GRACE_MS) || 60000

export const attentionForSocket = (socket, roomCode) =>
  socket?.data?.attention?.[roomCode] || null

export const isTrackedSocket = (socket, roomCode) => !!attentionForSocket(socket, roomCode)

// When an untracked socket stops being trusted (0 when it has no join timestamp).
export const untrackedSocketExpiry = (socket, roomCode) => {
  const joinedAt = Number(socket?.data?.joinedRoomAt?.get?.(roomCode)) || 0
  return joinedAt > 0 ? joinedAt + ATTENTION_UNTRACKED_GRACE_MS : 0
}

// Is this socket currently keeping the student present?
export const isSocketActiveForAttention = (socket, roomCode, now = Date.now()) => {
  const att = attentionForSocket(socket, roomCode)
  if (att) {
    if (att.state !== 'active') return false
    const lastPing = Number(att.lastPingAt) || 0
    return !lastPing || now - lastPing <= ATTENTION_STALE_MS
  }
  const expiry = untrackedSocketExpiry(socket, roomCode)
  return expiry > 0 && now <= expiry
}

/**
 * @param {Array} sockets    Sockets fetched for the user (e.g. io.in(`user:${id}`).fetchSockets()).
 * @param {string} roomCode
 * @param {{ excludeId?: string|null, now?: number }} options
 * @returns {{
 *   inRoom: Array,
 *   tracked: Array,
 *   anyActive: boolean
 * }}
 */
export const aggregateAttention = (sockets, roomCode, { excludeId = null, now = Date.now() } = {}) => {
  const inRoom = (sockets || []).filter(
    (s) => s.id !== excludeId && s.rooms?.has?.(roomCode)
  )
  const tracked = inRoom.filter((s) => isTrackedSocket(s, roomCode))
  // Tracked sockets are authoritative; untracked ones only count when the room has no tracked socket
  // at all (a legacy client), and even then only inside their join grace window.
  const considered = tracked.length > 0 ? tracked : inRoom
  return {
    inRoom,
    tracked,
    anyActive: considered.some((s) => isSocketActiveForAttention(s, roomCode, now))
  }
}
