import mongoose from 'mongoose'

const questionSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  type: {
    type: String,
    enum: ['MCQ', 'TF', 'MSQ', 'RANKING', 'MATRIX', 'CATEGORIZATION'],
    required: true
  },
  imageUrl: {
    type: String,
    default: ''
  },
  question: {
    type: String,
    required: true
  },
  options: [{
    text: { type: String, required: true },
    isCorrect: { type: Boolean, default: false },
    imageUrl: { type: String, default: '' },
    categoryId: { type: Number }, // Index of the category this option belongs to (for CATEGORIZATION)
    nextSubQuestionId: { type: mongoose.Schema.Types.ObjectId } // For conditional routing to a sub-question
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
  timeToAnswer: {
    type: Number,
    default: 30
  },
  correctPoints: {
    type: Number,
    default: 10
  },
  incorrectPoints: {
    type: Number,
    default: 0
  },
  matrixRows: [{ type: String }],
  matrixColumns: [{ type: String }],
  categories: [{ type: String }],
  subQuestions: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    type: { type: String, enum: ['MCQ', 'TF', 'MSQ'] },
    question: { type: String },
    options: [{
      text: { type: String },
      isCorrect: { type: Boolean, default: false }
    }]
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

const Question = mongoose.model('Question', questionSchema)

export default Question