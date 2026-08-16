import mongoose from 'mongoose'

// A "doubt" is a question a student raises to the teacher during a live room —
// separate from the poll/quiz Question model. Students can post one, upvote
// others' (bumping ones a lot of the class is stuck on), and the teacher can
// mark them resolved. Kept intentionally small: this is a live-session queue,
// not a permanent knowledge base.
const doubtSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Students can choose to post anonymously; the author is still stored (for
  // moderation/authorization — only the author or the teacher may resolve/delete)
  // but never sent to other students when isAnonymous is true.
  isAnonymous: {
    type: Boolean,
    default: false
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
  status: {
    type: String,
    enum: ['open', 'resolved'],
    default: 'open'
  },
  resolvedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
})

// The teacher's live queue is fetched by room, sorted by open-first / most-upvoted.
doubtSchema.index({ roomId: 1, status: 1, createdAt: -1 })

const Doubt = mongoose.model('Doubt', doubtSchema)

export default Doubt
