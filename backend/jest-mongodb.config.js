// Configuration for the @shelf/jest-mongodb preset.
// Starts an in-memory MongoDB before tests run, stops after.
// Only tests that import mongoose models actually use it; pure-logic tests
// (e.g. passwordService.test.js) ignore it.
module.exports = {
  mongodbMemoryServerOptions: {
    binary: {
      version: '6.0.6',
      skipMD5: true
    },
    instance: {
      dbName: 'spandan-test'
    },
    autoStart: true
  },
  mongoURLEnvName: 'MONGO_URL'
}