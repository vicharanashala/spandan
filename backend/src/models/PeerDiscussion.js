import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true },
  text: { type: String, required: true, maxlength: 1000 },
  sentAt: { type: Date, default: Date.now }
}, { _id: false })

const peerDiscussionSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },

  // requester = the student who got the question wrong and initiated the discussion.
  // partner = the student who answered correctly and was invited to discuss.
  requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requesterName: { type: String, required: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  partnerName: { type: String, required: true },

  status: {
    type: String,
    enum: ['pending', 'active', 'declined', 'expired', 'ended'],
    default: 'pending'
  },

  messages: { type: [messageSchema], default: [] },

  requestedAt: { type: Date, default: Date.now },
  respondedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },

  // Housekeeping: auto-purge discussion records (including chat text) a week after creation
  // rather than keeping them indefinitely — this is meant to be a short-lived study aid, not a
  // permanent transcript.
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  }
})

peerDiscussionSchema.index({ roomId: 1, questionId: 1, requesterId: 1, status: 1 })
peerDiscussionSchema.index({ roomId: 1, status: 1 })
peerDiscussionSchema.index({ partnerId: 1, status: 1 })
peerDiscussionSchema.index({ requesterId: 1, status: 1 })
peerDiscussionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const PeerDiscussion = mongoose.model('PeerDiscussion', peerDiscussionSchema)

export default PeerDiscussion
