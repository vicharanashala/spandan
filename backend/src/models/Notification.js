import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },
  announcement: {
    type: String,
    required: true
  },
  emails: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  fileName: {
    type: String,
    default: null
  },
  clearedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
})

notificationSchema.index({ roomCode: 1, createdAt: -1 })

const Notification = mongoose.model('Notification', notificationSchema)

export default Notification
