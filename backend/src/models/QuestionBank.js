import mongoose from 'mongoose'

const questionBankSchema = new mongoose.Schema({
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  question: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['MCQ', 'TF', 'MSQ'],
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
  points: {
    type: Number,
    default: 100
  },
  timeToAnswer: {
    type: Number,
    default: 30
  },
  category: {
    type: String,
    default: 'Uncategorized',
    trim: true
  },
  // Source tracking
  sourceRoomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    default: null
  },
  // Usage stats
  timesUsed: {
    type: Number,
    default: 0
  },
  lastUsedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
})

// Index for fast teacher lookups + category filtering
questionBankSchema.index({ teacherId: 1, createdAt: -1 })
questionBankSchema.index({ teacherId: 1, category: 1 })

const QuestionBank = mongoose.model('QuestionBank', questionBankSchema)

export default QuestionBank
