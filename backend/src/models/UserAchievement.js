import mongoose from 'mongoose'

const userAchievementSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  badgeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Badge', required: true },
  roomCode: { type: String, default: null, index: true },
  scope: { type: String, enum: ['section', 'lifetime'], required: true, default: 'lifetime', index: true },
  earnedAt: { type: Date, default: Date.now }
}, { timestamps: true })

// Section achievements can be earned once per section/room; lifetime achievements are earned once globally.
userAchievementSchema.index({ userId: 1, badgeId: 1, scope: 1, roomCode: 1 }, { unique: true })

export default mongoose.model('UserAchievement', userAchievementSchema)
