// Global test setup for backend

// middleware/auth.js refuses to load without a signing key (there is deliberately no default),
// so give the suite one. CI sets its own; this keeps a bare `npm test` working locally.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key'

beforeAll(async () => {
  // Setup any global test configuration
});

afterAll(async () => {
  // Cleanup after all tests
});
