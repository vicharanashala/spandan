import mongoose from 'mongoose'

const transcriptSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  segmentIndex: {
    type: Number,
    required: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },
  wordCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// Index for efficient querying by room and segment
transcriptSchema.index({ roomId: 1, segmentIndex: 1 })

const Transcript = mongoose.model('Transcript', transcriptSchema)

export default Transcript