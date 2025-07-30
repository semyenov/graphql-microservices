import { afterAll, beforeAll } from 'bun:test';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/test_db';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-purposes-only';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';
  process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
});

afterAll(() => {
  // Cleanup
});
