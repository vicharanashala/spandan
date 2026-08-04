// Global test setup for backend.
// @shelf/jest-mongodb preset sets process.env.MONGO_URL before this file runs.
const mongoose = require('mongoose')

beforeAll(async () => {
  if (process.env.MONGO_URL) {
    await mongoose.connect(process.env.MONGO_URL, { serverSelectionTimeoutMS: 30000 })
  }
})

// We deliberately do NOT clear collections in a global afterEach.
// Each test file is responsible for its own fixtures; cross-suite isolation
// is provided by the in-memory MongoDB instance being fresh per Jest run.
// (Global cleanup was too aggressive and broke unrelated suites.)

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect()
  }
})