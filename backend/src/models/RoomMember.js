import mongoose from 'mongoose'

const roomMemberSchema = new mongoose.Schema({
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
  joinedAt: {
    type: Date,
    default: Date.now
  },
  // Waiting-room state. 'admitted' is the default so memberships created before the waiting room
  // existed (and rooms with the feature switched off) keep counting as live participants.
  status: {
    type: String,
    enum: ['waiting', 'admitted', 'rejected'],
    default: 'admitted'
  },
  // Whether the student joined inside the session's grace window (snapshot at join time).
  onTime: {
    type: Boolean,
    default: true
  },
  admittedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },

  // ── Attendance (drives the end-of-session points deduction) ───────────────────────────────────
  // Every stretch of time the student was actually inside the live room. A reload / rejoin appends a
  // new interval instead of resetting anything, so a leave-and-rejoin gap counts as missed time.
  presence: [{
    start: { type: Date, required: true },
    end: { type: Date, default: null }, // null = the interval is still open (student present)
    // Why the interval was closed: 'tab-hidden', 'window-blur', 'frozen', 'leave' or 'disconnect'.
    // Shown in the teacher's per-lecture history; null when the interval is open or was closed by an
    // older server that did not record a reason.
    endedReason: { type: String, default: null }
  }],
  // null = the student is currently present (or has never left). Set when their last live socket
  // leaves/disconnects, cleared when they (re)join. Used for the live participant count.
  leftAt: { type: Date, default: null },
  lastSeenAt: { type: Date, default: null },

  // Teacher override: a valid, documented reason to be absent. Finalization then applies a 0% penalty.
  attendanceExcused: { type: Boolean, default: false },

  // Attendance snapshot written once at room end (see services/attendanceService.js). Second runs are
  // no-ops unless forced (e.g. the teacher excuses the student afterwards).
  attendanceFinalizedAt: { type: Date, default: null },
  sessionSeconds: { type: Number, default: null },
  presentSeconds: { type: Number, default: null },
  // Time written off by the cumulative absence allowance (never more than the allowance or the
  // actual time away after the first join, including a final departure with no return).
  // `presentSeconds + forgivenSeconds + missedSeconds == sessionSeconds` (up to rounding).
  forgivenSeconds: { type: Number, default: null },
  missedSeconds: { type: Number, default: null },
  penaltyPercent: { type: Number, default: null },
  rawPoints: { type: Number, default: null },        // points earned before the attendance deduction
  adjustedPoints: { type: Number, default: null }    // points after the attendance deduction
})

// Index for fast lookups - one entry per student per room
roomMemberSchema.index({ roomId: 1, studentId: 1 }, { unique: true })
roomMemberSchema.index({ roomId: 1, status: 1, joinedAt: 1 })

// Index for counting participants per room
roomMemberSchema.index({ roomId: 1 })

// Student-centric lookups (a student's rooms/memberships) filter by studentId alone;
// the unique compound index starts with roomId so it can't serve these queries.
roomMemberSchema.index({ studentId: 1 })

const RoomMember = mongoose.model('RoomMember', roomMemberSchema)

export default RoomMember