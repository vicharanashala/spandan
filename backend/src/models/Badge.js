import mongoose from 'mongoose'

const badgeSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  badgeType: {
    type: String,
    enum: [
      'first_answer',
      'streak_3',
      'streak_5',
      'streak_10',
      'perfect_session',
      'speed_demon',
      'century_club',
      'active_learner',
      'comeback_kid',
      'quiz_master'
    ],
    required: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    default: null
  },
  awardedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

badgeSchema.index({ studentId: 1, badgeType: 1 }, { unique: true })
badgeSchema.index({ studentId: 1, awardedAt: -1 })

const Badge = mongoose.model('Badge', badgeSchema)

export default Badge
