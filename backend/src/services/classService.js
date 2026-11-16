import Class from '../models/Class.js'
import ClassMember from '../models/ClassMember.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'
import { createRoom } from './roomService.js'

export const createClass = async ({ name, teacherId, settings = {} }) => {
  if (!name || !name.trim()) {
    throw new Error('Class name is required')
  }

  const newClass = new Class({
    name: name.trim(),
    teacher: teacherId,
    settings
  })

  await newClass.save()
  return newClass
}

export const getTeacherClasses = async (teacherId) => {
  const classes = await Class.find({ teacher: teacherId }).sort({ createdAt: -1 }).lean()

  const classIds = classes.map(c => c._id)

  // Find all rooms under these classes
  const rooms = await Room.find({ classId: { $in: classIds } })
    .select('_id classId name code isActive endedAt createdAt')
    .sort({ createdAt: -1 })
    .lean()

  // Find all members under these classes
  const members = await ClassMember.find({ classId: { $in: classIds } })
    .select('classId status')
    .lean()

  // Group rooms and members by classId
  const roomsByClass = new Map()
  for (const r of rooms) {
    const key = String(r.classId)
    if (!roomsByClass.has(key)) roomsByClass.set(key, [])
    roomsByClass.get(key).push(r)
  }

  const membersByClass = new Map()
  for (const m of members) {
    const key = String(m.classId)
    if (!membersByClass.has(key)) membersByClass.set(key, { active: 0, pending: 0, removed: 0 })
    const counts = membersByClass.get(key)
    if (m.status === 'active') counts.active++
    else if (m.status === 'pending') counts.pending++
    else if (m.status === 'removed') counts.removed++
  }

  return classes.map(c => {
    const cRooms = roomsByClass.get(String(c._id)) || []
    const mCounts = membersByClass.get(String(c._id)) || { active: 0, pending: 0, removed: 0 }
    const activeSession = cRooms.find(r => r.isActive && !r.endedAt) || null

    return {
      ...c,
      isActive: c.isActive !== false,
      totalSessions: cRooms.length,
      activeSession: activeSession ? { _id: activeSession._id, name: activeSession.name, code: activeSession.code } : null,
      totalMembers: mCounts.active,
      pendingRequests: mCounts.pending
    }
  })
}

export const getStudentClasses = async (studentId) => {
  const memberships = await ClassMember.find({
    studentId,
    status: { $in: ['active', 'pending'] }
  })
    .populate({
      path: 'classId',
      populate: { path: 'teacher', select: 'name email profileImage' }
    })
    .sort({ updatedAt: -1 })
    .lean()

  // Filter out any where classId is null (e.g. deleted class)
  const validMemberships = memberships.filter(m => m.classId)
  const classIds = validMemberships.map(m => m.classId._id)

  // Find active sessions for these classes
  const activeRooms = await Room.find({
    classId: { $in: classIds },
    isActive: true,
    endedAt: null
  }).select('_id classId name code createdAt').lean()

  const activeByClass = new Map(activeRooms.map(r => [String(r.classId), r]))

  // Total session counts
  const sessionCounts = await Room.aggregate([
    { $match: { classId: { $in: classIds } } },
    { $group: { _id: '$classId', count: { $sum: 1 } } }
  ])
  const sessionCountMap = new Map(sessionCounts.map(s => [String(s._id), s.count]))

  return validMemberships.map(m => {
    const cls = m.classId
    const activeSession = activeByClass.get(String(cls._id)) || null
    return {
      _id: cls._id,
      name: cls.name,
      code: cls.code,
      teacher: cls.teacher,
      isActive: cls.isActive,
      memberStatus: m.status,
      joinedAt: m.joinedAt,
      totalSessions: sessionCountMap.get(String(cls._id)) || 0,
      activeSession: activeSession ? { _id: activeSession._id, name: activeSession.name, code: activeSession.code } : null
    }
  })
}

