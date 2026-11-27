import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['class_invite'],
    default: 'class_invite',
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
    index: true
  },
  fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending',
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  payload: {
    className: { type: String, default: '' },
    classCode: { type: String, default: '' },
    teacherName: { type: String, default: '' }
  }
}, {
  timestamps: true
})

notificationSchema.index({ userId: 1, status: 1, createdAt: -1 })
notificationSchema.index({ userId: 1, classId: 1, status: 1 })

const Notification = mongoose.model('Notification', notificationSchema)

export default Notification
