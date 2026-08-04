import Room from '../models/Room.js'
import Question from '../models/Question.js'
import RoomMember from '../models/RoomMember.js'
import Response from '../models/Response.js'
import Transcript from '../models/Transcript.js'
import { invalidateRoomLive } from './roomLiveCache.js'

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

// ─── Co-host helpers ──────────────────────────────────────────────────────────

/**
 * Returns true if userId is the room owner OR is an active (non-expired) co-host.
 * Pure in-memory check — no DB call; caller must have already loaded the room.
 * Handles both the old ObjectId style and the new {user, expiresAt} subdoc style.
 */
export const isRoomHost = (room, userId) => {
  const uid = userId.toString()
  const teacherId = room.teacher?._id ? room.teacher._id.toString() : room.teacher.toString()
  if (teacherId === uid) return true
  const now = new Date()
  return (room.coHosts || []).some(ch => {
    // Support both old flat ObjectId entries and new {user, expiresAt} subdocs
    const chUserId = (ch && typeof ch === 'object' && ch.user)
      ? (ch.user._id || ch.user).toString()
      : ch.toString()
    if (chUserId !== uid) return false
    // Old-style entries have no expiresAt field — treat as not expired
    if (ch.expiresAt === undefined) return true
    // null expiresAt = no expiry (valid until session ends)
    return !ch.expiresAt || ch.expiresAt > now
  })
}

const CO_HOST_MAX = 3

/**
 * Returns rooms where userId is an active (non-expired) co-host.
 * Includes a questionCount field matching getRoomsByTeacher's shape.
 */
export const getRoomsByCoHost = async (userId, options = {}) => {
  const { skip = 0, limit = 100 } = options
  const now = new Date()
  const rooms = await Room.find({ 'coHosts.user': userId })
    .populate('teacher', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)

  // Filter to only rooms where the user's co-host entry hasn't expired
  const activeRooms = rooms.filter(room => {
    const uid = userId.toString()
    const entry = (room.coHosts || []).find(ch => {
      const chId = (ch.user?._id || ch.user).toString()
      return chId === uid
    })
    if (!entry) return false
    return !entry.expiresAt || entry.expiresAt > now
  })

  const roomIds = activeRooms.map(r => r._id)
  const questionCounts = roomIds.length
    ? await Question.aggregate([
        { $match: { roomId: { $in: roomIds }, status: 'approved' } },
        { $group: { _id: '$roomId', count: { $sum: 1 } } }
      ])
    : []
  const countMap = new Map(questionCounts.map(q => [q._id.toString(), q.count]))

  return activeRooms.map(room => ({
    ...room.toObject(),
    questionCount: countMap.get(room._id.toString()) || 0,
    isCoHost: true
  }))
}

/**
 * Returns populated co-host user objects for a room.
 */
export const getCoHosts = async (roomId) => {
  const room = await Room.findById(roomId).populate('coHosts.user', 'name email')
  if (!room) throw new Error('Room not found')
  return (room.coHosts || []).map(ch => ({
    _id: ch.user?._id || ch.user,
    name: ch.user?.name,
    email: ch.user?.email,
    expiresAt: ch.expiresAt
  }))
}

/**
 * Adds a co-host by email. Owner-only. Enforces max CO_HOST_MAX.
 */
export const addCoHost = async (roomId, ownerId, email) => {
  const User = (await import('../models/User.js')).default
  const room = await Room.findById(roomId)
  if (!room) throw new Error('Room not found')
  if (room.teacher.toString() !== ownerId.toString()) {
    throw new Error('Only the room owner can add co-hosts')
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() })
  if (!user) throw new Error('No user found with that email')
  if (user.role !== 'teacher') throw new Error('Co-hosts must have a teacher account')
  if (user._id.toString() === ownerId.toString()) {
    throw new Error('The room owner cannot be added as a co-host')
  }

  const alreadyCoHost = (room.coHosts || []).some(ch => {
    const chId = (ch.user?._id || ch.user || ch).toString()
    return chId === user._id.toString()
  })
  if (alreadyCoHost) throw new Error('This user is already a co-host of this room')
  if ((room.coHosts || []).length >= CO_HOST_MAX) {
    throw new Error(`Maximum of ${CO_HOST_MAX} co-hosts allowed per room`)
  }

  room.coHosts.push({ user: user._id, expiresAt: null })
  await room.save()
  return { _id: user._id, name: user.name, email: user.email }
}

/**
 * Removes a co-host by userId. Owner-only.
 */
export const removeCoHost = async (roomId, ownerId, coHostUserId) => {
  const room = await Room.findById(roomId)
  if (!room) throw new Error('Room not found')
  if (room.teacher.toString() !== ownerId.toString()) {
    throw new Error('Only the room owner can remove co-hosts')
  }

  const before = (room.coHosts || []).length
  room.coHosts = (room.coHosts || []).filter(ch => {
    const chId = (ch.user?._id || ch.user || ch).toString()
    return chId !== coHostUserId.toString()
  })
  if (room.coHosts.length === before) throw new Error('User is not a co-host of this room')

  await room.save()
}

// ─── Invite-code co-host flow ──────────────────────────────────────────────
// Generates (or refreshes) a random 8-char uppercase invite code on the room.
// Any teacher who submits this code within the TTL is added as a co-host.
// Multi-use: one code serves multiple teachers until it expires or is regenerated.

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
  return code
}

export const generateCoHostInvite = async (roomId, ownerId, coHostDuration = null) => {
  const room = await Room.findById(roomId)
  if (!room) throw new Error('Room not found')
  if (room.teacher.toString() !== ownerId.toString()) {
    throw new Error('Only the room owner can generate a co-host invite')
  }
  const code = generateInviteCode()
  // Code itself is valid for 24h (gives teachers time to enter it).
  // coHostDuration controls how long the co-host RELATIONSHIP lasts once redeemed.
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  room.coHostInvite = { code, expiresAt, coHostDuration }
  await room.save()
  return { code, expiresAt, coHostDuration }
}

export const joinAsCoHost = async (code, teacherId) => {
  const now = new Date()
  const room = await Room.findOne({
    'coHostInvite.code': code.toUpperCase().trim(),
    'coHostInvite.expiresAt': { $gt: now }
  }).populate('teacher', 'name')
  if (!room) throw new Error('Invalid or expired co-host code')

  if (room.teacher._id.toString() === teacherId.toString()) {
    throw new Error('You are already the owner of this room')
  }

  // Idempotent: if already a co-host, just return room info so they can navigate in
  const alreadyCoHost = (room.coHosts || []).some(ch => {
    const chId = (ch.user?._id || ch.user || ch).toString()
    return chId === teacherId.toString()
  })
  if (!alreadyCoHost) {
    // Calculate personal expiry from the invite's coHostDuration (null = until session ends)
    const duration = room.coHostInvite?.coHostDuration
    const expiresAt = duration ? new Date(Date.now() + duration) : null
    room.coHosts.push({ user: teacherId, expiresAt })
    await room.save()
  }
  return { room: { _id: room._id, name: room.name, code: room.code } }
}