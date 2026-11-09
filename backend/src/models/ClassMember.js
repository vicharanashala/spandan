import mongoose from 'mongoose'

const classMemberSchema = new mongoose.Schema({
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
    index: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'removed'],
    default: 'active',
    index: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  removedAt: {
    type: Date,
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
})

// Unique compound index on (classId, studentId)
classMemberSchema.index({ classId: 1, studentId: 1 }, { unique: true })
classMemberSchema.index({ studentId: 1, status: 1 })

const ClassMember = mongoose.model('ClassMember', classMemberSchema)

export default ClassMember
