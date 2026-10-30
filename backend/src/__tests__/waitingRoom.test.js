// Pure-policy tests for the waiting room + attendance classification. No DB: every helper under
// test here is deterministic given a room doc and an `at` timestamp, which is exactly why the
// policy lives in waitingRoom.js and is shared by the REST and Socket.IO layers.
import {
  participantsChannel,
  viewersChannel,
  getAttendanceSettings,
  computeLateMinutes,
  computeAttendanceStatus,
  attendanceForMember,
  attendanceReferenceTime,
  evaluateJoin
} from '../services/waitingRoom.js'
import { penaltyForStatus, computeStrike, streakFromRows, STRIKE_EVERY } from '../services/attendanceLedger.js'
import {
  computeAverageSp,
  applyDeductions,
  STARTING_SP,
  STARTING_ATTENDANCE_MINUTES,
  ATTENDANCE_DAY_MINUTES,
  ATTENDANCE_TARGET_MINUTES
} from '../services/studentStanding.js'

const BASE = new Date('2026-01-01T09:00:00.000Z')
const plus = (min) => new Date(BASE.getTime() + min * 60000)

const scheduledRoom = (overrides = {}) => ({
  _id: 'room1',
  settings: {
    waitingRoomEnabled: true,
    waitingRoomPolicy: 'manual',
    scheduledStartAt: BASE,
    graceMinutes: 5,
    lateWindowMinutes: 15,
    latePenaltySp: 10,
    allowLateJoin: true,
    ...overrides
  }
})

describe('channels', () => {
  it('participants use the bare code and viewers are namespaced', () => {
    expect(participantsChannel('ABC123')).toBe('ABC123')
    expect(viewersChannel('ABC123')).toBe('viewers:ABC123')
    // No room code must never accidentally collide two different rooms.
    expect(viewersChannel('')).toBe('viewers:')
  })
})

describe('getAttendanceSettings', () => {
  it('falls back to defaults when the room has no schedule/settings', () => {
    const s = getAttendanceSettings({})
    expect(s.scheduledStartAt).toBeNull()
    expect(s.graceMinutes).toBe(5)
    expect(s.lateWindowMinutes).toBe(15)
    expect(s.latePenaltySp).toBe(0)
  })

  it('clamps out-of-range values to the schema bounds', () => {
    const s = getAttendanceSettings({ settings: { graceMinutes: 999, lateWindowMinutes: -3, latePenaltySp: 99999 } })
    expect(s.graceMinutes).toBe(120)
    expect(s.lateWindowMinutes).toBe(0)
    expect(s.latePenaltySp).toBe(1000)
  })

  it('preserves fractional minutes so seconds-level values survive', () => {
    const s = getAttendanceSettings({ settings: { graceMinutes: 0.5, lateWindowMinutes: 1.5 } })
    expect(s.graceMinutes).toBe(0.5)
    expect(s.lateWindowMinutes).toBe(1.5)
  })
})

describe('attendance classification', () => {
  it('has no schedule ⇒ everyone is on time and 0 late minutes', () => {
    const room = { settings: {} }
    expect(computeAttendanceStatus({ room, at: plus(600) })).toBe('on_time')
    expect(computeLateMinutes({ room, at: plus(600) })).toBe(0)
  })

  it('classifies on_time / late / very_late against grace + late window', () => {
    const room = scheduledRoom()
    expect(computeAttendanceStatus({ room, at: plus(0) })).toBe('on_time')
    expect(computeAttendanceStatus({ room, at: plus(5) })).toBe('on_time') // exactly at grace
    expect(computeAttendanceStatus({ room, at: plus(6) })).toBe('late')
    expect(computeAttendanceStatus({ room, at: plus(20) })).toBe('late') // exactly at cutoff
    expect(computeAttendanceStatus({ room, at: plus(21) })).toBe('very_late')
  })

  it('counts late minutes only after the grace period', () => {
    const room = scheduledRoom()
    expect(computeLateMinutes({ room, at: plus(5) })).toBe(0)
    expect(computeLateMinutes({ room, at: plus(10) })).toBe(5)
    expect(computeLateMinutes({ room, at: plus(6.5) })).toBe(2) // ceil
  })

  it('sticky: a stamped outcome is never recomputed on reconnect', () => {
    const room = scheduledRoom()
    expect(attendanceForMember({ room, member: { attendanceStatus: 'on_time' }, at: plus(60) })).toBe('on_time')
    // A still-pending member is re-derived from admittedAt.
    expect(attendanceForMember({ room, member: { attendanceStatus: 'pending', admittedAt: plus(10) }, at: plus(60) })).toBe('late')
  })

  it('judges attendance on the arrival time, not the admission time', () => {
    expect(attendanceReferenceTime({ member: { joinedAt: plus(0) }, at: plus(60) })).toEqual(plus(0))
    // A waiting student is judged from when they asked to join.
    expect(attendanceReferenceTime({ member: { waitingRequestedAt: plus(3), joinedAt: plus(0) }, at: plus(60) })).toEqual(plus(3))
    expect(attendanceReferenceTime({ member: { admittedAt: plus(10) }, at: plus(60) })).toEqual(plus(10))
    expect(attendanceReferenceTime({ member: { attendanceStatus: 'on_time' }, at: plus(60) })).toEqual(plus(60))
  })

  it('a stale pending member is re-derived from arrival, not from the moment of the page load', () => {
    const room = scheduledRoom()
    expect(attendanceForMember({ room, member: { attendanceStatus: 'pending', joinedAt: plus(0) }, at: plus(60) })).toBe('on_time')
  })
})

