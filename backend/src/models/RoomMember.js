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
  // Set when the student leaves (or navigates away from) the room. The row itself is kept so a
  // rejoin restores the same admission + attendance decision instead of being re-evaluated from
  // scratch - a reconnecting student must not land back in the lobby or be marked very late.
  leftAt: { type: Date, default: null },
  // --- Waiting room state ----------------------------------------------------------------
  // 'admitted' = allowed into the live participant channel. This is ALSO the effective default
  // for older docs where the field is absent (waiting rooms were introduced later); read paths
  // treat undefined as admitted when the room does not use a waiting room.
  admissionStatus: {
    type: String,
    enum: ['waiting', 'admitted', 'rejected'],
    default: 'admitted'
  },
  waitingRequestedAt: { type: Date, default: null },
  admittedAt: { type: Date, default: null },
  admittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // --- Attendance ------------------------------------------------------------------------
  // 'pending' until the student is admitted / the room ends. At admission (or room end for
  // non-waiting rooms) this becomes on_time / late / very_late. The AttendanceLedger snapshot
  // is written when the room ends (services/attendanceLedger.js).
  attendanceStatus: {
    type: String,
    enum: ['pending', 'on_time', 'late', 'very_late', 'absent', 'excused'],
    default: 'pending'
  },
  attendanceMarkedAt: { type: Date, default: null }
})

// Index for fast lookups - one entry per student per room
roomMemberSchema.index({ roomId: 1, studentId: 1 }, { unique: true })

// Index for counting participants per room
roomMemberSchema.index({ roomId: 1 })

// Waiting-room dashboard: count/list a room's waiting students quickly.
roomMemberSchema.index({ roomId: 1, admissionStatus: 1 })

// Student-centric lookups (a student's rooms/memberships) filter by studentId alone;
// the unique compound index starts with roomId so it can't serve these queries.
roomMemberSchema.index({ studentId: 1 })

const RoomMember = mongoose.model('RoomMember', roomMemberSchema)

export default RoomMember
