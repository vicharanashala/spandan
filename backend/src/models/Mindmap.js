import mongoose from 'mongoose'

// Persists generated mindmaps per room — without this, a student who joins
// AFTER a mindmap was generated (live socket broadcast only) would never see
// it, since there was nothing to fetch on page load.
const mindmapSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  markdown: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

const Mindmap = mongoose.model('Mindmap', mindmapSchema)

export default Mindmap