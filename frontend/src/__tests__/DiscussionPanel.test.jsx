import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import DiscussionPanel from '../components/DiscussionPanel'
import { createRecordingPipeline } from '../services/recordingPipelineService'

jest.mock('../config.js', () => ({ API_URL: '/api', BASE_PATH: '', SOCKET_URL: 'http://localhost' }))
jest.mock('../services/recordingPipelineService', () => ({ createRecordingPipeline: jest.fn() }))

const room = { _id: 'room1', code: 'ABCDEF' }
const student = { _id: 's1' }
let socket, listeners
const entry = (id, order, text, role = 'student') => ({ id, order, text, speakerRole: role, speakerName: 'Alice' })
const state = extra => ({ roomCode: room.code, active: true, session: 'session1', version: 1, pendingHands: [], speaker: null, entries: [], ...extra })
const deliver = (event, data) => act(() => { for (const fn of listeners[event] || []) fn(data) })

beforeEach(() => {
  listeners = {}
  socket = { connected: true, emit: jest.fn(), on: (event, fn) => { (listeners[event] ||= []).push(fn) }, off: (event, fn) => { listeners[event] = (listeners[event] || []).filter(item => item !== fn) } }
  createRecordingPipeline.mockReset()
})

test('teacher has no separate transcript or question button; new student speech feeds the room transcript once', () => {
  const append = jest.fn()
  render(<DiscussionPanel room={room} socket={socket} user={{ _id: 't1' }} teacher onStudentTranscript={append} />)
  const historical = entry('a', 1, 'history'), fresh = entry('b', 2, 'student speech')
  deliver('discussion:update', state({ entries: [historical] }))
  deliver('discussion:transcript', { roomCode: room.code, session: 'session1', entry: fresh })
  deliver('discussion:update', state({ version: 2, entries: [historical, fresh] }))
  expect(append).toHaveBeenCalledTimes(1)
  expect(append).toHaveBeenCalledWith(fresh)
  expect(screen.queryByRole('log')).toBeNull()
  expect(screen.queryByRole('button', { name: /Use discussion for questions/i })).toBeNull()
})

