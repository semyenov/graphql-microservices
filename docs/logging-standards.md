# Logging Standards

This document outlines the logging standards and best practices for the GraphQL Microservices project.

## Overview

All services and scripts in this project use the `@graphql-microservices/logger` package, which provides structured logging based on Pino. This ensures consistent log formatting, better performance, and improved debugging capabilities across the entire codebase.

## Logger Package

The logger is located at `packages/logger` and provides:
- Structured JSON logging with Pino
- Pretty printing in development mode
- Correlation ID tracking
- GraphQL request logging
- Error serialization
- Performance optimizations

## Basic Usage

### Import and Create Logger Instance

```typescript
import { createLogger } from '@graphql-microservices/logger';

// Create a logger instance with service name
const logger = createLogger({ service: 'my-service' });
```

### Log Levels

Use appropriate log levels for different scenarios:

```typescript
// Debug information (verbose, only in development)
logger.debug('Detailed debug information', { userId, requestData });

// Informational messages
logger.info('User logged in successfully', { userId, email });

// Warning messages
logger.warn('Rate limit approaching', { userId, remainingRequests: 5 });

// Error messages (always include error object)
logger.error('Failed to process payment', error, { orderId, amount });

// Fatal errors (application should exit)
logger.fatal('Cannot connect to database', error);
```

## Best Practices

### 1. Always Name Your Service

Every logger instance should specify the service name for easier log filtering:

```typescript
// Good
const logger = createLogger({ service: 'orders-service' });

// Bad
const logger = createLogger(); // Missing service context
```

### 2. Include Contextual Data

Always include relevant context as structured data:

```typescript
// Good - structured data
logger.info('Order created', { 
  orderId: order.id, 
  customerId: order.customerId,
  totalAmount: order.total 
});

// Bad - string concatenation
logger.info(`Order ${order.id} created for customer ${order.customerId}`);
```

### 3. Error Logging

Always pass the error object as the second parameter:

```typescript
// Good
try {
  await processOrder(order);
} catch (error) {
  logger.error('Failed to process order', error, { orderId: order.id });
}

// Bad - loses stack trace
logger.error(`Failed to process order: ${error.message}`);
```

### 4. GraphQL Context Integration

Add logger to GraphQL context for use in resolvers:

```typescript
interface Context extends AuthContext {
  logger: ReturnType<typeof createLogger>;
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [createGraphQLLoggingPlugin(logger)],
  formatError: (err) => formatGraphQLError(err, logger),
});

// In resolvers
async createUser(parent, args, context) {
  context.logger.info('Creating user', { email: args.email });
  // ...
}
```

### 5. Correlation IDs

Use correlation IDs to track requests across services:

```typescript
// In gateway
const correlationId = context.headers['x-correlation-id'] || generateId();
logger.info('Incoming request', { correlationId, operationName });

// Pass to downstream services
const response = await fetch(serviceUrl, {
  headers: {
    'x-correlation-id': correlationId
  }
});
```

### 6. Performance Considerations

- Avoid logging in hot paths (tight loops, frequent operations)
- Use appropriate log levels (debug logs can be disabled in production)
- Structured logging is faster than string interpolation
- Log sampling for high-volume operations

```typescript
// Sample only 10% of successful operations
if (Math.random() < 0.1) {
  logger.info('Operation completed', { duration, result });
}
```

## Common Patterns

### Service Startup

```typescript
logger.info('🚀 Service starting', { 
  service: config.serviceName,
  version: config.version,
  environment: config.environment 
});

// After successful startup
logger.info('✅ Service ready', { 
  url: server.url,
  port: config.port 
});
```

### Request Logging

```typescript
// Request start
logger.info('Incoming request', {
  method: req.method,
  path: req.path,
  correlationId: req.headers['x-correlation-id']
});

// Request complete
logger.info('Request completed', {
  method: req.method,
  path: req.path,
  statusCode: res.statusCode,
  duration: Date.now() - startTime,
  correlationId: req.headers['x-correlation-id']
});
```

### Database Operations

```typescript
// Query logging
logger.debug('Executing database query', {
  query: query.text,
  params: query.values,
  service: 'postgres'
});

// Connection issues
logger.error('Database connection failed', error, {
  host: config.database.host,
  database: config.database.name,
  attempt: retryCount
});
```

### External API Calls

```typescript
const startTime = Date.now();
try {
  const response = await fetch(url);
  logger.info('External API call successful', {
    url,
    method: 'GET',
    statusCode: response.status,
    duration: Date.now() - startTime
  });
} catch (error) {
  logger.error('External API call failed', error, {
    url,
    method: 'GET',
    duration: Date.now() - startTime
  });
}
```

## Script Logging

Scripts should use descriptive logging with emojis for better CLI readability:

```typescript
const logger = createLogger({ service: 'build-script' });

logger.info('🏗️  Building services...');
logger.info('📦 Processing package', { package: pkg.name });
logger.info('✅ Build completed successfully');
logger.error('❌ Build failed', error);
```

## Testing

When testing, you can use the mock logger or adjust log levels:

```typescript
// In tests
const logger = createLogger({ 
  service: 'test',
  level: 'silent' // Disable logs during tests
});

// Or use mock logger
import { createMockLogger } from '@graphql-microservices/logger/test';
const logger = createMockLogger();
```

## Production Considerations

1. **Log Levels**: Set appropriate log levels in production (typically 'info' or 'warn')
2. **Sensitive Data**: Never log passwords, tokens, or other sensitive information
3. **PII**: Be careful with personally identifiable information
4. **Volume**: Monitor log volume and implement sampling if needed
5. **Retention**: Define log retention policies
6. **Aggregation**: Use log aggregation services (ELK, Datadog, etc.)

## Migration Guide

If you're migrating from console.log:

```typescript
// Before
console.log('Processing order', orderId);
console.error('Failed:', error);

// After
logger.info('Processing order', { orderId });
logger.error('Failed to process order', error, { orderId });
```

From shared/utils logging functions:

```typescript
// Before
import { logInfo, logError } from '@shared/utils';
logInfo('Service started');
logError('Service failed');

// After (utils functions now use logger internally)
// No change needed, but consider using logger directly for more features
```

## Environment Variables

The logger respects these environment variables:

- `LOG_LEVEL`: Set the minimum log level (debug, info, warn, error)
- `NODE_ENV`: Pretty printing enabled in development
- `LOG_PRETTY`: Force pretty printing (true/false)

Example:
```bash
LOG_LEVEL=debug bun run dev
NODE_ENV=production LOG_LEVEL=warn bun start
```

## Troubleshooting

### Logs Not Appearing

1. Check log level: `logger.level`
2. Ensure logger is created: `const logger = createLogger({...})`
3. Verify environment variables
4. Check if running in test mode (may be silenced)

### Performance Issues

1. Reduce log verbosity in production
2. Implement log sampling
3. Avoid logging large objects
4. Use debug level for detailed logs

### Integration Issues

1. Ensure @graphql-microservices/logger is in dependencies
2. Run `bun install` after adding logger
3. Check for circular dependencies
4. Verify package exports in tsconfig