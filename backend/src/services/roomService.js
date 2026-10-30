import Room from '../models/Room.js'
import Question from '../models/Question.js'
import RoomMember from '../models/RoomMember.js'
import Response from '../models/Response.js'
import Transcript from '../models/Transcript.js'
import { invalidateRoomLive } from './roomLiveCache.js'
import { ensureRoomMember, evaluateJoin } from './waitingRoom.js'
import { getStudentAttendanceSummary } from './attendanceLedger.js'

export const createRoom = async (name, teacherId, settings = {}) => {
  const room = new Room({
    name,
    teacher: teacherId,
    settings
  })

  await room.save()
  return room
}

export const getRoomById = async (id) => {
  const room = await Room.findById(id).populate('teacher', 'name')
  if (!room) {
    throw new Error('Room not found')
  }
  return room
}

export const getRoomByCode = async (code) => {
  const room = await Room.findOne({ code: code.toUpperCase() }).populate('teacher', 'name')
  if (!room) {
    throw new Error('Room not found')
  }
  return room
}

// Enriched join used by both the REST join (GET /rooms/join/:code) and the waiting-room flows.
// Creates/refreshes the RoomMember row (never demoting an admitted student), then returns the
// room plus everything the client needs to decide between the live session and the waiting room:
//
//   { room, admitted, waitingRoom, admissionStatus, attendanceStatus, lateMinutes,
//     waitingRoomEnabled, policy, notification, attendance }
//
// Contract change: joinRoomByCode used to resolve to the bare room; callers must now read
// `.room`. See frontend/src/stores/roomStore.js.
export const joinRoomByCode = async (code, studentId, { at = new Date() } = {}) => {
  const room = await getRoomByCode(code)
  if (!room) throw new Error('Room not found')
  if (room.endedAt) throw new Error('This room has ended and can no longer be joined')

  const { member, evaluation, becameWaiting = false } = await ensureRoomMember({ room, studentId, at })
  // The account entering the room is always a participant in the attendance ledger view, even if
  // it is still waiting, so we do not filter the summary by admission here.
  let attendance = null
  try {
    attendance = await getStudentAttendanceSummary(studentId)
  } catch (e) {
    attendance = null
  }

  return {
    room,
    member,
    admitted: evaluation.admitted,
    waitingRoom: evaluation.waitingRoom,
    watchOnly: evaluation.watchOnly,
    admissionStatus: evaluation.state,
    attendanceStatus: evaluation.attendanceStatus,
    lateMinutes: evaluation.lateMinutes,
    waitingRoomEnabled: evaluation.enabled,
    policy: evaluation.policy,
    notification: evaluation.notification,
    attendance,
    // True only when this join moved the student INTO the waiting room (drives the teacher chime).
    becameWaiting
  }
}

// Current waiting-room state for a student (used by polling/refresh and the socket layer).
export const getJoinState = async (room, studentId, { at = new Date() } = {}) => {
  const member = await RoomMember.findOne({ roomId: room._id, studentId })
  return evaluateJoin({ room, member, at })
}