describe('evaluateJoin', () => {
  it('waiting room disabled ⇒ always admitted (legacy behaviour)', () => {
    const room = { settings: {} }
    const e = evaluateJoin({ room, member: null })
    expect(e.state).toBe('admitted')
    expect(e.admitted).toBe(true)
    expect(e.waitingRoom).toBe(false)
  })

  it('automatic policy admits a brand-new student immediately', () => {
    const room = scheduledRoom({ waitingRoomPolicy: 'automatic' })
    const e = evaluateJoin({ room, member: null, at: plus(0) })
    expect(e.state).toBe('admitted')
    expect(e.waitingRoom).toBe(false)
  })

  it('manual policy admits an on-time student immediately', () => {
    const room = scheduledRoom()
    const e = evaluateJoin({ room, member: null, at: plus(0) })
    expect(e.state).toBe('admitted')
    expect(e.waitingRoom).toBe(false)
    expect(e.attendanceStatus).toBe('on_time')
    expect(e.notification).toMatch(/on time/i)
  })

  it('manual policy also admits a late student, with the late notice', () => {
    const room = scheduledRoom()
    const e = evaluateJoin({ room, member: null, at: plus(10) })
    expect(e.state).toBe('admitted')
    expect(e.waitingRoom).toBe(false)
    expect(e.attendanceStatus).toBe('late')
    expect(e.notification).toMatch(/joined late/i)
    expect(e.notification).toMatch(/10 SP/)
  })

  it('manual policy sends only a very-late arrival to the waiting room', () => {
    const room = scheduledRoom()
    const e = evaluateJoin({ room, member: null, at: plus(21) })
    expect(e.state).toBe('waiting')
    expect(e.admitted).toBe(false)
    expect(e.attendanceStatus).toBe('pending')
    expect(e.notification).toMatch(/approve/i)
  })

  it('automatic policy promotes an already-waiting member on the next join', () => {
    const room = scheduledRoom({ waitingRoomPolicy: 'automatic' })
    const member = { admissionStatus: 'waiting' }
    expect(evaluateJoin({ room, member, at: plus(0) }).state).toBe('admitted')
  })

  it('promoting a waiting student later still judges attendance from when they arrived', () => {
    // Student asked to join on time, the teacher only switched the room to automatic 50 minutes later.
    const room = scheduledRoom({ waitingRoomPolicy: 'automatic' })
    const member = {
      admissionStatus: 'waiting',
      attendanceStatus: 'pending',
      waitingRequestedAt: plus(1),
      joinedAt: plus(1)
    }
    expect(evaluateJoin({ room, member, at: plus(50) }).attendanceStatus).toBe('on_time')
  })

  it('a student who left and rejoins stays admitted with the original outcome', () => {
    const room = scheduledRoom() // manual policy
    const member = {
      admissionStatus: 'admitted',
      attendanceStatus: 'on_time',
      joinedAt: plus(0),
      admittedAt: plus(0),
      leftAt: plus(12) // they navigated away / disconnected and came back later
    }
    const e = evaluateJoin({ room, member, at: plus(90) })
    expect(e.state).toBe('admitted')
    expect(e.admitted).toBe(true)
    expect(e.attendanceStatus).toBe('on_time')
    expect(e.watchOnly).toBe(false)
    expect(e.lateMinutes).toBe(0)
  })

  it('manual policy keeps a very-late waiting member waiting', () => {
    const room = scheduledRoom()
    const member = {
      admissionStatus: 'waiting',
      attendanceStatus: 'pending',
      waitingRequestedAt: plus(21),
      joinedAt: plus(21)
    }
    expect(evaluateJoin({ room, member, at: plus(40) }).state).toBe('waiting')
  })

  it('manual policy promotes a waiting member who actually arrived on time', () => {
    const room = scheduledRoom()
    const member = {
      admissionStatus: 'waiting',
      attendanceStatus: 'pending',
      waitingRequestedAt: plus(0),
      joinedAt: plus(0)
    }
    const e = evaluateJoin({ room, member, at: plus(40) })
    expect(e.state).toBe('admitted')
    expect(e.attendanceStatus).toBe('on_time')
  })

  it('a legacy membership row (no admissionStatus) counts as admitted', () => {
    const room = scheduledRoom()
    const member = { admissionStatus: undefined, attended: true }
    expect(evaluateJoin({ room, member, at: plus(0) }).state).toBe('admitted')
  })

  it('a rejected member stays rejected and is excused (no penalty)', () => {
    const room = scheduledRoom()
    const e = evaluateJoin({ room, member: { admissionStatus: 'rejected' }, at: plus(0) })
    expect(e.state).toBe('rejected')
    expect(e.attendanceStatus).toBe('excused')
    expect(e.waitingRoom).toBe(true)
  })

  it('late-join hard stop rejects a NEW student past grace+late window when allowLateJoin is false', () => {
    const room = scheduledRoom({ waitingRoomPolicy: 'automatic', allowLateJoin: false })
    expect(evaluateJoin({ room, member: null, at: plus(20) }).state).toBe('admitted') // exactly at cutoff
    expect(evaluateJoin({ room, member: null, at: plus(21) }).state).toBe('rejected')  // past cutoff
  })

  it('the hard stop never kicks an already-admitted student', () => {
    const room = scheduledRoom({ waitingRoomPolicy: 'automatic', allowLateJoin: false })
    const member = { admissionStatus: 'admitted', attendanceStatus: 'late' }
    expect(evaluateJoin({ room, member, at: plus(120) }).state).toBe('admitted')
  })

  it('a very-late arrival is admitted but watch-only, and told so', () => {
    const room = scheduledRoom({ waitingRoomPolicy: 'automatic' })
    const e = evaluateJoin({ room, member: null, at: plus(21) })
    expect(e.admitted).toBe(true)
    expect(e.attendanceStatus).toBe('very_late')
    expect(e.watchOnly).toBe(true)
    expect(e.notification).toMatch(/only watch the video/i)
    expect(e.notification).toMatch(/20 SP/) // very late = 2x the 10 SP penalty
  })

  it('on-time and late arrivals are not watch-only and get their own notice', () => {
    const room = scheduledRoom({ waitingRoomPolicy: 'automatic' })
    const onTime = evaluateJoin({ room, member: null, at: plus(0) })
    expect(onTime.watchOnly).toBe(false)
    expect(onTime.notification).toMatch(/on time/i)
    const late = evaluateJoin({ room, member: null, at: plus(10) })
    expect(late.watchOnly).toBe(false)
    expect(late.notification).toMatch(/joined late/i)
    expect(late.notification).toMatch(/10 SP/)
    expect(late.notification).toMatch(/strike/i)
  })

  it('a waiting or rejected student is never flagged watch-only', () => {
    const room = scheduledRoom()
    expect(evaluateJoin({ room, member: null, at: plus(60) }).watchOnly).toBe(false)
    expect(evaluateJoin({ room, member: { admissionStatus: 'rejected' }, at: plus(60) }).watchOnly).toBe(false)
  })
})

