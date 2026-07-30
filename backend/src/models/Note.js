import mongoose from 'mongoose'

const noteSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  segmentIndex: {
    type: Number,
    default: null
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    default: null
  },
  targetStudentIds: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'User',
    default: []
  },
  topic: {
    type: String,
    trim: true,
    required: [true, 'Note topic is required']
  },
  title: {
    type: String,
    required: [true, 'Note title is required'],
    trim: true,
    maxlength: [200, 'Note title cannot exceed 200 characters']
  },
  transcriptSource: {
    type: String,
    enum: ['auto', 'manual'],
    required: true
  },
  sourceText: {
    type: String
  },
  content: {
    type: String,
    required: [true, 'Note content is required']
  },
  status: {
    type: String,
    enum: ['pending_review', 'released', 'discarded'],
    default: 'pending_review'
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  releasedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true })

noteSchema.index({ roomId: 1, status: 1 })
noteSchema.index({ roomId: 1, segmentIndex: 1 })

const Note = mongoose.model('Note', noteSchema)

export default Note
