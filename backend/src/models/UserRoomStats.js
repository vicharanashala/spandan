import mongoose from 'mongoose'

const userRoomStatsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  roomCode: { type: String, required: true, index: true },
  totalAnswers: { type: Number, default: 0 },
  correctAnswers: { type: Number, default: 0 },
  firstAnswersCorrect: { type: Number, default: 0 },
  currentStreak: { type: Number, default: 0 },
  maxStreak: { type: Number, default: 0 },
  accuracy: { type: Number, default: 0 },
  fastestResponse: { type: Number, default: null },
  fastAnswers5: { type: Number, default: 0 },
  fastAnswers10: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 }
}, { timestamps: true })

userRoomStatsSchema.index({ userId: 1, roomCode: 1 }, { unique: true })

export default mongoose.model('UserRoomStats', userRoomStatsSchema)
