import mongoose from 'mongoose'

const encryptedValueSchema = new mongoose.Schema({
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
  ciphertext: { type: String, required: true }
}, { _id: false })

const encryptedAiKeysSchema = new mongoose.Schema({
  minimax: { type: mongoose.Schema.Types.Mixed, default: null },
  openai: { type: mongoose.Schema.Types.Mixed, default: null },
  anthropic: { type: mongoose.Schema.Types.Mixed, default: null },
  google: { type: mongoose.Schema.Types.Mixed, default: null }
}, { _id: false })

const globalConfigSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'default'
  },
  encryptedAiKeys: {
    type: encryptedAiKeysSchema,
    default: () => ({})
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
})

const GlobalConfig = mongoose.model('GlobalConfig', globalConfigSchema)

export default GlobalConfig