export const getClassById = async (classId, user) => {
  const cls = await Class.findById(classId)
    .populate('teacher', 'name email profileImage')
    .lean()

  if (!cls) {
    const err = new Error('Class not found')
    err.status = 404
    throw err
  }

  const isTeacherOwner = String(cls.teacher._id || cls.teacher) === String(user._id)
  let userMembership = null

  if (!isTeacherOwner) {
    userMembership = await ClassMember.findOne({ classId, studentId: user._id }).lean()
    if (!userMembership || userMembership.status === 'removed') {
      const err = new Error('Access denied to this class')
      err.status = 403
      throw err
    }
  }

  // Active session for this class
  const activeSession = await Room.findOne({
    classId,
    isActive: true,
    endedAt: null
  }).select('_id name code createdAt settings').lean()

  // Global active session for the teacher across ANY class
  const teacherActiveSession = isTeacherOwner ? await Room.findOne({
    teacher: user._id,
    classId: { $ne: null },
    isActive: true,
    endedAt: null
  }).select('_id classId name code createdAt settings').lean() : null

  // Counts
  const totalSessions = await Room.countDocuments({ classId })
  const memberCounts = await ClassMember.aggregate([
    { $match: { classId: cls._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ])
  const countMap = { active: 0, pending: 0, removed: 0 }
  for (const mc of memberCounts) {
    if (countMap[mc._id] !== undefined) countMap[mc._id] = mc.count
  }

  return {
    class: cls,
    isOwner: isTeacherOwner,
    userMembership,
    activeSession: activeSession ? {
      _id: activeSession._id,
      name: activeSession.name,
      code: activeSession.code,
      createdAt: activeSession.createdAt,
      settings: activeSession.settings
    } : null,
    hasAnyLiveClassSession: !!teacherActiveSession,
    teacherActiveSession: teacherActiveSession ? {
      _id: teacherActiveSession._id,
      classId: teacherActiveSession.classId,
      name: teacherActiveSession.name,
      code: teacherActiveSession.code,
      createdAt: teacherActiveSession.createdAt,
      settings: teacherActiveSession.settings
    } : null,
    stats: {
      totalSessions,
      totalMembers: countMap.active,
      pendingRequests: countMap.pending,
      removedMembers: countMap.removed
    }
  }
}

export const joinClassByCode = async (code, studentId) => {
  if (!code || !code.trim()) {
    const err = new Error('Class code is required')
    err.status = 400
    throw err
  }

  const cls = await Class.findByCode(code)
  if (!cls) {
    const err = new Error('Class not found. Please verify the 6-character code.')
    err.status = 404
    throw err
  }

  if (!cls.isActive) {
    const err = new Error('This class is no longer active')
    err.status = 400
    throw err
  }

  // Check existing membership
  let member = await ClassMember.findOne({ classId: cls._id, studentId })

  if (!member) {
    // First time join -> status is active immediately
    member = new ClassMember({
      classId: cls._id,
      studentId,
      status: 'active',
      joinedAt: new Date()
    })
    await member.save()
    return {
      class: cls,
      member,
      status: 'active',
      message: 'Enrolled in class successfully'
    }
  }

  if (member.status === 'active') {
    return {
      class: cls,
      member,
      status: 'active',
      message: 'You are already enrolled in this class'
    }
  }

  if (member.status === 'pending') {
    return {
      class: cls,
      member,
      status: 'pending',
      message: 'Your re-join request is pending approval from the teacher'
    }
  }

  if (member.status === 'removed' || member.status === 'declined' || member.status === 'invited') {
    // Code join on declined | invited | removed -> status pending for teacher approval
    // Same document is preserved!
    member.previousStatus = member.status
    member.status = 'pending'
    await member.save()
    return {
      class: cls,
      member,
      status: 'pending',
      message: 'Join request submitted. Waiting for teacher approval.'
    }
  }

  return { class: cls, member, status: member.status }
}

export const updateMemberStatus = async (classId, studentId, teacherId, action) => {
  const cls = await Class.findById(classId)
  if (!cls) {
    const err = new Error('Class not found')
    err.status = 404
    throw err
  }

  if (String(cls.teacher) !== String(teacherId)) {
    const err = new Error('Only the class teacher can modify membership')
    err.status = 403
    throw err
  }

  const member = await ClassMember.findOne({ classId, studentId })
  if (!member) {
    const err = new Error('Member not found in class')
    err.status = 404
    throw err
  }

  if (action === 'approve') {
    member.status = 'active'
    member.approvedAt = new Date()
    member.joinedAt = member.joinedAt || new Date()
    member.previousStatus = null
    await member.save()
    await Notification.updateMany(
      { userId: studentId, classId, status: 'pending' },
      { status: 'accepted', readAt: new Date() }
    )
    return { member, message: 'Member approved and restored to active' }
  } else if (action === 'remove') {
    // Soft remove: all historical data kept, status set to removed
    member.previousStatus = member.status
    member.status = 'removed'
    member.removedAt = new Date()
    await member.save()
    return { member, message: 'Member removed from class' }
  } else if (action === 'reject') {
    // Teacher rejects re-join request: restore to declined or removed as appropriate
    const targetStatus = (member.previousStatus === 'declined' || member.previousStatus === 'invited')
      ? 'declined'
      : 'removed'
    member.status = targetStatus
    if (targetStatus === 'removed') {
      member.removedAt = member.removedAt || new Date()
    } else {
      member.declinedAt = member.declinedAt || new Date()
    }
    await member.save()
    return { member, message: 'Join request rejected' }
  } else {
    const err = new Error('Invalid action. Expected approve, remove, or reject.')
    err.status = 400
    throw err
  }
}

export const archiveClass = async (classId, teacherId) => {
  const cls = await Class.findById(classId)
  if (!cls) {
    const err = new Error('Class not found')
    err.status = 404
    throw err
  }
  if (String(cls.teacher) !== String(teacherId)) {
    const err = new Error('Only the class teacher can archive this class')
    err.status = 403
    throw err
  }
  cls.isActive = false
  await cls.save()
  return cls
}

export const restoreClass = async (classId, teacherId) => {
  const cls = await Class.findById(classId)
  if (!cls) {
    const err = new Error('Class not found')
    err.status = 404
    throw err
  }
  if (String(cls.teacher) !== String(teacherId)) {
    const err = new Error('Only the class teacher can restore this class')
    err.status = 403
    throw err
  }
  cls.isActive = true
  await cls.save()
  return cls
}

export const createClassSession = async (classId, teacherId, { name, settings = {} }) => {
  const cls = await Class.findById(classId)
  if (!cls) {
    const err = new Error('Class not found')
    err.status = 404
    throw err
  }

  if (String(cls.teacher) !== String(teacherId)) {
    const err = new Error('Only the class teacher can start a session')
    err.status = 403
    throw err
  }

  if (cls.isActive === false) {
    const err = new Error('This class is archived. Restore it to start new sessions.')
    err.status = 400
    throw err
  }

  // Mentor rule: while the teacher has ANY live class session, they cannot start another session in ANY class.
  const activeSession = await Room.findOne({
    teacher: teacherId,
    classId: { $ne: null },
    isActive: true,
    endedAt: null
  })

  if (activeSession) {
    const err = new Error('You already have a live class session. End it before starting a new one in any class.')
    err.status = 400
    err.code = 'ACTIVE_SESSION_EXISTS'
    err.activeRoomId = activeSession._id
    throw err
  }

  // Inherit class settings as defaults if not overridden
  const mergedSettings = {
    ...(cls.settings || {}),
    ...settings
  }

  const sessionName = (name && name.trim()) ? name.trim() : `${cls.name} - Session`
  const room = await createRoom(sessionName, teacherId, mergedSettings, classId)
  return room
}

export const getClassSessions = async (classId) => {
  const rooms = await Room.find({ classId })
    .sort({ createdAt: -1 })
    .lean()

  const roomIds = rooms.map(r => r._id)

  const [questionCounts, responseCounts, participantCounts] = await Promise.all([
    Question.aggregate([
      { $match: { roomId: { $in: roomIds } } },
      { $group: { _id: '$roomId', count: { $sum: 1 } } }
    ]),
    Response.aggregate([
      { $match: { roomId: { $in: roomIds } } },
      { $group: { _id: '$roomId', count: { $sum: 1 } } }
    ]),
    RoomMember.aggregate([
      { $match: { roomId: { $in: roomIds } } },
      { $group: { _id: '$roomId', count: { $sum: 1 } } }
    ])
  ])

  const qMap = new Map(questionCounts.map(q => [String(q._id), q.count]))
  const rMap = new Map(responseCounts.map(r => [String(r._id), r.count]))
  const pMap = new Map(participantCounts.map(p => [String(p._id), p.count]))

  return rooms.map(room => ({
    ...room,
    questionCount: qMap.get(String(room._id)) || 0,
    responseCount: rMap.get(String(room._id)) || 0,
    participantCount: pMap.get(String(room._id)) || 0
  }))
}

export const isSessionBeforeJoin = (room, joinedAt) => {
  if (!joinedAt || !room) return false
  const joinedTime = new Date(joinedAt).getTime()
  const roomCreatedTime = new Date(room.createdAt).getTime()
  if (isNaN(joinedTime) || isNaN(roomCreatedTime)) return false
  return roomCreatedTime < joinedTime
}

export const getFirstTimelineDate = (member) => {
  if (!member) return 0
  const times = []
  if (member.invitedAt) {
    const t = new Date(member.invitedAt).getTime()
    if (!isNaN(t)) times.push(t)
  }
  if (member.joinedAt) {
    const t = new Date(member.joinedAt).getTime()
    if (!isNaN(t)) times.push(t)
  }
  if (member.createdAt) {
    const t = new Date(member.createdAt).getTime()
    if (!isNaN(t)) times.push(t)
  }
  return times.length > 0 ? Math.min(...times) : 0
}

export const getSessionMembershipCoverage = (room, member) => {
  if (!room || !member) return 'active_eligible'

  const roomCreatedTime = new Date(room.createdAt).getTime()
  if (isNaN(roomCreatedTime)) return 'active_eligible'

  const firstTime = getFirstTimelineDate(member)

  // 1. before_join: room was created strictly before the student's first enrollment or invite
  if (firstTime && roomCreatedTime < firstTime) {
    return 'before_join'
  }

  // 2. during_removal:
  // If member.removedAt is set AND room.createdAt >= member.removedAt
  if (member.removedAt) {
    const removedTime = new Date(member.removedAt).getTime()
    if (!isNaN(removedTime) && roomCreatedTime >= removedTime) {
      const approvedTime = member.approvedAt ? new Date(member.approvedAt).getTime() : 0
      const isReactivated = member.status === 'active' && approvedTime > removedTime

      if (!isReactivated) {
        return 'during_removal'
      } else if (roomCreatedTime < approvedTime) {
        return 'during_removal'
      }
    }
  }

  // 3. during_declined:
  if (member.status === 'declined' || member.declinedAt) {
    const declinedTime = member.declinedAt
      ? new Date(member.declinedAt).getTime()
      : (member.invitedAt ? new Date(member.invitedAt).getTime() : 0)
    if (declinedTime && roomCreatedTime >= declinedTime) {
      const approvedTime = member.approvedAt ? new Date(member.approvedAt).getTime() : 0
      const isReactivated = member.status === 'active' && approvedTime > declinedTime
      if (!isReactivated || roomCreatedTime < approvedTime) {
        return 'during_declined'
      }
    }
  }

  // 4. during_invited:
  if (member.status === 'invited') {
    return 'during_invited'
  }

  return 'active_eligible'
}

export const getClassMembersWithPerformance = async (classId, teacherId) => {
  const cls = await Class.findById(classId)
  if (!cls) {
    const err = new Error('Class not found')
    err.status = 404
    throw err
  }

  if (String(cls.teacher) !== String(teacherId)) {
    const err = new Error('Access denied')
    err.status = 403
    throw err
  }

  const members = await ClassMember.find({ classId })
    .populate('studentId', 'name email profileImage')
    .sort({ createdAt: -1 })
    .lean()

  // All rooms under this class
  const classRooms = await Room.find({ classId })
    .select('_id name code createdAt endedAt isActive')
    .lean()
  const roomIds = classRooms.map(r => r._id)
  const totalClassSessions = classRooms.length

  // Room members, responses, and questions for these rooms
  const [roomMembers, responses, allQuestions] = await Promise.all([
    RoomMember.find({ roomId: { $in: roomIds } })
      .select('roomId studentId joinedAt')
      .lean(),
    Response.find({ roomId: { $in: roomIds } })
      .select('roomId studentId isCorrect pointsEarned createdAt')
      .lean(),
    Question.find({ roomId: { $in: roomIds }, status: 'approved' })
      .select('_id roomId')
      .lean()
  ])

  const questionsByRoom = new Map()
  for (const q of allQuestions) {
    const rid = String(q.roomId)
    questionsByRoom.set(rid, (questionsByRoom.get(rid) || 0) + 1)
  }

  // Build lookups per student
  const studentAttendedRooms = new Map() // sid -> Set of roomIds
  const studentResponses = new Map()     // sid -> array of responses

  for (const rm of roomMembers) {
    const sid = String(rm.studentId)
    if (!studentAttendedRooms.has(sid)) studentAttendedRooms.set(sid, new Set())
    studentAttendedRooms.get(sid).add(String(rm.roomId))
  }

  for (const resp of responses) {
    const sid = String(resp.studentId)
    if (!studentAttendedRooms.has(sid)) studentAttendedRooms.set(sid, new Set())
    studentAttendedRooms.get(sid).add(String(resp.roomId))

    if (!studentResponses.has(sid)) studentResponses.set(sid, [])
    studentResponses.get(sid).push(resp)
  }

  const enrichMember = (m) => {
    const student = m.studentId || {}
    const sid = String(student._id || m.studentId)
    const attendedSet = studentAttendedRooms.get(sid) || new Set()
    const studentResps = studentResponses.get(sid) || []

    // Sessions possible: once under class (invited or joined), all sessions are possible!
    // Only sessions strictly before first enrollment/invite are excluded (unless attended).
    const firstTime = getFirstTimelineDate(m)
    const possibleRooms = classRooms.filter(r => {
      const roomCreatedTime = new Date(r.createdAt).getTime()
      const isBefore = firstTime && roomCreatedTime < firstTime
      return !isBefore || attendedSet.has(String(r._id))
    })

    const sessionsPossible = possibleRooms.length
    const sessionsAttended = possibleRooms.filter(r => attendedSet.has(String(r._id))).length
    const attendanceRate = sessionsPossible > 0 ? Math.round((sessionsAttended / sessionsPossible) * 100) : 0

    // Polls launched and missed across attended eligible sessions
    const attendedEligibleRooms = possibleRooms.filter(r => attendedSet.has(String(r._id)))
    let pollsLaunched = 0
    let pollsMissed = 0
    let pollsAttempted = 0
    let correctCount = 0

    for (const r of attendedEligibleRooms) {
      const totalQ = questionsByRoom.get(String(r._id)) || 0
      pollsLaunched += totalQ
      const respsInRoom = studentResps.filter(resp => String(resp.roomId) === String(r._id))
      pollsAttempted += respsInRoom.length
      correctCount += respsInRoom.filter(resp => resp.isCorrect).length
      pollsMissed += Math.max(0, totalQ - respsInRoom.length)
    }

    const accuracy = pollsAttempted > 0 ? Math.round((correctCount / pollsAttempted) * 100) : 0

    let lastActive = m.joinedAt
    for (const r of studentResps) {
      if (r.createdAt && (!lastActive || new Date(r.createdAt) > new Date(lastActive))) {
        lastActive = r.createdAt
      }
    }

    return {
      _id: m._id,
      studentId: sid,
      name: student.name || 'Student',
      email: student.email || '',
      profileImage: student.profileImage || null,
      status: m.status,
      previousStatus: m.previousStatus || (m.removedAt ? 'removed' : null),
      joinedAt: m.joinedAt,
      invitedAt: m.invitedAt,
      declinedAt: m.declinedAt,
      removedAt: m.removedAt,
      approvedAt: m.approvedAt,
      sessionsAttended,
      sessionsPossible,
      totalClassSessions,
      attendanceRate,
      pollsAttempted,
      pollsLaunched,
      pollsMissed,
      correctCount,
      accuracy,
      lastActive
    }
  }

  const enriched = members.map(enrichMember)
  const activeMembers = enriched.filter(m => m.status === 'active')
  const avgAttendance = activeMembers.length > 0
    ? Math.round(activeMembers.reduce((sum, m) => sum + (m.attendanceRate || 0), 0) / activeMembers.length)
    : 0

  return {
    active: activeMembers,
    invited: enriched.filter(m => m.status === 'invited'),
    pending: enriched.filter(m => m.status === 'pending'),
    declined: enriched.filter(m => m.status === 'declined'),
    removed: enriched.filter(m => m.status === 'removed'),
    totalClassSessions,
    avgAttendance
  }
}

export const getStudentPerformanceInClass = async (classId, studentId) => {
  const [cls, member] = await Promise.all([
    Class.findById(classId).populate('teacher', 'name email').lean(),
    ClassMember.findOne({ classId, studentId }).lean()
  ])

  if (!cls) {
    const err = new Error('Class not found')
    err.status = 404
    throw err
  }

  const student = await User.findById(studentId).select('name email profileImage').lean()
  const classRooms = await Room.find({ classId }).sort({ createdAt: -1 }).lean()
  const roomIds = classRooms.map(r => r._id)

  const [roomMembers, responses, allQuestions] = await Promise.all([
    RoomMember.find({ roomId: { $in: roomIds }, studentId }).lean(),
    Response.find({ roomId: { $in: roomIds }, studentId }).lean(),
    Question.find({ roomId: { $in: roomIds }, status: 'approved' }).lean()
  ])

  const attendedRoomIds = new Set(roomMembers.map(rm => String(rm.roomId)))
  responses.forEach(r => attendedRoomIds.add(String(r.roomId)))

  const questionsByRoom = new Map()
  for (const q of allQuestions) {
    const key = String(q.roomId)
    if (!questionsByRoom.has(key)) questionsByRoom.set(key, 0)
    questionsByRoom.set(key, questionsByRoom.get(key) + 1)
  }

  const responsesByRoom = new Map()
  for (const r of responses) {
    const key = String(r.roomId)
    if (!responsesByRoom.has(key)) responsesByRoom.set(key, [])
    responsesByRoom.get(key).push(r)
  }

  const joinedAt = member?.joinedAt || member?.createdAt

  // Session-by-session breakdown
  const sessionBreakdown = classRooms.map(room => {
    const rid = String(room._id)
    const attended = attendedRoomIds.has(rid)
    const roomResps = responsesByRoom.get(rid) || []
    const totalQ = questionsByRoom.get(rid) || 0
    const attempted = roomResps.length
    const correct = roomResps.filter(r => r.isCorrect).length
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0

    const coverage = getSessionMembershipCoverage(room, member || { joinedAt })
    let status = 'missed'
    let subLabel = null
    let missReason = null

    if (attended) {
      status = 'attended'
    } else if (coverage === 'before_join') {
      status = 'before_join'
    } else {
      status = 'missed'
      if (coverage === 'during_removal') {
        subLabel = 'Removed from class'
        missReason = 'removed'
      } else if (coverage === 'during_declined') {
        subLabel = 'Declined invite'
        missReason = 'declined'
      } else if (coverage === 'during_invited') {
        subLabel = 'Invited (not accepted)'
        missReason = 'invited'
      }
    }

    const pollsMissed = attended ? Math.max(0, totalQ - attempted) : 0

    return {
      roomId: room._id,
      roomName: room.name,
      roomCode: room.code,
      date: room.createdAt,
      endedAt: room.endedAt,
      isActive: room.isActive,
      status, // 'attended' | 'missed' | 'before_join'
      coverage, // 'active_eligible' | 'before_join' | 'during_removal' | 'during_declined' | 'during_invited'
      subLabel,
      missReason,
      attended,
      isBeforeJoin: status === 'before_join',
      isDuringRemoval: coverage === 'during_removal',
      isDuringDeclined: coverage === 'during_declined',
      totalQuestions: totalQ,
      pollsAttempted: attempted,
      pollsMissed,
      correctCount: correct,
      accuracy
    }
  })

  // Ensure sessions are strictly sorted by createdAt descending
  sessionBreakdown.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Sessions possible: once under class (invited or joined), all sessions are possible!
  // Only sessions strictly before first enrollment/invite are excluded (unless attended).
  const firstTime = getFirstTimelineDate(member || { joinedAt })
  const possibleRooms = classRooms.filter(r => {
    const roomCreatedTime = new Date(r.createdAt).getTime()
    const isBefore = firstTime && roomCreatedTime < firstTime
    return !isBefore || attendedRoomIds.has(String(r._id))
  })

  const sessionsPossible = possibleRooms.length
  const sessionsAttended = possibleRooms.filter(r => attendedRoomIds.has(String(r._id))).length
  const attendanceRate = sessionsPossible > 0 ? Math.round((sessionsAttended / sessionsPossible) * 100) : 0

  // Polls launched, attempted, and missed across attended eligible sessions
  const attendedEligibleRooms = possibleRooms.filter(r => attendedRoomIds.has(String(r._id)))
  let pollsLaunched = 0
  let pollsMissed = 0
  let pollsAttempted = 0
  let correctCount = 0

  for (const r of attendedEligibleRooms) {
    const totalQ = questionsByRoom.get(String(r._id)) || 0
    pollsLaunched += totalQ
    const respsInRoom = responsesByRoom.get(String(r._id)) || []
    pollsAttempted += respsInRoom.length
    correctCount += respsInRoom.filter(resp => resp.isCorrect).length
    pollsMissed += Math.max(0, totalQ - respsInRoom.length)
  }

  const accuracy = pollsAttempted > 0 ? Math.round((correctCount / pollsAttempted) * 100) : 0

  return {
    student: {
      _id: student?._id,
      name: student?.name,
      email: student?.email,
      profileImage: student?.profileImage
    },
    status: member?.status || 'active',
    joinedAt,
    sessionsAttended,
    sessionsPossible,
    totalClassSessions: classRooms.length,
    attendanceRate,
    pollsAttempted,
    pollsLaunched,
    pollsMissed,
    correctCount,
    accuracy,
    sessions: sessionBreakdown
  }
}

export const exportClassCsv = async (classId, teacherId) => {
  const cls = await Class.findById(classId).lean()
  if (!cls) {
    const err = new Error('Class not found')
    err.status = 404
    throw err
  }

  if (String(cls.teacher) !== String(teacherId)) {
    const err = new Error('Access denied')
    err.status = 403
    throw err
  }

  const { active, pending, removed, totalClassSessions } = await getClassMembersWithPerformance(classId, teacherId)
  const allMembers = [...active, ...pending, ...removed]

  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const row = (arr) => arr.map(esc).join(',') + '\n'

  let csv = '\uFEFF' // UTF-8 BOM
  csv += `# Class: ${cls.name} (Code: ${cls.code})\n`
  csv += `# Total Sessions: ${totalClassSessions}\n`
  csv += `# Export Date: ${new Date().toISOString()}\n\n`

  csv += row([
    'Student Name',
    'Email',
    'Status',
    'Sessions Attended',
    'Sessions Possible',
    'Total Class Sessions',
    'Attendance %',
    'Polls Launched',
    'Polls Attempted',
    'Polls Missed',
    'Correct Answers',
    'Accuracy %',
    'Joined Date',
    'Last Active'
  ])

  for (const m of allMembers) {
    csv += row([
      m.name,
      m.email,
      m.status,
      m.sessionsAttended,
      m.sessionsPossible,
      m.totalClassSessions,
      `${m.attendanceRate}%`,
      m.pollsLaunched ?? 0,
      m.pollsAttempted,
      m.pollsMissed ?? 0,
      m.correctCount,
      `${m.accuracy}%`,
      m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '',
      m.lastActive ? new Date(m.lastActive).toLocaleDateString() : ''
    ])
  }

  const safeName = (cls.name || 'class').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 50)
  const filename = `Spandan_Class_${safeName}_${cls.code}_Roster.csv`

  return { csv, filename }
}

export const getClassStats = async (classId, teacherId) => {
  const cls = await Class.findById(classId).lean()
  if (!cls) {
    const err = new Error('Class not found')
    err.status = 404
    throw err
  }

  if (String(cls.teacher) !== String(teacherId)) {
    const err = new Error('Access denied')
    err.status = 403
    throw err
  }

  const rooms = await Room.find({ classId }).select('_id isActive endedAt createdAt').lean()
  const roomIds = rooms.map(r => r._id)

  const [members, totalQuestions, allResponses, roomMembers] = await Promise.all([
    ClassMember.find({ classId }).select('studentId status joinedAt createdAt removedAt approvedAt').lean(),
    Question.countDocuments({ roomId: { $in: roomIds }, status: 'approved' }),
    Response.find({ roomId: { $in: roomIds } }).select('isCorrect studentId roomId').lean(),
    RoomMember.find({ roomId: { $in: roomIds } }).select('roomId studentId').lean()
  ])

  const totalSessions = rooms.length
  const activeSessions = rooms.filter(r => r.isActive && !r.endedAt).length
  const activeMembers = members.filter(m => m.status === 'active')
  const pendingRequests = members.filter(m => m.status === 'pending').length

  const totalResponses = allResponses.length
  const totalCorrect = allResponses.filter(r => r.isCorrect).length
  const averageAccuracy = totalResponses > 0 ? Math.round((totalCorrect / totalResponses) * 100) : 0

  // Calculate fair average attendance across active members
  const attendedMap = new Map() // sid -> Set of roomIds
  for (const rm of roomMembers) {
    const sid = String(rm.studentId)
    if (!attendedMap.has(sid)) attendedMap.set(sid, new Set())
    attendedMap.get(sid).add(String(rm.roomId))
  }
  for (const resp of allResponses) {
    const sid = String(resp.studentId)
    if (!attendedMap.has(sid)) attendedMap.set(sid, new Set())
    attendedMap.get(sid).add(String(resp.roomId))
  }

  let totalAttPct = 0
  for (const m of activeMembers) {
    const sid = String(m.studentId)
    const attendedSet = attendedMap.get(sid) || new Set()
    const firstTime = getFirstTimelineDate(m)
    const possibleRooms = rooms.filter(r => {
      const roomCreatedTime = new Date(r.createdAt).getTime()
      const isBefore = firstTime && roomCreatedTime < firstTime
      return !isBefore || attendedSet.has(String(r._id))
    })
    const possible = possibleRooms.length
    const attended = possibleRooms.filter(r => attendedSet.has(String(r._id))).length
    const rate = possible > 0 ? Math.round((attended / possible) * 100) : 0
    totalAttPct += rate
  }
  const avgAttendance = activeMembers.length > 0 ? Math.round(totalAttPct / activeMembers.length) : 0

  return {
    totalSessions,
    activeSessions,
    totalMembers: activeMembers.length,
    pendingRequests,
    totalQuestions,
    totalResponses,
    averageAccuracy,
    avgAttendance
  }
}

export const inviteStudentToClass = async ({ classId, teacherId, email, name }) => {
  const cls = await Class.findById(classId)
  if (!cls) {
    const err = new Error('Class not found')
    err.status = 404
    throw err
  }

  if (String(cls.teacher) !== String(teacherId)) {
    const err = new Error('Only the class teacher can invite students')
    err.status = 403
    throw err
  }

  if (cls.isActive === false) {
    const err = new Error('This class is archived. Restore it to invite students.')
    err.status = 400
    throw err
  }

  if (!email || typeof email !== 'string' || !email.trim()) {
    return { status: 'invalid', email: email || '', message: 'Email address is required' }
  }

  const normalizedEmail = email.trim().toLowerCase()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(normalizedEmail)) {
    return { status: 'invalid', email: normalizedEmail, message: 'Invalid email address format' }
  }

  const teacher = await User.findById(teacherId).select('name email').lean()
  const student = await User.findOne({ email: normalizedEmail })
  if (!student) {
    return { status: 'not_found', email: normalizedEmail, message: 'No Spandan account found with this email' }
  }

  if (student.role !== 'student') {
    return { status: 'not_student', email: normalizedEmail, message: 'User is registered as an instructor/admin, not a student' }
  }

  let member = await ClassMember.findOne({ classId: cls._id, studentId: student._id })

  if (member) {
    if (member.status === 'active') {
      return { status: 'already_member', email: normalizedEmail, student, member, message: 'Student is already an active member of this class' }
    }

    if (member.status === 'invited') {
      // Refresh pending notification
      await Notification.findOneAndUpdate(
        { userId: student._id, classId: cls._id, status: 'pending' },
        {
          readAt: null,
          fromUserId: teacherId,
          payload: { className: cls.name, classCode: cls.code, teacherName: teacher?.name || 'Instructor' }
        },
        { upsert: true, new: true }
      )
      return { status: 'invited', alreadyInvited: true, email: normalizedEmail, student, member, message: 'Student already has a pending invite' }
    }

    // Re-invite student who was previously removed, pending, or declined
    const wasReinvited = member.status === 'removed' || member.status === 'declined'
    member.status = 'invited'
    member.invitedAt = member.invitedAt || new Date()
    await member.save()

    await Notification.findOneAndUpdate(
      { userId: student._id, classId: cls._id },
      {
        status: 'pending',
        readAt: null,
        fromUserId: teacherId,
        payload: { className: cls.name, classCode: cls.code, teacherName: teacher?.name || 'Instructor' }
      },
      { upsert: true, new: true }
    )

    return {
      status: 'invited',
      reinvited: wasReinvited,
      email: normalizedEmail,
      student,
      member,
      message: wasReinvited ? 'Re-invited student to class' : 'Invited student to class'
    }
  }

  // Brand new member
  member = new ClassMember({
    classId: cls._id,
    studentId: student._id,
    status: 'invited',
    invitedAt: new Date(),
    joinedAt: null
  })
  await member.save()

  await Notification.create({
    userId: student._id,
    type: 'class_invite',
    classId: cls._id,
    fromUserId: teacherId,
    status: 'pending',
    payload: { className: cls.name, classCode: cls.code, teacherName: teacher?.name || 'Instructor' }
  })

  return {
    status: 'invited',
    email: normalizedEmail,
    student,
    member,
    message: 'Invited student to class successfully'
  }
}

