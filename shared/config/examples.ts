/**
 * Examples of using the type-safe configuration service
 */

import { Result } from '@graphql-microservices/shared-result';
import { z } from 'zod';
import {
  type ConfigChangeEvent,
  ConfigService,
  configBuilder,
  createConfigService,
} from './config-service';
import { userServiceEnvSchema } from './index';
import {
  GatewayConfig,
  getServiceConfig,
  ObservabilityConfig,
  OrderServiceConfig,
  ProductServiceConfig,
  UserServiceConfig,
} from './typed-config';

// Example 1: Basic configuration service
async function basicExample() {
  // Define a schema
  const appConfigSchema = z.object({
    APP_NAME: z.string().default('My App'),
    PORT: z.string().transform(Number).default(3000),
    DATABASE_URL: z.string().url(),
    FEATURES: z
      .object({
        ENABLE_AUTH: z.boolean().default(true),
        ENABLE_CACHE: z.boolean().default(false),
      })
      .default({}),
  });

  // Create configuration service
  const config = createConfigService({
    schema: appConfigSchema,
    sources: [{ type: 'env' }],
  });

  // Initialize
  const result = await config.initialize();

  if (Result.isOk(result)) {
    console.log('Configuration loaded:', result.value);

    // Get specific value
    const portResult = config.getValue('PORT');
    if (Result.isOk(portResult)) {
      console.log('Port:', portResult.value);
    }
  }
}

// Example 2: Using the configuration builder
async function builderExample() {
  const schema = z.object({
    API_URL: z.string().url(),
    API_KEY: z.string(),
    TIMEOUT: z.number().default(5000),
    RETRY_COUNT: z.number().default(3),
  });

  const config = configBuilder(schema)
    .withEnv()
    .withFile('config/api.json')
    .withRemote('https://config-server.com/api-config', {
      Authorization: 'Bearer token',
    })
    .withRefreshInterval(60000) // Refresh every minute
    .onValidationError((errors) => {
      console.error('Configuration validation failed:', errors.format());
    })
    .onRefresh((newConfig) => {
      console.log('Configuration refreshed:', newConfig);
    })
    .build();

  await config.initialize();
}

// Example 3: Service-specific configuration
async function serviceConfigExample() {
  // Initialize gateway configuration
  const gatewayResult = await GatewayConfig.initialize();

  if (Result.isOk(gatewayResult)) {
    // Get full configuration
    const config = gatewayResult.value;
    console.log('Gateway port:', config.PORT);

    // Get specific value
    const redisUrlResult = GatewayConfig.getValue('REDIS_URL');
    if (Result.isOk(redisUrlResult)) {
      console.log('Redis URL:', redisUrlResult.value);
    }

    // Listen for changes
    GatewayConfig.onChange((event) => {
      console.log('Gateway configuration changed:', event.changedKeys);
    });
  }

  // Initialize user service configuration
  const userResult = await UserServiceConfig.initialize();

  if (Result.isOk(userResult)) {
    // Get JWT configuration
    const jwtConfigResult = UserServiceConfig.getJwtConfig();
    if (Result.isOk(jwtConfigResult)) {
      console.log('JWT expires in:', jwtConfigResult.value.JWT_EXPIRES_IN);
    }
  }
}

