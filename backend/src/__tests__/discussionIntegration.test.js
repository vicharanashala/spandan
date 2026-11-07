/** @jest-environment @shelf/jest-mongodb/lib/environment.js */
import { jest } from '@jest/globals'
import mongoose from 'mongoose'
import express from 'express'
import request from 'supertest'
import User from '../models/User.js'
import { TERMS_VERSION } from '../config/terms.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import Discussion from '../models/Discussion.js'
import transcription from '../routes/transcription.js'
import { generateToken, clearUserCache } from '../middleware/auth.js'
import { audioAccess, reserveOrder, publishAudio, changeDiscussion, closeDiscussionForRoom, readDiscussion } from '../services/discussionService.js'
import { broadcastDiscussionTranscript, broadcastDiscussionUpdate, leaveSubscribedRooms, registerDiscussionSockets, sendDiscussionSnapshot } from '../services/discussionSockets.js'
import { updateRoom, deleteRoom, deactivateRoom } from '../services/roomService.js'

jest.setTimeout(30000)
let teacher, student, other, room, app, fetchMock
const audio = 'UklGRg=='
beforeAll(async () => {
  await mongoose.connect(global.__MONGO_URI__, { dbName: 'discussion-integration' })
  await Promise.all([Discussion.init(), User.init(), RoomMember.init()])
})
afterAll(async () => { await mongoose.disconnect() })
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Room.deleteMany({}), RoomMember.deleteMany({}), Discussion.deleteMany({})])
  clearUserCache()
  // No password comparisons in these tests; insertMany avoids unrelated bcrypt CPU cost.
  ;[teacher, student, other] = await User.insertMany([['Teacher', 'teacher'], ['Student', 'student'], ['Other', 'teacher']].map(([name, role]) => ({ name, email: `${name}@test.example`, password: 'test-fixture-only', role, teacherApprovalStatus: 'approved', termsVersion: TERMS_VERSION })))
  room = await Room.create({ name: 'Discussion test', teacher: teacher._id })
  await RoomMember.create({ roomId: room._id, studentId: student._id })
  app = express(); app.use(express.json()); app.use('/transcription', transcription)
  fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: 'Hello classroom', segments: [] }) })
})
afterEach(() => jest.restoreAllMocks())
const post = (user, body) => request(app).post('/transcription/transcribe').set('Authorization', `Bearer ${generateToken(user._id)}`).send({ audio, ...body })
async function approve() {
  await changeDiscussion(room, 'start', teacher)
  await changeDiscussion(room, 'raise-hand', student)
  const state = await changeDiscussion(room, 'approve', teacher, String(student._id))
  return { roomId: String(room._id), session: state.session, grant: state.speaker.grant }
}

test('rejects unauthenticated and unapproved student audio before inference', async () => {
  expect((await request(app).post('/transcription/transcribe').send({ audio })).status).toBe(401)
  expect((await post(student, { roomId: room._id, speakerRole: 'teacher', speakerId: teacher._id })).status).toBe(403)
  expect(fetchMock).not.toHaveBeenCalled()
})
test('derives speaker identity from authenticated user, forwards only audio, and preserves teacher transcription', async () => {
  const metadata = await approve()
  const result = await post(student, { ...metadata, speakerRole: 'teacher', speakerId: teacher._id })
  expect(result.status).toBe(200)
  expect(result.body.discussionEntry).toMatchObject({ speakerId: String(student._id), speakerRole: 'student', speakerName: 'Student' })
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ audio })
  expect((await post(teacher, {})).status).toBe(200)
  expect((await post(teacher, { roomId: room._id })).status).toBe(200)
  expect((await post(other, { roomId: room._id })).status).toBe(403)
})
test('checks room ownership, membership, role and teacher approval', async () => {
  await expect(changeDiscussion(room, 'start', other)).rejects.toMatchObject({ status: 403 })
  await expect(changeDiscussion(room, 'start', student)).rejects.toMatchObject({ status: 403 })
  const metadata = await approve()
  await RoomMember.deleteMany({})
  expect((await post(student, metadata)).status).toBe(403)
  await User.updateOne({ _id: teacher._id }, { teacherApprovalStatus: 'rejected' }); clearUserCache()
  expect((await post(teacher, {})).status).toBe(401)
})
test('removal during inference rejects the result, including after reapproval', async () => {
  const metadata = await approve()
  fetchMock.mockImplementationOnce(async () => {
    await changeDiscussion(room, 'remove-speaker', teacher, String(student._id))
    await changeDiscussion(room, 'raise-hand', student)
    await changeDiscussion(room, 'approve', teacher, String(student._id))
    return { ok: true, status: 200, json: async () => ({ text: 'stale speech' }) }
  })
  expect((await post(student, metadata)).status).toBe(403)
  expect((await readDiscussion(room)).entries).toEqual([])
})

