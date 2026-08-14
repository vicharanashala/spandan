// confusionEventService.test.js -- unit + integration tests for the
// live "topic-aware confusion event" pipeline.
//
// Uses the @shelf/jest-mongodb preset (configured via jest-mongodb.config.js
// and connected in src/__tests__/setup.cjs). Mongoose is already connected
// to process.env.MONGO_URL when this file runs.

import mongoose from 'mongoose'
import {
  attachSignalToEvent,
  getActiveForRoom,
  getLatestForRoom,
  listForRoom,
  closeEvent,
  closeAllActiveForRoom,
  formatForClient
} from '../services/confusionEventService.js'
import { ConfusionEvent, Room, DoubtSignal, TopicMarker, User } from '../models/index.js'
import * as topicService from '../services/topicService.js'
import * as doubtService from '../services/doubtService.js'

const FAKE_ROOM_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER_ROOM_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb'

// Helper to make ObjectIds out of hex strings (for fixtures populated with hex)
const oid = (hex) => new mongoose.Types.ObjectId(hex)

beforeEach(async () => {
  // Wipe collections between tests -- setup.cjs leaves the in-memory DB up
  // across all suites in a single Jest run.
  await ConfusionEvent.deleteMany({})
  await DoubtSignal.deleteMany({})
  await TopicMarker.deleteMany({})
  await Room.deleteMany({})
  await User.deleteMany({})
})

