import mongoose from 'mongoose'

const chatMessageSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderRole: {
    type: String,
    enum: ['teacher', 'cohost', 'student'],
    required: true
  },
  senderName: {
    type: String,
    required: true,
    trim: true,
    maxlength: [100, 'Sender name cannot exceed 100 characters']
  },
  text: {
    type: String,
    trim: true,
    default: '',
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  attachment: {
    url: { type: String, default: null },
    fileType: { type: String, enum: ['image', 'pdf', 'file', null], default: null },
    fileName: { type: String, default: null },
    storageName: { type: String, default: null },
    fileSize: { type: Number, default: null }
  },
  replyTo: {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
    senderName: { type: String, default: null },
    senderRole: { type: String, default: null },
    text: { type: String, default: null },
    hasAttachment: { type: Boolean, default: false }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// Index for fast room chat history queries
chatMessageSchema.index({ roomId: 1, createdAt: 1 })
// Index for student-centric queries
chatMessageSchema.index({ senderId: 1 })
// Index for exact attachment storageName lookup
chatMessageSchema.index({ 'attachment.storageName': 1 }, { sparse: true })

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema)

export default ChatMessage
