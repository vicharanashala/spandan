import mongoose from 'mongoose'

const classSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Class name is required'],
    trim: true,
    maxlength: [200, 'Class name cannot exceed 200 characters']
  },
  code: {
    type: String,
    unique: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  }
}, {
  timestamps: true
})

function generateClassCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

classSchema.pre('save', function(next) {
  if (!this.code) {
    this.code = generateClassCode()
  }
  next()
})

classSchema.statics.findByCode = function(code) {
  return this.findOne({ code: String(code).trim().toUpperCase() })
}

classSchema.index({ teacher: 1, createdAt: -1 })

const Class = mongoose.model('Class', classSchema)

export default Class
