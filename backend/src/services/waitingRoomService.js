import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import User from '../models/User.js'
import { startPresence, countPresent, getReconnectAllowanceSeconds, computeReconnectUsage, getAttentionConfig } from './attendanceService.js'

// Waiting-room defaults. A room that predates the feature (no settings.waitingRoom) is treated as
// DISABLED so existing sessions behave exactly as before; new rooms get the schema default
// (enabled: true) because createRoom writes the settings object explicitly.
const DEFAULT_CONFIG = {
  enabled: false,
  mode: 'automatic',
  graceSeconds: 120,
  scheduledAt: null,
  reconnectAllowanceSeconds: 60
}

const parseScheduledAt = (raw) => {
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

// Membership documents written before the waiting room existed have no status. They must keep
// counting as live participants, so "admitted" is expressed as "not waiting and not rejected"
// rather than status: 'admitted'.
export const ADMITTED_STATUS_FILTER = { status: { $nin: ['waiting', 'rejected'] } }

export const getWaitingRoomConfig = (room) => {
  const raw = room?.settings?.waitingRoom || {}
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_CONFIG.enabled
  const mode = raw.mode === 'manual' ? 'manual' : 'automatic'
  const rawGrace = Number(raw.graceSeconds)
  const graceSeconds = Number.isFinite(rawGrace)
    ? Math.max(0, Math.min(3600, Math.floor(rawGrace)))
    : DEFAULT_CONFIG.graceSeconds
  return {
    enabled,
    mode,
    graceSeconds,
    scheduledAt: parseScheduledAt(raw.scheduledAt),
    // Always at least 60 seconds, even if the room stores 0.
    reconnectAllowanceSeconds: getReconnectAllowanceSeconds(room)
  }
}

export const getSessionStartedAt = (room) =>
  room?.sessionStartedAt || room?.createdAt || new Date()

// The clock used by the grace window and attendance. When a class is scheduled, opening the room
// early must not start the clock: it waits for the scheduled time. A room opened AFTER the scheduled
// time uses the real start (the teacher was late, so students are not punished for it).
export const getClassStartAt = (room) => {
  const actualStart = getSessionStartedAt(room)
  const scheduledAt = getWaitingRoomConfig(room).scheduledAt
  if (!scheduledAt) return actualStart
  return scheduledAt.getTime() > new Date(actualStart).getTime() ? scheduledAt : actualStart
}

export const getGraceDeadline = (room) => {
  const { graceSeconds } = getWaitingRoomConfig(room)
  return new Date(getClassStartAt(room).getTime() + graceSeconds * 1000)
}

export const isOnTime = (room, at = new Date()) =>
  new Date(at).getTime() <= getGraceDeadline(room).getTime()

export const admittedFilter = (roomId) => ({ roomId, ...ADMITTED_STATUS_FILTER })

export const countAdmitted = (roomId) => RoomMember.countDocuments(admittedFilter(roomId))

const serializeMember = (member, room = null, now = new Date()) => {
  const student = member.studentId && typeof member.studentId === 'object'
    ? member.studentId
    : null
  const usage = room ? computeReconnectUsage({ member, room, at: now }) : null
  return {
    _id: String(member._id),
    studentId: String(student?._id || member.studentId),
    name: student?.name || 'Student',
    email: student?.email || '',
    status: member.status || 'admitted',
    onTime: member.onTime !== false,
    joinedAt: member.joinedAt,
    admittedAt: member.admittedAt || null,
    rejectedAt: member.rejectedAt || null,
    // Attendance / points-deduction summary (null until the room ends and attendance is finalized).
    leftAt: member.leftAt || null,
    present: usage ? usage.present : member.leftAt == null,
    presenceOpen: usage ? usage.present : member.leftAt == null,
    // Live attention state for the teacher console: why the student is away and since when.
    away: usage ? !usage.present : member.leftAt != null,
    awayReason: usage?.awayReason ?? null,
    awaySince: usage && !usage.present ? (member.leftAt || null) : null,
    presenceCount: Array.isArray(member.presence) ? member.presence.length : 0,
    rejoins: usage ? usage.rejoins : Math.max(0, (Array.isArray(member.presence) ? member.presence.length : 0) - 1),
    // Raw join/leave history and the live reconnect-budget accounting for this student.
    presence: Array.isArray(member.presence)
      ? member.presence.map((p) => ({ start: p.start || null, end: p.end || null, endedReason: p.endedReason || null }))
      : [],
    presenceEvents: usage?.events || [],
    reconnectAllowanceSeconds: usage?.allowanceSeconds ?? null,
    reconnectUsedSeconds: usage?.usedSeconds ?? null,
    reconnectRemainingSeconds: usage?.remainingSeconds ?? null,
    reconnectGapSeconds: usage?.gapSeconds ?? null,
    reconnectGaps: usage?.gaps || [],
    livePresentSeconds: usage?.presentSeconds ?? null,
    excused: !!member.attendanceExcused,
    attendanceFinalized: !!member.attendanceFinalizedAt,
    sessionSeconds: member.sessionSeconds ?? null,
    presentSeconds: member.presentSeconds ?? null,
    forgivenSeconds: member.forgivenSeconds ?? null,
    missedSeconds: member.missedSeconds ?? null,
    penaltyPercent: member.penaltyPercent ?? null,
    rawPoints: member.rawPoints ?? null,
    adjustedPoints: member.adjustedPoints ?? null
  }
}

const byJoinOrder = (a, b) => new Date(a.joinedAt) - new Date(b.joinedAt)

/**
 * Build the waiting-room snapshot the teacher console renders: config + waiting/admitted lists in
 * join order, each entry carrying its on-time/late tag.
 */
export const buildWaitingRoomSnapshot = async (room) => {
  const config = getWaitingRoomConfig(room)
  const now = new Date()
  const members = await RoomMember.find({ roomId: room._id })
    .populate('studentId', 'name email')
    .sort({ joinedAt: 1 })
    .lean()

  const serialized = members.map((m) => serializeMember(m, room, now))
  const waiting = serialized.filter(m => m.status === 'waiting').sort(byJoinOrder)
  const rejected = serialized.filter(m => m.status === 'rejected').sort(byJoinOrder)
  const admitted = serialized.filter(m => m.status !== 'waiting' && m.status !== 'rejected').sort(byJoinOrder)
  const attention = getAttentionConfig(room)

  return {
    enabled: config.enabled,
    mode: config.mode,
    graceSeconds: config.graceSeconds,
    scheduledAt: config.scheduledAt,
    reconnectAllowanceSeconds: config.reconnectAllowanceSeconds,
    attention,
    classStartsAt: getClassStartAt(room),
    sessionStartedAt: getSessionStartedAt(room),
    graceEndsAt: getGraceDeadline(room),
    waiting,
    admitted,
    rejected,
    counts: {
      waiting: waiting.length,
      admitted: admitted.length,
      rejected: rejected.length,
      // Students whose presence interval is currently open. `admitted` is the roster; this is the
      // live head-count that dips when someone disconnects and recovers when they rejoin.
      present: admitted.filter(m => m.presenceOpen).length,
      onTime: waiting.filter(m => m.onTime).length,
      late: waiting.filter(m => !m.onTime).length
    }
  }
}

/**
 * Resolve (and create when needed) a student's membership for a room.
 *
 * - Waiting room off  -> admitted immediately (legacy behaviour).
 * - Waiting room on   -> new members are held as 'waiting'; an existing admitted member keeps their
 *                        admitted state across reloads; a rejected member stays rejected.
 * - joinedAt/onTime are NEVER rewritten for an existing waiting member, so reloads cannot push a
 *   student to the back of the admission queue or flip their on-time tag.
 */
export const ensureMembership = async ({ room, studentId, at = new Date() }) => {
  const config = getWaitingRoomConfig(room)
  const existing = await RoomMember.findOne({ roomId: room._id, studentId })

  if (!config.enabled) {
    if (existing) {
      if (existing.status !== 'admitted') {
        existing.status = 'admitted'
        existing.admittedAt = existing.admittedAt || at
        existing.rejectedAt = null
        await existing.save()
      }
      return existing
    }
    return RoomMember.create({
      roomId: room._id,
      studentId,
      joinedAt: at,
      status: 'admitted',
      onTime: true,
      admittedAt: at
    })
  }

  if (existing) return existing

  return RoomMember.create({
    roomId: room._id,
    studentId,
    joinedAt: at,
    status: 'waiting',
    onTime: isOnTime(room, at),
    admittedAt: null
  })
}

const hostChannel = (roomId) => `host:room:${roomId}`

export const emitWaitingRoomUpdate = async (io, room) => {
  const snapshot = await buildWaitingRoomSnapshot(room)
  if (io) {
    io.to(hostChannel(room._id)).emit('waiting:updated', snapshot)
  }
  return snapshot
}

/**
 * Tell the teacher console that one student joined, rejoined, left or lost attention. Every event
 * also carries the student's live absence budget so the participant meter can move without a full
 * page refresh.
 *
 * Emitted on the host-only channel: student names and ids are never broadcast to the class. The
 * waiting-room snapshot is refreshed in the same tick so `counts.present` (the live head-count that
 * dips on a disconnect / tab switch) stays accurate.
 */
export const emitPresenceEvent = async (io, room, studentId, action, at = new Date(), meta = {}) => {
  if (!io || !room) return null
  const [member, user] = await Promise.all([
    RoomMember.findOne({ roomId: room._id, studentId }).lean(),
    User.findById(studentId).select('name').lean()
  ])
  if (!member) return null

  const usage = computeReconnectUsage({ member, room, at })
  const participants = await countPresent(room._id)
  // Attention transitions have their own labels so the teacher can tell a tab-switch apart from an
  // intentional leave. Everything else keeps the join/rejoin/left wording.
  const kind = action === 'left' || action === 'away' || action === 'returned'
    ? action
    : (usage.rejoins > 0 ? 'rejoined' : 'joined')
  const reason = meta.reason || usage.awayReason || null
  const payload = {
    roomId: String(room._id),
    studentId: String(studentId),
    name: user?.name || 'Student',
    action: kind,
    reason,
    at,
    participants,
    rejoins: usage.rejoins,
    reconnectAllowanceSeconds: usage.allowanceSeconds,
    reconnectUsedSeconds: usage.usedSeconds,
    reconnectRemainingSeconds: usage.remainingSeconds
  }
  io.to(hostChannel(room._id)).emit('presence:changed', payload)
  await emitWaitingRoomUpdate(io, room)
  return payload
}

const emitStudentState = (io, room, studentId, state, extra = {}) => {
  if (!io) return
  io.to(`user:${studentId}`).emit(`waiting:${state}`, {
    roomId: String(room._id),
    roomCode: room.code,
    state,
    status: state,
    ...extra
  })
}

/**
 * Admit waiting students.
 *
 * automatic mode (teacher's first admit):
 *   - default: every ON-TIME waiting student, in join order
 *   - all:     every waiting student (on-time + late)
 *   - the room then flips to manual so later joiners wait for individual review.
 *
 * manual mode:
 *   - all: true -> every waiting student in join order
 *   - otherwise -> the given studentIds
 */
export const admitWaitingStudents = async ({ io, room, studentIds = [], all = false }) => {
  const config = getWaitingRoomConfig(room)
  const baseFilter = { roomId: room._id, status: 'waiting' }

  let targets = []
  if (all) {
    targets = await RoomMember.find(baseFilter).sort({ joinedAt: 1 })
  } else if (studentIds.length > 0) {
    targets = await RoomMember.find({
      ...baseFilter,
      studentId: { $in: studentIds }
    }).sort({ joinedAt: 1 })
  } else if (config.mode === 'automatic') {
    // "Admit" in automatic mode = release the on-time cohort only.
    targets = await RoomMember.find({ ...baseFilter, onTime: true }).sort({ joinedAt: 1 })
  }

  const now = new Date()
  const admittedIds = []
  for (const member of targets) {
    member.status = 'admitted'
    member.admittedAt = now
    member.rejectedAt = null
    await member.save()
    admittedIds.push(member.studentId)
  }

  // Automatic mode always hands over to manual after the first admit — even when the on-time
  // cohort was empty — so students arriving later are reviewed individually.
  let updatedRoom = room
  if (config.mode === 'automatic') {
    updatedRoom = await Room.findByIdAndUpdate(
      room._id,
      { $set: { 'settings.waitingRoom.mode': 'manual' } },
      { new: true }
    ) || room
  }

  if (io) {
    // Only start the attendance clock for students whose socket is actually still connected: a
    // student may have closed the waiting screen before the teacher got to them.
    let onlineIds = new Set()
    if (admittedIds.length > 0) {
      try {
        const sockets = await io.in(admittedIds.map((id) => `user:${id}`)).fetchSockets()
        onlineIds = new Set(sockets.map((s) => String(s.data?.userId || '')).filter(Boolean))
      } catch { /* best effort — presence falls back to joinedAt at finalization */ }
    }

    for (const studentId of admittedIds) {
      if (onlineIds.has(String(studentId))) await startPresence(updatedRoom, studentId, now)
      // Move the student's live sockets from their private channel into the room channel, then let
      // their waiting screen switch to the live session.
      io.in(`user:${studentId}`).socketsJoin(updatedRoom.code)
    }
    const liveParticipants = await countPresent(room._id)
    for (const studentId of admittedIds) {
      emitStudentState(io, updatedRoom, studentId, 'admitted', { participants: liveParticipants })
    }
    if (admittedIds.length > 0) {
      io.to(updatedRoom.code).emit('room:joined', {
        roomCode: updatedRoom.code,
        participants: liveParticipants
      })
    }
  }

  const participants = await countPresent(room._id)
  const waitingRoom = await emitWaitingRoomUpdate(io, updatedRoom)
  return {
    admitted: admittedIds.length,
    participants,
    waitingRoom,
    room: updatedRoom
  }
}

/**
 * Reject waiting students (manual review). Rejected students are not deleted: their docs stay so
 * they can't silently re-enter by refreshing, and the teacher console can still see them.
 */
export const rejectWaitingStudents = async ({ io, room, studentIds = [], all = false }) => {
  const baseFilter = { roomId: room._id, status: 'waiting' }
  let targets = []
  if (all) {
    targets = await RoomMember.find(baseFilter).sort({ joinedAt: 1 })
  } else if (studentIds.length > 0) {
    targets = await RoomMember.find({
      ...baseFilter,
      studentId: { $in: studentIds }
    }).sort({ joinedAt: 1 })
  }

  const now = new Date()
  const rejectedIds = []
  for (const member of targets) {
    member.status = 'rejected'
    member.rejectedAt = now
    await member.save()
    rejectedIds.push(member.studentId)
  }

  if (io) {
    for (const studentId of rejectedIds) {
      io.in(`user:${studentId}`).socketsLeave(room.code)
      emitStudentState(io, room, studentId, 'rejected')
    }
  }

  const waitingRoom = await emitWaitingRoomUpdate(io, room)
  return { rejected: rejectedIds.length, waitingRoom, room }
}

export const setWaitingRoomMode = async ({ io, room, mode }) => {
  const nextMode = mode === 'manual' ? 'manual' : 'automatic'
  const updatedRoom = await Room.findByIdAndUpdate(
    room._id,
    { $set: { 'settings.waitingRoom.mode': nextMode } },
    { new: true }
  ) || room
  const waitingRoom = await emitWaitingRoomUpdate(io, updatedRoom)
  return { waitingRoom, room: updatedRoom }
}

/**
 * Admitted participants in join order (used by the teacher's clickable participant count).
 */
export const listAdmittedParticipants = async (roomId) => {
  const [room, members] = await Promise.all([
    Room.findById(roomId).lean(),
    RoomMember.find(admittedFilter(roomId))
      .populate('studentId', 'name email')
      .sort({ joinedAt: 1 })
      .lean()
  ])
  // The room is needed for the live reconnect-budget meter, so the participant list and the
  // waiting-room snapshot describe each student the same way.
  const now = new Date()
  return members.map((m) => serializeMember(m, room, now))
}
