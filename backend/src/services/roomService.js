import Room from '../models/Room.js'
import Question from '../models/Question.js'
import RoomMember from '../models/RoomMember.js'
import Response from '../models/Response.js'

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
  const room = await Room.findById(id).populate('teacher', 'name email')
  if (!room) {
    throw new Error('Room not found')
  }
  return room
}

export const getRoomByCode = async (code) => {
  const room = await Room.findOne({ code: code.toUpperCase() }).populate('teacher', 'name email')
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
  
  return room
}

export const deleteRoom = async (roomId) => {
  const room = await Room.findByIdAndDelete(roomId)
  if (!room) {
    throw new Error('Room not found')
  }
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
  
  return room
}

export const getRoomsByStudent = async (studentId) => {
  // Get rooms from RoomMember (where student joined)
  const memberships = await RoomMember.find({ studentId }).populate('roomId')
  const memberRooms = memberships.filter(m => m.roomId).map(m => m.roomId)
  
  // Also get rooms from Response (where student answered) - includes rooms student left
  const responseRooms = await Response.find({ studentId }).populate('roomId')
  // Filter out null roomId (deleted rooms) to prevent crash
  const validResponseRooms = responseRooms.filter(r => r.roomId)
  const uniqueResponseRoomIds = [...new Set(validResponseRooms.map(r => r.roomId._id.toString()))]
  
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