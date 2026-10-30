// Core waiting-room logic.
//
// Two kinds of helpers live here:
//   1. Pure policy functions (no DB) - timing, admission decisions, channel names. These are what
//      the unit tests exercise and what the socket/REST layers share, so a join is evaluated
//      identically over HTTP and Socket.IO.
//   2. Thin RoomMember flows (ensure/admit/reject/list) used by the routes and sockets. Keeping
//      them beside the policy keeps the "which channel/status should this student be in" rule in
//      one place.
//
// Channel model:
//   participants -> room.code            (live polls, leaderboard, participation)
//   viewers      -> viewers:<room.code>  (waiting room, rejected and very-late students; read-only)
import RoomMember from '../models/RoomMember.js'

export const DEFAULT_GRACE_MINUTES = 5
export const DEFAULT_LATE_WINDOW_MINUTES = 15
export const DEFAULT_LATE_PENALTY_SP = 0

// Attendance outcomes that count as a "late strike" for the 3-strike rule.
export const LATE_STATUSES = ['late', 'very_late']

export const participantsChannel = (roomCode) => String(roomCode || '')
export const viewersChannel = (roomCode) => `viewers:${String(roomCode || '')}`

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

// Grace / late window are stored in minutes but may be fractional (seconds mode in the UI sends
// e.g. 0.5 for 30s). Round to microseconds so float division noise never leaks into comparisons.
function clampMinutes(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n * 1e6) / 1e6))
}

