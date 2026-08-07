import mongoose from 'mongoose'
import { Room, TopicMarker, Transcript } from '../models/index.js'
import { extractTopicProxy } from './topicGenerator.js'

/**
 * topicService — teacher-set topic markers for "what was being taught when".
 *
 * Each marker says "from recordingOffsetMs `startMs` until `endMs`, the topic
 * was `<label>`". Doubt signals arriving in that window inherit the label,
 * so the confusion-spike dashboard shows:
 *
 *   🕐 02:34 — 8 lost
 *   📚 Glycolysis — Investment Phase
 *
 * If no marker covers a signal's time, we fall back to a "topic proxy"
 * built from the matching Transcript doc — first 4-6 significant words.
 */

const MAX_LABEL_LEN = 120
const MAX_NOTE_LEN = 240

/**
 * Returns true if a stored topic label is obviously corrupted --
 * contains Whisper-hallucinated filler tokens, repeated phrases,
 * or stopword fragments. Used to decide whether to fall through
 * to the heuristic on fresh transcripts.
 *
 * Patterns caught (examples from production data on 2026-07-13/14):
 *   - "Hello hello"              (adjacent duplicate, also HALLUC token)
 *   - "Hello forums"             (HALLUC token 'hello')
 *   - "Hello we're"              (greeting + contraction; never a topic)
 *   - "Photos hello"             (transcript anchor ending on a greeting)
 *   - "Restakes photos that's"   (HALLUC tokens)
 *   - "Session still annoying"   (HALLUC token)
 *   - "Photosynthesis which contain"   (subordinate-clause glue + verb)
 *   - "Photosynthesis which Photosynthesis"  (NON-ADJACENT duplicate)
 *   - "Whether climate"          (no trigger word, but a Whisper-confused label
 *     where "Whether" came from a mistranscription of "Weather")
 *   - "Is that"                  (low-information: just a copula + demonstrative)
 *   - "Thinking which"           (concept + connector; never a topic)
 *   - "Hello hello hello"        (all-greeting label)
 *
 * Also labels where the FIRST token is a greeting open like "Hello" "Hi"
 * "Welcome" "Good morning" -- these were the dominant garbage pattern in
 * the 2026-07-14 diagnostic dump.
 */
function looksCorrupted (label) {
  if (!label || typeof label !== 'string') return true
  const s = label.trim()
  if (s.length < 2) return true
  const tokens = s.split(/\s+/)
  // 0. Empty post-sanitization -- defensive. Caller treat as corrupt.
  if (tokens.length === 0) return true
  // 0a. Greeting-led label (the dominant garbage on 2026-07-14 DB dump):
  // 'Hello we're', 'Hi guys', 'Photos hello' (with greeting at end), etc.
  // We match every token against GREETING_FILLER and consider the label
  // corrupt if every meaningful token is a greeting. Centralized set lives
  // in topicGenerator.js; we redefine a strict subset here so this module
  // doesn't break if topicGenerator.js changes its set in the future.
  //
  // Split into SALUTATION (always-greeting: hello, hi, hey, ...) and
  // DISCOURSE (could-be-content: today, so, well) and META (lecture,
  // topic, ...). For the SALUTATION gate at 0b/0c we use only SALUTATION
  // so a label like 'Intro' or 'Lesson 1' isn't rejected.
  const SALUTATION = new Set([
    'hello','hi','hey','howdy','greetings','welcome',
    'okay','ok','alright','right','so','now','well','yeah','yes',
    'today','tonight','tomorrow','yesterday',
    'everyone','everybody','all','class','guys','friends','folks','people',
    'students','student','teacher','classroom'
  ])
  // Full set for the all-greetings check (rule 0).
  const GREETING = new Set([
    ...SALUTATION,
    'lecture','lesson','topic','subject','chapter','section','part','unit',
    'session','discussion','overview','introduction','intro'
  ])
  const CONNECTORS = new Set([
    'which','where','when','that','who','whom','whose','how','why',
    'is','are','was','were','has','have','had','does','do','did',
    'will','would','can','could','should','may','might','shall',
    'and','or','but','about'
  ])
  const meaningful = tokens.filter(t => !GREETING.has(t.toLowerCase()) && !CONNECTORS.has(t.toLowerCase()))
  if (meaningful.length === 0 && tokens.length > 0) return true
  // 0b. First token is salutation OR connector => corrupt.
  //   Use SALUTATION (not the full GREETING set) so legit labels like
  //   'Intro', 'Lesson 1', 'Topic overview' are NOT rejected. Only the
  //   pure greeting words trigger this rule.
  if (SALUTATION.has(tokens[0].toLowerCase()) || CONNECTORS.has(tokens[0].toLowerCase())) return true
  // 0c. Last token is salutation => 'Photos hello', 'Food hi', etc.
  if (SALUTATION.has(tokens[tokens.length - 1].toLowerCase())) return true
  // 1. Adjacent duplicate: 'Photosynthesis which Photosynthesis'
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].toLowerCase() === tokens[i - 1].toLowerCase()) return true
  }
  // 2. Known hallucination tokens / filler words that aren't real concepts
  const HALLUC = /\b(Restakes|Mistakes|Strangesth|Session|annoying|that's|hello|hi|hey|welcome|today)\b/i
  if (HALLUC.test(s)) return true
  // 3. Subordinate-clause glue words -- shouldn't be in a topic label
  if (/\b(which|where|when|how|why)\s+(contain|have|has|is|are)\b/i.test(s)) return true
  // 4. NON-ADJACENT duplicate separated by a single connector word.
  const DUP_CONNECTORS = /\b(\w+)\s+(which|where|when|that|and|or|is|are|was|were|has|have|had|do|does|did|will|would|can|could|should|may|might)\s+(\w+)\b/i
  const m = s.match(DUP_CONNECTORS)
  if (m && m[1].toLowerCase() === m[3].toLowerCase()) return true
  // 5. Single-word labels that are just a question-word + generic noun.
  //    These never convey a topic ('Whether climate', 'Is that', 'How do').
  if (/^\s*(whether|is|are|was|were|do|does|did|can|could|would|should|will|may|might)\s+\w+\s*$/i.test(s)) {
    return true
  }
  // 6. Pure demonstrative / pronoun labels ('this that', 'that one', etc.)
  if (/^\s*(this|that|these|those|it|they|them|he|she|we|you|i)\b/i.test(s) && tokens.length <= 3) {
    return true
  }
  return false
}

