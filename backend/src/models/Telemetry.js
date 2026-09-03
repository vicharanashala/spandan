import mongoose from 'mongoose'

const telemetrySchema = new mongoose.Schema({
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
  tabSwitches: {
    type: Number,
    default: 0
  },
  fullscreenExits: {
    type: Number,
    default: 0
  },
  blurs: {
    type: Number,
    default: 0
  },
  isFullscreenUnsupported: {
    type: Boolean,
    default: false
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
})

// Ensures fast updates and guarantees unique records per student, question, and room
telemetrySchema.index({ roomId: 1, questionId: 1, studentId: 1 }, { unique: true })

// Auto-expire unsubmitted telemetry documents after 2 hours
telemetrySchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7200 })

const Telemetry = mongoose.model('Telemetry', telemetrySchema)

export default Telemetry
