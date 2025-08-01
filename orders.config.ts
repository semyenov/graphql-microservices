// Orders service configuration file
// Use environment-specific overrides with $production, $test, etc.

export default {
  // Base configuration
  PORT: 4003,
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',

  // Database
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/orders_db',

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
    PORT: 5003,
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/orders_test_db',
  },

  // With observability enabled
  $observability: {
    OTEL_SERVICE_NAME: 'orders-service',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
    OTEL_TRACES_ENABLED: true,
    OTEL_METRICS_ENABLED: true,
  },
};
