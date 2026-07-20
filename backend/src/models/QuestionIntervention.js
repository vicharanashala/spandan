import mongoose from 'mongoose'

export const INTERVENTION_TYPES = Object.freeze({
  NEED_NOTES: 'need_notes',
  NEED_QUESTION_EXPLANATION: 'need_question_explanation',
  NEED_TOPIC_AGAIN: 'need_topic_again'
})

export const INTERVENTION_TYPE_LABELS = Object.freeze({
  [INTERVENTION_TYPES.NEED_NOTES]: 'Need Notes',
  [INTERVENTION_TYPES.NEED_QUESTION_EXPLANATION]: 'Need Question Explanation',
  [INTERVENTION_TYPES.NEED_TOPIC_AGAIN]: 'Need Topic Explained Again'
})

// Lifecycle stages for a single QuestionIntervention record. Two-step flow:
//   'asked'        — Stage 1: teacher published the ask (no content yet); students respond.
//   'content_sent' — Stage 2: teacher reviewed counts and delivered the actual notes/link.
// One document progresses through both stages — do NOT create a second record for delivery.
export const INTERVENTION_STATUSES = Object.freeze({
  ASKED: 'asked',
  CONTENT_SENT: 'content_sent'
})

const CONTENT_RETENTION_DAYS = 3

const interventionSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
    index: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: Object.values(INTERVENTION_STATUSES),
    default: INTERVENTION_STATUSES.ASKED
  },
  // The set of intervention types students may choose from during the ASK stage. Defaults to
  // the full enum so the front-end always has the canonical "Need Notes / Explanation /
  // Topic Again" radio options without the teacher having to opt in. Extensible: callers may
  // pass a subset of INTERVENTION_TYPES to constrain the choices.
  offeredTypes: {
    type: [String],
    enum: Object.values(INTERVENTION_TYPES),
    default: () => Object.values(INTERVENTION_TYPES)
  },
  // The teacher's chosen content type for DELIVER. Null while status='asked' (no content yet);
  // set when the teacher sends the actual notes/link in stage 2. Stored as the canonical
  // chosen "kind" of intervention content the teacher decided on.
  type: {
    type: String,
    enum: [...Object.values(INTERVENTION_TYPES), null],
    default: null
  },
  content: {
    text: { type: String, default: '' },
    url: { type: String, default: '' }
  },
  deadlineAt: {
    type: Date,
    required: true,
    index: true
  },
  contentExpiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
})

// MongoDB TTL index — auto-deletes the row as soon as contentExpiresAt is in the past.
// Matches the codebase's existing pattern for time-based auto-removal (see
// models/PasswordResetToken.js:32). After the 3-day window closes, the row disappears from
// the database entirely — students who did not download within that window lose access
// permanently. Students who downloaded retain their local file (out of the system's control).
// expireAfterSeconds: 0 means "delete the document the moment contentExpiresAt is past".
// Mongo's TTL monitor runs roughly every 60s, so there is a small (sub-minute) window past
// expiry during which the row still exists — the route layer enforces the same cutoff
// inline via isContentVisible() so the API never returns expired content in that window.
interventionSchema.index({ contentExpiresAt: 1 }, { expireAfterSeconds: 0 })

interventionSchema.index({ questionId: 1, teacherId: 1 })

const QuestionIntervention = mongoose.model('QuestionIntervention', interventionSchema)

export const retentionWindowDays = CONTENT_RETENTION_DAYS
export default QuestionIntervention
