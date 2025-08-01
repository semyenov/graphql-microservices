// Gateway configuration file
// Use environment-specific overrides with $production, $test, etc.

export default {
  // Development defaults
  PORT: 4000,
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',

  // Redis configuration
  REDIS_URL: 'redis://localhost:6379',

  // Gateway specific
  INTROSPECTION_ENABLED: true,
  PLAYGROUND_ENABLED: true,

  // You can override subgraph URLs in production
  // SUBGRAPH_URLS: 'users:http://users-service:4001/graphql,products:http://products-service:4002/graphql,orders:http://orders-service:4003/graphql',

  // Production overrides
  $production: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'warn',
    INTROSPECTION_ENABLED: false,
    PLAYGROUND_ENABLED: false,
  },

  // Test environment
  $test: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    PORT: 5000,
  },
};
