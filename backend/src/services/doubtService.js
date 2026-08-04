import crypto from 'crypto'
import mongoose from 'mongoose'
import { DoubtSignal, Room, TopicMarker, ConfusionEvent } from '../models/index.js'
import { annotateSpikesWithTopics } from './topicService.js'

/**
 * Per-room salt for anonymous student hashes. Stored on Room.doubtSalt.
 * Lazy-generated on first signal; rotated when the room ends so signals
 * cannot be linked across sessions.
 */
export async function ensureRoomSalt (roomId) {
  const room = await Room.findById(roomId).select('doubtSalt')
  if (!room) return null
  if (!room.doubtSalt) {
    const salt = crypto.randomBytes(32).toString('hex')
    await Room.updateOne({ _id: roomId }, { $set: { doubtSalt: salt } })
    return salt
  }
  return room.doubtSalt
}

export function hashStudent (userId, salt) {
  return crypto.createHmac('sha256', salt).update(String(userId)).digest('hex')
}

const ANTI_SPAM_MS = 30 * 1000 // one signal per student per 30s, regardless of segment

// Per-room marker for the most-recent poll start. Anti-spam only counts
// signals that landed AFTER this marker, so a new poll gives every student
// a fresh signal slot. Keyed by String(roomId) for cheap Map lookup.
const lastPollStartedAtByRoom = new Map()

/**
 * Update the "last poll started" marker for a room. Called by the socket
 * 'new_question' / 'question:start' handlers right before they broadcast.
 * After this call, any prior DoubtSignal in this room is no longer eligible
 * to satisfy the anti-spam check (so students can press Confused again on
 * the new poll).
 */
export function markPollStarted (roomId) {
  lastPollStartedAtByRoom.set(String(roomId), Date.now())
}

/**
 * For tests / smoke scripts: read the marker without mutating it.
 */
export function getLastPollStartedAt (roomId) {
  return lastPollStartedAtByRoom.get(String(roomId)) || null
}

/**
 * Record a doubt signal. Returns { ok, signal, reason } — reason is set when
 * the call was deliberately ignored (anti-spam or already-retracted-then-readded).
 */
export async function recordDoubt ({ roomId, userId, segmentIndex, transcriptOffsetMs, client, recordingOffsetMs, utteranceSnapshot, clientSentAt }) {
  if (!mongoose.Types.ObjectId.isValid(String(roomId))) {
    return { ok: false, reason: 'invalid_room_id' }
  }
  const room = await Room.findById(roomId).select('_id isActive doubtSalt roomStartedAt')
  if (!room) return { ok: false, reason: 'room_not_found' }
  if (!room.isActive) return { ok: false, reason: 'room_ended' }

  const salt = room.doubtSalt || (await ensureRoomSalt(roomId))
  const studentHash = hashStudent(userId, salt)

  // Anti-spam: scope to the most-recent poll. A signal only blocks a re-click
  // if BOTH:
  //   (a) it landed within the last ANTI_SPAM_MS, AND
  //   (b) it landed AFTER the most-recent poll-start marker for this room.
  // The poll marker is set when the teacher starts a new poll (see
  // markPollStarted + the socket 'new_question'/'question:start' handlers).
  // So a click on Poll #2 is never blocked by a click on Poll #1, even if
  // Poll #1 ended <30s ago.
  const pollStartedAtMs = lastPollStartedAtByRoom.get(String(roomId)) || 0
  const recent = await DoubtSignal.findOne({
    roomId,
    studentHash,
    retracted: false,
    createdAt: {
      $gt: new Date(Math.max(Date.now() - ANTI_SPAM_MS, pollStartedAtMs))
    }
  }).sort({ createdAt: -1 })
  if (recent) return { ok: false, reason: 'anti_spam', retryAfterMs: ANTI_SPAM_MS }

  // Compute recordingOffsetMs server-side if client didn't provide one
  // (more authoritative -- uses server clock + roomStartedAt).
  let computedRecordingOffsetMs = null
  if (typeof recordingOffsetMs === 'number' && recordingOffsetMs >= 0) {
    computedRecordingOffsetMs = recordingOffsetMs
  } else if (room.roomStartedAt) {
    const sentAt = clientSentAt ? new Date(clientSentAt) : new Date()
    // Clamp to non-negative (clock skew could go slightly negative)
    computedRecordingOffsetMs = Math.max(0, sentAt.getTime() - room.roomStartedAt.getTime())
  }

  const signal = await DoubtSignal.create({
    roomId,
    studentHash,
    segmentIndex: Math.max(0, parseInt(segmentIndex, 10) || 0),
    transcriptOffsetMs: Math.max(0, parseInt(transcriptOffsetMs, 10) || 0),
    clientSentAt: clientSentAt ? new Date(clientSentAt) : new Date(),
    recordingOffsetMs: computedRecordingOffsetMs,
    utteranceSnapshot: typeof utteranceSnapshot === 'string' ? utteranceSnapshot.slice(0, 500) : '',
    client: { type: client || 'web' }
  })

  return { ok: true, signal }
}