/**
 * Add or update a topic marker. If a marker already starts at the same
 * `startMs` in this room, it's replaced (idempotent for the teacher's UX
 * of "fix the label").
 */
export async function setTopic ({ roomId, teacherId, startMs, label, note = '', endMs = null }) {
  if (!mongoose.Types.ObjectId.isValid(String(roomId))) {
    return { ok: false, reason: 'invalid_room_id' }
  }
  if (!label || typeof label !== 'string' || !label.trim()) {
    return { ok: false, reason: 'label_required' }
  }
  if (typeof startMs !== 'number' || startMs < 0) {
    return { ok: false, reason: 'invalid_start_ms' }
  }
  const cleanLabel = label.trim().slice(0, MAX_LABEL_LEN)
  const cleanNote = (note || '').trim().slice(0, MAX_NOTE_LEN)
  const cleanEnd = typeof endMs === 'number' && endMs > startMs ? endMs : null

  // Verify room + teacher ownership
  const room = await Room.findById(roomId).select('_id teacher')
  if (!room) return { ok: false, reason: 'room_not_found' }
  if (String(room.teacher) !== String(teacherId)) {
    return { ok: false, reason: 'not_teacher' }
  }

  const marker = await TopicMarker.findOneAndUpdate(
    { roomId, startMs },
    {
      $set: {
        roomId,
        teacherId,
        startMs,
        endMs: cleanEnd,
        label: cleanLabel,
        note: cleanNote,
        source: 'manual',
        confirmed: true
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  return { ok: true, marker }
}

/**
 * Remove a topic marker by id (or by startMs).
 */
export async function deleteTopic ({ roomId, teacherId, markerId, startMs }) {
  if (!mongoose.Types.ObjectId.isValid(String(roomId))) {
    return { ok: false, reason: 'invalid_room_id' }
  }
  const room = await Room.findById(roomId).select('_id teacher')
  if (!room) return { ok: false, reason: 'room_not_found' }
  if (String(room.teacher) !== String(teacherId)) {
    return { ok: false, reason: 'not_teacher' }
  }
  const query = { roomId }
  if (markerId && mongoose.Types.ObjectId.isValid(String(markerId))) {
    query._id = markerId
  } else if (typeof startMs === 'number') {
    query.startMs = startMs
  } else {
    return { ok: false, reason: 'marker_id_or_start_ms_required' }
  }
  const r = await TopicMarker.deleteOne(query)
  return { ok: true, deletedCount: r.deletedCount }
}

/**
 * Get all topic markers for a room, in start-time order.
 */
export async function listTopics (roomId) {
  if (!mongoose.Types.ObjectId.isValid(String(roomId))) {
    return { ok: false, reason: 'invalid_room_id' }
  }
  const markers = await TopicMarker.find({ roomId })
    .sort({ startMs: 1 })
    .lean()
  return { ok: true, topics: markers }
}

/**
 * Resolve the topic label for a given recording offset. Returns:
 *   { label: string, source: 'marker' | 'transcript' | 'none', markerId? }
 *
 * Lookup order:
 *   1. If a TopicMarker covers the offset, use its label (after corruption check)
 *   2. Else, find the closest preceding Transcript (within ±15s, session-scoped)
 *      and use the first ~6 significant words as the "topic proxy"
 *   3. Else, source='none'
 *
 * Session scoping:
 *   `roomStartedAt` (required for session correctness) filters every
 *   transcript and stale-marker lookup to the current lecture. If it's null,
 *   we return 'General Confusion' rather than leaking from a previous session.
 *
 *   Note: active TopicMarker rows in step (1) are NOT additionally filtered by
 *   `createdAt >= roomStartedAt` because markers can legitimately start near
 *   zero-offset (startMs ~ roomStartedAt). Their endMs/end-of-session is what
 *   keeps them in-scope; we additionally run `looksCorrupted()` to drop the
 *   stale 'Photosynthesis which Photosynthesis' style labels.
 */
export async function resolveTopicForOffset ({ roomId, recordingOffsetMs, roomStartedAt }) {
  if (!mongoose.Types.ObjectId.isValid(String(roomId))) {
    return { label: '', source: 'none' }
  }

  // 1. Topic markers — find one where startMs <= offset < endMs (or endMs null)
  const marker = await TopicMarker.findOne({
    roomId,
    startMs: { $lte: recordingOffsetMs },
    $or: [
      { endMs: null },
      { endMs: { $gt: recordingOffsetMs } }
    ]
  }).sort({ startMs: -1 }).lean()

  if (marker) {
    // CORRUPTED-MARKER FIX: check looksCorrupted on the primary marker too,
    // not only the soft fallback. Catches stale/healed labels like
    // 'Photosynthesis which Photosynthesis' that the primary path used to
    // pass through.
    if (looksCorrupted(marker.label)) {
      // fall through to transcript fallback (NOT return the corrupted label)
    } else {
      return {
        label: marker.label,
        note: marker.note || '',
        source: marker.source === 'auto' ? 'auto' : 'marker',
        markerId: marker._id,
        startMs: marker.startMs,
        endMs: marker.endMs
      }
    }
  }

  // 1b. SOFT FALLBACK: most recent marker that started <= offset.
  // This handles the common case of students joining AFTER the teacher has
  // moved past a marker (offset past endMs) -- the current topic is still
  // whatever the teacher last said.
  const lastMarker = await TopicMarker.findOne({
    roomId,
    startMs: { $lte: recordingOffsetMs }
  }).sort({ startMs: -1 }).lean()

  if (lastMarker) {
    // STALE-MARKER FIX: skip stale open-ended markers (>5min old) AND
    // anything that fails looksCorrupted.
    const isOpenEnded = !lastMarker.endMs
    const markerAgeMs = lastMarker.createdAt ? (Date.now() - new Date(lastMarker.createdAt).getTime()) : 0
    const isStale = isOpenEnded && markerAgeMs > 5 * 60 * 1000
    const labelLooksCorrupt = looksCorrupted(lastMarker.label)
    if (isStale || labelLooksCorrupt) {
      // fall through to the transcript fallback
    } else {
      return {
        label: lastMarker.label,
        note: lastMarker.note || '',
        source: 'latest_marker',
        markerId: lastMarker._id,
        startMs: lastMarker.startMs,
        endMs: lastMarker.endMs
      }
    }
  }

  // 2. Fallback: closest preceding Transcript within ±15s.
  // ALWAYS session-scope when roomStartedAt is known. If we have NO
  // session anchor, we cannot trust any transcript in the room (it would
  // be from a previous lecture), so return General Confusion directly
  // rather than running the heuristic on stale data.
  let transcripts
  if (roomStartedAt) {
    const targetTs = new Date(new Date(roomStartedAt).getTime() + recordingOffsetMs)
    const windowStart = new Date(targetTs.getTime() - 15000)
    const windowEnd = new Date(targetTs.getTime() + 5000)
    transcripts = await Transcript.find({
      roomId,
      createdAt: { $gte: windowStart, $lte: windowEnd }
    })
      .sort({ createdAt: -1 })
      .limit(1)
      .lean()
  } else {
    // No session clock — GUARD against cross-session leak. Returning
    // 'General Confusion' is the safe fall-through (the empty-topic
    // branch downstream will be replaced with this).
    return { label: 'General Confusion', note: '', source: 'no_session', markerId: null }
  }

  if (transcripts.length > 0) {
    const raw = extractTopicProxy(transcripts[0].text)
    return {
      label: raw || 'General Confusion',
      note: '',
      source: 'transcript',
      markerId: null
    }
  }

  // 2b. SOFT FALLBACK: if no transcript is in the ±15s window but the room
  // has transcripts, use the most recent session-scoped transcript. Without
  // roomStartedAt we cannot safely fall back, so return General Confusion.
  if (!roomStartedAt) {
    return { label: 'General Confusion', note: '', source: 'no_session', markerId: null }
  }
  const lastTranscript = await Transcript.findOne({
    roomId,
    createdAt: { $gte: new Date(roomStartedAt) }
  })
    .sort({ segmentIndex: -1, createdAt: -1 })
    .lean()

  if (lastTranscript) {
    const raw = extractTopicProxy(lastTranscript.text)
    return {
      label: raw || 'General Confusion',
      note: '',
      source: 'latest_transcript',
      markerId: null
    }
  }

  return { label: 'General Confusion', note: '', source: 'none', markerId: null }
}

/**
 * Resolve topics for many offsets at once (one round-trip per batch via
 * the in-memory intersection of sorted markers + sorted offsets).
 *
 * Session scoping: when `roomStartedAt` is provided, markers with
 * `createdAt < roomStartedAt` are filtered out so a previous lecture's
 * markers don't leak into the current batch. The same looksCorrupted()
 * check applies to every primary marker.
 */
export async function resolveTopicsForOffsets ({ roomId, offsets, roomStartedAt }) {
  if (!mongoose.Types.ObjectId.isValid(String(roomId))) {
    return new Map(offsets.map(o => [o, { label: '', source: 'none' }]))
  }
  const markerFilter = { roomId }
  if (roomStartedAt) {
    markerFilter.createdAt = { $gte: new Date(roomStartedAt) }
  }
  const markers = await TopicMarker.find(markerFilter).sort({ startMs: 1 }).lean()
  // Compute the most recent preceding marker (within the session scope).
  const lastMarker = markers.length ? markers[markers.length - 1] : null
  const out = new Map()
  // For each offset, walk markers in order
  for (const offset of offsets) {
    const m = markers.find(mk => mk.startMs <= offset && (mk.endMs == null || mk.endMs > offset))
    if (m && !looksCorrupted(m.label)) {
      out.set(offset, { label: m.label, note: m.note || '', source: 'marker', markerId: m._id })
    } else if (lastMarker && lastMarker.startMs <= offset && !looksCorrupted(lastMarker.label)) {
      // Soft fallback: use the most recent preceding marker (covers past-endMs case)
      out.set(offset, { label: lastMarker.label, note: lastMarker.note || '', source: 'latest_marker', markerId: lastMarker._id })
    } else if (!roomStartedAt) {
      out.set(offset, { label: '', source: 'none' })
    } else {
      // No marker covers the offset in the current session — caller will
      // run a session-scoped transcript lookup if needed.
      out.set(offset, { label: '', source: 'none' })
    }
  }
  return out
}

/**
 * Re-export the heuristic from topicGenerator.js so existing imports
 * (`import { extractTopicProxy } from './topicService.js'`) keep working.
 * topicGenerator.js owns the implementation; topicService.js owns the
 * marker + transcript plumbing.
 */
export { extractTopicProxy }

/**
 * Augment a list of spike buckets with their topic labels. The spike service
 * can call this before returning to the teacher.
 */
export async function annotateSpikesWithTopics ({ roomId, spikes }) {
  if (!spikes?.length) return spikes
  const offsets = spikes.map(s => s.recordingOffsetMs).filter(o => o != null)
  // Load roomStartedAt so the batch lookup is session-scoped.
  let roomStartedAt = null
  try {
    const r = await Room.findById(roomId).select('roomStartedAt').lean()
    roomStartedAt = r?.roomStartedAt || null
  } catch (e) { /* fall through with null */ }
  const labels = await resolveTopicsForOffsets({ roomId, offsets, roomStartedAt })
  return spikes.map(s => {
    const found = labels.get(s.recordingOffsetMs)
    return {
      ...s,
      topic: {
        label: found?.label || '',
        source: found?.source || 'none',
        markerId: found?.markerId || null
      }
    }
  })
}

export default {
  setTopic,
  deleteTopic,
  listTopics,
  resolveTopicForOffset,
  resolveTopicsForOffsets,
  annotateSpikesWithTopics
}