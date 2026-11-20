
import mongoose from 'mongoose'
import { hash, compare } from '@node-rs/bcrypt'
import { TERMS_VERSION } from '../config/terms.js'

const BCRYPT_COST = Number(process.env.BCRYPT_COST) || 10

const userSchema = new mongoose.Schema(
  {
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

    googleId: {
      type: String,
      unique: true,
      sparse: true,
      default: undefined
    },

    authProvider: {
      type: String,
      enum: ['local', 'google', 'samagama'],
      default: 'local'
    },

    password: {
      type: String,
      required: [
        function () {
          return !this.googleId
        },
        'Password is required'
      ],
      minlength: [6, 'Password must be at least 6 characters']
    },

    role: {
      type: String,
      enum: ['teacher', 'student'],
      required: [true, 'Role is required']
    },

    teacherApprovalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },

    tourSeen: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },

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

    enrollmentNumber: {
      type: String,
      default: ''
    },

    class: {
      type: String,
      default: ''
    },

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

    // Terms of Use acceptance
    termsVersion: {
      type: String,
      default: null
    },

    termsAcceptedAt: {
      type: Date,
      default: null
    },

    isActive: {
      type: Boolean,
      default: true
    },

    lastLogin: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
)

// Hash passwords before saving.
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) {
    return
  }

  this.password = await hash(this.password, BCRYPT_COST)
})

// Compare the entered password with its stored hash.
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password || typeof candidatePassword !== 'string') {
    return false
  }

  return compare(candidatePassword, this.password)
}

// Never expose password hashes in API responses.
userSchema.methods.toJSON = function () {
  const obj = this.toObject()
  delete obj.password
  obj.termsAccepted = obj.termsVersion === TERMS_VERSION
  return obj
}

const User = mongoose.model('User', userSchema)

export default User
