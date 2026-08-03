import mongoose from 'mongoose'

// Tracks which terms have already been shown in a specific room's sidebar —
// separate from the global Term cache, because dedupe needs to happen PER ROOM
// (a term shouldn't repeat in the same lecture's sidebar) even though its
// definition is shared globally across all rooms.
const roomTermSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  term: {
    type: String,
    required: true
  },
  termLower: {
    type: String,
    required: true
  },
  segmentIndex: {
    type: Number,
    default: -1
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// A term can only appear once per room — this is the actual dedupe enforcement,
// backed by a unique index so a race between two segments can't slip a duplicate through.
roomTermSchema.index({ roomId: 1, termLower: 1 }, { unique: true })

const RoomTerm = mongoose.model('RoomTerm', roomTermSchema)

export default RoomTerm