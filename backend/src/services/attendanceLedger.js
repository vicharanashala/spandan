// Attendance ledger processing.
//
// Runs once per room when the session ends (PUT /rooms/:id { isActive: false }); idempotent via
// Room.attendanceProcessedAt so a retry/recovery never double-penalises. For every RoomMember we
// stamp/read an attendance outcome, write one AttendanceLedger row, and compute the running
// late-run (3-strike) state per student.
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import AttendanceLedger from '../models/AttendanceLedger.js'
import User from '../models/User.js'
import { LATE_STATUSES } from './waitingRoom.js'
import { ensureStanding, settleRoomForStudent, standingSummary } from './studentStanding.js'
import { fetchLiveStanding } from './spurtiLive.js'

// Every 3rd consecutive late arrival triggers an extra strike penalty on top of the base one.
export const STRIKE_EVERY = 3

// SP this outcome costs. Penalties are ledger-only (see AttendanceLedger); they never mutate the
// quiz leaderboard, which sums live Response.points.
export function penaltyForStatus({ status, latePenaltySp }) {
  const base = Math.max(0, Number(latePenaltySp) || 0)
  switch (status) {
    case 'late': return base
    case 'very_late': return base * 2
    case 'absent': return base * 3
    // 'excused' (teacher rejected) and 'on_time' cost nothing.
    default: return 0
  }
}

function resolveFinalStatus(member) {
  const s = member.attendanceStatus
  if (s === 'on_time' || s === 'late' || s === 'very_late' || s === 'excused' || s === 'absent') return s
  // Still 'pending' at room end: a waiting-room member who was never admitted is absent; anything
  // else (a member admitted before attendance stamping existed) counts as on time.
  return member.admissionStatus === 'waiting' ? 'absent' : 'on_time'
}

// Pure running-state calculator: given a student's prior ledger rows (oldest first) and a new
// status, return the ledger row's strike fields. Separated out so it is unit-testable without a DB.
export function computeStrike({ priorLateRun = 0, status }) {
  if (!LATE_STATUSES.includes(status)) return { consecutiveLate: 0, strikeTriggered: false }
  const consecutiveLate = priorLateRun + 1
  return { consecutiveLate, strikeTriggered: consecutiveLate % STRIKE_EVERY === 0 }
}

// Number of late arrivals at the head of a newest-first list (ledger rows + live rows). An on-time,
// excused or absent row ends the run.
export function streakFromRows(rows = []) {
  let streak = 0
  for (const row of rows) {
    if (LATE_STATUSES.includes(row?.status)) streak++
    else break
  }
  return streak
}

// The ledger is only written when a room ends. Pull attendance already stamped on in-progress
// memberships so the dashboard's streak reacts to a late join immediately instead of waiting for
// the session to finish. Rooms already in the ledger are skipped to avoid counting twice.
async function getLiveAttendanceRows(studentId, ledgerRows) {
  const processedRoomIds = new Set(ledgerRows.map((r) => String(r.roomId)))
  const members = await RoomMember.find({
    studentId,
    attendanceStatus: { $in: ['on_time', ...LATE_STATUSES, 'excused'] }
  }).lean()
  const pending = members.filter((m) => !processedRoomIds.has(String(m.roomId)))
  if (!pending.length) return []

  const rooms = await Room.find({
    _id: { $in: pending.map((m) => m.roomId) },
    attendanceProcessedAt: null
  }).select('name settings.latePenaltySp').lean()
  const roomById = new Map(rooms.map((r) => [String(r._id), r]))

  return pending
    .filter((m) => roomById.has(String(m.roomId)))
    .map((m) => {
      const room = roomById.get(String(m.roomId))
      const latePenaltySp = Number(room?.settings?.latePenaltySp) || 0
      return {
        roomId: m.roomId,
        roomName: room?.name || '',
        status: m.attendanceStatus,
        penaltySp: penaltyForStatus({ status: m.attendanceStatus, latePenaltySp }),
        // Same timestamp precedence used when the ledger row is eventually written.
        createdAt: m.attendanceMarkedAt || m.admittedAt || m.joinedAt || null,
        live: true
      }
    })
}

