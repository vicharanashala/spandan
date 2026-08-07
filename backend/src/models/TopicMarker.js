import mongoose from 'mongoose'

/**
 * TopicMarker — teacher-set labels for recording time windows.
 *
 * "At 02:34, teacher was talking about Glycolysis — Investment Phase"
 * "At 05:10, topic shifted to Glycolysis — Payoff Phase"
 *
 * Doubt signals arriving during a topic marker inherit the topic label,
 * so the teacher dashboard can show "8 students lost during Glycolysis —
 * Investment Phase" instead of just a transcript snippet.
 *
 * Topics are anchored to `startMs` (recordingOffsetMs) and last until
 * `endMs` (or the next topic marker, whichever comes first).
 *
 * If a doubt signal's recordingOffsetMs falls between two markers (or before
 * the first marker), the spike card falls back to the matching transcript's
 * first few words as a "topic proxy".
 */
const topicMarkerSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Recording clock offset (ms) when this topic started
    startMs: { type: Number, required: true, min: 0 },
    // Recording clock offset (ms) when this topic ended (exclusive). Null = still active
    endMs: { type: Number, default: null },
    // The label the teacher typed, e.g. "Glycolysis — Investment Phase"
    label: { type: String, required: true, trim: true, maxlength: 120 },
    // Optional short sub-label
    note: { type: String, trim: true, maxlength: 240, default: '' },
    // 'manual' = teacher typed it, 'auto' = AI extracted from transcript
    source: { type: String, enum: ['manual', 'auto'], default: 'manual' },
    // Confidence score from AI generator (0-1). Only meaningful for source='auto'.
    confidence: { type: Number, min: 0, max: 1, default: null },
    // True when the teacher has explicitly accepted/edited this auto topic
    confirmed: { type: Boolean, default: false }
  },
  { timestamps: true }
)

// Lookups by room + time window
topicMarkerSchema.index({ roomId: 1, startMs: 1 })
topicMarkerSchema.index({ roomId: 1, startMs: 1, endMs: 1 })

export default mongoose.model('TopicMarker', topicMarkerSchema)