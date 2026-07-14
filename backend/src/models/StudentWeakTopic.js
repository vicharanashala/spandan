import mongoose from 'mongoose'

const weakTopicSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  topic: { type: String, default: '' },
  subtopics: [{
    name: { type: String },
    score: { type: Number, default: 0 },
    questionsWrong: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }]
  }],
  overallAccuracy: { type: Number, default: 0 },
  averageResponseTime: { type: Number, default: 0 },
  participationRate: { type: Number, default: 100 },
  totalQuestionsAttempted: { type: Number, default: 0 },
  totalCorrect: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
})

weakTopicSchema.index({ studentId: 1, roomId: 1 }, { unique: true })

export default mongoose.model('StudentWeakTopic', weakTopicSchema)
