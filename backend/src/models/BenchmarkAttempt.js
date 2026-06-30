import mongoose from 'mongoose'

const benchmarkResponseSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  selectedOptions: {
    type: [Number],
    default: []
  },
  responseTime: {
    type: Number,
    required: true
  },
  isCorrect: {
    type: Boolean,
    required: true
  },
  points: {
    type: Number,
    default: 0
  }
}, { _id: false })

const benchmarkAttemptSchema = new mongoose.Schema({
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
  responses: [benchmarkResponseSchema],
  accuracy: {
    type: Number,
    default: 0
  },
  averageResponseTime: {
    type: Number,
    default: 0
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date,
    default: null
  },
  timerState: {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null
    },
    startTime: {
      type: Date,
      default: null
    }
  }
}, {
  timestamps: true
})

// Enforce unique attempt per user per room
benchmarkAttemptSchema.index({ roomId: 1, studentId: 1 }, { unique: true })

const BenchmarkAttempt = mongoose.model('BenchmarkAttempt', benchmarkAttemptSchema)

export default BenchmarkAttempt
