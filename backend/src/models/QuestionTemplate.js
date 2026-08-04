import mongoose from 'mongoose'

const questionTemplateSchema = new mongoose.Schema({
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
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
    text: String,
    isCorrect: Boolean
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
    default: 10
  },
  tags: [{
    type: String,
    trim: true
  }],
  usageCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
})

questionTemplateSchema.index({ teacherId: 1, name: 1 })
questionTemplateSchema.index({ teacherId: 1, tags: 1 })

const QuestionTemplate = mongoose.model('QuestionTemplate', questionTemplateSchema)

export default QuestionTemplate
