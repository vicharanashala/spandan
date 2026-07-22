// Global test setup for backend.
//
// MongoDB is intentionally opt-in here. Most backend unit tests do not need a
// database, and starting mongodb-memory-server in sandboxed environments fails
// when it tries to download MongoDB binaries.
jest.setTimeout(60000)

const mongoose = require('mongoose')

async function connectToOptionalTestDb() {
  const testMongoUri = process.env.TEST_MONGODB_URI || process.env.MONGODB_URI

  if (!testMongoUri) {
    return
  }

  await mongoose.connect(testMongoUri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
  })
}

async function clearConnectedDb() {
  if (mongoose.connection.readyState !== 1) {
    return
  }

  const collections = await mongoose.connection.db.collections()
  await Promise.all(collections.map(collection => collection.deleteMany({})))
}

beforeAll(async () => {
  await connectToOptionalTestDb()
})

afterEach(async () => {
  await clearConnectedDb()
})

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
})
