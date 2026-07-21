import mongoose from 'mongoose'

const teamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Team name is required'],
    trim: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  points: {
    type: Number,
    default: 0
  },
  streakCount: {
    type: Number,
    default: 0
  },
  avatar: {
    type: String,
    default: '🧙‍♂️'
  }
}, {
  timestamps: true
})

// Index for fast room lookups
teamSchema.index({ roomId: 1 })
// Index for finding a student's team in a room
teamSchema.index({ roomId: 1, members: 1 })

const Team = mongoose.model('Team', teamSchema)

export default Team
