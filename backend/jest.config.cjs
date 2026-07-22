module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['./src/__tests__/setup.cjs'],
  testTimeout: 60000,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/__tests__/**',
    '!src/index.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true
};
