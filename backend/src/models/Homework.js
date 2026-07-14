import mongoose from 'mongoose'

const homeworkItemSchema = new mongoose.Schema({
  type: { type: String, enum: ['MCQ', 'SHORT_ANSWER', 'LONG_ANSWER', 'PRACTICE_PROBLEM', 'READING', 'CASE_STUDY'], required: true },
  question: { type: String, required: true },
  options: [{ text: String, isCorrect: Boolean }],
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  topic: { type: String, default: '' },
  bloomLevel: { type: String, default: 'Understand' }
}, { _id: false })

const homeworkSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  topic: { type: String, default: '' },
  weakSubtopics: [{ type: String }],
  items: [homeworkItemSchema],
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  dueDate: { type: Date },
  status: { type: String, enum: ['pending', 'submitted', 'reviewed'], default: 'pending' },
  score: { type: Number, default: null },
  isPremium: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
})

homeworkSchema.index({ studentId: 1, roomId: 1 })

export default mongoose.model('Homework', homeworkSchema)
