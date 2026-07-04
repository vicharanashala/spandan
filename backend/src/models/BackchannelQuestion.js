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
  originalText: {
    type: String,
    required: true,
    trim: true,
    default: function() {
      return this.text
    },
    maxlength: [500, 'Original question cannot exceed 500 characters']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  moderationStatus: {
    type: String,
    enum: ['approved', 'blocked', 'flagged'],
    default: 'approved',
    index: true
  },
  moderationReasons: [{
    type: String,
    trim: true
  }],
  moderationScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 1
  },
  isHidden: {
    type: Boolean,
    default: false,
    index: true
  },
  upvotedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  reportedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['open', 'resolved', 'deleted'],
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
  },
  flaggedAt: {
    type: Date,
    default: null
  },
  flaggedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
})

backchannelQuestionSchema.index({ roomId: 1, status: 1, createdAt: -1 })
backchannelQuestionSchema.index({ roomId: 1, moderationStatus: 1, isHidden: 1 })

backchannelQuestionSchema.pre('validate', function(next) {
  if (!this.originalText && this.text) {
    this.originalText = this.text
  }
  next()
})

backchannelQuestionSchema.methods.toClient = function(userId, options = {}) {
  const upvoterIds = (this.upvotedBy || []).map(id => id.toString())
  const reporterIds = (this.reportedBy || []).map(id => id.toString())
  const currentUserId = userId?.toString()
  const includeAudit = options.includeAudit === true

  const payload = {
    _id: this._id,
    roomId: this.roomId,
    text: this.text,
    status: this.status,
    moderationStatus: this.moderationStatus,
    moderationReasons: this.moderationReasons || [],
    isHidden: this.isHidden,
    upvotes: upvoterIds.length,
    reports: reporterIds.length,
    hasUpvoted: currentUserId ? upvoterIds.includes(currentUserId) : false,
    hasReported: currentUserId ? reporterIds.includes(currentUserId) : false,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    resolvedAt: this.resolvedAt
  }

  if (includeAudit) {
    payload.originalText = this.originalText
    payload.createdBy = this.createdBy
    payload.moderationScore = this.moderationScore
    payload.flaggedAt = this.flaggedAt
    payload.deletedAt = this.deletedAt
  }

  return payload
}

const BackchannelQuestion = mongoose.model('BackchannelQuestion', backchannelQuestionSchema)

export default BackchannelQuestion
