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
  teamId: {
    type: Number,
    default: null
  },
  teamName: {
    type: String,
    default: null,
    trim: true
  }
})

// Index for fast lookups - one entry per student per room
roomMemberSchema.index({ roomId: 1, studentId: 1 }, { unique: true })

// Index for counting participants per room
roomMemberSchema.index({ roomId: 1 })
roomMemberSchema.index({ roomId: 1, teamId: 1 })

const RoomMember = mongoose.model('RoomMember', roomMemberSchema)

export default RoomMember
