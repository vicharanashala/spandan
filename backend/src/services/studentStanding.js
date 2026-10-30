// Student standing: spendable SP balance + attendance minutes.
//
// Quiz points (Response.points) are what a student earns in a session; attendance minutes are how
// long they were actually in the room. A room is settled once, when the attendance ledger writes
// its row (services/attendanceLedger.js):
//
//   + points earned in that room
//   + minutes between admission and room end (attended statuses only)
//   - the teacher's late penalty (late 1x, very_late 2x, absent 3x)
//   - on every 3rd consecutive late: the student's average SP per attended session and one
//     "attendance day" (60 minutes)
//
// Balances never go below zero. New students start with a non-zero balance so the dashboard is
// useful immediately, and historical sessions are folded in exactly once (backfilledAt).
import Response from '../models/Response.js'
import AttendanceLedger from '../models/AttendanceLedger.js'
import Room from '../models/Room.js'
import StudentStanding from '../models/StudentStanding.js'

const envNumber = (name, fallback, min = 0) => {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) ? Math.max(min, raw) : fallback
}

// Pre-added balances so a fresh install shows real numbers, not a wall of zeroes.
export const STARTING_SP = envNumber('STARTING_SP', 1000)
// Each student's seeded SP varies by up to ±this amount around STARTING_SP.
export const STARTING_SP_VARIATION = envNumber('STARTING_SP_VARIATION', 250)
export const STARTING_ATTENDANCE_MINUTES = envNumber('STARTING_ATTENDANCE_MINUTES', 1800)
// The dashboard shows attendance as `minutes / ATTENDANCE_TARGET_MINUTES`; the value may exceed it.
export const ATTENDANCE_TARGET_MINUTES = envNumber('ATTENDANCE_TARGET_MINUTES', 3600, 1)
// "One day of attendance" removed by a strike.
export const ATTENDANCE_DAY_MINUTES = envNumber('ATTENDANCE_DAY_MINUTES', 60)

// Stable 32-bit FNV-1a hash. Used only to give each student a repeatable seeded balance.
function stableHash(value) {
  let hash = 2166136261
  const text = String(value)
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

// Deterministic per-student starting SP. Same student always gets the same value across restarts.
export function startingSpForStudent(studentId) {
  const spread = Math.max(0, Math.round(STARTING_SP_VARIATION))
  if (!spread) return STARTING_SP
  const offset = (stableHash(studentId || 'student') % (spread * 2 + 1)) - spread
  return Math.max(0, Math.round((STARTING_SP + offset) / 10) * 10)
}

// Statuses that mean the student actually attended (excused/rejected and absent earn nothing).
export const ATTENDED_STATUSES = ['on_time', 'late', 'very_late']

export function computeAverageSp({ totalEarnedSp = 0, sessionsAttended = 0 } = {}) {
  const earned = Math.max(0, Number(totalEarnedSp) || 0)
  const sessions = Math.max(0, Number(sessionsAttended) || 0)
  if (!sessions) return 0
  return Math.max(0, Math.round(earned / sessions))
}

// Pure clamp helper. Returns the balances after removing the requested costs, never negative.
export function applyDeductions({ spBalance = 0, attendanceMinutes = 0, spCost = 0, minutesCost = 0 } = {}) {
  const sp = Math.max(0, Number(spBalance) || 0)
  const mins = Math.max(0, Number(attendanceMinutes) || 0)
  return {
    spBalance: Math.max(0, Math.round(sp - Math.max(0, Number(spCost) || 0))),
    attendanceMinutes: Math.max(0, Math.round(mins - Math.max(0, Number(minutesCost) || 0)))
  }
}

async function pointsForRoom(studentId, roomId) {
  const agg = await Response.aggregate([
    { $match: { studentId, roomId } },
    { $group: { _id: null, total: { $sum: '$points' } } }
  ])
  return Math.round(agg[0]?.total || 0)
}

async function totalPoints(studentId, excludeRoomId = null) {
  const match = { studentId }
  if (excludeRoomId) match.roomId = { $ne: excludeRoomId }
  const agg = await Response.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$points' } } }
  ])
  return Math.round(agg[0]?.total || 0)
}

