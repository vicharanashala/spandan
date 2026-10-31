import mongoose from 'mongoose'

const doubtSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: [true, 'Doubt text is required'],
    trim: true,
    maxlength: [500, 'Doubt cannot exceed 500 characters']
  },
  upvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  upvoteCount: {
    type: Number,
    default: 0
  },
  isResolved: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// Index for fast query of room doubts: most upvoted first, oldest first on ties
doubtSchema.index({ roomId: 1, upvoteCount: -1, createdAt: 1 })

const Doubt = mongoose.model('Doubt', doubtSchema)

export default Doubt