describe('attendanceLedger pure helpers', () => {
  it('penalises late 1x, very_late 2x, absent 3x, and nothing for on_time/excused', () => {
    expect(penaltyForStatus({ status: 'on_time', latePenaltySp: 10 })).toBe(0)
    expect(penaltyForStatus({ status: 'late', latePenaltySp: 10 })).toBe(10)
    expect(penaltyForStatus({ status: 'very_late', latePenaltySp: 10 })).toBe(20)
    expect(penaltyForStatus({ status: 'absent', latePenaltySp: 10 })).toBe(30)
    expect(penaltyForStatus({ status: 'excused', latePenaltySp: 10 })).toBe(0)
    // Negative/garbage penalty is treated as 0.
    expect(penaltyForStatus({ status: 'late', latePenaltySp: -5 })).toBe(0)
  })

  it('resets the late run on a non-late outcome', () => {
    expect(computeStrike({ priorLateRun: 2, status: 'on_time' })).toEqual({ consecutiveLate: 0, strikeTriggered: false })
    expect(computeStrike({ priorLateRun: 2, status: 'excused' })).toEqual({ consecutiveLate: 0, strikeTriggered: false })
  })

  it(`triggers a strike on every ${STRIKE_EVERY}rd consecutive late arrival`, () => {
    expect(computeStrike({ priorLateRun: 0, status: 'late' })).toEqual({ consecutiveLate: 1, strikeTriggered: false })
    expect(computeStrike({ priorLateRun: 1, status: 'very_late' })).toEqual({ consecutiveLate: 2, strikeTriggered: false })
    expect(computeStrike({ priorLateRun: 2, status: 'late' })).toEqual({ consecutiveLate: 3, strikeTriggered: true })
    expect(computeStrike({ priorLateRun: 5, status: 'late' })).toEqual({ consecutiveLate: 6, strikeTriggered: true })
  })

  it('counts the live late run from the newest rows, including in-progress rooms', () => {
    const rows = [
      { status: 'late', live: true },          // current room, newest
      { status: 'very_late' },                 // completed room
      { status: 'late' },                      // completed room
      { status: 'on_time' }                    // stops the run
    ]
    expect(streakFromRows(rows)).toBe(3)
    expect(streakFromRows([{ status: 'on_time', live: true }, ...rows])).toBe(0)
    expect(streakFromRows([])).toBe(0)
  })
})

