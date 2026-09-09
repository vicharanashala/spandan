import mongoose from 'mongoose'

const issueReportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: {
    type: String,
    enum: ['video', 'audio', 'poll', 'room-joining', 'profile', 'other'],
    required: true
  },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  roomCode: { type: String, trim: true, uppercase: true, maxlength: 20, default: '' },
  page: { type: String, trim: true, maxlength: 200, default: '' },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt: { type: Date, default: null }
}, { timestamps: true })

issueReportSchema.index({ status: 1, createdAt: -1 })

export default mongoose.model('IssueReport', issueReportSchema)