test.each(['removed', 'ended', 'room-closing'])('atomic transcript insert rejects a grant revoked immediately before persistence (%s)', async outcome => {
  const metadata = await approve()
  const access = await audioAccess(student, metadata)
  const order = await reserveOrder(access)
  const original = Discussion.findOneAndUpdate.bind(Discussion)
  let changed = false
  jest.spyOn(Discussion, 'findOneAndUpdate').mockImplementation((...args) => {
    const query = original(...args)
    if (args[1]?.$push?.entries && !changed) {
      changed = true
      return { lean: async () => {
        if (outcome === 'removed') await changeDiscussion(room, 'remove-speaker', teacher, String(student._id))
        else if (outcome === 'ended') await changeDiscussion(room, 'end', teacher)
        else await closeDiscussionForRoom(room._id)
        return query.lean()
      } }
    }
    return query
  })

  await expect(publishAudio(access, order, 'late speech', null)).rejects.toMatchObject({ status: 403 })
  expect((await readDiscussion(room)).entries).toEqual([])
})
test.each(['ended-room', 'ended-discussion', 'removed-member', 'changed-role'])('rejects in-flight audio after %s', async kind => {
  const metadata = await approve()
  fetchMock.mockImplementationOnce(async () => {
    if (kind === 'ended-room') await Room.updateOne({ _id: room._id }, { endedAt: new Date() })
    if (kind === 'ended-discussion') await changeDiscussion(room, 'end', teacher)
    if (kind === 'removed-member') await RoomMember.deleteMany({})
    if (kind === 'changed-role') await User.updateOne({ _id: student._id }, { role: 'teacher' })
    return { ok: true, status: 200, json: async () => ({ text: 'stale' }) }
  })
  expect((await post(student, metadata)).status).toBe(403)
  expect((await Discussion.findOne({ roomId: room._id })).entries).toHaveLength(0)
})
test('failed inference leaves no ordering barrier and completion order cannot reorder the transcript', async () => {
  const metadata = await approve()
  fetchMock.mockRejectedValueOnce(new Error('unavailable'))
  expect((await post(student, metadata)).status).toBe(502)
  const access = await audioAccess(student, metadata)
  const first = await reserveOrder(access), second = await reserveOrder(access)
  await publishAudio(access, second, 'second', null)
  await publishAudio(access, first, 'first', null)
  expect((await readDiscussion(room)).entries.map(e => e.text)).toEqual(['first', 'second'])
})
test('atomic concurrent approval allows only one speaker and state survives another reader', async () => {
  const second = await User.create({ name: 'Second', email: 'second@test.example', password: 'password123', role: 'student' })
  await RoomMember.create({ roomId: room._id, studentId: second._id })
  await changeDiscussion(room, 'start', teacher)
  await changeDiscussion(room, 'raise-hand', student); await changeDiscussion(room, 'raise-hand', second)
  const results = await Promise.allSettled([changeDiscussion(room, 'approve', teacher, String(student._id)), changeDiscussion(room, 'approve', teacher, String(second._id))])
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  expect((await readDiscussion(room)).speaker).toBeTruthy()
})
test('new discussion sessions reject old grants and retain transcript until restarted', async () => {
  const metadata = await approve()
  expect((await post(student, metadata)).status).toBe(200)
  await changeDiscussion(room, 'end', teacher)
  expect((await readDiscussion(room)).entries).toHaveLength(1)
  await changeDiscussion(room, 'start', teacher)
  expect((await readDiscussion(room)).entries).toEqual([])
  expect((await post(student, metadata)).status).toBe(403)
})
test('socket rejects expired identities, unjoined callers, forged actors and non-owner teachers', async () => {
  const handlers = {}, emit = jest.fn()
  const socket = { data: { userId: String(student._id), tokenExp: Date.now() / 1000 + 100 }, rooms: new Set([room.code]), on: (name, cb) => { handlers[name] = cb }, emit }
  registerDiscussionSockets({ to: () => ({ emit }) }, socket)
  const call = async data => { const ack = jest.fn(); await handlers['discussion:start'](data, ack); return ack }
  expect((await call({ roomCode: room.code, userId: String(teacher._id), token: generateToken(teacher._id) }))).toHaveBeenCalledWith(expect.objectContaining({ ok: false }))
  socket.data.userId = String(other._id)
  expect((await call({ roomCode: room.code }))).toHaveBeenCalledWith(expect.objectContaining({ ok: false }))
  socket.data.userId = String(teacher._id); socket.data.tokenExp = 1
  expect((await call({ roomCode: room.code }))).toHaveBeenCalledWith(expect.objectContaining({ ok: false }))
  socket.data.tokenExp = Date.now() / 1000 + 100; socket.rooms.clear()
  expect((await call({ roomCode: room.code }))).toHaveBeenCalledWith(expect.objectContaining({ ok: false }))
})

