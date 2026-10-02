import mongoose from 'mongoose'

export const FEEDBACK_FACILITATORS = [
  'Jinal',
  'Meenakshi',
  'Pavani',
  'Prakash',
  'Prof. Sudarshan',
  'Rohit',
  'Sakshi',
  'Other / Guest'
]

const feedbackSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  sessionSummary: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150
  },
  whatWorkedWell: {
    type: String,
    required: true,
    trim: true,
    maxlength: 250
  },
  whatUnclear: {
    type: String,
    trim: true,
    maxlength: 250
  },
  facilitators: {
    type: [{ type: String, enum: FEEDBACK_FACILITATORS, trim: true }],
    required: true,
    validate: {
      validator: (value) => Array.isArray(value) && value.length > 0,
      message: 'At least one facilitator is required'
    }
  }
}, {
  timestamps: true
})

// A student can submit feedback only once for each room.
feedbackSchema.index({ roomId: 1, studentId: 1 }, { unique: true })

const Feedback = mongoose.model('Feedback', feedbackSchema)

export default Feedback
