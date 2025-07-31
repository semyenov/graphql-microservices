# GraphQL Microservices Observability Package

This package provides OpenTelemetry observability instrumentation for the GraphQL microservices architecture, including distributed tracing, metrics collection, and enhanced logging.

## Features

- **Distributed Tracing**: Track requests across all federated services
- **Automatic Instrumentation**: Built-in support for GraphQL, HTTP, Redis, and DataLoader
- **Custom Metrics**: Record business metrics like signup rates, cache hit ratios
- **Context Propagation**: Trace context flows through the entire request lifecycle
- **Apollo Server Plugin**: Deep integration with GraphQL execution
- **Performance Monitoring**: Track resolver execution times and database query durations

## Installation

```bash
bun add @graphql-microservices/shared-observability
```

## Quick Start

### 1. Set Environment Variables

```bash
# Required
OTEL_SERVICE_NAME=users-service
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Optional
OTEL_TRACES_ENABLED=true
OTEL_METRICS_ENABLED=true
OTEL_EXPORTER_OTLP_HEADERS=api-key=your-key
OTEL_LOG_LEVEL=info
```

### 2. Initialize Observability (First Import!)

```typescript
// IMPORTANT: This must be the first import in your service
import { setupServiceObservability } from '@graphql-microservices/shared-observability/service-integration';
const { metrics } = setupServiceObservability('users-service');

// Now import everything else
import { ApolloServer } from '@apollo/server';
// ... other imports
```

### 3. Use Instrumented Resolvers

```typescript
const resolvers = {
  Query: {
    user: async (_, { id }, context) => {
      return instrumentedResolver(
        'Query.user',
        async ({ id, context }) => {
          // Your resolver logic here
          const user = await context.prisma.user.findUnique({ where: { id } });
          return user;
        },
        { id, context },
        { userId: id } // Custom attributes
      );
    },
  },
};
```

## Core APIs

### Initialize Observability

```typescript
import { initializeObservability } from '@graphql-microservices/shared-observability';

const sdk = initializeObservability('service-name');
```

### Create Custom Spans

```typescript
import { createSpan, addSpanAttributes, addSpanEvent } from '@graphql-microservices/shared-observability';

await createSpan('operation.name', async (span) => {
  // Add attributes
  addSpanAttributes({
    'user.id': userId,
    'operation.type': 'query',
  });
  
  // Your operation
  const result = await someOperation();
  
  // Add events
  addSpanEvent('operation.completed', { 
    resultCount: result.length 
  });
  
  return result;
});
```

### Record Metrics

```typescript
const metrics = new MetricsRecorder('service-name');

// Count events
metrics.recordCounter('user.login', 1, { method: 'oauth' });

// Record values
metrics.recordHistogram('request.size', 1024, { endpoint: '/graphql' });

// Time operations
const result = await metrics.recordDuration(
  'database.query',
  async () => await db.query(sql),
  { table: 'users' }
);
```

## Instrumentation Helpers

### Database Operations

```typescript
const user = await instrumentedDatabaseOperation(
  'user.findById',
  () => prisma.user.findUnique({ where: { id } }),
  metrics
);
```

### Cache Operations

```typescript
const cached = await instrumentedCacheOperation(
  'get',
  'user:123',
  () => redis.get('user:123'),
  metrics
);
```

### HTTP Requests

```typescript
const response = await makeInstrumentedRequest(
  'https://api.example.com/users',
  {
    method: 'POST',
    body: JSON.stringify(data),
  }
);
```

## Apollo Server Integration

### Create Instrumented Server

```typescript
import { createInstrumentedApolloServer } from '@graphql-microservices/shared-observability/service-integration';

const server = createInstrumentedApolloServer(
  buildSubgraphSchema([{ typeDefs, resolvers }]),
  'users-service',
  formatError
);
```

### Create Instrumented Context

```typescript
const { url } = await startStandaloneServer(server, {
  context: async ({ req }) => {
    return createInstrumentedContext(req, async () => ({
      prisma,
      redis,
      user: await getUser(req),
    }));
  },
});
```

## Best Practices

### 1. Attribute Naming

Follow OpenTelemetry semantic conventions:
- `user.id` instead of `userId`
- `http.method` instead of `method`
- `db.operation` instead of `query`

### 2. Sensitive Data

Never include sensitive data in spans:
```typescript
// ❌ Bad
addSpanAttributes({ password: user.password });

// ✅ Good
addSpanAttributes({ 'user.id': user.id });
```

### 3. Error Handling

Errors are automatically recorded, but add context:
```typescript
try {
  await riskyOperation();
} catch (error) {
  addSpanEvent('operation.failed', {
    'error.type': error.constructor.name,
    'error.code': error.code,
  });
  throw error;
}
```

### 4. Sampling

For high-volume services, configure sampling:
```bash
OTEL_TRACES_SAMPLER=traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1  # Sample 10% of traces
```

## Viewing Traces

### Jaeger (Development)

```bash
# Start Jaeger
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest

# View traces at http://localhost:16686
```

### Production Options

- **Datadog**: Set `OTEL_EXPORTER_OTLP_ENDPOINT` to Datadog's OTLP endpoint
- **New Relic**: Use their OTLP endpoint with API key in headers
- **AWS X-Ray**: Use the AWS Distro for OpenTelemetry
- **Google Cloud Trace**: Use Google's OpenTelemetry exporter

## Common Patterns

### Trace Correlation in Logs

```typescript
import { getActiveSpan } from '@graphql-microservices/shared-observability';

const span = getActiveSpan();
if (span) {
  const { traceId, spanId } = span.spanContext();
  console.log(`[${traceId}:${spanId}] Operation completed`);
}
```

### Cross-Service Tracing

```typescript
// Service A: Inject trace context
const headers = injectTraceContext({});
await fetch('http://service-b/api', { headers });

// Service B: Extract trace context
const traceContext = extractTraceContext(req.headers);
```

### Performance Monitoring

```typescript
// Track slow queries
const result = await instrumentedDatabaseOperation(
  'user.complexQuery',
  async () => {
    const start = Date.now();
    const result = await prisma.$queryRaw`...`;
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      addSpanEvent('slow.query.detected', { duration });
    }
    
    return result;
  },
  metrics
);
```

## Troubleshooting

### No Traces Appearing

1. Check environment variables are set
2. Verify OTLP endpoint is accessible
3. Ensure observability is initialized first
4. Check for errors in console

### Missing Spans

1. Verify instrumentation is active
2. Check span status for errors
3. Ensure context propagation

### Performance Impact

1. Use sampling in production
2. Limit span attributes
3. Batch span exports
4. Monitor memory usage

## Complete Example

See `services/users/src/index-with-observability.ts` for a complete example of integrating observability into a service.
