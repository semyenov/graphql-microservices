# Type-Safe Configuration System

This document describes the modern, type-safe configuration management system implemented across the GraphQL microservices.

## Overview

The configuration system provides:
- **Type Safety**: Full TypeScript type inference using Zod schemas
- **Runtime Validation**: Automatic validation of configuration values
- **Multiple Sources**: Support for environment variables, files, remote APIs, and in-memory config
- **Hot Reloading**: Auto-refresh configuration at specified intervals
- **Change Detection**: Event-based notifications when configuration changes
- **Result Type Integration**: Functional error handling with the Result monad
- **Service-Specific Types**: Dedicated configuration classes for each service

## Architecture

### Core Components

1. **ConfigService**: Generic configuration service that handles loading, validation, and caching
2. **ConfigBuilder**: Fluent API for building configuration services
3. **Service Configs**: Type-safe configuration classes for each microservice
4. **Zod Schemas**: Define and validate configuration structure

### Configuration Sources

The system supports multiple configuration sources that are merged in order:

```typescript
const config = configBuilder(schema)
  .withFile('config/defaults.json')    // Base defaults
  .withEnv()                          // Environment variables
  .withFile('config/local.json')      // Local overrides
  .withMemory({ /* runtime config */ }) // Runtime overrides
  .withRemote('https://api.com/config') // Remote configuration
  .build();
```

## Usage

### Service Configuration

Each service has a dedicated configuration class:

```typescript
// Gateway Service
import { GatewayConfig } from '@graphql-microservices/shared-config';
import { Result } from '@graphql-microservices/shared-result';

const configResult = await GatewayConfig.initialize();
if (Result.isErr(configResult)) {
  logger.error('Failed to initialize configuration:', configResult.error);
  process.exit(1);
}

const config = configResult.value;
console.log('Port:', config.PORT);
```

### Getting Specific Values

```typescript
// Get a specific configuration value
const portResult = GatewayConfig.getValue('PORT');
if (Result.isOk(portResult)) {
  console.log('Port:', portResult.value);
}

// Get nested values
const redisUrlResult = config.getNestedValue('cache.redis.url');
```

### Configuration Changes

```typescript
// Listen for configuration changes
GatewayConfig.onChange((event) => {
  console.log('Configuration changed:', event.changedKeys);
  console.log('Previous:', event.previous);
  console.log('Current:', event.current);
  
  // React to specific changes
  if (event.changedKeys.includes('RATE_LIMIT')) {
    // Update rate limiting configuration
  }
});
```

### Custom Configuration

```typescript
// Define a custom schema
const customSchema = z.object({
  API_KEY: z.string().min(32),
  TIMEOUT_MS: z.number().positive(),
  FEATURES: z.object({
    NEW_UI: z.boolean().default(false),
    BETA_API: z.boolean().default(false),
  }).default({}),
});

// Create configuration service
const config = configBuilder(customSchema)
  .withEnv()
  .withFile('config/api.json')
  .withRefreshInterval(60000) // Refresh every minute
  .onValidationError((errors) => {
    console.error('Validation failed:', errors.format());
  })
  .onRefresh((newConfig) => {
    console.log('Configuration refreshed');
  })
  .build();

await config.initialize();
```

## Service-Specific Configurations

### Gateway Service

```typescript
class GatewayConfig {
  static initialize(): Promise<Result<GatewayEnv, DomainError>>
  static get(): Result<GatewayEnv, DomainError>
  static getValue<K>(key: K): Result<GatewayEnv[K], DomainError>
  static onChange(listener: (event) => void): void
}
```

### User Service

```typescript
class UserServiceConfig {
  static initialize(): Promise<Result<UserServiceEnv, DomainError>>
  static get(): Result<UserServiceEnv, DomainError>
  static getValue<K>(key: K): Result<UserServiceEnv[K], DomainError>
  static getJwtConfig(): Result<JwtConfig, DomainError>
  static onChange(listener: (event) => void): void
}
```

### Product Service

```typescript
class ProductServiceConfig {
  static initialize(): Promise<Result<ProductServiceEnv, DomainError>>
  static get(): Result<ProductServiceEnv, DomainError>
  static getValue<K>(key: K): Result<ProductServiceEnv[K], DomainError>
  static onChange(listener: (event) => void): void
}
```

### Order Service

