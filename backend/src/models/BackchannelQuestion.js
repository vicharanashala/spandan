import mongoose from 'mongoose'

const backchannelQuestionSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: [500, 'Question cannot exceed 500 characters']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  upvotedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['open', 'resolved'],
    default: 'open',
    index: true
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
})

backchannelQuestionSchema.index({ roomId: 1, status: 1, createdAt: -1 })

backchannelQuestionSchema.methods.toClient = function(userId) {
  const upvoterIds = (this.upvotedBy || []).map(id => id.toString())
  const currentUserId = userId?.toString()

  return {
    _id: this._id,
    roomId: this.roomId,
    text: this.text,
    status: this.status,
    upvotes: upvoterIds.length,
    hasUpvoted: currentUserId ? upvoterIds.includes(currentUserId) : false,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    resolvedAt: this.resolvedAt
  }
}

const BackchannelQuestion = mongoose.model('BackchannelQuestion', backchannelQuestionSchema)

export default BackchannelQuestion
