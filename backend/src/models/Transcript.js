import mongoose from 'mongoose'

const transcriptSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  // For 'audio' transcripts this is the live segment number (0,1,2...). For 'paste' transcripts
  // there is no segment, so it is the sentinel -1 (see `source`).
  segmentIndex: {
    type: Number,
    required: true
  },
  // How the transcript was captured: 'audio' = live per-segment transcription; 'paste' = teacher
  // pasted text via "Paste & Generate" (no segment). Defaults to 'audio' so existing records and
  // the live flow are unaffected.
  source: {
    type: String,
    enum: ['audio', 'paste'],
    default: 'audio'
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },
  wordCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// Index for efficient querying by room and segment
transcriptSchema.index({ roomId: 1, segmentIndex: 1 })

const Transcript = mongoose.model('Transcript', transcriptSchema)

export default Transcript