```typescript
class OrderServiceConfig {
  static initialize(): Promise<Result<OrderServiceEnv, DomainError>>
  static get(): Result<OrderServiceEnv, DomainError>
  static getValue<K>(key: K): Result<OrderServiceEnv[K], DomainError>
  static onChange(listener: (event) => void): void
}
```

## Configuration Schemas

All configuration schemas are defined using Zod for runtime validation:

```typescript
// Base schema shared by all services
const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Service-specific schemas extend the base
export const userServiceEnvSchema = z.object({
  ...baseEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...redisEnvSchema.shape,
  ...jwtEnvSchema.shape,
});
```

## Error Handling

The configuration system uses the Result type for comprehensive error handling:

```typescript
const configResult = await config.initialize();

Result.match(configResult, {
  ok: (config) => {
    console.log('Configuration loaded successfully');
  },
  err: (error) => {
    if (error.code === 'VALIDATION_ERROR') {
      console.error('Invalid configuration:', error.fieldErrors);
    } else if (error.code === 'CONFIG_FILE_ERROR') {
      console.error('Failed to load config file:', error.details);
    }
  }
});
```

## Testing

For testing, use the memory source to provide predictable configuration:

```typescript
const testConfig = configBuilder(userServiceEnvSchema)
  .withMemory({
    NODE_ENV: 'test',
    PORT: 4001,
    DATABASE_URL: 'postgresql://test@localhost:5432/test_db',
    REDIS_URL: 'redis://localhost:6379/1',
    JWT_EXPIRES_IN: '1h',
  })
  .build();

const result = await testConfig.initialize();
```

## Migration Guide

### From parseEnv to Type-Safe Config

Before:
```typescript
import { parseEnv, userServiceEnvSchema } from '@graphql-microservices/shared-config';
const env = parseEnv(userServiceEnvSchema);
```

After:
```typescript
import { UserServiceConfig } from '@graphql-microservices/shared-config';
import { Result } from '@graphql-microservices/shared-result';

const configResult = await UserServiceConfig.initialize();
if (Result.isErr(configResult)) {
  logger.error('Failed to initialize configuration:', configResult.error);
  process.exit(1);
}
const env = configResult.value;
```

## Best Practices

1. **Initialize Early**: Initialize configuration as one of the first steps in your service
2. **Handle Errors**: Always check the Result and handle configuration errors gracefully
3. **Use Type-Safe Accessors**: Use `getValue()` for type-safe access to specific values
4. **Listen for Changes**: Subscribe to configuration changes for dynamic updates
5. **Validate Strictly**: Define strict schemas with proper validation rules
6. **Secure Sensitive Data**: Never log sensitive configuration values
7. **Test with Mocks**: Use memory source for predictable testing

## Advanced Features

### Remote Configuration

```typescript
const config = configBuilder(schema)
  .withRemote('https://config-api.com/service-config', {
    'Authorization': 'Bearer ${API_TOKEN}',
    'X-Service': 'users',
  })
  .withRefreshInterval(30000) // Poll every 30 seconds
  .build();
```

### Configuration Composition

```typescript
// Base configuration
const baseConfig = configBuilder(baseSchema)
  .withFile('config/base.json')
  .build();

// Service-specific configuration
const serviceConfig = configBuilder(serviceSchema)
  .withMemory(await baseConfig.get())
  .withEnv()
  .withFile(`config/${SERVICE_NAME}.json`)
  .build();
```

### Dynamic Feature Flags

```typescript
const featureFlags = configBuilder(featureFlagSchema)
  .withRemote('https://feature-flags.com/api/flags')
  .withRefreshInterval(10000) // Check every 10 seconds
  .build();

featureFlags.on('change', (event) => {
  if (event.changedKeys.includes('FLAGS.NEW_CHECKOUT')) {
    // Toggle feature dynamically
  }
});
```

## Troubleshooting

### Configuration Not Loading

1. Check that all required environment variables are set
2. Verify file paths are correct (relative to process.cwd())
3. Ensure remote endpoints are accessible
4. Check schema validation errors in logs

### Type Errors

1. Ensure you're using the correct service configuration class
2. Check that schema types match expected values
3. Use `getValue()` for type-safe access

### Performance Issues

1. Reduce refresh interval for remote configurations
2. Cache configuration values that don't change
3. Use memory source for frequently accessed values