function toDate(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function isWaitingRoomEnabled(room) {
  return !!room?.settings?.waitingRoomEnabled
}

export function getWaitingPolicy(room) {
  return room?.settings?.waitingRoomPolicy === 'manual' ? 'manual' : 'automatic'
}

export function getAttendanceSettings(room) {
  const s = room?.settings || {}
  return {
    scheduledStartAt: toDate(s.scheduledStartAt),
    graceMinutes: clampMinutes(s.graceMinutes, 0, 120, DEFAULT_GRACE_MINUTES),
    lateWindowMinutes: clampMinutes(s.lateWindowMinutes, 0, 240, DEFAULT_LATE_WINDOW_MINUTES),
    latePenaltySp: clampInt(s.latePenaltySp, 0, 1000, DEFAULT_LATE_PENALTY_SP)
  }
}

// Minutes from the scheduled start to `at`, counting only time AFTER the grace period.
// 0 for anyone on time (or before the start). Used for the ledger's lateMinutes field.
export function computeLateMinutes({ room, at = new Date() }) {
  const { scheduledStartAt, graceMinutes } = getAttendanceSettings(room)
  const when = toDate(at) || new Date()
  if (!scheduledStartAt) return 0
  const diffMin = (when.getTime() - scheduledStartAt.getTime()) / 60000
  if (diffMin <= graceMinutes) return 0
  return Math.max(0, Math.ceil(diffMin - graceMinutes))
}

// Classification for a join/admission time. No scheduled start = on_time (a room that never set a
// schedule should not invent lateness).
export function computeAttendanceStatus({ room, at = new Date() }) {
  const { scheduledStartAt, graceMinutes, lateWindowMinutes } = getAttendanceSettings(room)
  const when = toDate(at) || new Date()
  if (!scheduledStartAt) return 'on_time'
  const diffMin = (when.getTime() - scheduledStartAt.getTime()) / 60000
  if (diffMin <= graceMinutes) return 'on_time'
  if (diffMin <= graceMinutes + lateWindowMinutes) return 'late'
  return 'very_late'
}

// The moment a student actually arrived. Attendance is judged on this, never on when the teacher
// got round to admitting them: a manual waiting room must not mark an on-time student late just
// because the teacher was slow to click Admit. Rejoining keeps joinedAt/admittedAt, so a network
// disconnect cannot shift the classification either.
export function attendanceReferenceTime({ member = null, at = new Date() } = {}) {
  return (
    toDate(member?.admittedAt) ||
    toDate(member?.waitingRequestedAt) ||
    toDate(member?.joinedAt) ||
    toDate(at) ||
    new Date()
  )
}

// Derived attendance for an admitted member. Once an outcome is stamped (not 'pending') it is
// sticky: a reconnect or a late page load must not silently turn an on-time student into late.
export function attendanceForMember({ room, member, at = new Date() }) {
  const stamped = member?.attendanceStatus
  if (stamped && stamped !== 'pending') return stamped
  return computeAttendanceStatus({ room, at: attendanceReferenceTime({ member, at }) })
}

// A very-late arrival is admitted but watch-only: they see the video and nothing else (no polls,
// no answers, no leaderboard). Enforced server-side by routing them to the viewers channel and
// refusing their responses/leaderboard reads, not just hidden in the UI.
export function isWatchOnly({ admitted, attendanceStatus }) {
  return !!admitted && attendanceStatus === 'very_late'
}

const spText = (n) => `${n} SP`

function joinNotification({ room, state, enabled, policy, attendanceStatus, arrivalStatus }) {
  if (state === 'rejected') return 'Your request to join this room was declined by the teacher.'
  if (state === 'waiting') {
    if (arrivalStatus === 'very_late') {
      return 'You joined very late, so your teacher needs to approve your entry. You can watch the video once admitted.'
    }
    return policy === 'manual'
      ? 'You are in the waiting room. Your teacher will admit you shortly.'
      : 'Waiting for the room to admit you.'
  }
  // Consequences mirror attendanceLedger.penaltyForStatus (late 1x, very late 2x) and its 3-strike rule.
  const { scheduledStartAt, latePenaltySp } = getAttendanceSettings(room)
  if (attendanceStatus === 'late') {
    const cost = latePenaltySp > 0 ? ` and costs ${spText(latePenaltySp)}` : ''
    return `You joined late. This is recorded in your attendance${cost}. Every 3rd late arrival in a row also counts as a strike.`
  }
  if (attendanceStatus === 'very_late') {
    const cost = latePenaltySp > 0 ? ` It is recorded as very late and costs ${spText(latePenaltySp * 2)}.` : ' It is recorded as very late in your attendance.'
    return `You joined very late, so you can only watch the video in this session. Polls and the leaderboard are not available to you.${cost}`
  }
  if (scheduledStartAt) return 'You joined on time. You can take part in every poll.'
  return enabled ? 'You are in the room.' : ''
}

// Decide what a student's state should be RIGHT NOW.
//
// Returns:
//   { enabled, policy, state, admitted, waitingRoom, watchOnly, attendanceStatus, lateMinutes, notification }
//
// `state` is the persisted admission state ('admitted' | 'waiting' | 'rejected'); `waitingRoom`
// is true whenever the student is not currently a live participant (the field the clients use to
// switch into watch-only mode).
//
// Admission policy (only when the waiting room is enabled):
//   automatic -> everyone is admitted on join (very-late arrivals are watch-only).
//   manual    -> on-time AND late arrivals are admitted automatically (the late notice explains the
//                penalty); only very-late arrivals wait for the teacher's approval.
export function evaluateJoin({ room, member = null, at = new Date() }) {
  const enabled = isWaitingRoomEnabled(room)
  const policy = getWaitingPolicy(room)
  const stored = member?.admissionStatus
  // Classification for the moment the student actually arrived. Drives both the admission decision
  // and (via attendanceForMember) the stamped outcome.
  const arrivalStatus = computeAttendanceStatus({ room, at: attendanceReferenceTime({ member, at }) })
  const needsApproval = arrivalStatus === 'very_late' && policy === 'manual'

  let state
  if (!enabled) {
    state = 'admitted'
  } else if (stored === 'rejected') {
    state = 'rejected'
  } else if (stored === 'admitted') {
    state = 'admitted'
  } else if (stored === 'waiting') {
    // Keep genuinely very-late arrivals waiting in manual rooms. Anything else (automatic rooms, or
    // a row parked by an older build) is promoted on the next join.
    state = needsApproval ? 'waiting' : 'admitted'
  } else if (member) {
    // Legacy membership row (field absent) predates the waiting room: treat as admitted.
    state = 'admitted'
  } else {
    state = needsApproval ? 'waiting' : 'admitted'
  }

  // Late-join hard stop: only applies when the teacher disabled late joining. An already-admitted
  // student is never retroactively kicked by changing the setting mid-session. Judge the cutoff
  // against the arrival time so a slow approval cannot reject a student who arrived in time.
  if (state === 'admitted' && enabled && room?.settings?.allowLateJoin === false && stored !== 'admitted') {
    const { scheduledStartAt, graceMinutes, lateWindowMinutes } = getAttendanceSettings(room)
    if (scheduledStartAt) {
      const cutoff = scheduledStartAt.getTime() + (graceMinutes + lateWindowMinutes) * 60000
      const when = attendanceReferenceTime({ member, at })
      if (when.getTime() > cutoff) state = 'rejected'
    }
  }

  const admitted = state === 'admitted'
  const attendanceStatus = !admitted
    ? (state === 'rejected' ? 'excused' : 'pending')
    : attendanceForMember({ room, member, at })
  const lateMinutes = admitted ? computeLateMinutes({ room, at: attendanceReferenceTime({ member, at }) }) : 0

  return {
    enabled,
    policy,
    state,
    admitted,
    waitingRoom: enabled ? !admitted : false,
    watchOnly: isWatchOnly({ admitted, attendanceStatus }),
    attendanceStatus,
    lateMinutes,
    notification: joinNotification({ room, state, enabled, policy, attendanceStatus, arrivalStatus })
  }
}

// ---------------------------------------------------------------------------------------------
// RoomMember flows (DB)
// ---------------------------------------------------------------------------------------------

// Create or refresh this student's membership row. Safe to call on every REST join AND socket
// join: it is idempotent and never demotes an already-admitted student.
export async function ensureRoomMember({ room, studentId, at = new Date() }) {
  const roomId = room._id
  let member = await RoomMember.findOne({ roomId, studentId })
  const now = toDate(at) || new Date()

  if (!member) {
    const evaluation = evaluateJoin({ room, member: null, at: now })
    member = await RoomMember.create({
      roomId,
      studentId,
      joinedAt: now,
      waitingRequestedAt: evaluation.state === 'waiting' ? now : null,
      admissionStatus: evaluation.state,
      admittedAt: evaluation.state === 'admitted' ? now : null,
      attendanceStatus: evaluation.attendanceStatus,
      attendanceMarkedAt: evaluation.state === 'admitted' ? now : null
    })
    // Became waiting on this call -> the teacher's lobby chime fires once (not on every rejoin).
    return {
      member,
      evaluation: evaluateJoin({ room, member, at: now }),
      becameWaiting: evaluation.state === 'waiting'
    }
  }

  const evaluation = evaluateJoin({ room, member, at: now })
  // Only a transition INTO waiting counts; a student already waiting who reconnects must not chime.
  const becameWaiting = evaluation.state === 'waiting' && member.admissionStatus !== 'waiting'
  const patch = {}

  // Rejoin after a leave: clear the marker but keep the original joinedAt / admittedAt / stamped
  // attendance, so the student walks straight back into the state they left.
  if (member.leftAt) patch.leftAt = null

  // Auto-promote (automatic policy, or the teacher just turned the waiting room off).
  if (evaluation.state === 'admitted' && member.admissionStatus !== 'admitted') {
    patch.admissionStatus = 'admitted'
    // Arrival time, not "right now": a slow manual approval must not turn an on-time student late.
    patch.admittedAt = attendanceReferenceTime({ member, at: now })
    patch.attendanceStatus = attendanceForMember({ room, member, at: now })
    patch.attendanceMarkedAt = now
  } else if (member.admissionStatus === 'admitted' && (!member.attendanceStatus || member.attendanceStatus === 'pending')) {
    // Backfill attendance for members admitted before this feature existed.
    patch.attendanceStatus = evaluation.attendanceStatus
    patch.attendanceMarkedAt = now
  }

  if (Object.keys(patch).length) {
    member = await RoomMember.findByIdAndUpdate(member._id, { $set: patch }, { new: true })
  }
  return { member, evaluation: evaluateJoin({ room, member, at: now }), becameWaiting }
}

// Teacher admits one waiting student. Attendance is stamped at the student's ARRIVAL time (when
// they asked to join), not when the teacher clicked Admit - otherwise a slow approval would mark
// an on-time student late through no fault of their own.
export async function admitRoomMember({ room, studentId, admittedBy = null, at = new Date() }) {
  const now = toDate(at) || new Date()
  const existing = await RoomMember.findOne({ roomId: room._id, studentId })
  if (!existing) return null

  const arrivalAt = attendanceReferenceTime({ member: existing, at: now })
  const attendanceStatus = existing.attendanceStatus && existing.attendanceStatus !== 'pending'
    ? existing.attendanceStatus
    : computeAttendanceStatus({ room, at: arrivalAt })

  const member = await RoomMember.findOneAndUpdate(
    { roomId: room._id, studentId },
    {
      $set: {
        admissionStatus: 'admitted',
        admittedAt: existing.admittedAt || arrivalAt,
        leftAt: null,
        admittedBy,
        attendanceStatus,
        attendanceMarkedAt: now
      }
    },
    { new: true }
  )
  return { member, evaluation: evaluateJoin({ room, member, at: now }) }
}

// Teacher rejects a waiting student. They stay connected in the viewers channel (watch-only) but
// can never post responses; the ledger marks the attempt 'excused' (0 penalty).
export async function rejectRoomMember({ room, studentId, rejectedBy = null, at = new Date() }) {
  const now = toDate(at) || new Date()
  const member = await RoomMember.findOneAndUpdate(
    { roomId: room._id, studentId },
    {
      $set: {
        admissionStatus: 'rejected',
        admittedBy: rejectedBy || null,
        attendanceStatus: 'excused',
        attendanceMarkedAt: now
      }
    },
    { new: true }
  )
  if (!member) return null
  return { member, evaluation: evaluateJoin({ room, member, at: now }) }
}

export async function listWaitingMembers(roomId) {
  return RoomMember.find({ roomId, admissionStatus: 'waiting', leftAt: null })
    .populate('studentId', 'name email enrollmentNumber')
    .sort({ waitingRequestedAt: 1, joinedAt: 1 })
    .lean()
}

export async function countParticipants(roomId) {
  // A member with no admissionStatus predates the feature and is a participant. `leftAt: null`
  // matches both an unset marker and legacy docs where the field does not exist, so students who
  // have left stop counting without breaking older rows.
  return RoomMember.countDocuments({
    roomId,
    leftAt: null,
    $or: [{ admissionStatus: 'admitted' }, { admissionStatus: { $exists: false } }, { admissionStatus: null }]
  })
}

export async function countWaiting(roomId) {
  return RoomMember.countDocuments({ roomId, admissionStatus: 'waiting', leftAt: null })
}