/**
 * Mark a room's recording clock origin. Called when the teacher starts the
 * recording / session. All subsequent doubt signals anchor their
 * `recordingOffsetMs` against this.
 */
export async function startRoomSession (roomId, teacherId) {
  if (!mongoose.Types.ObjectId.isValid(String(roomId))) {
    return { ok: false, reason: 'invalid_room_id' }
  }
  const room = await Room.findById(roomId)
  if (!room) return { ok: false, reason: 'room_not_found' }
  // Only the room's teacher can start the session
  if (String(room.teacher) !== String(teacherId)) {
    return { ok: false, reason: 'not_teacher' }
  }
  // Capture the previous session start (if any). If the previous session
  // was active recently (within SESSION_GAP_MS) we treat this as the SAME
  // session being re-asserted (teacher hit Start Recording again, or the
  // socket re-fired). In that case we DO NOT close any active ConfusionEvents
  // -- they belong to the current recording and must stay alive.
  const SESSION_GAP_MS = 5 * 60 * 1000 // 5 minutes
  const previousStart = room.roomStartedAt ? new Date(room.roomStartedAt) : null
  const isNewSession = !previousStart ||
    (Date.now() - previousStart.getTime()) > SESSION_GAP_MS
  // Reset session clock
  room.roomStartedAt = new Date()
  await room.save()
  if (isNewSession) {
    // Fresh session boundary -- close any prior active ConfusionEvents so
    // the new session starts clean.
    ConfusionEvent.updateMany(
      { roomId, status: 'active' },
      { $set: { status: 'closed', closedAt: new Date() } }
    ).catch(e => console.warn('[doubtService] closeAllActiveForRoom on session start:', e.message))
  }
  // Close auto-topic markers that pre-date this session so they don't haunt
  // the new session. Teacher-set markers (source='manual', confirmed=true)
  // are intentionally preserved across sessions.
  const sessionStartTs = room.roomStartedAt
  TopicMarker.updateMany(
    {
      roomId,
      source: 'auto',
      $or: [
        { createdAt: { $lt: sessionStartTs } },
        { endMs: null }
      ]
    },
    { $set: { endMs: 0 } }
  ).catch(e => console.warn('[doubtService] close stale auto markers on session start:', e.message))
  return { ok: true, roomStartedAt: room.roomStartedAt }
}

/**
 * Get a room's current recording clock + most-recent teacher position
 * (for late-joining students who need to sync up).
 */
export async function getRoomSession (roomId) {
  if (!mongoose.Types.ObjectId.isValid(String(roomId))) {
    return { ok: false, reason: 'invalid_room_id' }
  }
  const room = await Room.findById(roomId).select('_id isActive roomStartedAt').lean()
  if (!room) return { ok: false, reason: 'room_not_found' }
  return {
    ok: true,
    roomStartedAt: room.roomStartedAt,
    isActive: room.isActive,
    // Server-side current recording offset, useful if student just joined
    currentRecordingOffsetMs: room.roomStartedAt
      ? Math.max(0, Date.now() - new Date(room.roomStartedAt).getTime())
      : null
  }
}

/**
 * Retract a signal. Only the original student (by hash) can retract, and only
 * within the retract window. We find the most recent non-retracted signal for
 * this hash in the room and mark it.
 */
const RETRACT_WINDOW_MS = 60 * 1000

export async function retractLatestDoubt ({ roomId, userId }) {
  const salt = await ensureRoomSalt(roomId)
  if (!salt) return { ok: false, reason: 'room_not_found' }
  const studentHash = hashStudent(userId, salt)
  const latest = await DoubtSignal.findOne({
    roomId,
    studentHash,
    retracted: false,
    createdAt: { $gt: new Date(Date.now() - RETRACT_WINDOW_MS) }
  }).sort({ createdAt: -1 })
  if (!latest) return { ok: false, reason: 'nothing_to_retract' }
  latest.retracted = true
  await latest.save()
  return { ok: true }
}