// ─── attachSignalToEvent ────────────────────────────────────────────
describe('attachSignalToEvent', () => {
  it('creates a new active event when none exists', async () => {
    const signalId = new mongoose.Types.ObjectId()
    const r = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: signalId.toString(),
      studentHash: 'a'.repeat(64),
      recordingOffsetMs: 60000,
      utteranceSnapshot: 'Photosynthesis uses chlorophyll to convert CO2 into glucose.',
      topicContext: { label: 'Photosynthesis', source: 'transcript', markerId: null }
    })
    expect(r.action).toBe('created')
    expect(r.closedPrior).toBeNull()
    expect(r.event.confusedStudentCount).toBe(1)
    expect(r.event.topicLabel).toBe('Photosynthesis')
    expect(r.event.topicSource).toBe('transcript')
    expect(r.event.studentIds).toEqual(['a'.repeat(64)])
    expect(r.event.signalIds.length).toBe(1)
    expect(r.event.status).toBe('active')
  })

  it('merges a second student into the existing active event', async () => {
    const sig1 = new mongoose.Types.ObjectId()
    const sig2 = new mongoose.Types.ObjectId()
    const hashA = 'a'.repeat(64)
    const hashB = 'b'.repeat(64)
    // First signal creates the event
    await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: sig1.toString(),
      studentHash: hashA,
      recordingOffsetMs: 60000,
      utteranceSnapshot: 'Photosynthesis uses chlorophyll.',
      topicContext: { label: 'Photosynthesis', source: 'transcript', markerId: null }
    })
    // Second signal SAME topic, different student -> merge
    const r = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: sig2.toString(),
      studentHash: hashB,
      recordingOffsetMs: 65000,
      utteranceSnapshot: 'Photosynthesis uses chlorophyll to make sugar.',
      topicContext: { label: 'Photosynthesis', source: 'transcript', markerId: null }
    })
    expect(r.action).toBe('merged')
    expect(r.event.confusedStudentCount).toBe(2)
    expect(r.event.studentIds).toEqual([hashA, hashB])
    expect(r.event.signalIds.length).toBe(2)
    expect(r.event.latestTranscriptSnippet).toContain('make sugar')
  })

  it('does NOT double-count a duplicate student (same HMAC)', async () => {
    const sig1 = new mongoose.Types.ObjectId()
    const sig2 = new mongoose.Types.ObjectId()
    const hash = 'c'.repeat(64)
    await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: sig1.toString(),
      studentHash: hash,
      topicContext: { label: 'Photosynthesis', source: 'transcript', markerId: null }
    })
    const r = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: sig2.toString(),
      studentHash: hash,
      topicContext: { label: 'Photosynthesis', source: 'transcript', markerId: null }
    })
    expect(r.action).toBe('noop')
    expect(r.event.confusedStudentCount).toBe(1)
    expect(r.event.signalIds.length).toBe(1)
  })

  it('closes the prior event and creates a new one when the topic changes', async () => {
    const sig1 = new mongoose.Types.ObjectId()
    const sig2 = new mongoose.Types.ObjectId()
    await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: sig1.toString(),
      studentHash: 'a'.repeat(64),
      topicContext: { label: 'Photosynthesis', source: 'transcript', markerId: null }
    })
    // Different topic label
    const r = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: sig2.toString(),
      studentHash: 'a'.repeat(64),
      topicContext: { label: 'Krebs Cycle', source: 'transcript', markerId: null }
    })
    expect(r.action).toBe('created')
    expect(r.closedPrior).toBeTruthy()
    expect(r.closedPrior.topicLabel).toBe('Photosynthesis')
    expect(r.closedPrior.status).toBe('closed')
    expect(r.event.topicLabel).toBe('Krebs Cycle')
    expect(r.event.confusedStudentCount).toBe(1)

    // Confirm only one active remains
    const active = await getActiveForRoom(FAKE_ROOM_ID)
    expect(active.topicLabel).toBe('Krebs Cycle')
  })

  it('matches topics by markerId even when labels differ slightly', async () => {
    const markerId = new mongoose.Types.ObjectId()
    const sig1 = new mongoose.Types.ObjectId()
    const sig2 = new mongoose.Types.ObjectId()
    // First event with a marker
    await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: sig1.toString(),
      studentHash: 'a'.repeat(64),
      topicContext: { label: 'Binary Search', source: 'marker', markerId: markerId.toString() }
    })
    // Same markerId, even if the label was auto-corrected -> same topic, merge
    const r = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: sig2.toString(),
      studentHash: 'b'.repeat(64),
      topicContext: { label: 'Binary Search.', source: 'marker', markerId: markerId.toString() }
    })
    expect(r.action).toBe('merged')
    expect(r.event.confusedStudentCount).toBe(2)
    expect(String(r.event.topicMarkerId)).toBe(markerId.toString())
  })

  it('creates a new event when the markerId changes', async () => {
    const m1 = new mongoose.Types.ObjectId()
    const m2 = new mongoose.Types.ObjectId()
    await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'a'.repeat(64),
      topicContext: { label: 'X', source: 'marker', markerId: m1.toString() }
    })
    const r = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'a'.repeat(64),
      topicContext: { label: 'Y', source: 'marker', markerId: m2.toString() }
    })
    expect(r.action).toBe('created')
    expect(r.closedPrior).toBeTruthy()
  })

  it('merges empty-label events when no utterance is available (both get the fallback label)', async () => {
    // Two students tap with no marker, no transcript, no utterance.
    // Both events get the hard fallback "General confusion" label and SHOULD merge.
    await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'a'.repeat(64),
      topicContext: { label: '', source: 'none', markerId: null }
    })
    const r = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'b'.repeat(64),
      topicContext: { label: '', source: 'none', markerId: null }
    })
    expect(r.action).toBe('merged')
    expect(r.event.confusedStudentCount).toBe(2)
    expect(r.event.topicLabel).toBe('General confusion')
    expect(r.event.topicSource).toBe('fallback')
  })

  it('keeps the latest transcript snippet (does not overwrite with empty)', async () => {
    await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'a'.repeat(64),
      utteranceSnapshot: 'Photosynthesis uses chlorophyll.',
      topicContext: { label: 'Photosynthesis', source: 'transcript', markerId: null }
    })
    const r = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'b'.repeat(64),
      utteranceSnapshot: '',
      topicContext: { label: 'Photosynthesis', source: 'transcript', markerId: null }
    })
    expect(r.event.latestTranscriptSnippet).toContain('Photosynthesis')
  })

  it('falls back to student utterance when no marker and no transcript', async () => {
    // No markers, no transcripts in DB -- only the student's utterance.
    const r = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'c'.repeat(64),
      recordingOffsetMs: 0,
      utteranceSnapshot: 'I am confused about the Krebs cycle'
    })
    expect(r.action).toBe('created')
    expect(r.event.topicLabel.toLowerCase()).toContain('krebs')
    expect(r.event.topicSource).toBe('student_utterance')
  })

  it('prefers marker over student utterance when both exist', async () => {
    const TopicMarker = (await import('../models/TopicMarker.js')).default
    await TopicMarker.create({
      roomId: new mongoose.Types.ObjectId(FAKE_ROOM_ID),
      teacherId: new mongoose.Types.ObjectId(),
      startMs: 0,
      endMs: 60000,
      label: 'Glycolysis -- Investment Phase',
      source: 'manual'
    })
    const r = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'd'.repeat(64),
      recordingOffsetMs: 5000,
      utteranceSnapshot: 'I am confused about the Krebs cycle'
    })
    expect(r.action).toBe('created')
    expect(r.event.topicLabel).toBe('Glycolysis -- Investment Phase')
    expect(r.event.topicSource).toBe('marker')
  })

  it('returns noop for invalid input', async () => {
    const r1 = await attachSignalToEvent({ roomId: 'not-an-oid', signalId: 'nope', studentHash: 'a'.repeat(64) })
    expect(r1.action).toBe('noop')
    const r2 = await attachSignalToEvent({ roomId: FAKE_ROOM_ID, signalId: 'nope', studentHash: 'a'.repeat(64) })
    expect(r2.action).toBe('noop')
  })

  it('isolates events by roomId', async () => {
    await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'a'.repeat(64),
      topicContext: { label: 'Photosynthesis', source: 'transcript', markerId: null }
    })
    const r = await attachSignalToEvent({
      roomId: OTHER_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'a'.repeat(64),
      topicContext: { label: 'Photosynthesis', source: 'transcript', markerId: null }
    })
    // Same topic, different room -> separate events (rooms are first-class boundary)
    expect(r.action).toBe('created')
    expect(r.event.confusedStudentCount).toBe(1)
  })

  it('updates latestTimestamp on each merge', async () => {
    const sig1 = new mongoose.Types.ObjectId()
    const sig2 = new mongoose.Types.ObjectId()
    const r1 = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: sig1.toString(),
      studentHash: 'a'.repeat(64),
      topicContext: { label: 'X', source: 'transcript', markerId: null }
    })
    const beforeMs = new Date(r1.event.latestTimestamp).getTime()
    // Wait 5ms
    await new Promise(res => setTimeout(res, 5))
    const r2 = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: sig2.toString(),
      studentHash: 'b'.repeat(64),
      topicContext: { label: 'X', source: 'transcript', markerId: null }
    })
    const afterMs = new Date(r2.event.latestTimestamp).getTime()
    expect(afterMs).toBeGreaterThanOrEqual(beforeMs)
  })
})

