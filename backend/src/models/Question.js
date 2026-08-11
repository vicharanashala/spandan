import mongoose from 'mongoose'

const questionSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  type: {
    type: String,
    enum: ['MCQ', 'TF', 'MSQ'],
    required: true
  },
  question: {
    type: String,
    required: true
  },
  options: [{
    text: { type: String, required: true },
    isCorrect: { type: Boolean, default: false }
  }],
  explanation: {
    type: String,
    default: ''
  },
  segmentIndex: {
    type: Number,
    default: 0
  },
  sessionIndex: {
    type: Number,
    default: 1
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  timeToAnswer: {
    type: Number,
    default: 30
  },
  points: {
    type: Number,
    default: 10
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  predictedAccuracy: {
    type: Number,
    min: 0,
    max: 100
  },
  actualAccuracy: {
    type: Number,
    min: 0,
    max: 100
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Phase 3 (response-window enforcement): once this poll is superseded by the next launch, responses
  // are accepted only until closeAt (= supersede time + POLL_RESPONSE_GRACE_MS). It is null while the
  // poll is live/current or has never been superseded. Stops a bot back-filling answers to polls that
  // have already moved on. Set/cleared by setLiveQuestion; enforced by POST /responses.
  closeAt: {
    type: Date,
    default: null
  }
})

// Covers the hot query shapes: filter by room (+status) and sort by createdAt.
// Without this every question read (poll load, stats, history) is a full COLLSCAN.
questionSchema.index({ roomId: 1, status: 1, createdAt: -1 })

const Question = mongoose.model('Question', questionSchema)

export default Question