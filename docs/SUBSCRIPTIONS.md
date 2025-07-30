# GraphQL Subscriptions Implementation

This document describes the GraphQL subscriptions implementation in the microservices architecture.

## Overview

Subscriptions enable real-time updates across the federated GraphQL microservices using Redis PubSub for inter-service communication.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │     │   Client    │     │   Client    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                    WebSocket/SSE
                           │
                  ┌────────▼────────┐
                  │     Gateway     │
                  │  (Port 4000)    │
                  └────────┬────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
    │  Users  │      │Products │      │ Orders  │
    │  (4001) │      │ (4002)  │      │ (4003)  │
    └────┬────┘      └────┬────┘      └────┬────┘
         │                 │                 │
         └─────────────────┴─────────────────┘
                           │
                    ┌──────▼──────┐
                    │    Redis    │
                    │   PubSub    │
                    └─────────────┘
```

## Implementation Details

### Shared PubSub Module

Located in `shared/pubsub/`, provides:
- Redis-based PubSub service
- Type-safe event constants
- Payload type definitions

### Service-Level Implementation

Each service implements:
1. Subscription type definitions in GraphQL schema
2. Subscription resolvers
3. Event publishing in mutations

### Events

#### User Service Events
- `USER_CREATED` - Fired when a new user signs up
- `USER_UPDATED` - Fired when user profile is updated
- `USER_DEACTIVATED` - Fired when admin deactivates a user

#### Product Service Events
- `PRODUCT_CREATED` - Fired when a new product is created
- `PRODUCT_UPDATED` - Fired when product details are updated
- `PRODUCT_STOCK_CHANGED` - Fired when product stock is modified
- `PRODUCT_DEACTIVATED` - Fired when a product is deactivated

#### Order Service Events
- `ORDER_CREATED` - Fired when a new order is placed
- `ORDER_STATUS_CHANGED` - Fired when order status changes
- `ORDER_CANCELLED` - Fired when an order is cancelled
- `ORDER_REFUNDED` - Fired when an order is refunded

## Usage Examples

### Subscribe to User Updates

```graphql
subscription OnUserUpdated($userId: ID) {
  userUpdated(userId: $userId) {
    id
    username
    email
    name
    role
    updatedAt
  }
}
```

### Subscribe to Product Stock Changes

```graphql
subscription OnProductStockChanged($productId: ID) {
  productStockChanged(productId: $productId) {
    id
    name
    stock
    updatedAt
  }
}
```

### Subscribe to Order Status Changes

```graphql
subscription OnOrderStatusChanged($userId: ID) {
  orderStatusChanged(userId: $userId) {
    id
    orderNumber
    status
    updatedAt
    user {
      id
      email
    }
  }
}
```

## Client Integration

### Using Apollo Client

```typescript
import { ApolloClient, InMemoryCache, split, HttpLink } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';

// Create WebSocket link for subscriptions
const wsLink = new GraphQLWsLink(createClient({
  url: 'ws://localhost:4000/graphql',
  connectionParams: {
    authorization: `Bearer ${getAuthToken()}`,
  },
}));

// Create HTTP link for queries and mutations
const httpLink = new HttpLink({
  uri: 'http://localhost:4000/graphql',
  headers: {
    authorization: `Bearer ${getAuthToken()}`,
  },
});

// Split traffic based on operation type
const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  httpLink,
);

const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
```

### Using with React

```typescript
import { useSubscription } from '@apollo/client';
import { graphql } from '@graphql-microservices/client';

const PRODUCT_UPDATED = graphql(`
  subscription OnProductUpdated($productId: ID!) {
    productUpdated(productId: $productId) {
      id
      name
      price
      stock
    }
  }
`);

function ProductDetails({ productId }) {
  const { data, loading } = useSubscription(PRODUCT_UPDATED, {
    variables: { productId },
  });

  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      <h2>{data?.productUpdated.name}</h2>
      <p>Price: ${data?.productUpdated.price}</p>
      <p>Stock: {data?.productUpdated.stock}</p>
    </div>
  );
}
```

## Security Considerations

1. **Authentication**: Subscriptions respect the same `@auth` directives as queries/mutations
2. **Authorization**: Role-based access control applies to subscriptions
3. **Filtering**: Subscriptions can be filtered by user context (e.g., users only see their own order updates)

## Performance Considerations

1. **Connection Pooling**: Redis connections are pooled and reused
2. **Event Filtering**: Events are filtered at the resolver level to minimize network traffic
3. **Graceful Shutdown**: PubSub connections are properly closed on service shutdown

## Testing Subscriptions

### Using GraphQL Playground

1. Navigate to http://localhost:4000/graphql
2. Open a subscription tab
3. Run a subscription query:

```graphql
subscription {
  productCreated {
    id
    name
    price
  }
}
```

4. In another tab, create a product:

```graphql
mutation {
  createProduct(input: {
    name: "Test Product"
    description: "Test"
    price: 99.99
    stock: 10
    sku: "TEST-001"
    category: "Electronics"
  }) {
    id
    name
  }
}
```

5. Observe the real-time update in the subscription tab

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Ensure the gateway supports WebSocket upgrade
   - Check CORS configuration
   - Verify authentication headers are passed correctly

2. **Events Not Received**
   - Verify Redis is running and accessible
   - Check service logs for publish errors
   - Ensure subscription resolver is correctly implemented

3. **Authentication Errors**
   - WebSocket connections need authentication in connection params
   - Token refresh might be needed for long-lived subscriptions

### Debug Mode

Enable debug logging for subscriptions:

```typescript
// In service startup
const pubSubService = new PubSubService({
  redisUrl: env.REDIS_URL,
  connectionOptions: {
    retryStrategy: (times) => Math.min(times * 50, 2000),
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
  },
});
```

## Future Enhancements

1. **Subscription Persistence**: Store subscription state for reconnection
2. **Rate Limiting**: Implement per-client subscription limits
3. **Metrics**: Add subscription metrics to monitoring
4. **Batching**: Batch multiple events for efficiency
5. **Filtering at Gateway**: Move some filtering logic to gateway level