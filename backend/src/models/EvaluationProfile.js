import mongoose from 'mongoose'

// Teacher-authored reusable evaluation profile.
//
// Each profile is owned by ONE teacher. Criteria come from a fixed registry
// (services/evaluationCriteria.js) — we store only the criterion `key` here, so
// changing a criterion's display label / aggregation in the registry is reflected
// everywhere automatically. Weights are stored as fractions in [0, 1]; the sum of
// weights across criteria must equal 1.0 (enforced both server-side on save and
// client-side before the save button enables).

const criterionEntrySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    trim: true
  },
  // Stored as fraction (e.g. 0.6 == 60%). Validation enforces the per-profile sum == 1.
  weight: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  }
}, { _id: false })

const evaluationProfileSchema = new mongoose.Schema({
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },
  criteria: {
    type: [criterionEntrySchema],
    default: []
  }
}, {
  timestamps: true
})

// Teacher dashboard list query ("my profiles, newest first") — covered by the compound
// {teacherId, createdAt:-1} so it serves both the equality and the sort.
evaluationProfileSchema.index({ teacherId: 1, createdAt: -1 })

const EvaluationProfile = mongoose.model('EvaluationProfile', evaluationProfileSchema)

export default EvaluationProfile