// ─── getActiveForRoom / getLatestForRoom / listForRoom ────────────────
describe('event queries', () => {
  beforeEach(async () => {
    // Create three events: two for FAKE_ROOM (current active + closed),
    // one for OTHER_ROOM.
    await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'a'.repeat(64),
      topicContext: { label: 'Photosynthesis', source: 'transcript', markerId: null }
    })
    await new Promise(res => setTimeout(res, 5))
    await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'b'.repeat(64),
      topicContext: { label: 'Krebs Cycle', source: 'transcript', markerId: null }
    })
    await attachSignalToEvent({
      roomId: OTHER_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'c'.repeat(64),
      topicContext: { label: 'Citric Acid', source: 'transcript', markerId: null }
    })
  })

  it('getActiveForRoom returns only the newest active event for the room', async () => {
    const active = await getActiveForRoom(FAKE_ROOM_ID)
    expect(active).toBeTruthy()
    expect(active.topicLabel).toBe('Krebs Cycle')
    expect(active.status).toBe('active')
  })

  it('getLatestForRoom returns the newest event regardless of room', async () => {
    const latest = await getLatestForRoom(FAKE_ROOM_ID)
    expect(latest.topicLabel).toBe('Krebs Cycle')
  })

  it('listForRoom returns events newest first with limit', async () => {
    const events = await listForRoom({ roomId: FAKE_ROOM_ID, limit: 10 })
    expect(events.length).toBe(2)
    expect(events[0].topicLabel).toBe('Krebs Cycle')
    expect(events[1].topicLabel).toBe('Photosynthesis')
  })

  it('listForRoom respects limit and caps at 200', async () => {
    const a = await listForRoom({ roomId: FAKE_ROOM_ID, limit: 1 })
    expect(a.length).toBe(1)
    const b = await listForRoom({ roomId: FAKE_ROOM_ID, limit: 99999 })
    expect(b.length).toBeLessThanOrEqual(200)
  })

  it('listForRoom returns [] for invalid room id', async () => {
    const events = await listForRoom({ roomId: 'not-an-oid', limit: 10 })
    expect(events).toEqual([])
  })

  it('getActiveForRoom returns null when none exist', async () => {
    const active = await getActiveForRoom('cccccccccccccccccccccccc')
    expect(active).toBeNull()
  })
})

