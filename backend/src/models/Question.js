import mongoose from 'mongoose'

const questionSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  type: {
    type: String,
    enum: ['MCQ', 'TF', 'MSQ', 'SHORT'],
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
  },
  
  // Precomputed Question-Level Aggregates
  stats: {
    answerDistribution: { type: Map, of: Number, default: {} }, // e.g., { "Option1": 15, "Option2": 2 }
    averageTTAMs: { type: Number, default: 0 },
    correctPercentage: { type: Number, default: 0 },
    tabSwitchesDuringQuestion: { type: Number, default: 0 }
  }
})

questionSchema.index({ roomId: 1 })

const Question = mongoose.model('Question', questionSchema)

export default Question