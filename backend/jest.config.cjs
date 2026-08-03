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
  verbose: true
};