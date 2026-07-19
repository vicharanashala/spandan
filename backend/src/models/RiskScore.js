import mongoose from 'mongoose'

// One RiskScore document per (student, session/room).
// Re-computed on every answer or skip event. Powers the live widget
// and the post-session dashboards.
const historyEntrySchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  answeredCorrectly: { type: Boolean, default: false },
  responseTimeMs: { type: Number, default: null },
  skipped: { type: Boolean, default: false },
  scoreAfter: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
}, { _id: false })

const riskScoreSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  // derived from the session start (when the room was created or first question was sent)
  date: {
    type: Date,
    required: true,
    index: true
  },
  // 0-100. 100 = safe/fully engaged, 0 = highest risk.
  currentScore: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  },
  // derived on every update. Thresholds live in riskScoreService.js.
  zone: {
    type: String,
    enum: ['safe', 'warning', 'risk'],
    default: 'safe'
  },
  // how many consecutive correct answers the student needs to climb
  // back to the safe threshold from their current score
  correctStreakNeeded: {
    type: Number,
    default: 0
  },
  history: [historyEntrySchema],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

// one doc per (student, room)
riskScoreSchema.index({ studentId: 1, roomId: 1 }, { unique: true })

const RiskScore = mongoose.model('RiskScore', riskScoreSchema)
export default RiskScore
