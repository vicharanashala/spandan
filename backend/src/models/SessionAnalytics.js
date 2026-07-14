import mongoose from 'mongoose'

const sessionAnalyticsSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  totalQuestions: { type: Number, default: 0 },
  totalStudents: { type: Number, default: 0 },
  overallParticipation: { type: Number, default: 0 },
  averageScore: { type: Number, default: 0 },
  averageCorrectPercentage: { type: Number, default: 0 },
  confusionScore: { type: Number, default: 0 },
  understandingScore: { type: Number, default: 0 },
  totalHomeworkAssigned: { type: Number, default: 0 },
  totalHomeworkSubmitted: { type: Number, default: 0 },
  strongestTopic: { type: String, default: '' },
  weakestTopic: { type: String, default: '' },
  questionBreakdown: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
    correctPercentage: Number,
    incorrectPercentage: Number,
    participationRate: Number,
    averageResponseTime: Number
  }],
  studentPerformance: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    studentName: String,
    accuracy: Number,
    totalPoints: Number,
    questionsAttempted: Number,
    weakTopics: [String]
  }],
  createdAt: { type: Date, default: Date.now }
})

export default mongoose.model('SessionAnalytics', sessionAnalyticsSchema)
