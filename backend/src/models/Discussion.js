import mongoose from 'mongoose'

// Shared across API instances; version is used for compare-and-swap state transitions.
const schema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  active: { type: Boolean, default: false },
  closing: { type: Boolean, default: false },
  session: { type: String, default: '' },
  version: { type: Number, default: 0 },
  nextOrder: { type: Number, default: 0 },
  pendingHands: { type: [mongoose.Schema.Types.Mixed], default: [] },
  speaker: { type: mongoose.Schema.Types.Mixed, default: null },
  entries: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { timestamps: true })
export default mongoose.model('Discussion', schema)
