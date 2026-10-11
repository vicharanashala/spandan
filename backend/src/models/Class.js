import mongoose from 'mongoose'

function generateClassCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

const classSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Class name is required'],
    trim: true,
    maxlength: [200, 'Class name cannot exceed 200 characters']
  },
  code: {
    type: String,
    unique: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    allowLateJoin: { type: Boolean, default: true },
    showResultsImmediately: { type: Boolean, default: true },
    mode: { type: String, enum: ['normal', 'video'], default: 'normal' },
    timeToAnswer: { type: Number, default: 30 },
    points: { type: Number, default: 100 },
    segmentTime: { type: Number, default: 2 },
    questionsPerSegment: { type: Number, default: 2 },
    difficulty: { type: String, default: 'medium' },
    questionProvider: { type: String, default: 'minimax' }
  }
}, {
  timestamps: true
})

// Generate unique class code before saving
classSchema.pre('save', function(next) {
  if (!this.code) {
    this.code = generateClassCode()
  }
  next()
})

// Static method to find by code (case-insensitive)
classSchema.statics.findByCode = function(code) {
  if (!code) return null
  return this.findOne({ code: code.toUpperCase() })
}

// Indexes for query performance
classSchema.index({ teacher: 1, createdAt: -1 })
classSchema.index({ members: 1 })

const Class = mongoose.model('Class', classSchema)

export default Class
