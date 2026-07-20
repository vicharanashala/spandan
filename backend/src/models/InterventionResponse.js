import mongoose from 'mongoose'
import { INTERVENTION_TYPES } from './QuestionIntervention.js'

const interventionResponseSchema = new mongoose.Schema({
  interventionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionIntervention',
    required: true,
    index: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // The student's chosen intervention type. Required when the student actually responds
  // to the intervention; explicitly null when the student only "saves" the content without
  // responding (saving without responding is allowed by the brief).
  selectedType: {
    type: String,
    enum: [...Object.values(INTERVENTION_TYPES), null],
    default: null
  },
  // Populated only when the student explicitly saves the content (POST .../save). Once set,
  // the content remains visible to that student past the 3-day content retention window.
  savedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
})

// One response row per (intervention, student). Saving without responding uses the same row
// — the unique index makes the student upsert idempotent regardless of which POST hits first.
interventionResponseSchema.index({ interventionId: 1, studentId: 1 }, { unique: true })

// Per-intervention aggregates (e.g. "Need Notes — 18") filter by interventionId+type, so an
// index here makes the analytics endpoint a covered lookup instead of a COLLSCAN.
interventionResponseSchema.index({ interventionId: 1, selectedType: 1 })

const InterventionResponse = mongoose.model('InterventionResponse', interventionResponseSchema)

export default InterventionResponse
