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
  // --- Streak Fire ---
  // Per-room consecutive-correct-answer streak.
  // Resets to 0 on a wrong answer or on missing an approved question that
  // appears earlier in the room timeline than the next one the student answers.
  currentStreak: {
    type: Number,
    default: 0
    // No min: with -3-on-wrong-answer rule, streak can go negative.
    // Student recovers by getting consecutive correct answers back to 0.
  },
  bestStreak: {
    type: Number,
    default: 0,
    min: 0
  },
  // --- Streak Freeze ---
  // One free shield per room. When a streak would otherwise break (wrong answer
  // or missed-question sweep), the freeze consumes and preserves the streak
  // instead. Resets to 1 on each new room join.
  streakFreezes: {
    type: Number,
    default: 1,
    min: 0
  }
})

// Index for fast lookups - one entry per student per room
roomMemberSchema.index({ roomId: 1, studentId: 1 }, { unique: true })

// Index for counting participants per room
roomMemberSchema.index({ roomId: 1 })

const RoomMember = mongoose.model('RoomMember', roomMemberSchema)

export default RoomMember