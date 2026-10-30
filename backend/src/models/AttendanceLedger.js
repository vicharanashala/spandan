import mongoose from 'mongoose'

// One immutable-ish ledger row per student per ended room. The ledger is the source of truth for
// attendance streaks and SP (Spandan Points) penalties; it is written once when a room ends
// (services/attendanceLedger.js) and never mutated by the live session path.
const attendanceLedgerSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Attendance outcome for this room.
  //   on_time   - admitted before scheduledStartAt + graceMinutes
  //   late      - admitted inside the late window
  //   very_late - admitted after the late window
  //   absent    - joined but was never admitted / never attended
  //   excused   - teacher rejected the join request (no academic penalty)
  status: {
    type: String,
    enum: ['on_time', 'late', 'very_late', 'absent', 'excused'],
    required: true
  },
  joinedAt: { type: Date, default: null },
  admittedAt: { type: Date, default: null },
  // Whole minutes between the scheduled start and admission (0 for on-time/before start).
  lateMinutes: { type: Number, default: 0, min: 0 },
  // SP deducted for this room. Ledger penalties are informational: the leaderboard only sums
  // live Response.points, so attendance never silently rewrites quiz scores.
  penaltySp: { type: Number, default: 0, min: 0 },
  // Consecutive late/very_late run INCLUDING this row (1 = first late in the run).
  consecutiveLate: { type: Number, default: 0, min: 0 },
  // True on the 3rd, 6th, 9th... consecutive late row, where the extra strike penalty applies.
  strikeTriggered: { type: Boolean, default: false },
  roomName: { type: String, default: '' },
  roomCode: { type: String, default: '' },
  processedAt: { type: Date, default: Date.now },
  // Set after the SP/attendance balances were updated for this row, so a retry never double-charges.
  standingSettledAt: { type: Date, default: null }
}, { timestamps: true })

// Exactly one ledger row per student per room (idempotent re-processing).
attendanceLedgerSchema.index({ roomId: 1, studentId: 1 }, { unique: true })
// Student attendance history / streak lookups.
attendanceLedgerSchema.index({ studentId: 1, createdAt: -1 })
// Teacher per-room attendance views.
attendanceLedgerSchema.index({ roomId: 1, penaltySp: -1 })

const AttendanceLedger = mongoose.model('AttendanceLedger', attendanceLedgerSchema)

export default AttendanceLedger