test('discussion state broadcasts all entries to teacher and only a student own entries and grant', async () => {
  const teacherSocket = { data: { userId: String(teacher._id), role: 'teacher' }, emit: jest.fn() }
  const studentSocket = { data: { userId: String(student._id), role: 'student' }, emit: jest.fn() }
  const otherStudentId = new mongoose.Types.ObjectId().toString()
  const otherStudentSocket = { data: { userId: otherStudentId, role: 'student' }, emit: jest.fn() }
  const state = {
    roomCode: room.code,
    active: true,
    session: 'session-1',
    version: 3,
    pendingHands: [
      { studentId: String(student._id), name: 'Student' },
      { studentId: otherStudentId, name: 'Other Student' }
    ],
    speaker: { studentId: String(student._id), name: 'Student', grant: 'private-grant' },
    entries: [
      { id: 'teacher-entry', speakerId: String(teacher._id), speakerRole: 'teacher', speakerName: 'Teacher', text: 'Teacher text', order: 1 },
      { id: 'student-entry', speakerId: String(student._id), speakerRole: 'student', speakerName: 'Student', text: 'Student text', order: 2 },
      { id: 'other-entry', speakerId: otherStudentId, speakerRole: 'student', speakerName: 'Other Student', text: 'Private other text', order: 3 }
    ]
  }
  const io = { in: jest.fn(() => ({ fetchSockets: async () => [teacherSocket, studentSocket, otherStudentSocket] })) }

  await broadcastDiscussionUpdate(io, room.code, state)

  expect(teacherSocket.emit).toHaveBeenCalledWith('discussion:update', state)
  expect(studentSocket.emit).toHaveBeenCalledWith('discussion:update', expect.objectContaining({
    speaker: { studentId: String(student._id), name: 'Student', grant: 'private-grant' },
    pendingHands: [{ studentId: String(student._id), name: 'Student' }],
    entries: [expect.objectContaining({ id: 'student-entry', text: 'Student text', speakerName: 'Student' })]
  }))
  expect(JSON.stringify(studentSocket.emit.mock.calls)).not.toContain('Teacher text')
  expect(JSON.stringify(studentSocket.emit.mock.calls)).not.toContain('Private other text')
  expect(JSON.stringify(studentSocket.emit.mock.calls)).not.toContain('Other Student')
  expect(JSON.stringify(studentSocket.emit.mock.calls)).not.toContain(otherStudentId)
  expect(otherStudentSocket.emit).toHaveBeenCalledWith('discussion:update', expect.objectContaining({
    speaker: null,
    pendingHands: [{ studentId: otherStudentId, name: 'Other Student' }],
    entries: [expect.objectContaining({ id: 'other-entry', text: 'Private other text' })]
  }))
  expect(JSON.stringify(otherStudentSocket.emit.mock.calls)).not.toContain('private-grant')
  expect(JSON.stringify(otherStudentSocket.emit.mock.calls)).not.toContain('Student text')
})