test('student room has no discussion UI before start, ignores stale updates, and hides others transcripts', () => {
  render(<DiscussionPanel room={room} socket={socket} user={student} />)
  expect(screen.queryByRole('region', { name: 'Discussion controls' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Raise Hand' })).toBeNull()
  deliver('discussion:update', state({ version: 3, entries: [entry('a', 1, 'shared speech')] }))
  deliver('discussion:transcript', { roomCode: room.code, session: 'session1', entry: entry('b', 2, 'new speech') })
  deliver('discussion:update', state({ version: 2, active: false }))
  expect(screen.getByRole('button', { name: 'Raise Hand' })).toBeInTheDocument()
  expect(screen.queryByText('shared speech')).toBeNull()
  expect(screen.queryByText('new speech')).toBeNull()
  deliver('discussion:update', state({ version: 4, active: false }))
  expect(screen.queryByRole('region', { name: 'Discussion controls' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Raise Hand' })).toBeNull()
})

test('student sees waiting, can raise again after rejection, and sees approval', () => {
  render(<DiscussionPanel room={room} socket={socket} user={student} />)
  deliver('discussion:update', state({ pendingHands: [{ studentId: 's1', name: 'Alice' }] }))
  expect(screen.getByText('Waiting for approval...')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Raise Hand' })).toBeNull()

  deliver('discussion:update', state({ version: 2 }))
  expect(screen.queryByText(/declined/i)).toBeNull()
  expect(screen.getByRole('button', { name: 'Raise Hand' })).toBeInTheDocument()

  deliver('discussion:update', state({ version: 3, speaker: { studentId: 's1', grant: 'grant1' } }))
  expect(screen.getByText('Approved by teacher')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Start Speaking' })).toHaveStyle({ borderRadius: '12px' })
})

test('teacher controls pending approval and approved speaker removal without a separate heading panel', () => {
  render(<DiscussionPanel room={room} socket={socket} user={{ _id: 't1' }} teacher />)
  deliver('discussion:update', state({ pendingHands: [{ studentId: 's1', name: 'Alice' }] }))
  expect(screen.getByRole('button', { name: /Start Discussion/ })).toHaveStyle({ borderRadius: '12px' })
  expect(screen.queryByRole('heading', { name: /discussion/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /Use discussion for questions/i })).toBeNull()
  expect(screen.getByRole('button', { name: /Approve/ })).toHaveStyle({ borderRadius: '12px' })
  expect(screen.getByRole('button', { name: /Reject/ })).toHaveStyle({ borderRadius: '12px' })
  deliver('discussion:update', state({ version: 2, speaker: { studentId: 's1', name: 'Alice', grant: 'g1' } }))
  expect(screen.getByRole('button', { name: /End Discussion/ })).toHaveStyle({ borderRadius: '12px' })
  expect(screen.getByRole('button', { name: /Remove/ })).toBeInTheDocument()
})

test('only new student entries feed the current teacher segment and sync recovers missed entries', () => {
  const append = jest.fn()
  render(<DiscussionPanel room={room} socket={socket} user={{ _id: 't1' }} teacher onStudentTranscript={append} />)
  const historical = entry('a', 1, 'history'), fresh = entry('b', 2, 'fresh')
  deliver('discussion:update', state({ entries: [historical] }))
  expect(append).not.toHaveBeenCalled()
  deliver('discussion:update', state({ version: 2, entries: [historical, fresh] }))
  expect(append).toHaveBeenCalledTimes(1)
  expect(append).toHaveBeenCalledWith(fresh)
})

test('speaker removal and disconnection dispose the microphone; reapproval requires a fresh click', async () => {
  const recorder = { startRecording: jest.fn(async () => {}), isRecording: () => true, dispose: jest.fn() }
  createRecordingPipeline.mockReturnValue(recorder)
  render(<DiscussionPanel room={room} socket={socket} user={student} />)
  deliver('discussion:update', state({ speaker: { studentId: 's1', grant: 'grant1' } }))
  await act(async () => fireEvent.click(screen.getByText('Start Speaking')))
  expect(recorder.startRecording).toHaveBeenCalledTimes(1)
  act(() => createRecordingPipeline.mock.calls[0][0].onTranscription(1, 'my words'))
  expect(screen.getByText(/Your transcription:/).parentElement).toHaveTextContent('my words')
  expect(screen.queryByText('shared student speech')).toBeNull()
  deliver('discussion:update', state({ version: 2 }))
  expect(recorder.dispose).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('Start Speaking')).toBeNull()
  deliver('discussion:update', state({ version: 3, speaker: { studentId: 's1', grant: 'grant2' } }))
  expect(recorder.startRecording).toHaveBeenCalledTimes(1)
  socket.connected = false
  deliver('disconnect')
  expect(screen.getByText('Start Speaking')).toBeDisabled()
})

test('student hand requests include no claimed identity or token', () => {
  render(<DiscussionPanel room={room} socket={socket} user={student} />)
  deliver('discussion:update', state())
  fireEvent.click(screen.getByText('Raise Hand'))
  expect(socket.emit).toHaveBeenCalledWith('discussion:raise-hand', { roomCode: room.code, studentId: undefined })
})

test('another participant joining does not trigger a discussion sync storm', () => {
  render(<DiscussionPanel room={room} socket={socket} user={student} />)
  socket.emit.mockClear()
  deliver('room:joined', { roomCode: room.code, participants: 100 })
  expect(socket.emit).not.toHaveBeenCalled()
})

test('teacher receives historical entries from the initial snapshot in server order after reload', () => {
  const snapshots = jest.fn()
  render(<DiscussionPanel room={room} socket={socket} user={{ _id: 't1' }} teacher onTranscriptUpdate={snapshots} />)
  const later = { ...entry('later', 2, 'question'), speakerName: 'Harshitha' }
  const earlier = entry('earlier', 1, 'explanation', 'teacher')
  deliver('discussion:update', state({ entries: [later, earlier] }))
  expect(snapshots).toHaveBeenLastCalledWith({ session: 'session1', active: true, entries: [earlier, later] })
})

test('reconnect snapshot merges history and live events once, in shared order', () => {
  const snapshots = jest.fn()
  render(<DiscussionPanel room={room} socket={socket} user={{ _id: 't1' }} teacher onTranscriptUpdate={snapshots} />)
  const first = entry('first', 1, 'teacher line', 'teacher')
  const second = entry('second', 2, 'student line')
  deliver('discussion:update', state({ entries: [first] }))
  deliver('disconnect')
  deliver('discussion:transcript', { roomCode: room.code, session: 'session1', entry: second })
  deliver('discussion:update', state({ version: 2, entries: [first, second] }))
  deliver('discussion:transcript', { roomCode: room.code, session: 'session1', entry: second })
  expect(snapshots).toHaveBeenLastCalledWith({ session: 'session1', active: true, entries: [first, second] })
  expect(snapshots.mock.calls.at(-1)[0].entries).toHaveLength(2)
})

test('new discussion session snapshot excludes entries from the previous session', () => {
  const snapshots = jest.fn()
  render(<DiscussionPanel room={room} socket={socket} user={{ _id: 't1' }} teacher onTranscriptUpdate={snapshots} />)
  deliver('discussion:update', state({ entries: [entry('old', 1, 'old session')] }))
  deliver('discussion:update', state({ version: 2, session: 'session2', entries: [entry('new', 1, 'new session', 'teacher')] }))
  expect(snapshots).toHaveBeenLastCalledWith({ session: 'session2', active: true, entries: [entry('new', 1, 'new session', 'teacher')] })
})