describe('student standing (SP + attendance balances)', () => {
  it('starts students above zero so the dashboard shows real numbers', () => {
    expect(STARTING_SP).toBeGreaterThan(0)
    expect(STARTING_ATTENDANCE_MINUTES).toBeGreaterThan(0)
    expect(ATTENDANCE_TARGET_MINUTES).toBeGreaterThanOrEqual(3600)
    expect(ATTENDANCE_DAY_MINUTES).toBe(60)
  })

  it('averages earned SP over attended sessions', () => {
    expect(computeAverageSp({ totalEarnedSp: 300, sessionsAttended: 3 })).toBe(100)
    expect(computeAverageSp({ totalEarnedSp: 250, sessionsAttended: 2 })).toBe(125)
    // No sessions (or garbage) means nothing to deduct.
    expect(computeAverageSp({ totalEarnedSp: 500, sessionsAttended: 0 })).toBe(0)
    expect(computeAverageSp({})).toBe(0)
  })

  it('deducts SP and minutes and never crosses zero', () => {
    expect(applyDeductions({ spBalance: 1000, attendanceMinutes: 1800, spCost: 100, minutesCost: 60 }))
      .toEqual({ spBalance: 900, attendanceMinutes: 1740 })
    expect(applyDeductions({ spBalance: 40, attendanceMinutes: 20, spCost: 100, minutesCost: 60 }))
      .toEqual({ spBalance: 0, attendanceMinutes: 0 })
    expect(applyDeductions({ spBalance: 100, attendanceMinutes: 100, spCost: -50, minutesCost: -50 }))
      .toEqual({ spBalance: 100, attendanceMinutes: 100 })
  })

  it('models a full 3-late strike: normal penalties plus average SP and 60 minutes', () => {
    // 1000 SP / 1800 min start, 300 SP earned over 3 sessions => average 100 SP.
    const earnedSp = 300
    const sessions = 3
    const averageSp = computeAverageSp({ totalEarnedSp: earnedSp, sessionsAttended: sessions })
    const base = { spBalance: STARTING_SP + earnedSp, attendanceMinutes: STARTING_ATTENDANCE_MINUTES }

    // Rows 1 and 2: ordinary late penalties of 10 SP each.
    const afterTwoLates = applyDeductions({ ...base, spCost: penaltyForStatus({ status: 'late', latePenaltySp: 10 }) * 2 })
    // Row 3: the normal penalty AND the strike (average SP + one attendance day).
    const afterStrike = applyDeductions({
      ...afterTwoLates,
      spCost: penaltyForStatus({ status: 'late', latePenaltySp: 10 }) + averageSp,
      minutesCost: ATTENDANCE_DAY_MINUTES
    })

    expect(afterStrike.spBalance).toBe(STARTING_SP + earnedSp - 30 - 100)
    expect(afterStrike.attendanceMinutes).toBe(STARTING_ATTENDANCE_MINUTES - 60)
  })
})
