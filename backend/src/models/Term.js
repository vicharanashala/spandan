import mongoose from 'mongoose'

// Global term cache — a term's meaning doesn't change between lectures or rooms,
// so we cache definition/study-material/mindmap ONCE here and reuse it everywhere.
// This directly addresses the maintainer's "API load optimal" requirement: if
// "Mutex" was ever explained in any past lecture, it costs zero new AI calls here.
const termSchema = new mongoose.Schema({
  // Lowercased, used as the actual lookup key (case-insensitive dedupe/matching)
  termLower: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Original display casing (e.g. "Mutex", not "mutex")
  term: {
    type: String,
    required: true
  },
  definition: {
    type: String,
    default: null // null until the lazy /details call fills it in
  },
  studyMaterial: [{
    title: String,
    url: String
  }],
  // Mermaid mindmap code for JUST this term — filled in lazily, only if a student
  // actually clicks "Generate Mindmap" for it at least once, ever, anywhere.
  mindmapCode: {
    type: String,
    default: null
  },
  category: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

const Term = mongoose.model('Term', termSchema)

export default Term