// Minutes attended across a student's completed ledger rows, from admission to room end.
async function historicalAttendanceMinutes(studentId, rows, excludeRoomId = null) {
  const attended = rows.filter((r) =>
    ATTENDED_STATUSES.includes(r.status) &&
    r.admittedAt &&
    (!excludeRoomId || String(r.roomId) !== String(excludeRoomId))
  )
  if (!attended.length) return 0
  const rooms = await Room.find({ _id: { $in: attended.map((r) => r.roomId) } })
    .select('endedAt createdAt')
    .lean()
  const roomById = new Map(rooms.map((r) => [String(r._id), r]))
  let minutes = 0
  for (const row of attended) {
    const room = roomById.get(String(row.roomId))
    if (!room) continue
    const end = room.endedAt ? new Date(room.endedAt) : new Date(room.createdAt || Date.now())
    minutes += Math.max(0, Math.round((end.getTime() - new Date(row.admittedAt).getTime()) / 60000))
  }
  return minutes
}

// Fold completed history into the starting balance exactly once. `excludeRoomId` keeps the room
// currently being settled out of the backfill: its responses already exist, and settlement below
// will add them, so counting them here too would double-credit the room.
async function backfillStanding(standing, { excludeRoomId = null } = {}) {
  const studentId = standing.studentId
  const rowFilter = { studentId }
  if (excludeRoomId) rowFilter.roomId = { $ne: excludeRoomId }
  const rows = await AttendanceLedger.find(rowFilter).sort({ createdAt: 1 }).lean()
  const attendedRows = rows.filter((r) => ATTENDED_STATUSES.includes(r.status))
  const sessionsAttended = attendedRows.length
  const earnedSp = await totalPoints(studentId, excludeRoomId)
  const averageSp = computeAverageSp({ totalEarnedSp: earnedSp, sessionsAttended })
  const attendanceEarned = await historicalAttendanceMinutes(studentId, rows, excludeRoomId)
  const penaltySp = rows.reduce((sum, r) => sum + (Number(r.penaltySp) || 0), 0)
  const strikeCount = rows.filter((r) => r.strikeTriggered).length
  const lastStrikeRow = [...rows].reverse().find((r) => r.strikeTriggered)

  const startingSp = startingSpForStudent(studentId)
  const spBalance = Math.max(0, Math.round(startingSp + earnedSp - penaltySp - strikeCount * averageSp))
  const attendanceMinutes = Math.max(0, Math.round(
    STARTING_ATTENDANCE_MINUTES + attendanceEarned - strikeCount * ATTENDANCE_DAY_MINUTES
  ))

  standing.spBalance = spBalance
  standing.attendanceMinutes = attendanceMinutes
  standing.totalEarnedSp = earnedSp
  standing.sessionsAttended = sessionsAttended
  standing.strikes = strikeCount
  standing.lastStrikeAt = lastStrikeRow
    ? new Date(lastStrikeRow.processedAt || lastStrikeRow.createdAt || Date.now())
    : null
  standing.backfilledAt = new Date()
  standing.history = [{
    type: 'backfill',
    spDelta: spBalance - startingSp,
    minutesDelta: attendanceMinutes - STARTING_ATTENDANCE_MINUTES,
    note: rows.length
      ? `Backfilled ${rows.length} past attendance record${rows.length === 1 ? '' : 's'}`
      : 'Starting balance'
  }]
  await standing.save()
  return standing
}

export async function ensureStanding(studentId, { excludeRoomId = null } = {}) {
  let standing = await StudentStanding.findOne({ studentId })
  if (!standing) {
    const startingSp = startingSpForStudent(studentId)
    try {
      standing = await StudentStanding.create({
        studentId,
        spBalance: startingSp,
        attendanceMinutes: STARTING_ATTENDANCE_MINUTES,
        history: [{ type: 'seed', spDelta: startingSp, minutesDelta: STARTING_ATTENDANCE_MINUTES, note: 'Starting balance' }]
      })
    } catch (err) {
      // Two requests created the row concurrently; the unique index picked a winner.
      if (err?.code === 11000) standing = await StudentStanding.findOne({ studentId })
      else throw err
    }
  }
  if (standing && !standing.backfilledAt) standing = await backfillStanding(standing, { excludeRoomId })
  return standing
}

