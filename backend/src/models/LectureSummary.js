import mongoose from 'mongoose'

const lectureSummarySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    default: null
  },
  originalText: {
    type: String,
    required: true
  },
  cleanedText: {
    type: String,
    required: true
  },
  overview: {
    type: String,
    default: ''
  },
  keyTakeaways: {
    type: [String],
    default: []
  },
  provider: {
    type: String,
    enum: ['minimax', 'openai', 'anthropic', 'google', 'none'],
    default: 'none'
  },
  status: {
    type: String,
    enum: ['draft', 'ready', 'failed'],
    default: 'draft'
  },
  published: {
    type: Boolean,
    default: false,
    index: true
  },
  wordCount: {
    type: Number,
    default: 0
  },
  errorMessage: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
})

lectureSummarySchema.index({ teacherId: 1, createdAt: -1 })
lectureSummarySchema.index({ published: 1, createdAt: -1 })

const LectureSummary = mongoose.model('LectureSummary', lectureSummarySchema)

export default LectureSummary
