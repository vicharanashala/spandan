import mongoose from 'mongoose'

const keyConceptSchema = new mongoose.Schema({
  concept: { type: String, required: true },
  definition: { type: String, default: '' }
}, { _id: false })

const commonMistakeSchema = new mongoose.Schema({
  mistake: { type: String, required: true },
  correction: { type: String, default: '' }
}, { _id: false })

const practiceQuestionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, default: '' },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' }
}, { _id: false })

const revisionSheetSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  title: { type: String, default: '' },
  topic: { type: String, default: '' },
  definitions: [{ term: String, definition: String }],
  importantFormulae: [{ formula: String, description: String }],
  keyConcepts: [keyConceptSchema],
  examples: [{ title: String, content: String }],
  commonMistakes: [commonMistakeSchema],
  frequentlyConfused: [{ concept1: String, concept2: String, distinction: String }],
  memoryTips: [{ tip: String, topic: String }],
  examTips: [{ tip: String }],
  quickReferenceTable: [{ category: String, details: String }],
  summary: { type: String, default: '' },
  practiceQuestions: [practiceQuestionSchema],
  vivaQuestions: [{ question: String, answer: String }],
  mcqs: [{
    question: String,
    options: [{ text: String, isCorrect: Boolean }],
    explanation: String
  }],
  status: { type: String, enum: ['draft', 'published'], default: 'published' },
  teacherNotes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
})

revisionSheetSchema.index({ roomId: 1 })

export default mongoose.model('RevisionSheet', revisionSheetSchema)
