import mongoose from 'mongoose'

const bankOptionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  isCorrect: { type: Boolean, default: false }
}, { _id: false })

const questionBankSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
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
  options: [bankOptionSchema],
  correctAnswer: {
    type: String,
    default: ''
  },
  explanation: {
    type: String,
    default: ''
  },
  topic: {
    type: String,
    default: ''
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  sourceRoom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    default: null
  },
  isArchived: {
    type: Boolean,
    default: false
  }
}, { timestamps: true })

questionBankSchema.index({ owner: 1, isArchived: 1, createdAt: -1 })
questionBankSchema.index({ owner: 1, topic: 1 })

export default mongoose.model('QuestionBank', questionBankSchema)