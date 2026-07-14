import mongoose from 'mongoose'

const subtopicSchema = new mongoose.Schema({
  name: { type: String, required: true },
  confusionScore: { type: Number, default: 0 },
  studentsAffected: { type: Number, default: 0 },
  recommendation: { type: String, default: '' }
}, { _id: false })

const misconceptionAnalysisSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  topic: { type: String, default: '' },
  subtopics: [subtopicSchema],
  overallConfusionScore: { type: Number, default: 0 },
  totalStudentsAnalyzed: { type: Number, default: 0 },
  generatedAt: { type: Date, default: Date.now }
})

export default mongoose.model('MisconceptionAnalysis', misconceptionAnalysisSchema)
