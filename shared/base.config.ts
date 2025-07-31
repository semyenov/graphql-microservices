// Shared base configuration that all services can extend from
// Use $extends: './shared/base.config' in your service config

export default {
  // Common defaults
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',

  // Common Redis configuration
  REDIS_URL: 'redis://localhost:6379',

  // Observability configuration (opt-in)
  $observability: {
    OTEL_SERVICE_NAME: process.env.SERVICE_NAME || 'graphql-microservice',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
    OTEL_TRACES_ENABLED: true,
    OTEL_METRICS_ENABLED: true,
    OTEL_LOG_LEVEL: 'info',
  },

  // Production defaults
  $production: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'warn',
    OTEL_LOG_LEVEL: 'warn',
  },

  // Test defaults
  $test: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    OTEL_TRACES_ENABLED: false,
    OTEL_METRICS_ENABLED: false,
  },

  // CI/CD environment
  $ci: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'debug',
    // Use in-memory Redis for CI
    REDIS_URL: 'redis://localhost:6380',
  },
};