/**
 * Aggregate distinct-student counts per segmentIndex for a room.
 * Output: [{ segmentIndex, count }]
 */
export async function getDoubtCountsBySegment (roomId) {
  return DoubtSignal.countDistinctStudentsBySegment(roomId)
}

/**
 * Shared broadcast step used by BOTH the HTTP POST /api/doubts route and the
 * Socket.IO 'doubt:signal' handler. After recordDoubt() has saved the signal,
 * both entry points do exactly the same thing:
 *   1) emit `doubt:new` to the room audience (raw per-segment count, legacy UI)
 *   2) attach the signal to the active ConfusionEvent for this room/topic and
 *      emit `confusion:update` (created|merged) so the teacher dashboard's
 *      live alert card re-renders.
 *   3) if attaching this signal caused a prior same-topic event to close
 *      (e.g. topic changed), emit `confusion:closed` for that prior event.
 *
 * Caller-specific acks (HTTP 200 / socket 'doubt:confirmed') are NOT done
 * here — the HTTP route and socket handler each ack their own caller.
 *
 * Errors from attachSignalToEvent are swallowed (logged) so a doubt signal
 * is never lost because of an analytics hiccup.
 *
 * @param {object} args
 * @param {import('socket.io').Server} args.io           Socket.IO server
 * @param {{_id:any,code:string}}       args.room        already-loaded Room doc (must have `code`)
 * @param {string}                       args.userId      ObjectId-like of the signaling student
 * @param {object}                       args.payload     Original payload from the caller
 *   - segmentIndex, transcriptOffsetMs, recordingOffsetMs, utteranceSnapshot
 * @param {object}                       args.signal      The saved DoubtSignal doc from recordDoubt()
 */
export async function broadcastRecordedDoubt ({ io, room, userId, payload, signal }) {
  if (!io || !room || !room.code) return
  const roomCode = room.code
  const roomId = room._id
  const segmentIndex = (payload && payload.segmentIndex) || 0

  // (1) legacy per-segment raw count broadcast
  try {
    const counts = await getDoubtCountsBySegment(roomId)
    const segCount = counts.find(c => c.segmentIndex === segmentIndex)?.count || 1
    io.to(roomCode).emit('doubt:new', {
      roomId: String(roomId),
      segmentIndex,
      count: segCount,
      recordingOffsetMs: signal.recordingOffsetMs,
      recordingOffsetLabel: signal.recordingOffsetLabel,
      utteranceSnapshot: signal.utteranceSnapshot || '',
      timestamp: Date.now()
    })
  } catch (e) {
    console.error('[broadcastRecordedDoubt] doubt:new emit failed:', e)
  }

  // (2) + (3) live ConfusionEvent attach + broadcasts
  try {
    const salt = await ensureRoomSalt(roomId)
    const studentHash = salt ? hashStudent(userId, salt) : null
    if (!studentHash) return
    const { attachSignalToEvent, formatForClient } = await import('./confusionEventService.js')
    const { event, action, closedPrior } = await attachSignalToEvent({
      roomId,
      signalId: signal._id,
      studentHash,
      recordingOffsetMs: signal.recordingOffsetMs,
      utteranceSnapshot: signal.utteranceSnapshot || ''
    })
    if (action === 'merged' || action === 'created') {
      io.to(roomCode).emit('confusion:update', {
        roomId: String(roomId),
        action,
        event: formatForClient(event)
      })
    }
    if (closedPrior) {
      io.to(roomCode).emit('confusion:closed', {
        roomId: String(roomId),
        reason: 'topic_changed',
        event: formatForClient(closedPrior)
      })
    }
  } catch (e) {
    // Don't fail the doubt on attach errors -- the signal is already saved.
    console.error('[broadcastRecordedDoubt] attachToEvent error:', e)
  }
}

/**
 * Detect confusion spikes. A segment is a spike when:
 *   - rawCount >= minMarkCount  (default 3), OR
 *   - rawCount >= mean + spikeStdDevMultiplier * stddev  (default 2.0)
 *
 * Returns { spikes: [{ segmentIndex, count, transcriptSnippet }], allSegments: [...] }
 * Includes a small transcript snippet per spike so the UI can show "you said
 * 'glycolysis produces 2 ATP' at this moment" without a second API call.
 */
