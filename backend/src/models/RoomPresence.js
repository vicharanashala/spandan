import mongoose from 'mongoose'

// Append-only log of connection intervals, separate from RoomMember (which is a live
// "who is currently connected" roster and deletes rows on leave). A student can have
// several intervals per room (reconnects, multiple tabs/devices) — this is what lets
// presence duration be computed after the room has ended. See services/presence.js.
const roomPresenceSchema = new mongoose.Schema({
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
    required: true
  },
  leftAt: {
    type: Date,
    default: null
  }
})

// A student can have multiple intervals in one room — not unique.
roomPresenceSchema.index({ roomId: 1, studentId: 1 })
// Finds this room's still-open intervals (e.g. to close them out).
roomPresenceSchema.index({ roomId: 1, leftAt: 1 })

const RoomPresence = mongoose.model('RoomPresence', roomPresenceSchema)

export default RoomPresence
