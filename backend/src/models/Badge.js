import mongoose from 'mongoose'

const badgeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '🏆' },
  category: {
    type: String,
    enum: ['performance', 'engagement', 'speed', 'milestone'],
    required: true
  },
  scope: {
    type: String,
    enum: ['section', 'lifetime'],
    default: 'lifetime',
    required: true,
    index: true
  },
  rule: {
    type: { type: String, required: true },
    threshold: { type: Number, required: true },
    minAnswers: { type: Number, default: null }
  },
  criteria: { type: String, default: '' }
}, { timestamps: true })

badgeSchema.index({ name: 1, scope: 1 }, { unique: true })

export default mongoose.model('Badge', badgeSchema)