export const inviteStudentsFromCsv = async ({ classId, teacherId, rows }) => {
  const cls = await Class.findById(classId)
  if (!cls) {
    const err = new Error('Class not found')
    err.status = 404
    throw err
  }

  if (String(cls.teacher) !== String(teacherId)) {
    const err = new Error('Only the class teacher can invite students')
    err.status = 403
    throw err
  }

  if (cls.isActive === false) {
    const err = new Error('This class is archived. Restore it to invite students.')
    err.status = 400
    throw err
  }

  if (!Array.isArray(rows)) {
    const err = new Error('Invalid CSV rows data')
    err.status = 400
    throw err
  }

  if (rows.length > 200) {
    const err = new Error('Maximum 200 students can be imported in a single batch.')
    err.status = 400
    throw err
  }

  const counts = {
    invited: 0,
    already_member: 0,
    reinvited: 0,
    not_found: 0,
    not_student: 0,
    invalid: 0
  }

  const notFoundEmails = []
  const results = []

  for (const row of rows) {
    const email = row.email || row.Email || row['student email'] || row['Student Email'] || row['student_email'] || row['EMAIL'] || ''
    const name = row.name || row.Name || row['student name'] || row['Student Name'] || row['student_name'] || row['NAME'] || ''

    if (!email || !String(email).trim()) {
      counts.invalid++
      results.push({ email: '', status: 'invalid', message: 'Missing email' })
      continue
    }

    const res = await inviteStudentToClass({ classId, teacherId, email: String(email).trim(), name: String(name).trim() })
    results.push(res)

    if (res.status === 'invited') {
      if (res.reinvited) counts.reinvited++
      else counts.invited++
    } else if (res.status === 'already_member') {
      counts.already_member++
    } else if (res.status === 'not_found') {
      counts.not_found++
      if (!notFoundEmails.includes(res.email)) notFoundEmails.push(res.email)
    } else if (res.status === 'not_student') {
      counts.not_student++
    } else if (res.status === 'invalid') {
      counts.invalid++
    }
  }

  return {
    total: rows.length,
    counts,
    notFoundEmails,
    results
  }
}

