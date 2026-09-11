import mongoose from 'mongoose'

const questionSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  type: {
    type: String,
    enum: ['MCQ', 'TF', 'MSQ'],
    required: true
  },
  question: {
    type: String,
    required: true
  },
  options: [{
    text: { type: String, required: true },
    isCorrect: { type: Boolean, default: false }
  }],
  explanation: {
    type: String,
    default: ''
  },
  segmentIndex: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  timeToAnswer: {
    type: Number,
    default: 30
  },
  points: {
    type: Number,
    default: 10
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Remediation fields
  isRemediation: {
    type: Boolean,
    default: false
  },
  parentQuestionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    default: null
  },
  // Generation lifecycle for remediation questions only. Regular (non-remediation) questions are
  // never in 'pending'/'failed' — they default straight to 'ready' so existing code that doesn't
  // know about this field keeps working. Used to make concurrent /generate calls for the same
  // parentQuestionId race-safe: the first caller inserts a 'pending' placeholder (claiming the
  // right to call the LLM), everyone else hits the unique index below, finds the placeholder, and
  // waits on it instead of firing a duplicate LLM call. See routes/remediation.js.
  generationStatus: {
    type: String,
    enum: ['pending', 'ready', 'failed'],
    default: 'ready'
  },
  // Timestamp of when a 'pending' generation was claimed (set on placeholder create/reclaim, never
  // touched after). Lets a later caller tell the difference between "someone is actively generating
  // this" and "the process that claimed this crashed and left it stuck in pending forever" — the
  // latter would otherwise permanently block retries, since the reclaim path only knew how to
  // recover 'failed' docs. See ensureRemediationQuestion() in questionService.js.
  generationStartedAt: {
    type: Date,
    default: null
  },
  // Phase 3 (response-window enforcement): once this poll is superseded by the next launch, responses
  // are accepted only until closeAt (= supersede time + POLL_RESPONSE_GRACE_MS). It is null while the
  // poll is live/current or has never been superseded. Stops a bot back-filling answers to polls that
  // have already moved on. Set/cleared by setLiveQuestion; enforced by POST /responses.
  closeAt: {
    type: Date,
    default: null
  }
})

// Covers the hot query shapes: filter by room (+status) and sort by createdAt.
// Without this every question read (poll load, stats, history) is a full COLLSCAN.
questionSchema.index({ roomId: 1, status: 1, createdAt: -1 })

// Enforces "at most one remediation question per (room, parent question)" at the DB level, so the
// insert-a-placeholder-to-claim-the-race trick in routes/remediation.js is actually atomic instead
// of racy. Partial index — only applies to isRemediation:true docs, so it never affects normal
// questions (which all have parentQuestionId: null and would otherwise collide with each other).
questionSchema.index(
  { roomId: 1, parentQuestionId: 1 },
  { unique: true, partialFilterExpression: { isRemediation: true } }
)

const Question = mongoose.model('Question', questionSchema)

export default Question