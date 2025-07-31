# Shared Logging Package

Production-ready structured logging with correlation ID support for GraphQL microservices.

## Features

- **Structured Logging**: JSON-based logs with consistent format across services
- **Correlation ID Tracking**: Automatic correlation ID generation and propagation
- **GraphQL Integration**: Apollo Server plugin with operation tracking
- **Performance Monitoring**: Built-in timing and metrics logging
- **Security**: Automatic redaction of sensitive fields
- **Database Logging**: Specialized logging for database operations
- **Audit Trails**: Support for audit logging with standardized format

## Usage

### Basic Setup

```typescript
import { createLogger, LogLevel } from '@graphql-microservices/shared-logging';

const logger = createLogger({
  service: 'users-service',
  level: LogLevel.INFO,
  version: '1.0.0',
});

logger.info('Service started', { port: 4001 });
logger.error('Database connection failed', error, { 
  correlationId: 'req-123',
  operation: 'startup' 
});
```

### GraphQL Integration

```typescript
import { createGraphQLLoggingPlugin } from '@graphql-microservices/shared-logging';

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [
    createGraphQLLoggingPlugin(logger)
  ],
});
```

### HTTP Middleware

```typescript
import { createHttpLoggingMiddleware, correlationUtils } from '@graphql-microservices/shared-logging';

app.use(correlationUtils.middleware());
app.use(createHttpLoggingMiddleware({
  service: 'gateway',
  level: LogLevel.INFO,
}));
```

### Performance Timing

```typescript
import { createTimer } from '@graphql-microservices/shared-logging';

const timer = createTimer(logger, { operation: 'user-lookup' });
const user = await findUser(id);
timer.stop('User lookup completed', { userId: user.id });
```

### Database Logging

```typescript
import { createDatabaseLogger } from '@graphql-microservices/shared-logging';

const dbLogger = createDatabaseLogger(logger);

const query = dbLogger.query('SELECT * FROM users WHERE id = ?', [userId]);
try {
  const result = await db.query(sql, params);
  query.success(result.rows.length);
} catch (error) {
  query.error(error);
}
```

### Business Metrics

```typescript
logger.metric('user.registration', 1, 'count', { 
  correlationId,
  source: 'web' 
});

logger.audit('user.login', 'user:123', { 
  correlationId,
  ipAddress: req.ip 
});
```

## Configuration

### Environment Variables

- `LOG_LEVEL`: Set logging level (trace, debug, info, warn, error, fatal)
- `NODE_ENV`: Controls pretty printing (development enables colors)
- `APP_VERSION`: Application version included in logs

### Logger Config

```typescript
interface LoggerConfig {
  level?: LogLevel;
  service: string;              // Required: service name
  version?: string;             // App version
  prettyPrint?: boolean;        // Enable colored output
  destination?: string;         // Log file path
  correlationIdHeader?: string; // Header name for correlation ID
  redactFields?: string[];      // Fields to redact from logs
}
```

## Log Format

All logs follow a consistent JSON structure:

```json
{
  "level": "info",
  "time": "2023-12-07T10:30:00.000Z",
  "pid": 12345,
  "hostname": "service-pod-abc",
  "service": "users-service",
  "version": "1.0.0",
  "environment": "production",
  "correlationId": "req-uuid-123",
  "operation": "getUser",
  "duration": 45,
  "msg": "User lookup completed"
}
```

## Security Features

- Automatic redaction of sensitive fields (passwords, tokens, etc.)
- Configurable field redaction
- Safe error serialization
- No sensitive data in logs by default

## Performance Impact

- Minimal overhead with JSON serialization
- Async logging where possible
- Configurable log levels to reduce verbosity in production
- Efficient correlation ID generation

## Integration Examples

### Service Setup

```typescript
// services/users/src/index.ts
import { createLogger, createGraphQLLoggingPlugin } from '@graphql-microservices/shared-logging';

const logger = createLogger({
  service: 'users-service',
  level: process.env.LOG_LEVEL as LogLevel || LogLevel.INFO,
});

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [
    createGraphQLLoggingPlugin(logger),
  ],
});

logger.info('Users service started', { port: 4001 });
```

### Resolver Logging

```typescript
const resolvers = {
  Query: {
    user: async (_, { id }, context) => {
      const { logger, correlationId } = context;
      const timer = createTimer(logger, { correlationId, operation: 'getUser' });
      
      try {
        const user = await userService.findById(id);
        timer.stop('User retrieved successfully', { userId: id });
        return user;
      } catch (error) {
        logger.error('Failed to retrieve user', error, { correlationId, userId: id });
        throw error;
      }
    },
  },
};
```

## Best Practices

1. **Always include correlation ID** in log context
2. **Use appropriate log levels** (info for business events, debug for technical details)
3. **Log performance metrics** for critical operations
4. **Include relevant context** (user ID, operation name, etc.)
5. **Use structured data** instead of string concatenation
6. **Redact sensitive information** from logs
7. **Log errors with full context** for debugging

## Monitoring Integration

Logs are structured for easy integration with:

- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Grafana Loki** for log aggregation
- **DataDog** or **New Relic** for APM
- **Prometheus** for metrics (via log-based metrics)

The structured format enables powerful querying and alerting based on correlation IDs, service names, and custom fields.