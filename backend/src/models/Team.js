import mongoose from 'mongoose'

const teamSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Team name is required'],
    trim: true,
    maxlength: [100, 'Team name cannot exceed 100 characters']
  },
  memberIds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  ],
  totalPoints: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
})

// Fast lookup: all teams in a room
teamSchema.index({ roomId: 1 })

// Fast lookup: find the team a student belongs to in a given room
teamSchema.index({ roomId: 1, memberIds: 1 })

const Team = mongoose.model('Team', teamSchema)

export default Team