// Example 4: Configuration with multiple sources
async function multiSourceExample() {
  const schema = z.object({
    // Base configuration
    SERVICE_NAME: z.string(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // Database configuration
    DB_HOST: z.string().default('localhost'),
    DB_PORT: z.number().default(5432),
    DB_NAME: z.string(),
    DB_USER: z.string(),
    DB_PASSWORD: z.string(),

    // Feature flags
    FEATURES: z
      .object({
        NEW_UI: z.boolean().default(false),
        BETA_API: z.boolean().default(false),
        EXPERIMENTAL: z.boolean().default(false),
      })
      .default({}),
  });

  // Sources are merged in order - later sources override earlier ones
  const config = configBuilder(schema)
    .withFile('config/defaults.json') // Base defaults
    .withEnv() // Environment variables
    .withFile('config/local.json') // Local overrides
    .withMemory({
      // Runtime overrides
      LOG_LEVEL: 'debug',
      FEATURES: {
        NEW_UI: true,
      },
    })
    .build();

  const result = await config.initialize();

  if (Result.isOk(result)) {
    console.log('Merged configuration:', result.value);
  }
}

// Example 5: Dynamic configuration updates
async function dynamicConfigExample() {
  const featureFlagsSchema = z.object({
    FLAGS: z.record(z.boolean()).default({}),
  });

  const config = configBuilder(featureFlagsSchema)
    .withRemote('https://feature-flags.com/api/flags')
    .withRefreshInterval(30000) // Refresh every 30 seconds
    .build();

  await config.initialize();

  // Listen for changes
  config.on('change', (event: ConfigChangeEvent<z.infer<typeof featureFlagsSchema>>) => {
    console.log('Feature flags updated:');
    console.log('Previous:', event.previous.FLAGS);
    console.log('Current:', event.current.FLAGS);
    console.log('Changed keys:', event.changedKeys);

    // React to specific flag changes
    if (event.changedKeys.includes('FLAGS.NEW_CHECKOUT')) {
      console.log('New checkout feature flag changed!');
      // Reload checkout module, update UI, etc.
    }
  });
}

// Example 6: Configuration validation and error handling
async function validationExample() {
  const strictSchema = z.object({
    // Required fields
    API_KEY: z.string().min(32, 'API key must be at least 32 characters'),
    DATABASE_URL: z.string().url('Invalid database URL'),

    // Validated numbers
    PORT: z.number().int().min(1).max(65535),
    TIMEOUT_MS: z.number().positive(),
    MAX_CONNECTIONS: z.number().int().min(1).max(100),

    // Complex validation
    ALLOWED_ORIGINS: z.array(z.string().url()).min(1),
    RATE_LIMITS: z.object({
      REQUESTS_PER_MINUTE: z.number().int().positive(),
      BURST_SIZE: z.number().int().positive(),
    }),

    // Custom validation
    CRON_SCHEDULE: z
      .string()
      .refine(
        (val) =>
          /^(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)$/.test(
            val
          ),
        'Invalid cron expression'
      ),
  });

  const config = createConfigService({
    schema: strictSchema,
    onValidationError: (errors) => {
      console.error('Configuration validation failed:');
      errors.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      // Could also send to monitoring service
    },
  });

  const result = await config.initialize();

  if (Result.isErr(result)) {
    console.error('Failed to load configuration:', result.error);
    // Handle gracefully - use defaults, exit, etc.
  }
}

// Example 7: Testing with mock configuration
async function testingExample() {
  // In tests, use memory source for predictable configuration
  const testConfig = configBuilder(userServiceEnvSchema)
    .withMemory({
      NODE_ENV: 'test',
      PORT: 4001,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
      REDIS_URL: 'redis://localhost:6379/1',
      JWT_EXPIRES_IN: '1h',
      JWT_REFRESH_EXPIRES_IN: '7d',
      JWT_ACCESS_PRIVATE_KEY: 'test-private-key',
      JWT_ACCESS_PUBLIC_KEY: 'test-public-key',
    })
    .build();

  const result = await testConfig.initialize();

  if (Result.isOk(result)) {
    // Use in tests
    console.log('Test configuration loaded');
  }
}

// Example 8: Configuration with observability
async function observabilityExample() {
  const config = configBuilder(userServiceEnvSchema)
    .withEnv()
    .onRefresh((newConfig) => {
      // Log configuration changes
      console.log('[CONFIG] Configuration refreshed', {
        service: 'users',
        environment: newConfig.NODE_ENV,
        timestamp: new Date().toISOString(),
      });

      // Send metrics
      // metrics.increment('config.refresh', { service: 'users' });
    })
    .build();

  config.on('change', (event) => {
    // Track which configuration keys changed
    event.changedKeys.forEach((key) => {
      console.log('[CONFIG] Configuration key changed', {
        key,
        service: 'users',
        // Don't log sensitive values
        previousValue:
          key.includes('PASSWORD') || key.includes('KEY') ? '[REDACTED]' : event.previous[key],
        currentValue:
          key.includes('PASSWORD') || key.includes('KEY') ? '[REDACTED]' : event.current[key],
      });
    });
  });

  await config.initialize();
}

// Example 9: Using configuration in GraphQL context
async function graphqlContextExample() {
  const configResult = await UserServiceConfig.initialize();

  if (Result.isErr(configResult)) {
    throw new Error('Failed to initialize configuration');
  }

  // Create GraphQL context with configuration
  const createContext = async ({ req }: any) => {
    const config = Result.unwrap(UserServiceConfig.get());

    return {
      config,
      // Use configuration values
      jwtSecret: config.JWT_ACCESS_PRIVATE_KEY,
      isDevelopment: config.NODE_ENV === 'development',
      // ... other context
    };
  };

  // In resolvers
  const resolvers = {
    Query: {
      me: async (_: any, __: any, context: any) => {
        if (context.isDevelopment) {
          console.log('Development mode - extra logging enabled');
        }
        // ... resolver logic
      },
    },
  };
}

// Example 10: Configuration with Result type integration
async function resultIntegrationExample() {
  const configResult = await getServiceConfig('orders');

  return Result.flatMap(configResult, (config) => {
    // Use configuration
    console.log('Orders service port:', config.PORT);

    // Chain with other operations
    return Result.tryCatch(
      () => {
        // Some operation that uses config
        const client = createDatabaseClient(config.DATABASE_URL);
        return client;
      },
      (error) => ({
        code: 'DB_CONNECTION_ERROR',
        message: 'Failed to connect to database',
        details: error,
      })
    );
  });
}

// Export examples for documentation
export {
  basicExample,
  builderExample,
  serviceConfigExample,
  multiSourceExample,
  dynamicConfigExample,
  validationExample,
  testingExample,
  observabilityExample,
  graphqlContextExample,
  resultIntegrationExample,
};
