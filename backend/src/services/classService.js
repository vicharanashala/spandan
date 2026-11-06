import Class from '../models/Class.js'
import ClassMember from '../models/ClassMember.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import User from '../models/User.js'
import { createRoom } from './roomService.js'
import { computeReconnectUsage } from './attendanceService.js'

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

  if (member.status === 'removed') {
    // Student rejoining after being removed -> status becomes pending (needs teacher approval)
    // Same document is preserved!
    member.status = 'pending'
    await member.save()
    return {
      class: cls,
      member,
      status: 'pending',
      message: 'Re-join request submitted. Waiting for teacher approval.'
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
    await member.save()
    return { member, message: 'Member approved and restored to active' }
  } else if (action === 'remove') {
    // Soft remove: all historical data kept, status set to removed
    member.status = 'removed'
    member.removedAt = new Date()
    await member.save()
    return { member, message: 'Member removed from class' }
  } else if (action === 'reject') {
    // Teacher rejects re-join request: stays removed
    member.status = 'removed'
    member.removedAt = new Date()
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
      { $match: { roomId: { $in: roomIds }, status: { $nin: ['waiting', 'rejected'] } } },
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

export const getSessionMembershipCoverage = (room, member) => {
  if (!room || !member) return 'active_eligible'

  const roomCreatedTime = new Date(room.createdAt).getTime()
  if (isNaN(roomCreatedTime)) return 'active_eligible'

  const joinedTime = member.joinedAt
    ? new Date(member.joinedAt).getTime()
    : (member.createdAt ? new Date(member.createdAt).getTime() : 0)

  // 1. before_join: room was created strictly before the student's first enrollment
  // Rule: room.createdAt < member.joinedAt (strict Date compare)
  if (joinedTime && roomCreatedTime < joinedTime) {
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
        // Member was never re-activated after that removal, or status is still removed / pending
        return 'during_removal'
      } else if (roomCreatedTime < approvedTime) {
        // Room was held during removal window [removedAt, approvedAt)
        return 'during_removal'
      }
    }
  }

  // 3. active_eligible: not before_join and not during_removal
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

  // Room members, responses, and questions for these rooms. Waiting-room students (still waiting or
  // rejected) are not counted as class attendance, so they are excluded from the member lookup.
  const [roomMembers, responses, allQuestions] = await Promise.all([
    RoomMember.find({ roomId: { $in: roomIds }, status: { $nin: ['waiting', 'rejected'] } })
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

    const joinedAt = m.joinedAt || m.createdAt

    // Active eligible sessions for this student (excludes before_join and during_removal windows)
    const activeEligibleRooms = classRooms.filter(r => {
      const coverage = getSessionMembershipCoverage(r, m)
      return coverage === 'active_eligible' || attendedSet.has(String(r._id))
    })

    const sessionsPossible = activeEligibleRooms.length
    const sessionsAttended = activeEligibleRooms.filter(r => attendedSet.has(String(r._id))).length
    const attendanceRate = sessionsPossible > 0 ? Math.round((sessionsAttended / sessionsPossible) * 100) : 0

    // Polls launched and missed across attended eligible sessions
    const attendedEligibleRooms = activeEligibleRooms.filter(r => attendedSet.has(String(r._id)))
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
      joinedAt: m.joinedAt,
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
    pending: enriched.filter(m => m.status === 'pending'),
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

  const memberByRoom = new Map(roomMembers.map(rm => [String(rm.roomId), rm]))

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
    const roomMember = memberByRoom.get(rid) || null
    // Join/leave history + reconnect budget accounting for THIS lecture. Open for a live room, so
    // the same shape drives the per-lecture expanded panel and the live meter.
    const reconnect = roomMember
      ? {
        ...computeReconnectUsage({ member: roomMember, room, at: room.endedAt || new Date() }),
        excused: !!roomMember.attendanceExcused,
        finalized: !!roomMember.attendanceFinalizedAt,
        penaltyPercent: roomMember.penaltyPercent ?? null,
        rawPoints: roomMember.rawPoints ?? null,
        adjustedPoints: roomMember.adjustedPoints ?? null
      }
      : null

    // Upstream attendance windows are based on the CLASS membership (joined/removed/approved dates),
    // not this room's membership row.
    const coverage = getSessionMembershipCoverage(room, member || { joinedAt })
    let status = 'missed'
    if (attended) {
      status = 'attended'
    } else if (coverage === 'before_join') {
      status = 'before_join'
    } else if (coverage === 'during_removal') {
      status = 'during_removal'
    } else {
      status = 'missed'
    }

    const pollsMissed = attended ? Math.max(0, totalQ - attempted) : 0

    return {
      roomId: room._id,
      roomName: room.name,
      roomCode: room.code,
      date: room.createdAt,
      endedAt: room.endedAt,
      isActive: room.isActive,
      status, // 'attended' | 'missed' | 'before_join' | 'during_removal'
      coverage, // 'active_eligible' | 'before_join' | 'during_removal'
      attended,
      isBeforeJoin: status === 'before_join',
      isDuringRemoval: status === 'during_removal',
      totalQuestions: totalQ,
      pollsAttempted: attempted,
      pollsMissed,
      correctCount: correct,
      accuracy,
      reconnect
    }
  })

  // Ensure sessions are strictly sorted by createdAt descending
  sessionBreakdown.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Active eligible sessions for this student (excludes before_join and during_removal windows)
  const activeEligibleRooms = classRooms.filter(r => {
    const coverage = getSessionMembershipCoverage(r, member || { joinedAt })
    return coverage === 'active_eligible' || attendedRoomIds.has(String(r._id))
  })

  const sessionsPossible = activeEligibleRooms.length
  const sessionsAttended = activeEligibleRooms.filter(r => attendedRoomIds.has(String(r._id))).length
  const attendanceRate = sessionsPossible > 0 ? Math.round((sessionsAttended / sessionsPossible) * 100) : 0

  // Polls launched, attempted, and missed across attended eligible sessions
  const attendedEligibleRooms = activeEligibleRooms.filter(r => attendedRoomIds.has(String(r._id)))
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
    const activeEligible = rooms.filter(r => {
      const coverage = getSessionMembershipCoverage(r, m)
      return coverage === 'active_eligible' || attendedSet.has(String(r._id))
    })
    const possible = activeEligible.length
    const attended = activeEligible.filter(r => attendedSet.has(String(r._id))).length
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
