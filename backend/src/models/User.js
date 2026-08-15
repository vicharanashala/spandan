import mongoose from 'mongoose'
// @node-rs/bcrypt is a Rust implementation whose hash/compare run on libuv's background
// thread pool, so password hashing no longer blocks the single event loop during login
// storms. Output is standard bcrypt and cross-compatible with the previous bcryptjs
// hashes, so existing passwords keep working (no reset needed).
import { hash, compare } from '@node-rs/bcrypt'

const BCRYPT_COST = Number(process.env.BCRYPT_COST) || 10

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
  // Google account subject id (stable per Google account). sparse+unique lets the many
  // non-Google accounts (field absent) coexist while each Google account maps to exactly
  // one Spandan user. Set only from a server-verified Google ID token, never client input.
  googleId: {
    type: String,
    unique: true,
    sparse: true,
    default: undefined
  },
  // How the account authenticates: 'local' (email+password), 'google' (OAuth), 'samagama' (SSO).
  authProvider: {
    type: String,
    enum: ['local', 'google', 'samagama'],
    default: 'local'
  },
  password: {
    // Optional for accounts provisioned via an external identity provider (Google OAuth),
    // which have no local password. Still required for normal email/password accounts.
    type: String,
    required: [function () { return !this.googleId }, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  role: {
    type: String,
    enum: ['teacher', 'student'],
    required: [true, 'Role is required']
  },
  // Teacher accounts must be approved by an admin before they can sign in or use any
  // teacher functionality. Students are 'approved' by default (the field is only
  // consulted when role === 'teacher'). New teacher registrations start 'pending'.
  teacherApprovalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  // Grants access to the admin approval page and endpoints. Set only via the migration
  // script or another admin; never client-settable.
  isAdmin: {
    type: Boolean,
    default: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: '',
    maxlength: [500, 'Rejection reason cannot exceed 500 characters']
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
  }
}, {
  timestamps: true
})

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next()
  
  try {
    this.password = await hash(this.password, BCRYPT_COST)
    next()
  } catch (error) {
    next(error)
  }
})

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  // OAuth-only accounts have no local password: never match, so password login fails cleanly
  // (surfaced as "invalid email or password") instead of throwing on an undefined hash.
  if (!this.password) return false
  return compare(candidatePassword, this.password)
}

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const obj = this.toObject()
  delete obj.password
  return obj
}

const User = mongoose.model('User', userSchema)

export default User