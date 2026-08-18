import mongoose from 'mongoose'

const passwordResetSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  expires: {
    type: Date,
    required: true,
    index: true
  },
  used: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// TTL index - MongoDB will auto-delete expired documents
passwordResetSchema.index({ expires: 1 }, { expireAfterSeconds: 0 })

const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetSchema)

export default PasswordResetToken