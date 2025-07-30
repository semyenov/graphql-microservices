# Rate Limiting Implementation

This document describes the rate limiting implementation for the GraphQL microservices.

## Overview

Rate limiting is implemented using Redis-backed token bucket algorithm to protect the API from abuse and ensure fair usage across all clients.

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   Gateway   │────▶│    Redis    │
│ Rate Limiter│     │   Storage   │
└──────┬──────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│  Services   │
└─────────────┘
```

## Features

- **Redis-backed**: Distributed rate limiting across multiple service instances
- **Flexible Configuration**: Per-operation rate limits
- **User-aware**: Different limits for authenticated vs anonymous users
- **Graceful Degradation**: Clear error messages with retry information
- **Preset Configurations**: Common rate limit patterns

## Configuration

### Service Integration

```typescript
import { RateLimitService, RATE_LIMIT_PRESETS, applyRateLimiting } from '@graphql-microservices/shared-rate-limit';

// Initialize rate limit service
const rateLimitService = new RateLimitService({
  redisUrl: env.REDIS_URL,
  defaultPoints: 100,
  defaultDuration: 60,
  defaultBlockDuration: 60,
});

// Apply rate limiting to resolvers
const rateLimitedResolvers = applyRateLimiting(resolvers, rateLimitService, {
  'Mutation.signIn': RATE_LIMIT_PRESETS.AUTH,
  'Mutation.signUp': RATE_LIMIT_PRESETS.AUTH,
  'Query.expensiveQuery': RATE_LIMIT_PRESETS.EXPENSIVE,
});
```

### Custom Rate Limits

```typescript
// Define custom limits for specific operations
const customLimits = {
  'Mutation.createOrder': {
    points: 10,
    duration: 300, // 10 orders per 5 minutes
    blockDuration: 600, // Block for 10 minutes
  },
  'Query.searchProducts': {
    points: 50,
    duration: 60, // 50 searches per minute
    blockDuration: 120, // Block for 2 minutes
  },
};
```

## Rate Limit Presets

### AUTH (Authentication Operations)
- **Points**: 5
- **Duration**: 300 seconds (5 minutes)
- **Block Duration**: 900 seconds (15 minutes)
- **Use for**: signIn, signUp, password reset

### MUTATION (General Mutations)
- **Points**: 30
- **Duration**: 60 seconds (1 minute)
- **Block Duration**: 300 seconds (5 minutes)
- **Use for**: createProduct, updateUser, etc.

### QUERY (General Queries)
- **Points**: 100
- **Duration**: 60 seconds (1 minute)
- **Block Duration**: 60 seconds (1 minute)
- **Use for**: getUser, listProducts, etc.

### PUBLIC (Public Endpoints)
- **Points**: 200
- **Duration**: 60 seconds (1 minute)
- **Block Duration**: 30 seconds
- **Use for**: Public queries, health checks

### EXPENSIVE (Resource-Intensive Operations)
- **Points**: 10
- **Duration**: 300 seconds (5 minutes)
- **Block Duration**: 600 seconds (10 minutes)
- **Use for**: Complex reports, bulk operations

## Implementation Examples

### Basic Usage

```typescript
// In resolver
const resolvers = {
  Mutation: {
    createProduct: async (parent, args, context) => {
      // Rate limiting is automatically applied if configured
      return await createProduct(args.input);
    },
  },
};
```

### Manual Rate Limiting

```typescript
// For custom rate limiting logic
const resolvers = {
  Mutation: {
    bulkImport: async (parent, args, context) => {
      // Check rate limit manually
      await rateLimitService.checkLimit(
        context.user.id,
        'bulkImport',
        { points: 1, duration: 3600 } // 1 per hour
      );
      
      return await performBulkImport(args);
    },
  },
};
```

### Conditional Rate Limiting

```typescript
// Skip rate limiting for admin users
const rateLimitConfig = {
  'Mutation.deleteUser': {
    ...RATE_LIMIT_PRESETS.MUTATION,
    skipIf: (context) => context.user?.role === 'ADMIN',
  },
};
```

## Error Handling

When rate limit is exceeded, clients receive:

```json
{
  "errors": [{
    "message": "Too many requests. Please retry after 45 seconds.",
    "extensions": {
      "code": "RATE_LIMITED",
      "retryAfter": 45000,
      "limit": 5,
      "remaining": 0,
      "resetAt": "2024-01-15T10:30:00.000Z"
    }
  }]
}
```

## Client Implementation

### Handling Rate Limit Errors

```typescript
import { ApolloClient, ApolloError } from '@apollo/client';

