import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const encryptedAiKeysSchema = new mongoose.Schema({
  minimax: { type: mongoose.Schema.Types.Mixed, default: null },
  openai: { type: mongoose.Schema.Types.Mixed, default: null },
  anthropic: { type: mongoose.Schema.Types.Mixed, default: null },
  google: { type: mongoose.Schema.Types.Mixed, default: null }
}, { _id: false })

const encryptedPersonalAiKeysSchema = new mongoose.Schema({
  google: { type: String, default: null },
  openai: { type: String, default: null },
  minimax: { type: String, default: null },
  anthropic: { type: String, default: null }
}, { _id: false })

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  role: {
    type: String,
    enum: ['teacher', 'student'],
    required: [true, 'Role is required']
  },
  profileImage: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    default: '',
    maxlength: [500, 'Bio cannot exceed 500 characters']
  },
  dateOfBirth: {
    type: Date,
    default: null
  },
  gender: {
    type: String,
    enum: ['', 'male', 'female', 'other'],
    default: ''
  },
  address: {
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zipCode: { type: String, default: '' },
    country: { type: String, default: '' }
  },
  socialLinks: {
    twitter: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    github: { type: String, default: '' }
  },
  // For students
  enrollmentNumber: {
    type: String,
    default: ''
  },
  class: {
    type: String,
    default: ''
  },
  // For teachers
  department: {
    type: String,
    default: ''
  },
  employeeId: {
    type: String,
    default: ''
  },
  qualifications: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  encryptedAiKeys: {
    type: encryptedAiKeysSchema,
    default: () => ({}),
    select: false
  },
  encryptedPersonalAiKeys: {
    type: encryptedPersonalAiKeysSchema,
    default: () => ({}),
    select: false
  }
}, {
  timestamps: true
})

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next()
  
  try {
    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const obj = this.toObject()
  delete obj.password
  delete obj.encryptedAiKeys
  delete obj.encryptedPersonalAiKeys
  return obj
}

const User = mongoose.model('User', userSchema)

export default User
