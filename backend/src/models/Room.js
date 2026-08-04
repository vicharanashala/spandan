import mongoose from 'mongoose'

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    maxlength: [200, 'Room name cannot exceed 200 characters']
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Per-room co-hosts. NOT a global user role — these teachers can run sessions in
  // this specific room (launch/end questions, view analytics/transcripts, export CSV)
  // but cannot record/paste transcripts, change room settings, end the room, delete it,
  // or manage co-hosts. Each entry carries an optional expiry set by the owner.
  coHosts: [{
    _id: false,
    user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, default: null }   // null = valid until the session ends
  }],
  code: {
    type: String,
    unique: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  endedAt: {
    type: Date,
    default: null
  },
  currentQuestion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question'
  },
  settings: {
    allowLateJoin: { type: Boolean, default: true },
    showResultsImmediately: { type: Boolean, default: true },
    requireCorrectAnswer: { type: Boolean, default: false },
    // Video mode: 'normal' = live mic + transcript (default); 'video' = YouTube link, tab-audio transcript
    mode: { type: String, enum: ['normal', 'video'], default: 'normal' },
    videoUrl: { type: String, default: '' },
    // Quiz settings
    timeToAnswer: { type: Number, default: 30 },
    points: { type: Number, default: 100 },
    segmentTime: { type: Number, default: 2 },
    questionsPerSegment: { type: Number, default: 2 },
    difficulty: { type: String, default: 'medium' },
    questionProvider: { type: String, default: 'minimax' },
    questionTypeMix: {
      MCQ: { type: Number, default: 50 },
      TF: { type: Number, default: 30 },
      MSQ: { type: Number, default: 20 }
    }
  },
  // Single active invite code that any teacher can use to join as co-host.
  // Multi-use for its TTL: one code, multiple teachers. Owner can regenerate
  // at any time to invalidate the old code (new code overwrites).
  coHostInvite: {
    code:            { type: String },
    expiresAt:       { type: Date },
    // Duration (ms) the co-host relationship lasts after a teacher redeems the code.
    // null = until the session ends (room is ended by the owner).
    coHostDuration:  { type: Number, default: null }
  }
}, {
  timestamps: true
})

// Generate unique room code before saving
roomSchema.pre('save', function(next) {
  if (!this.code) {
    this.code = generateRoomCode()
  }
  next()
})

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// Static method to find by code
roomSchema.statics.findByCode = function(code) {
  return this.findOne({ code: code.toUpperCase() })
}

// Teacher dashboards and access checks query rooms by teacher; index avoids a COLLSCAN.
roomSchema.index({ teacher: 1, createdAt: -1 })
// Co-host dashboards query rooms where the user appears in coHosts[]; index avoids a COLLSCAN.
roomSchema.index({ 'coHosts.user': 1 })

const Room = mongoose.model('Room', roomSchema)

export default Room