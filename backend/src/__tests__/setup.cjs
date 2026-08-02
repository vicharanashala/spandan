// Global test setup for backend
const mongoose = require('mongoose')

beforeAll(async () => {
  // Connect mongoose to the in-memory MongoDB provided by @shelf/jest-mongodb
  // (sets process.env.MONGO_URL via globalSetup and global.__MONGO_URI__).
  // Skip if already connected (avoids duplicate connections in suites that
  // also call mongoose.connect directly).
  if (mongoose.connection.readyState === 1) return
  const uri =
    process.env.MONGO_URL ||
    global.__MONGO_URI__ ||
    'mongodb://127.0.0.1:27017/test'
  await mongoose.connect(uri)
})

afterAll(async () => {
  try {
    await mongoose.connection.close()
  } catch (_) { /* noop */ }
})