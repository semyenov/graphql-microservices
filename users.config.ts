// Users service configuration file
// Use environment-specific overrides with $production, $test, etc.

export default {
  // Base configuration
  PORT: 4001,
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',

  // Database
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/users_db',

  // Redis for caching
  REDIS_URL: 'redis://localhost:6379',

  // JWT configuration
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',

  // In production, you should provide proper RSA keys
  // JWT_ACCESS_PRIVATE_KEY: '...',
  // JWT_ACCESS_PUBLIC_KEY: '...',
  // JWT_REFRESH_PRIVATE_KEY: '...',
  // JWT_REFRESH_PUBLIC_KEY: '...',

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
    PORT: 5001,
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/users_test_db',
  },

  // Local development with Docker
  $dev: {
    // You can extend from a shared config
    // $extends: './shared/dev.config',
  },
};
