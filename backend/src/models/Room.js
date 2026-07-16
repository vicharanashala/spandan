import mongoose from 'mongoose'
import crypto from 'crypto'

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    maxlength: [200, 'Room name cannot exceed 200 characters']
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  code: {
    type: String,
    unique: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  endedAt: {
    type: Date,
    default: null
  },
  currentQuestion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question'
  },
  settings: {
    allowLateJoin: { type: Boolean, default: true },
    showResultsImmediately: { type: Boolean, default: true },
    requireCorrectAnswer: { type: Boolean, default: false },
    // Quiz settings
    timeToAnswer: { type: Number, default: 30 },
    points: { type: Number, default: 100 },
    segmentTime: { type: Number, default: 2 },
    questionsPerSegment: { type: Number, default: 2 },
    difficulty: { type: String, default: 'medium' },
    questionProvider: { type: String, default: 'minimax' },
    questionTypeMix: {
      MCQ: { type: Number, default: 50 },
      TF: { type: Number, default: 30 },
      MSQ: { type: Number, default: 20 }
    },
    notificationSound: { type: String, default: 'beep' },
    customSoundUrl: { type: String, default: '' }
  }
}, {
  timestamps: true
})

// Generate unique room code before saving
roomSchema.pre('save', function(next) {
  if (!this.code) {
    this.code = generateRoomCode()
  }
  next()
})

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(6)
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(bytes[i] % chars.length)
  }
  return code
}

// Static method to find by code
roomSchema.statics.findByCode = function(code) {
  return this.findOne({ code: code.toUpperCase() })
}

// Teacher dashboards and access checks query rooms by teacher; index avoids a COLLSCAN.
roomSchema.index({ teacher: 1, createdAt: -1 })

const Room = mongoose.model('Room', roomSchema)

export default Room