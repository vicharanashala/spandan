import { create } from 'zustand'
import { useSocketStore } from './socketStore'

/**
 * teacherPositionStore — tracks the live position of the teacher's recording.
 *
 * Both students (to know what they're hearing) and the teacher (to know their
 * own recording clock) use this store.
 *
 * Data flow:
 *   1. Teacher calls `startSession(roomId)` when they hit "Start Recording"
 *   2. Teacher app emits `teacher:position` every ~2s with current segment +
 *      offset + recording clock
 *   3. Socket store receives the broadcast and forwards it via
 *      `_onTeacherPosition(handler)`
 *   4. Students read the latest via `lastPosition`; their doubt signals
 *      attach `recordingOffsetMs` from this store
 *
 * Late-joining students can call `hydrateFromServer(roomId)` to fetch the
 * current session state on mount instead of waiting for the next broadcast.
 */
export const useTeacherPositionStore = create((set, get) => ({
  // Latest known position from the teacher (or null if no broadcast yet)
  lastPosition: null,
  // When the recording session started (from server clock)
  roomStartedAt: null,
  // Whether the session is active (teacher is recording)
  sessionActive: false,
  // Client-side clock we use when the teacher hasn't broadcast yet
  // (graceful degradation -- still records a meaningful-ish offset)
  clientStartedAt: null,

  /**
   * Start the recording session. Teacher calls this once when they
   * begin recording. Emits a socket event to broadcast roomStartedAt to
   * all students.
   */
  startSession: (roomId, roomCode) => {
    const socket = useSocketStore.getState().socket
    const now = Date.now()
    set({ sessionActive: true, clientStartedAt: now, roomStartedAt: new Date(now).toISOString() })
    if (socket && roomCode) {
      socket.emit('teacher:session-start', { roomId, roomCode })
    }
  },

  /** Broadcast current position to all students. Teacher calls every ~2s. */
  broadcastPosition: (roomCode, partial) => {
    const socket = useSocketStore.getState().socket
    if (!socket || !roomCode) return
    const { roomStartedAt } = get()
    const recordingOffsetMs = roomStartedAt
      ? Date.now() - new Date(roomStartedAt).getTime()
      : (partial.recordingOffsetMs || 0)
    socket.emit('teacher:position', {
      roomCode,
      segmentIndex: partial.segmentIndex || 0,
      transcriptOffsetMs: partial.transcriptOffsetMs || 0,
      recordingOffsetMs,
      recordingOffsetLabel: formatMs(recordingOffsetMs),
      utterance: partial.utterance || ''
    })
  },

  /** Receive a broadcast position from the socket (called from socket store). */
  _onTeacherPosition: (data) => {
    set({
      lastPosition: {
        segmentIndex: data.segmentIndex || 0,
        transcriptOffsetMs: data.transcriptOffsetMs || 0,
        recordingOffsetMs: data.recordingOffsetMs || 0,
        recordingOffsetLabel: data.recordingOffsetLabel || '00:00',
        utterance: data.utterance || '',
        receivedAt: Date.now()
      }
    })
  },

  /** Receive session start from server. */
  _onSessionStart: (data) => {
    set({
      sessionActive: true,
      roomStartedAt: data.roomStartedAt,
      clientStartedAt: Date.now()
    })
  },

  /** Clear state -- called on disconnect/leave room. */
  reset: () => {
    set({
      lastPosition: null,
      roomStartedAt: null,
      sessionActive: false,
      clientStartedAt: null
    })
  }
}))

/**
 * Format milliseconds as MM:SS or HH:MM:SS.
 * Single source of truth -- also used by the teacher UI's "now playing".
 */
export function formatMs (ms) {
  if (ms == null || isNaN(ms) || ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default useTeacherPositionStore