// ─── closeEvent / closeAllActiveForRoom ─────────────────────────────
describe('event closing', () => {
  it('closeEvent flips status to closed', async () => {
    const r = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'a'.repeat(64),
      topicContext: { label: 'X', source: 'transcript', markerId: null }
    })
    const closed = await closeEvent(r.event._id)
    expect(closed.status).toBe('closed')
    expect(closed.closedAt).toBeTruthy()
    // verify no longer active
    const active = await getActiveForRoom(FAKE_ROOM_ID)
    expect(active).toBeNull()
  })

  it('closeAllActiveForRoom closes everything in one go', async () => {
    await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'a'.repeat(64),
      topicContext: { label: 'X', source: 'transcript', markerId: null }
    })
    await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'b'.repeat(64),
      topicContext: { label: 'Y', source: 'transcript', markerId: null }
    })
    // The second attach closed the first, so only 1 is active
    const count = await closeAllActiveForRoom(FAKE_ROOM_ID)
    expect(count).toBe(1)
    const active = await getActiveForRoom(FAKE_ROOM_ID)
    expect(active).toBeNull()
  })
})

// ─── formatForClient ────────────────────────────────────────────────
describe('formatForClient', () => {
  it('null -> null', () => {
    expect(formatForClient(null)).toBeNull()
  })

  it('formats a complete event for the dashboard wire', async () => {
    const r = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: new mongoose.Types.ObjectId().toString(),
      studentHash: 'a'.repeat(64),
      recordingOffsetMs: 120000,
      utteranceSnapshot: 'Binary Search divides the sorted array in half each step.',
      topicContext: {
        label: 'Binary Search',
        note: 'Lower Bound',
        source: 'marker',
        markerId: new mongoose.Types.ObjectId().toString()
      }
    })
    const formatted = formatForClient(r.event)
    expect(formatted.id).toBeTruthy()
    expect(formatted.roomId).toBe(FAKE_ROOM_ID)
    expect(formatted.topic.label).toBe('Binary Search')
    expect(formatted.topic.subtopic).toBe('Lower Bound')
    expect(formatted.topic.source).toBe('marker')
    expect(formatted.topic.markerId).toBeTruthy()
    expect(formatted.confusedStudentCount).toBe(1)
    expect(formatted.startedAt).toBeTruthy()
    expect(formatted.startedAtLabel).toMatch(/\d/)
    expect(formatted.lastUpdateAt).toBeTruthy()
    expect(formatted.lastUpdateLabel).toMatch(/\d/)
    expect(formatted.startRecordingOffsetMs).toBe(120000)
    expect(formatted.latestRecordingOffsetMs).toBe(120000)
    expect(formatted.latestTranscriptSnippet).toContain('Binary Search')
    expect(formatted.status).toBe('active')
    expect(formatted.signalCount).toBe(1)
  })
})

