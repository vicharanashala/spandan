import mongoose from 'mongoose'

const questionReportSchema = new mongoose.Schema({
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
  studentName: {
    type: String,
    required: true
  },
  reportType: {
    type: String,
    enum: [
      'Incorrect Answer',
      'Wrong Question',
      'Typographical Error',
      'Duplicate Question',
      'Ambiguous Question',
      'Missing Option',
      'Other'
    ],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Reviewed', 'Accepted', 'Rejected'],
    default: 'Pending'
  },
  aiAnalysis: {
    confidenceScore: { type: Number, default: 0 },
    suggestedCorrection: { type: String, default: '' },
    reasoning: { type: String, default: '' }
  },
  teacherDecision: {
    type: String,
    default: ''
  },
  originalQuestionSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  correctedQuestionSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
})

// Prevent duplicate reports from the same student on the same question
questionReportSchema.index({ questionId: 1, studentId: 1 }, { unique: true })

const QuestionReport = mongoose.model('QuestionReport', questionReportSchema)

export default QuestionReport
