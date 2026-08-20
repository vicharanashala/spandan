import mongoose from 'mongoose'

const learningReportSchema = new mongoose.Schema({
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

  metrics: {
    totalQuestions: {
      type: Number,
      default: 0
    },
    attempted: {
      type: Number,
      default: 0
    },
    correct: {
      type: Number,
      default: 0
    },
    accuracy: {
      type: Number,
      default: 0
    },
    totalPoints: {
      type: Number,
      default: 0
    },
    averageResponseTime: {
      type: Number,
      default: 0
    }
  },

  aiAnalysis: {
    summary: {
      type: String,
      default: ''
    },
    strengths: {
      type: [String],
      default: []
    },
    weaknesses: {
      type: [String],
      default: []
    },
    recommendations: {
      type: [String],
      default: []
    }
  },

  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },

  error: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
})

// One report per student per session.
learningReportSchema.index(
  { roomId: 1, studentId: 1 },
  { unique: true }
)

// Fast lookup of all reports for a session.
learningReportSchema.index({ roomId: 1, createdAt: -1 })

const LearningReport = mongoose.model('LearningReport', learningReportSchema)

export default LearningReport