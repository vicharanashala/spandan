import mongoose from 'mongoose'

const savedQuestionSchema = new mongoose.Schema({
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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
  timeToAnswer: {
    type: Number,
    default: 30
  },
  points: {
    type: Number,
    default: 100
  },
  tags: [{
    type: String
  }]
}, {
  timestamps: true
})

// Index for fast lookups by teacher
savedQuestionSchema.index({ teacherId: 1 })

const SavedQuestion = mongoose.model('SavedQuestion', savedQuestionSchema)

export default SavedQuestion