async function seedDiscussionHistory() {
  const otherStudent = await User.create({ name: 'Other Student', email: 'other-student@test.example', password: 'test-fixture-only', role: 'student', teacherApprovalStatus: 'approved', termsVersion: TERMS_VERSION })
  await RoomMember.create({ roomId: room._id, studentId: otherStudent._id })
  const session = 'privacy-history-session'
  const entries = [
    { id: 'teacher-history', session, order: 1, speakerId: String(teacher._id), speakerRole: 'teacher', speakerName: 'Teacher', text: 'Teacher history', timestamp: new Date().toISOString() },
    { id: 'student-history', session, order: 2, speakerId: String(student._id), speakerRole: 'student', speakerName: 'Student', text: 'My history', timestamp: new Date().toISOString() },
    { id: 'other-history', session, order: 3, speakerId: String(otherStudent._id), speakerRole: 'student', speakerName: 'Other Student', text: 'Other private history', timestamp: new Date().toISOString() }
  ]
  const state = await Discussion.create({
    roomId: room._id,
    active: true,
    session,
    version: 4,
    speaker: { studentId: String(otherStudent._id), name: otherStudent.name, grant: 'other-private-grant' },
    entries
  })
  return { otherStudent, state, entries }
}

function makeDiscussionSocket(user) {
  const handlers = {}
  const emit = jest.fn()
  const socket = {
    data: { userId: String(user._id), tokenExp: Date.now() / 1000 + 100 },
    rooms: new Set([room.code]),
    on: (name, handler) => { handlers[name] = handler },
    emit
  }
  return { socket, handlers, emit }
}

test('discussion sync returns full history to teacher and private history/grants to the requesting student', async () => {
  const { otherStudent, state, entries } = await seedDiscussionHistory()
  const io = { in: jest.fn(() => ({ fetchSockets: async () => [] })) }
  const teacherSync = makeDiscussionSocket(teacher)
  registerDiscussionSockets(io, teacherSync.socket)
  const teacherAck = jest.fn()
  await teacherSync.handlers['discussion:sync']({ roomCode: room.code }, teacherAck)
  const teacherState = teacherSync.emit.mock.calls.find(([event]) => event === 'discussion:update')?.[1]
  expect(teacherAck).toHaveBeenCalledWith({ ok: true })
  expect(teacherState.entries.map(entry => entry.id)).toEqual(entries.map(entry => entry.id))
  expect(teacherState.speaker).toMatchObject({ studentId: String(otherStudent._id), grant: 'other-private-grant' })

  const studentSync = makeDiscussionSocket(student)
  registerDiscussionSockets(io, studentSync.socket)
  const studentAck = jest.fn()
  await studentSync.handlers['discussion:sync']({ roomCode: room.code }, studentAck)
  const studentState = studentSync.emit.mock.calls.find(([event]) => event === 'discussion:update')?.[1]
  expect(studentAck).toHaveBeenCalledWith({ ok: true })
  expect(studentState.entries.map(entry => entry.id)).toEqual(['student-history'])
  expect(studentState.speaker).toBeNull()
  expect(JSON.stringify(studentSync.emit.mock.calls)).not.toContain(String(otherStudent._id))
  expect(JSON.stringify(studentSync.emit.mock.calls)).not.toContain('Other Student')
  expect(JSON.stringify(studentSync.emit.mock.calls)).not.toContain('Other private history')
  expect(JSON.stringify(studentSync.emit.mock.calls)).not.toContain('other-private-grant')

  await Discussion.updateOne({ _id: state._id }, { $set: { speaker: { studentId: String(student._id), name: student.name, grant: 'my-private-grant' } } })
  const approvedSync = makeDiscussionSocket(student)
  registerDiscussionSockets(io, approvedSync.socket)
  await approvedSync.handlers['discussion:sync']({ roomCode: room.code }, jest.fn())
  const approvedState = approvedSync.emit.mock.calls.find(([event]) => event === 'discussion:update')?.[1]
  expect(approvedState.speaker).toMatchObject({ studentId: String(student._id), grant: 'my-private-grant' })
  expect(JSON.stringify(approvedSync.emit.mock.calls)).not.toContain('other-private-grant')
})

