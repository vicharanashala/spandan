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
  // The transcript snippet this term was detected FROM — needed to correctly
  // define ambiguous terms/acronyms (e.g. "NSS" means something completely
  // different in a government-scheme lecture vs a Unix-systems lecture).
  // Without this, the definition step has no way to know which meaning was
  // actually intended.
  sourceText: {
    type: String,
    default: ''
  },
  // TTL field — set to now+24h on creation, updated to now+5h when room ends.
  // MongoDB's TTL index automatically deletes the document once this time passes —
  // room-specific term lists are only relevant during (and briefly after) the session.
  expiresAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// A term can only appear once per room — this is the actual dedupe enforcement,
// backed by a unique index so a race between two segments can't slip a duplicate through.
roomTermSchema.index({ roomId: 1, termLower: 1 }, { unique: true })

// TTL index — MongoDB auto-deletes documents when expiresAt is reached
roomTermSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const RoomTerm = mongoose.model('RoomTerm', roomTermSchema)

export default RoomTerm