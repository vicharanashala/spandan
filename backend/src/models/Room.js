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
  code: {
    type: String,
    unique: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  endedAt: {
    type: Date,
    default: null
  },
  // When the live session actually started (room creation == session start in this app). Used by the
  // waiting room to decide which students joined inside the grace window ("on time") and which are
  // late. Older rooms do not have it; callers fall back to createdAt.
  sessionStartedAt: {
    type: Date,
    default: Date.now
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
    },
    // Waiting room. When enabled, students who join are held outside the live room until the teacher
    // admits them. 'automatic' releases every on-time student in join order on the teacher's first
    // admit (then switches to 'manual'); 'manual' makes the teacher admit/reject each student.
    // graceSeconds is the on-time window measured from the scheduled class time (when set) rather
    // than from the moment the teacher opened the room, so opening the room early cannot mark
    // students who arrive at the scheduled time as late.
    waitingRoom: {
      enabled: { type: Boolean, default: true },
      mode: { type: String, enum: ['automatic', 'manual'], default: 'automatic' },
      graceSeconds: { type: Number, default: 120, min: 0, max: 3600 },
      scheduledAt: { type: Date, default: null },
      // Cumulative time a student may be disconnected during the session without it counting as
      // absence. All reconnect gaps share this one budget (so repeated short drops cannot farm it).
      // A 60-second floor is always applied, even when the teacher sets 0.
      reconnectAllowanceSeconds: { type: Number, default: 60, min: 0, max: 3600 }
    },
    // Anonymous leaderboard. When ON, students see only an anonymised top-N board (every row
    // 'Anonymous #<rank>', no self-highlight); the teacher sees real names for the BOTTOM
    // anonymityPercent% of the class (the lowest scorers) and 'Anonymous #<rank>' for everyone else.
    // OFF = names shown as normal (default).
    anonymousLeaderboard: { type: Boolean, default: false },
    anonymityPercent: { type: Number, default: 20, min: 0, max: 100 },
    // Only meaningful while anonymousLeaderboard is ON. When the teacher turns this ON, students ALSO
    // see the real names of the bottom anonymityPercent% (the same lowest-scorer slice the teacher
    // sees) appended to their masked top-N board. OFF (default) = students see only the masked top-N.
    revealBottomToStudents: { type: Boolean, default: false },
    // Attention tracking. The student's browser reports when the Spandan window is visible AND
    // focused; losing either for `graceSeconds` closes the presence interval, so the time counts
    // against the same absence budget and poll answers are rejected while away. `enabled` defaults
    // to true; older rooms without this object are treated as enabled. Teachers can turn it off.
    attention: {
      enabled: { type: Boolean, default: true },
      graceSeconds: { type: Number, default: 7, min: 0, max: 300 }
    }
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
roomSchema.index({ classId: 1, createdAt: -1 })

const Room = mongoose.model('Room', roomSchema)

export default Room