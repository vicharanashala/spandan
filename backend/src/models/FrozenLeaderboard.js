import mongoose from 'mongoose'

const frozenLeaderboardSchema = new mongoose.Schema({
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
  studentName: {
    type: String,
    required: true
  },
  rank: {
    type: Number,
    required: true
  },
  correctCount: {
    type: Number,
    required: true
  },
  totalAnswered: {
    type: Number,
    required: true
  },
  accuracy: {
    type: Number,
    required: true
  },
  averageResponseTime: {
    type: Number,
    required: true
  },
  totalPoints: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
})

// Enforce uniqueness: only one entry per student per room
frozenLeaderboardSchema.index({ roomId: 1, studentId: 1 }, { unique: true })
// Index for querying by rank within a room
frozenLeaderboardSchema.index({ roomId: 1, rank: 1 })

const FrozenLeaderboard = mongoose.model('FrozenLeaderboard', frozenLeaderboardSchema)

export default FrozenLeaderboard
