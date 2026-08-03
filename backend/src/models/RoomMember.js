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
  }
})

// Index for fast lookups - one entry per student per room
roomMemberSchema.index({ roomId: 1, studentId: 1 }, { unique: true })

// Index for counting participants per room
roomMemberSchema.index({ roomId: 1 })

// Student-centric lookups (a student's rooms/memberships) filter by studentId alone;
// the unique compound index starts with roomId so it can't serve these queries.
roomMemberSchema.index({ studentId: 1 })

const RoomMember = mongoose.model('RoomMember', roomMemberSchema)

export default RoomMember