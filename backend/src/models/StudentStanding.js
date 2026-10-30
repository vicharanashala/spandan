import mongoose from 'mongoose'

// Persisted, spendable balances for one student. Quiz points (Response.points) are the source of
// what a student earns per session; attendance minutes come from how long they were in the room.
// The attendance ledger applies the deltas when a room ends (services/attendanceLedger.js) so the
// same room is never settled twice.
const standingEntrySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['seed', 'backfill', 'earned', 'late_penalty', 'strike'],
    required: true
  },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
  roomName: { type: String, default: '' },
  spDelta: { type: Number, default: 0 },
  minutesDelta: { type: Number, default: 0 },
  note: { type: String, default: '' },
  at: { type: Date, default: Date.now }
}, { _id: false })

const studentStandingSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // Current spendable Spandan Points. Clamped at 0; a penalty larger than the balance simply
  // empties it instead of going negative.
  spBalance: { type: Number, default: 0, min: 0 },
  // Current attendance minutes. The dashboard compares this against a 3600-minute baseline but
  // the value is allowed to grow past it.
  attendanceMinutes: { type: Number, default: 0, min: 0 },
  // Lifetime earnings, kept so "average SP per attended session" survives balance deductions.
  totalEarnedSp: { type: Number, default: 0, min: 0 },
  sessionsAttended: { type: Number, default: 0, min: 0 },
  // Number of 3-in-a-row strikes applied so far (and when the last one landed).
  strikes: { type: Number, default: 0, min: 0 },
  lastStrikeAt: { type: Date, default: null },
  // One-time backfill marker so history is folded into the starting balance exactly once.
  backfilledAt: { type: Date, default: null },
  history: { type: [standingEntrySchema], default: [] }
}, { timestamps: true })

const StudentStanding = mongoose.model('StudentStanding', studentStandingSchema)

export default StudentStanding