const client = new ApolloClient({
  // ... configuration
  errorLink: onError(({ graphQLErrors, operation, forward }) => {
    if (graphQLErrors) {
      for (const err of graphQLErrors) {
        if (err.extensions?.code === 'RATE_LIMITED') {
          const retryAfter = err.extensions.retryAfter;
          
          // Show user-friendly message
          showNotification({
            type: 'warning',
            message: `Please wait ${Math.ceil(retryAfter / 1000)} seconds before trying again.`,
          });
          
          // Optionally retry after delay
          return new Observable(observer => {
            setTimeout(() => {
              forward(operation).subscribe(observer);
            }, retryAfter);
          });
        }
      }
    }
  }),
});
```

### Exponential Backoff

```typescript
async function executeWithBackoff(operation, maxRetries = 3) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (error.graphQLErrors?.[0]?.extensions?.code === 'RATE_LIMITED') {
        const retryAfter = error.graphQLErrors[0].extensions.retryAfter;
        await new Promise(resolve => setTimeout(resolve, retryAfter));
        lastError = error;
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}
```

## Monitoring

### Check Rate Limit Status

```typescript
// Add a query to check rate limit status
const resolvers = {
  Query: {
    rateLimitStatus: async (parent, args, context) => {
      const status = await rateLimitService.getStatus(
        context.user.id,
        'generalQuery'
      );
      
      return {
        limit: status.limit,
        remaining: status.remaining,
        resetAt: status.resetAt,
      };
    },
  },
};
```

### Metrics Integration

```typescript
// Track rate limit hits
rateLimitService.on('consume', (key, operation) => {
  metrics.increment('rate_limit.consume', { operation });
});

rateLimitService.on('rejected', (key, operation) => {
  metrics.increment('rate_limit.rejected', { operation });
});
```

## Best Practices

1. **Set Appropriate Limits**: Balance between security and user experience
2. **Use Different Keys**: Separate limits for different operation types
3. **Implement Graceful Handling**: Show clear messages to users
4. **Monitor Usage**: Track rate limit hits and adjust as needed
5. **Document Limits**: Make rate limits clear in API documentation

## Testing

### Unit Tests

```typescript
describe('Rate Limiting', () => {
  it('should limit requests after threshold', async () => {
    const rateLimiter = new RateLimitService({
      defaultPoints: 2,
      defaultDuration: 60,
    });
    
    // First two requests succeed
    await rateLimiter.checkLimit('test-key', 'test-op');
    await rateLimiter.checkLimit('test-key', 'test-op');
    
    // Third request fails
    await expect(
      rateLimiter.checkLimit('test-key', 'test-op')
    ).rejects.toThrow('Rate limit exceeded');
  });
});
```

### Integration Tests

```typescript
it('should rate limit GraphQL mutations', async () => {
  const client = createTestClient();
  
  // Make requests up to limit
  for (let i = 0; i < 5; i++) {
    await client.mutate({ mutation: CREATE_USER });
  }
  
  // Next request should fail
  const result = await client.mutate({ mutation: CREATE_USER });
  expect(result.errors[0].extensions.code).toBe('RATE_LIMITED');
});
```

## Troubleshooting

### Common Issues

1. **Rate limits not working**
   - Check Redis connection
   - Verify rate limit service is initialized
   - Ensure resolvers are wrapped correctly

2. **Incorrect user identification**
   - Check context.user is properly set
   - Verify IP detection for anonymous users
   - Consider proxy headers

3. **Too restrictive limits**
   - Monitor actual usage patterns
   - Adjust limits based on user feedback
   - Consider different limits for different user tiers

## Future Enhancements

1. **Dynamic Rate Limits**: Adjust limits based on server load
2. **User Tiers**: Different limits for free/premium users
3. **Cost-Based Limiting**: Limit based on query complexity
4. **Sliding Window**: More accurate rate limiting algorithm
5. **Rate Limit Headers**: Return limit info in response headers