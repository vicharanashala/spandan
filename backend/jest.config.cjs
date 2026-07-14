module.exports = {
  testEnvironment: 'node',
  preset: '@shelf/jest-mongodb',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['./src/__tests__/setup.cjs'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/__tests__/**',
    '!src/index.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  // Allow extra time for mongod to start on Windows (Defender scans new binary on first launch)
  globals: {
    'mongoMS': {
      startupTimeout: 60000
    }
  }
};