export const getRoomsByTeacher = async (teacherId, options = {}) => {
  const { skip = 0, limit = 100 } = options
  const rooms = await Room.find({ teacher: teacherId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    
  // Get question counts for each room
  const roomIds = rooms.map(r => r._id)
  const questionCounts = await Question.aggregate([
    { $match: { roomId: { $in: roomIds }, status: 'approved' } },
    { $group: { _id: '$roomId', count: { $sum: 1 } } }
  ])
  
  const countMap = new Map(questionCounts.map(q => [q._id.toString(), q.count]))
  
  // Attach questionCount to each room
  return rooms.map(room => ({
    ...room.toObject(),
    questionCount: countMap.get(room._id.toString()) || 0
  }))
}

export const updateRoom = async (roomId, updates) => {
  const room = await Room.findByIdAndUpdate(
    roomId,
    { $set: updates },
    { new: true, runValidators: true }
  )

  if (!room) {
    throw new Error('Room not found')
  }

  // If this update ends the room, drop the room-live cache so POST /responses re-reads Mongo, sees
  // endedAt, and refuses further submits (Phase 3). This is the real end path (PUT /rooms/:id with
  // isActive:false / endedAt). Non-fatal if Redis is unavailable.
  if (updates && (updates.isActive === false || updates.endedAt)) {
    await invalidateRoomLive(roomId)
  }

  return room
}

export const deleteRoom = async (roomId) => {
  const room = await Room.findByIdAndDelete(roomId)
  if (!room) {
    throw new Error('Room not found')
  }
  // Cascade-delete everything tied to this room so no orphaned records are left behind.
  // Orphans (e.g. a Response whose room is gone) otherwise break student room-history and
  // skew per-room queries. The room doc is removed first (fail-fast on not-found); if a
  // cascade delete were to partially fail, the null-guards in the read paths still cope.
  const [responses, members, questions, transcripts] = await Promise.all([
    Response.deleteMany({ roomId }),
    RoomMember.deleteMany({ roomId }),
    Question.deleteMany({ roomId }),
    Transcript.deleteMany({ roomId })
  ])
  console.log(
    `[rooms] deleted room ${roomId} + cascade: ` +
    `${responses.deletedCount} responses, ${members.deletedCount} members, ` +
    `${questions.deletedCount} questions, ${transcripts.deletedCount} transcripts`
  )
  return room
}

export const setCurrentQuestion = async (roomId, questionId) => {
  const room = await Room.findByIdAndUpdate(
    roomId,
    { $set: { currentQuestion: questionId } },
    { new: true }
  )
  
  if (!room) {
    throw new Error('Room not found')
  }
  
  return room
}

export const deactivateRoom = async (roomId) => {
  const room = await Room.findByIdAndUpdate(
    roomId,
    { $set: { isActive: false, endedAt: new Date() } },
    { new: true, runValidators: true }
  )

  if (!room) {
    throw new Error('Room not found')
  }

  // Drop the room-live cache so POST /responses re-reads Mongo and sees endedAt → refuses further
  // submits (Phase 3 response-window). Non-fatal if Redis is unavailable.
  await invalidateRoomLive(roomId)

  return room
}

export const getRoomsByStudent = async (studentId) => {
  // Get rooms from RoomMember (where student joined)
  const memberships = await RoomMember.find({ studentId }).populate('roomId')
  const memberRooms = memberships.filter(m => m.roomId).map(m => m.roomId)
  
  // Also get rooms from Response (where student answered) - includes rooms student left.
  // Guard against orphan responses whose room was deleted (roomId populates to null) —
  // otherwise a single orphan throws and the student's whole room history 500s.
  const responseRooms = await Response.find({ studentId }).populate('roomId')
  const uniqueResponseRoomIds = [...new Set(responseRooms.filter(r => r.roomId).map(r => r.roomId._id.toString()))]
  
  // Get full room objects for Response rooms that aren't in RoomMember
  const responseRoomIds = uniqueResponseRoomIds.filter(id => !memberRooms.some(r => r._id.toString() === id))
  const additionalRooms = responseRoomIds.length > 0 
    ? await Room.find({ _id: { $in: responseRoomIds } })
    : []
  
  // Combine RoomMember rooms + Response-only rooms
  const allRooms = [...memberRooms, ...additionalRooms]
  
  if (allRooms.length === 0) {
    return []
  }
  
  const roomIds = allRooms.map(r => r._id)
  
  const questionCounts = await Question.aggregate([
    { $match: { roomId: { $in: roomIds } } },
    { $group: { _id: '$roomId', count: { $sum: 1 } } }
  ])
  
  const countMap = new Map(questionCounts.map(q => [q._id.toString(), q.count]))
  
  // Attach questionCount to each room and sort by most recent
  return allRooms.map(room => ({
    ...room.toObject(),
    questionCount: countMap.get(room._id.toString()) || 0
  })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export const getActiveRoomsByStudent = async (studentId) => {
  // Find rooms from RoomMember (where student joined) - all rooms student has joined
  const memberships = await RoomMember.find({ studentId }).populate({
    path: 'roomId',
    match: { isActive: true, endedAt: null } // Only active rooms
  })
  
  // Also find rooms from Response (where student answered questions) - for completeness
  const responses = await Response.find({ studentId }).populate({
    path: 'roomId',
    match: { isActive: true, endedAt: null }
  })
  
  // Extract rooms from RoomMember (filtered to active rooms by populate)
  const memberRooms = memberships
    .filter(m => m.roomId)
    .map(m => m.roomId)
  
  // Extract rooms from Response (filtered to active rooms by populate)
  const responseRooms = responses
    .filter(r => r.roomId)
    .map(r => r.roomId)
  
  // Combine and deduplicate by roomId
  const roomMap = new Map()
  memberRooms.forEach(room => roomMap.set(room._id.toString(), room))
  responseRooms.forEach(room => roomMap.set(room._id.toString(), room))
  
  const rooms = Array.from(roomMap.values())
  
  // Get question counts for each room (only approved questions)
  const roomIds = rooms.map(r => r._id)
  
  if (roomIds.length === 0) {
    return []
  }
  
  const questionCounts = await Question.aggregate([
    { $match: { roomId: { $in: roomIds }, status: 'approved' } },
    { $group: { _id: '$roomId', count: { $sum: 1 } } }
  ])
  
  const countMap = new Map(questionCounts.map(q => [q._id.toString(), q.count]))
  
  // Attach questionCount to each room and sort by most recent (from joinedAt if available)
  return rooms.map(room => ({
    ...room.toObject(),
    questionCount: countMap.get(room._id.toString()) || 0
  })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}