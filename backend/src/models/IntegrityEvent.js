// IntegrityEvent — records suspicious student behaviour during a live quiz.
//
// Each document captures ONE event: a tab switch, fullscreen exit, or paste.
// The collection is an append-only audit log — nothing is ever updated.
//
// Retention: a TTL index auto-purges documents older than 90 days so the
// collection doesn't grow unbounded. Teachers who need longer retention
// should export before the TTL fires.
//
// Compound index on (roomId, studentId, createdAt) lets the teacher view
// efficiently sort all events for a room, grouped by student.

import mongoose from 'mongoose'

const integrityEventSchema = new mongoose.Schema(
  {
    // ── Who / Where ──────────────────────────────────────────────────────────
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // The question that was active when the event fired. Null when no question
    // is live (e.g. a paste that happens between questions).
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null
    },

    // ── What happened ────────────────────────────────────────────────────────
    eventType: {
      type: String,
      enum: ['tab_switch', 'window_blur', 'fullscreen_exit', 'paste'],
      required: true
    },

    // Arbitrary extra context. Kept as Mixed so individual event types can
    // attach their own fields without schema churn:
    //   tab_switch    → { visibilityState: 'hidden' }
    //   window_blur   → {}
    //   fullscreen_exit → {}
    //   paste         → { pastedLength: <number> }
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    // createdAt is all we need; updatedAt is meaningless on an append-only log.
    timestamps: { createdAt: true, updatedAt: false }
  }
)

// ── Indexes ──────────────────────────────────────────────────────────────────
// Primary access pattern: fetch all events for a room, newest first.
integrityEventSchema.index({ roomId: 1, studentId: 1, createdAt: -1 })

// TTL: auto-delete documents 90 days after they were created.
integrityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })

export default mongoose.model('IntegrityEvent', integrityEventSchema)
