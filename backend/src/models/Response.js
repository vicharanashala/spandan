import mongoose from 'mongoose'

const responseSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  selectedOption: {
    type: Number,
    required: false // Now optional since other types might not use this
  },
  selectedOptions: {
    type: [Number], // Array for MSQ - stores all selected option indices
    default: []
  },
  rankedOptions: {
    type: [Number], // For RANKING type: array of option indices in ranked order
    default: []
  },
  matrixAnswers: {
    type: Map,
    of: Number, // key: rowIndex (as string), value: columnIndex
    default: {}
  },
  categoryAnswers: {
    type: Map,
    of: Number, // key: optionIndex (as string), value: categoryIndex
    default: {}
  },
  subResponses: [{
    subQuestionId: { type: mongoose.Schema.Types.ObjectId },
    selectedOption: { type: Number },
    isCorrect: { type: Boolean, default: false }
  }],
  isCorrect: {
    type: Boolean,
    default: false
  },
  responseTime: {
    type: Number,
    default: 0
  },
  points: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// Index for fast lookups
responseSchema.index({ roomId: 1, questionId: 1, studentId: 1 }, { unique: true })
// Index for leaderboard queries
responseSchema.index({ roomId: 1, studentId: 1, points: -1 })

const Response = mongoose.model('Response', responseSchema)

export default Response