export async function detectSpikes ({ roomId, minMarkCount = 3, spikeStdDevMultiplier = 2.0 }) {
  const { Transcript } = await import('../models/index.js')
  const counts = await getDoubtCountsBySegment(roomId)
  if (counts.length === 0) return { spikes: [], allSegments: counts }

  const values = counts.map(c => c.count)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  const stddev = Math.sqrt(variance)
  const spikeThreshold = mean + spikeStdDevMultiplier * stddev

  // Fetch transcripts once for snippet lookup
  const transcripts = await Transcript.find({ roomId })
    .select('segmentIndex text')
    .lean()
  const transcriptBySeg = new Map(transcripts.map(t => [t.segmentIndex, t.text]))

  const spikes = counts
    .filter(c => c.count >= minMarkCount || c.count >= spikeThreshold)
    .map(c => {
      const segSnippet = (transcriptBySeg.get(c.segmentIndex) || '').slice(0, 200)
      return {
        segmentIndex: c.segmentIndex,
        count: c.count,
        transcriptSnippet: segSnippet,
        hasTranscript: !!transcriptBySeg.get(c.segmentIndex)
      }
    })
    .sort((a, b) => b.count - a.count)

  return { spikes, allSegments: counts, stats: { mean, stddev, threshold: spikeThreshold } }
}

/**
 * NEW: Get per-spike details with recording timestamps + utterance snapshots.
 * This is the data the teacher UI really wants. Goes signal-by-signal to
 * show *when* each signal arrived and *what the teacher said* at that moment.
 */
export async function getSpikeDetails ({ roomId, bucketMs = 5000, minMarkCount = 3 }) {
  const bucketCounts = await DoubtSignal.countDistinctStudentsByRecordingTime(roomId, bucketMs)
  let spikes = bucketCounts
    .filter(b => b.count >= minMarkCount)
    .map(b => ({
      recordingOffsetMs: b.recordingOffsetMs,
      recordingOffsetLabel: formatMs(b.recordingOffsetMs),
      count: b.count,
      sampleUtterance: b.sampleUtterance || ''
    }))
    .sort((a, b) => a.recordingOffsetMs - b.recordingOffsetMs)
  // Augment each spike with the topic label (teacher-set marker or transcript proxy)
  spikes = await annotateSpikesWithTopics({ roomId, spikes })
  return { spikes, bucketMs }
}

/**
 * NEW: Get all signals for a room, time-anchored, so the teacher can replay
 * "where was each student when they tapped?". Returns:
 *   [{ recordingOffsetMs, recordingOffsetLabel, utteranceSnapshot,
 *      studentHashShort (first 8 chars for display), clientSentAt, retracted }]
 */
export async function getSignalsForRoom (roomId, opts = {}) {
  const limit = Math.min(opts.limit || 200, 1000)
  const signals = await DoubtSignal.find({ roomId })
    .sort({ recordingOffsetMs: 1, createdAt: 1 })
    .limit(limit)
    .lean()
  const mapped = signals.map(s => ({
    _id: s._id,
    segmentIndex: s.segmentIndex,
    transcriptOffsetMs: s.transcriptOffsetMs,
    recordingOffsetMs: s.recordingOffsetMs,
    recordingOffsetLabel: formatMs(s.recordingOffsetMs || 0),
    utteranceSnapshot: s.utteranceSnapshot || '',
    studentHashShort: (s.studentHash || '').slice(0, 8),
    clientSentAt: s.clientSentAt || s.createdAt,
    retracted: !!s.retracted
  }))
  // Annotate each signal with topic label so the timeline can show topic per-tap
  const { annotateSpikesWithTopics } = await import('./topicService.js')
  const spikesForAnnotation = mapped.map(s => ({ recordingOffsetMs: s.recordingOffsetMs || 0 }))
  const annotated = await annotateSpikesWithTopics({ roomId, spikes: spikesForAnnotation })
  return mapped.map((s, i) => ({
    ...s,
    topic: annotated[i]?.topic || { label: '', source: 'none' }
  }))
}

/**
 * Format milliseconds as MM:SS or HH:MM:SS for UI display.
 */
function formatMs (ms) {
  if (ms == null || isNaN(ms)) return '—'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}