export const cancelClassInvite = async ({ classId, teacherId, memberId }) => {
  const cls = await Class.findById(classId)
  if (!cls) {
    const err = new Error('Class not found')
    err.status = 404
    throw err
  }

  if (String(cls.teacher) !== String(teacherId)) {
    const err = new Error('Only the class teacher can manage invites')
    err.status = 403
    throw err
  }

  const member = await ClassMember.findOne({ _id: memberId, classId })
  if (!member) {
    const err = new Error('Membership record not found')
    err.status = 404
    throw err
  }

  if (member.status !== 'invited') {
    const err = new Error('Can only cancel invites for students with status invited')
    err.status = 400
    throw err
  }

  // Update notification to declined
  await Notification.updateMany(
    { userId: member.studentId, classId: cls._id, status: 'pending' },
    { status: 'declined', readAt: new Date() }
  )

  if (!member.joinedAt) {
    // If student never joined, remove the invited document
    await ClassMember.deleteOne({ _id: member._id })
  } else {
    // If student had previous attendance history, soft-remove
    member.status = 'declined'
    await member.save()
  }

  return { success: true, message: 'Invite cancelled successfully' }
}

export const getClassPeopleDashboard = async (classId, teacherId) => {
  const membersData = await getClassMembersWithPerformance(classId, teacherId)

  return {
    active: membersData.active,
    invited: membersData.invited || [],
    pending: membersData.pending || [],
    declined: membersData.declined || [],
    removed: membersData.removed || [],
    stats: {
      activeCount: membersData.active.length,
      invitedCount: (membersData.invited || []).length,
      pendingCount: (membersData.pending || []).length,
      declinedCount: (membersData.declined || []).length,
      removedCount: (membersData.removed || []).length,
      totalCount: membersData.active.length + (membersData.invited || []).length + (membersData.pending || []).length + (membersData.declined || []).length + (membersData.removed || []).length
    },
    totalClassSessions: membersData.totalClassSessions,
    avgAttendance: membersData.avgAttendance
  }
}