// Apply one ended room to the student's balances. Idempotency is the caller's job: it only calls
// this when the AttendanceLedger row has no standingSettledAt marker yet.
export async function settleRoomForStudent({ room, member, status, penaltySp = 0, strikeTriggered = false }) {
  const standing = await ensureStanding(member.studentId)
  const earnedSp = await pointsForRoom(member.studentId, room._id)
  const attended = ATTENDED_STATUSES.includes(status)

  const end = room.endedAt ? new Date(room.endedAt) : new Date()
  const minutesEarned = attended && member.admittedAt
    ? Math.max(0, Math.round((end.getTime() - new Date(member.admittedAt).getTime()) / 60000))
    : 0

  const nextTotalEarnedSp = standing.totalEarnedSp + earnedSp
  const nextSessionsAttended = standing.sessionsAttended + (attended ? 1 : 0)
  const averageSp = computeAverageSp({ totalEarnedSp: nextTotalEarnedSp, sessionsAttended: nextSessionsAttended })

  const afterEarn = applyDeductions({
    spBalance: standing.spBalance + earnedSp,
    attendanceMinutes: standing.attendanceMinutes + minutesEarned,
    spCost: penaltySp
  })
  const penaltyApplied = Math.min(penaltySp, standing.spBalance + earnedSp)
  const strikeSpCost = strikeTriggered ? Math.min(averageSp, afterEarn.spBalance) : 0
  const strikeMinutesCost = strikeTriggered ? Math.min(ATTENDANCE_DAY_MINUTES, afterEarn.attendanceMinutes) : 0
  const final = applyDeductions({
    spBalance: afterEarn.spBalance,
    attendanceMinutes: afterEarn.attendanceMinutes,
    spCost: strikeSpCost,
    minutesCost: strikeMinutesCost
  })

  standing.spBalance = final.spBalance
  standing.attendanceMinutes = final.attendanceMinutes
  standing.totalEarnedSp = nextTotalEarnedSp
  standing.sessionsAttended = nextSessionsAttended
  if (strikeTriggered) {
    standing.strikes += 1
    standing.lastStrikeAt = new Date()
  }

  standing.history.push({
    type: 'earned',
    roomId: room._id,
    roomName: room.name || '',
    spDelta: earnedSp,
    minutesDelta: minutesEarned,
    note: `Session earnings (${status})`
  })
  if (penaltySp > 0) {
    standing.history.push({
      type: 'late_penalty',
      roomId: room._id,
      roomName: room.name || '',
      spDelta: -penaltyApplied,
      note: `${status} penalty`
    })
  }
  if (strikeTriggered) {
    standing.history.push({
      type: 'strike',
      roomId: room._id,
      roomName: room.name || '',
      spDelta: -strikeSpCost,
      minutesDelta: -strikeMinutesCost,
      note: `${standing.strikes} consecutive late strike: average SP + ${strikeMinutesCost} min`
    })
  }
  if (standing.history.length > 50) standing.history = standing.history.slice(-50)
  await standing.save()

  return {
    spBalance: final.spBalance,
    attendanceMinutes: final.attendanceMinutes,
    averageSp,
    earnedSp,
    minutesEarned,
    strikeSpCost,
    strikeMinutesCost,
    strikes: standing.strikes
  }
}

export function standingSummary(standing) {
  const averageSp = computeAverageSp({
    totalEarnedSp: standing.totalEarnedSp,
    sessionsAttended: standing.sessionsAttended
  })
  return {
    spBalance: Math.max(0, Math.round(standing.spBalance || 0)),
    attendanceMinutes: Math.max(0, Math.round(standing.attendanceMinutes || 0)),
    attendanceTargetMinutes: ATTENDANCE_TARGET_MINUTES,
    attendanceDayMinutes: ATTENDANCE_DAY_MINUTES,
    averageSp,
    totalEarnedSp: Math.round(standing.totalEarnedSp || 0),
    sessionsAttended: standing.sessionsAttended || 0,
    strikes: standing.strikes || 0,
    lastStrikeAt: standing.lastStrikeAt || null,
    history: (standing.history || []).slice(-5).map((h) => ({
      type: h.type,
      roomName: h.roomName || '',
      spDelta: h.spDelta || 0,
      minutesDelta: h.minutesDelta || 0,
      note: h.note || '',
      at: h.at
    }))
  }
}