test('discussion reconnect snapshot restores full teacher history but only the student own history and grant', async () => {
  const { otherStudent, state, entries } = await seedDiscussionHistory()
  const teacherReconnect = makeDiscussionSocket(teacher)
  await sendDiscussionSnapshot(teacherReconnect.socket, room)
  const teacherState = teacherReconnect.emit.mock.calls.find(([event]) => event === 'discussion:update')?.[1]
  expect(teacherState.entries.map(entry => entry.id)).toEqual(entries.map(entry => entry.id))
  expect(teacherState.speaker).toMatchObject({ studentId: String(otherStudent._id), grant: 'other-private-grant' })

  const studentReconnect = makeDiscussionSocket(student)
  await sendDiscussionSnapshot(studentReconnect.socket, room)
  const studentState = studentReconnect.emit.mock.calls.find(([event]) => event === 'discussion:update')?.[1]
  expect(studentState.entries.map(entry => entry.id)).toEqual(['student-history'])
  expect(studentState.speaker).toBeNull()
  expect(JSON.stringify(studentReconnect.emit.mock.calls)).not.toContain(String(otherStudent._id))
  expect(JSON.stringify(studentReconnect.emit.mock.calls)).not.toContain('Other Student')
  expect(JSON.stringify(studentReconnect.emit.mock.calls)).not.toContain('Other private history')
  expect(JSON.stringify(studentReconnect.emit.mock.calls)).not.toContain('other-private-grant')

  await Discussion.updateOne({ _id: state._id }, { $set: { speaker: { studentId: String(student._id), name: student.name, grant: 'my-private-grant' } } })
  const approvedReconnect = makeDiscussionSocket(student)
  await sendDiscussionSnapshot(approvedReconnect.socket, room)
  const approvedState = approvedReconnect.emit.mock.calls.find(([event]) => event === 'discussion:update')?.[1]
  expect(approvedState.speaker).toMatchObject({ studentId: String(student._id), grant: 'my-private-grant' })
  expect(JSON.stringify(approvedReconnect.emit.mock.calls)).not.toContain('other-private-grant')
})
test('transcript events go to the teacher and the uttering student only', async () => {
  const teacherSocket = { data: { userId: String(teacher._id), role: 'teacher' }, emit: jest.fn() }
  const speakerSocket = { data: { userId: String(student._id), role: 'student' }, emit: jest.fn() }
  const otherStudentSocket = { data: { userId: new mongoose.Types.ObjectId().toString(), role: 'student' }, emit: jest.fn() }
  const io = { in: jest.fn(() => ({ fetchSockets: async () => [teacherSocket, speakerSocket, otherStudentSocket] })) }
  const entry = { id: 'entry-1', session: 'session-1', speakerId: String(student._id), speakerRole: 'student', speakerName: 'Student', text: 'Private utterance', order: 1 }

  await broadcastDiscussionTranscript(io, room.code, entry)

  const event = ['discussion:transcript', { roomCode: room.code, session: entry.session, entry }]
  expect(teacherSocket.emit).toHaveBeenCalledWith(...event)
  expect(speakerSocket.emit).toHaveBeenCalledWith(...event)
  expect(otherStudentSocket.emit).not.toHaveBeenCalled()
})

test('reauthentication cleanup leaves application rooms but keeps the socket private room', () => {
  const rooms = new Set(['socket-1', room.code, `user:${student._id}`])
  const socket = { id: 'socket-1', rooms, leave: name => rooms.delete(name) }
  leaveSubscribedRooms(socket)
  expect([...rooms]).toEqual(['socket-1'])
})

test('ending discussion during teacher inference preserves teacher text without publishing stale discussion text', async () => {
  await approve()
  fetchMock.mockImplementationOnce(async () => {
    await changeDiscussion(room, 'end', teacher)
    return { ok: true, status: 200, json: async () => ({ text: 'teacher final window' }) }
  })
  const result = await post(teacher, { roomId: room._id })
  expect(result.status).toBe(200)
  expect(result.body.text).toBe('teacher final window')
  expect(result.body.discussionEntry).toBeNull()
})

test('concurrent first starts create exactly one discussion document', async () => {
  await Promise.all([changeDiscussion(room, 'start', teacher), changeDiscussion(room, 'start', teacher)])
  expect(await Discussion.countDocuments({ roomId: room._id })).toBe(1)
})

test('room shutdown installs a closed marker that prevents a first discussion start', async () => {
  await closeDiscussionForRoom(room._id)
  await expect(changeDiscussion(room, 'start', teacher)).rejects.toMatchObject({ status: 403 })
  expect(await Discussion.countDocuments({ roomId: room._id })).toBe(1)
})

