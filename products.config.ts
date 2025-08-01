// Products service configuration file
// Use environment-specific overrides with $production, $test, etc.

export default {
  // Base configuration
  PORT: 4002,
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',

  // Database
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/products_db',

  // Redis for caching
  REDIS_URL: 'redis://localhost:6379',

  // Production overrides
  $production: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'warn',
    // DATABASE_URL should be set via environment variable
    // REDIS_URL should be set via environment variable
  },

  // Test environment
  $test: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    PORT: 5002,
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/products_test_db',
  },

  // Staging environment
  $staging: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
    // Can use different Redis instance for staging
    REDIS_URL: 'redis://redis-staging:6379',
  },
};