export async function processRoomAttendance(roomId) {
  const room = await Room.findById(roomId)
  if (!room) throw new Error('Room not found')

  // Idempotence guard: claim the room first with a conditional update. If another invocation
  // already claimed it, we are done.
  if (room.attendanceProcessedAt) return { processed: 0, skipped: true }
  const claim = await Room.findOneAndUpdate(
    { _id: roomId, attendanceProcessedAt: null },
    { $set: { attendanceProcessedAt: new Date() } },
    { new: true }
  )
  if (!claim) return { processed: 0, skipped: true }

  const members = await RoomMember.find({ roomId }).lean()
  if (!members.length) return { processed: 0, skipped: false }

  const latePenaltySp = Number(room.settings?.latePenaltySp) || 0
  const processedAt = new Date()
  let processed = 0

  // Make sure every participant already has a standing row BEFORE this room's ledger rows are
  // written. Otherwise a first-time backfill would see this room and the settlement below would
  // count it a second time.
  await Promise.all([...new Set(members.map((m) => String(m.studentId)))].map((id) => ensureStanding(id, { excludeRoomId: room._id })))

  for (const member of members) {
    const status = resolveFinalStatus(member)

    // Prior late run for this student, EXCLUDING this room (a re-run would otherwise see its own
    // row; the unique index also makes the upsert below safe).
    const prior = await AttendanceLedger.find({
      studentId: member.studentId,
      roomId: { $ne: room._id }
    }).sort({ createdAt: -1 }).limit(STRIKE_EVERY - 1).select('status').lean()

    let priorLateRun = 0
    for (const row of prior) {
      if (LATE_STATUSES.includes(row.status)) priorLateRun++
      else break
    }

    const strike = computeStrike({ priorLateRun, status })
    const penaltySp = penaltyForStatus({ status, latePenaltySp })

    const lateMinutes = member.admittedAt
      ? Math.max(0, Math.round((new Date(member.admittedAt).getTime() - (room.settings?.scheduledStartAt ? new Date(room.settings.scheduledStartAt).getTime() : 0)) / 60000))
      : 0

    const ledgerRow = await AttendanceLedger.findOneAndUpdate(
      { roomId: room._id, studentId: member.studentId },
      {
        $set: {
          status,
          joinedAt: member.joinedAt || null,
          admittedAt: member.admittedAt || null,
          lateMinutes: status === 'late' || status === 'very_late' ? lateMinutes : 0,
          penaltySp,
          consecutiveLate: strike.consecutiveLate,
          strikeTriggered: strike.strikeTriggered,
          roomName: room.name || '',
          roomCode: room.code || '',
          processedAt
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    // Apply earnings and penalties once per ledger row. The marker makes a retry a no-op.
    if (ledgerRow && !ledgerRow.standingSettledAt) {
      await settleRoomForStudent({
        room,
        member,
        status,
        penaltySp,
        strikeTriggered: strike.strikeTriggered
      })
      await AttendanceLedger.updateOne(
        { _id: ledgerRow._id },
        { $set: { standingSettledAt: processedAt } }
      )
    }

    // Mirror the final outcome back onto the member for the teacher's roster view.
    if (member.attendanceStatus !== status) {
      await RoomMember.updateOne({ _id: member._id }, { $set: { attendanceStatus: status, attendanceMarkedAt: processedAt } })
    }
    processed++
  }

  return { processed, skipped: false }
}

// Student-facing attendance summary: the current late streak and lifetime session counters used
// by the student dashboard card.
//
// SP and attendance minutes are a READ-ONLY MIRROR of Spurti when it is reachable (see
// services/spurtiLive.js); otherwise they fall back to Spandan's locally settled balances. The
// late streak, strikes and session counters always come from Spandan's own ledger.
export async function getStudentAttendanceSummary(studentId, { chatengineToken } = {}) {
  const ledgerRows = await AttendanceLedger.find({ studentId }).sort({ createdAt: -1 }).lean()
  const liveRows = await getLiveAttendanceRows(studentId, ledgerRows)
  // Newest first across completed sessions and any in-progress room. Only the streak uses this
  // merged list; the lifetime counters stay based on completed ledger rows.
  const rows = [...liveRows, ...ledgerRows].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return bt - at
  })

  const total = ledgerRows.length
  const attended = ledgerRows.filter((r) => r.status !== 'absent').length
  const onTime = ledgerRows.filter((r) => r.status === 'on_time').length
  const lateCount = ledgerRows.filter((r) => LATE_STATUSES.includes(r.status)).length
  const veryLate = ledgerRows.filter((r) => r.status === 'very_late').length
  const absent = ledgerRows.filter((r) => r.status === 'absent').length
  const totalPenaltySp = ledgerRows.reduce((sum, r) => sum + (r.penaltySp || 0), 0)

  const currentLateStreak = streakFromRows(rows)
  // Only flag "live" when an in-progress room is actually part of the current run, so the
  // dashboard does not claim a live contribution while the meter reads zero.
  const liveInStreak = rows.slice(0, currentLateStreak).some((r) => r.live)

  const [standing, student] = await Promise.all([
    ensureStanding(studentId),
    User.findById(studentId).select('email').lean()
  ])
  const localStanding = standingSummary(standing)
  const mirrored = student?.email
    ? await fetchLiveStanding(student.email, { chatengineToken })
    : null
  // Spurti has no "average SP at risk" figure. Use its balance per attended session as a close
  // equivalent, and fall back to Spandan's local average when there is nothing to divide by.
  const liveAverageSp = mirrored && mirrored.sessionsAttended > 0
    ? Math.round(mirrored.spBalance / mirrored.sessionsAttended)
    : localStanding.averageSp
  const spBalance = mirrored ? mirrored.spBalance : localStanding.spBalance
  const attendanceMinutes = mirrored ? mirrored.attendanceMinutes : localStanding.attendanceMinutes
  const averageSp = mirrored ? liveAverageSp : localStanding.averageSp
  const displayedStanding = {
    ...localStanding,
    spBalance,
    attendanceMinutes,
    averageSp
  }

  return {
    total,
    attended,
    onTime,
    late: lateCount,
    veryLate,
    absent,
    totalPenaltySp,
    currentLateStreak,
    strikeEvery: STRIKE_EVERY,
    live: liveInStreak,
    // Spendable balances + the amounts a strike would take.
    spBalance,
    attendanceMinutes,
    attendanceTargetMinutes: localStanding.attendanceTargetMinutes,
    attendanceDayMinutes: localStanding.attendanceDayMinutes,
    averageSp,
    sessionsAttended: localStanding.sessionsAttended,
    strikes: localStanding.strikes,
    // 'spurti' means these balances are mirrored live; 'local' means Spandan's own ledger.
    source: mirrored ? 'spurti' : 'local',
    liveSource: mirrored,
    local: {
      spBalance: localStanding.spBalance,
      attendanceMinutes: localStanding.attendanceMinutes
    },
    standing: displayedStanding,
    recent: rows.slice(0, 5).map((r) => ({
      roomId: r.roomId,
      roomName: r.roomName,
      status: r.status,
      penaltySp: r.penaltySp || 0,
      createdAt: r.createdAt,
      live: !!r.live
    }))
  }
}