test('permanent room deletion removes discussion history with the other room records', async () => {
  const metadata = await approve()
  expect((await post(student, metadata)).status).toBe(200)
  expect((await readDiscussion(room)).entries).toHaveLength(1)

  await deleteRoom(room._id)

  expect(await Room.findById(room._id)).toBeNull()
  expect(await Discussion.findOne({ roomId: room._id })).toBeNull()
})

test('deleting a nonexistent room does not create a discussion marker', async () => {
  const missingRoomId = new mongoose.Types.ObjectId()

  await expect(deleteRoom(missingRoomId)).rejects.toThrow('Room not found')

  expect(await Discussion.findOne({ roomId: missingRoomId })).toBeNull()
})

test('concurrent room removal after the existence check does not leave an orphan discussion marker', async () => {
  jest.spyOn(Room, 'findByIdAndUpdate').mockImplementationOnce(async () => {
    await Room.findByIdAndDelete(room._id)
    return null
  })

  await expect(deleteRoom(room._id)).rejects.toThrow('Room not found')

  expect(await Discussion.findOne({ roomId: room._id })).toBeNull()
})

test.each(['update', 'deactivate'])('%s shutdown stays fail-closed and can be retried safely', async operation => {
  const metadata = await approve()
  expect((await post(student, metadata)).status).toBe(200)
  jest.spyOn(Room, 'findByIdAndUpdate').mockRejectedValueOnce(new Error('simulated room update failure'))
  const shutdown = () => operation === 'update'
    ? updateRoom(room._id, { isActive: false, endedAt: new Date() })
    : deactivateRoom(room._id)

  await expect(shutdown()).rejects.toThrow('simulated room update failure')
  expect((await Room.findById(room._id)).isActive).toBe(true)
  const closed = await Discussion.findOne({ roomId: room._id }).lean()
  expect(closed).toMatchObject({ active: false, closing: true, speaker: null })
  expect(closed.entries).toHaveLength(1)

  await shutdown()
  const endedRoom = await Room.findById(room._id)
  expect(endedRoom.isActive).toBe(false)
  expect(endedRoom.endedAt).toBeTruthy()
  expect((await Discussion.findOne({ roomId: room._id }).lean()).entries).toHaveLength(1)
})

test('failed room deletion remains closed and retry removes room and discussion history', async () => {
  const metadata = await approve()
  expect((await post(student, metadata)).status).toBe(200)
  jest.spyOn(Room, 'findByIdAndUpdate').mockRejectedValueOnce(new Error('simulated room shutdown failure'))

  await expect(deleteRoom(room._id)).rejects.toThrow('simulated room shutdown failure')
  expect((await Room.findById(room._id)).isActive).toBe(true)
  expect(await Discussion.findOne({ roomId: room._id }).lean()).toMatchObject({ active: false, closing: true })

  await deleteRoom(room._id)
  expect(await Room.findById(room._id)).toBeNull()
  expect(await Discussion.findOne({ roomId: room._id })).toBeNull()
})

test('retry completes deletion after the ended room survives a final delete failure', async () => {
  const metadata = await approve()
  expect((await post(student, metadata)).status).toBe(200)
  jest.spyOn(Room, 'findByIdAndDelete').mockRejectedValueOnce(new Error('simulated final room delete failure'))

  await expect(deleteRoom(room._id)).rejects.toThrow('simulated final room delete failure')
  const endedRoom = await Room.findById(room._id)
  expect(endedRoom).toMatchObject({ isActive: false })
  expect(endedRoom.endedAt).toBeTruthy()
  expect(await Discussion.findOne({ roomId: room._id })).toBeNull()
  await expect(audioAccess(student, { roomId: room._id, session: metadata.session, grant: metadata.grant }))
    .rejects.toMatchObject({ status: 403 })

  await deleteRoom(room._id)
  expect(await Room.findById(room._id)).toBeNull()
  expect(await Discussion.findOne({ roomId: room._id })).toBeNull()
})

test('cached HTTP identity cannot authorize audio after the account role changes', async () => {
  const metadata = await approve()
  expect((await post(student, metadata)).status).toBe(200)
  fetchMock.mockClear()
  await User.updateOne({ _id: student._id }, { role: 'teacher' })
  expect((await post(student, metadata)).status).toBe(403)
  expect(fetchMock).not.toHaveBeenCalled()
})
