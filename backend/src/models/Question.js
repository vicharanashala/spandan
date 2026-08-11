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
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  // Set the moment this question is actually pushed live to students (question:start /
  // new_question). `status: 'approved'` only means it's cleared to be asked — it can sit in the
  // question bank approved-but-unlaunched for a while, and that used to leak into students'
  // "Past Questions" list as an unattempted item. Filtering on launchedAt fixes that: a question
  // only appears for students once it's actually been shown to the room.
  launchedAt: {
    type: Date,
    default: null
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
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// Covers the hot query shapes: filter by room (+status) and sort by createdAt.
// Without this every question read (poll load, stats, history) is a full COLLSCAN.
questionSchema.index({ roomId: 1, status: 1, createdAt: -1 })

const Question = mongoose.model('Question', questionSchema)

export default Question