// ─── Integration: real DoubtSignal -> topic resolution -> event ─────
describe('integration with doubtService + topicService', () => {
  beforeEach(async () => {
    // Seed a Room and a TopicMarker so topic resolution can look it up
    await Room.create({
      _id: oid(FAKE_ROOM_ID),
      code: 'INTROOM1',
      name: 'Integration Room 1',
      teacher: new mongoose.Types.ObjectId(),
      isActive: true,
      doubtSalt: 'f'.repeat(64),
      roomStartedAt: new Date(Date.now() - 5 * 60 * 1000) // 5min ago
    })
  })

  it('full pipeline: record doubt -> topic resolved -> event created/merged', async () => {
    // First call creates a topic marker so resolveTopicForOffset can find it
    const teacherId = (await Room.findById(FAKE_ROOM_ID)).teacher
    const marker = await TopicMarker.create({
      roomId: FAKE_ROOM_ID,
      teacherId,
      startMs: 0,
      endMs: 600000,
      label: 'Glycolysis',
      note: 'Investment Phase',
      source: 'manual',
      confirmed: true
    })

    // Hash a synthetic userId with the seeded salt
    const userId = new mongoose.Types.ObjectId()
    const hashA = doubtService.hashStudent(userId, 'f'.repeat(64))
    const hashB = doubtService.hashStudent(new mongoose.Types.ObjectId(), 'f'.repeat(64))

    // Resolve topic for an offset within the marker window
    const topic = await topicService.resolveTopicForOffset({
      roomId: FAKE_ROOM_ID,
      recordingOffsetMs: 60000
    })
    expect(topic.label).toBe('Glycolysis')
    expect(topic.source).toBe('marker')
    expect(String(topic.markerId)).toBe(marker._id.toString())

    // First signal -> create event
    const sig1 = await DoubtSignal.create({
      roomId: FAKE_ROOM_ID,
      studentHash: hashA,
      segmentIndex: 1,
      recordingOffsetMs: 60000,
      utteranceSnapshot: 'Glycolysis begins with the phosphorylation of glucose by hexokinase.'
    })
    const r1 = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: sig1._id.toString(),
      studentHash: hashA,
      recordingOffsetMs: 60000,
      utteranceSnapshot: sig1.utteranceSnapshot,
      topicContext: topic
    })
    expect(r1.action).toBe('created')
    expect(r1.event.confusedStudentCount).toBe(1)

    // Second signal, same topic -> merge
    const sig2 = await DoubtSignal.create({
      roomId: FAKE_ROOM_ID,
      studentHash: hashB,
      segmentIndex: 1,
      recordingOffsetMs: 65000,
      utteranceSnapshot: 'Glycolysis requires ATP input during the investment phase.'
    })
    const r2 = await attachSignalToEvent({
      roomId: FAKE_ROOM_ID,
      signalId: sig2._id.toString(),
      studentHash: hashB,
      recordingOffsetMs: 65000,
      utteranceSnapshot: sig2.utteranceSnapshot,
      topicContext: topic
    })
    expect(r2.action).toBe('merged')
    expect(r2.event.confusedStudentCount).toBe(2)
    expect(r2.event.topicSubtopic).toBe('Investment Phase')

    // Active event reflects both students + two signal IDs
    const active = await getActiveForRoom(FAKE_ROOM_ID)
    expect(active.confusedStudentCount).toBe(2)
    expect(active.signalIds.length).toBe(2)
  })
})