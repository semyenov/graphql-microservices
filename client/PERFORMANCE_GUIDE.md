# Performance Optimization Guide for gql-tada

This guide covers best practices for optimizing performance when using gql-tada with your GraphQL microservices.

## 1. Query Optimization

### Use Fragments for Reusability

Instead of repeating selections, use fragments:

```typescript
// ❌ Bad - Repetitive selections
const ORDERS_QUERY = graphql(`
  query GetOrders {
    orders {
      id
      status
      total
      user { id name email }
      items { id quantity price product { id name price } }
    }
  }
`);

const ORDER_DETAILS = graphql(`
  query GetOrder($id: ID!) {
    order(id: $id) {
      id
      status
      total
      user { id name email }
      items { id quantity price product { id name price } }
    }
  }
`);

// ✅ Good - Reusable fragments
const ORDER_FRAGMENT = graphql(`
  fragment OrderDetails on Order {
    id
    status
    total
    user { id name email }
    items {
      id
      quantity
      price
      product { id name price }
    }
  }
`);

const ORDERS_QUERY = graphql(`
  query GetOrders {
    orders {
      ...OrderDetails
    }
  }
`, [ORDER_FRAGMENT]);
```

### Avoid Over-fetching

Only request fields you need:

```typescript
// ❌ Bad - Fetching unnecessary fields
const USER_QUERY = graphql(`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      username
      email
      name
      phoneNumber
      role
      isActive
      createdAt
      updatedAt
      orders {
        id
        status
        totalAmount
        items {
          id
          quantity
          price
          product {
            id
            name
            description
            price
            sku
            category
            tags
            stock
          }
        }
      }
    }
  }
`);

// ✅ Good - Only fetch what you need
const USER_SUMMARY = graphql(`
  query GetUserSummary($id: ID!) {
    user(id: $id) {
      id
      name
      email
      orders(first: 5) {
        nodes {
          id
          totalAmount
          createdAt
        }
        totalCount
      }
    }
  }
`);
```

## 2. Caching Strategies

### Implement Field-level Caching

Use the cache hints in your services:

```typescript
// In your service resolvers
const resolvers = {
  Query: {
    product: async (_, { id }, context) => {
      // Check cache first
      const cached = await context.cacheService.get(`product:${id}`);
      if (cached) return cached;
      
      const product = await context.prisma.product.findUnique({ where: { id } });
      
      // Cache for 5 minutes
      await context.cacheService.set(`product:${id}`, product, 300);
      
      return product;
    },
  },
};
```

### Use Apollo Client Cache

Configure proper cache policies:

```typescript
const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        products: {
          // Cache products list for 60 seconds
          read(existing, { args, toReference }) {
            if (existing && Date.now() - existing.timestamp < 60000) {
              return existing.data;
            }
          },
        },
      },
    },
    Product: {
      fields: {
        // Normalize price to number for consistent caching
        price: {
          read(price) {
            return typeof price === 'string' ? parseFloat(price) : price;
          },
        },
      },
    },
  },
});
```

## 3. Batching and DataLoader

### Batch Queries with DataLoader

Already implemented in services, but ensure proper usage:

```typescript
// In client code, batch multiple queries
const batchQueries = graphql(`
  query BatchedDashboard($userId: ID!, $productIds: [ID!]!) {
    user(id: $userId) {
      id
      name
      recentOrders: orders(first: 5) {
        nodes { id totalAmount }
      }
    }
    products(ids: $productIds) {
      id
      name
      price
      stock
    }
  }
`);
```

### Use Field Aliases for Parallel Fetching

```typescript
const PARALLEL_STATS = graphql(`
  query ParallelStats {
    todayOrders: orders(dateFrom: $today) {
      totalCount
      nodes { id totalAmount }
    }
    weekOrders: orders(dateFrom: $weekAgo) {
      totalCount
      aggregateTotal
    }
    lowStock: products(maxStock: 10) {
      id
      name
      stock
    }
  }
`);
```

## 4. Pagination Best Practices

### Use Cursor-based Pagination

```typescript
const PAGINATED_ORDERS = graphql(`
  query PaginatedOrders($after: String, $first: Int = 20) {
    orders(after: $after, first: $first) {
      nodes {
        id
        orderNumber
        totalAmount
        createdAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`);

// Implement infinite scroll
function useInfiniteOrders() {
  const [orders, setOrders] = useState([]);
  const [cursor, setCursor] = useState(null);
  
  const loadMore = async () => {
    const result = await client.query({
      query: PAGINATED_ORDERS,
      variables: { after: cursor, first: 20 },
    });
    
    setOrders([...orders, ...result.data.orders.nodes]);
    setCursor(result.data.orders.pageInfo.endCursor);
  };
  
  return { orders, loadMore };
}
```

## 5. Bundle Size Optimization

### Use Dynamic Imports for Large Queries

```typescript
// queries/admin.ts - Only loaded for admin users
export const ADMIN_QUERIES = {
  FULL_USER_DATA: graphql(`
    query FullUserData {
      users {
        id
        username
        email
        name
        phoneNumber
        role
        isActive
        createdAt
        updatedAt
        refreshToken
        orders {
          id
          status
          totalAmount
          items {
            id
            quantity
            price
            product {
              id
              name
              price
            }
          }
        }
      }
    }
  `),
};

// In component
if (user.role === 'ADMIN') {
  const { ADMIN_QUERIES } = await import('./queries/admin');
  // Use admin queries
}
```

### Tree-shake Unused Queries

```typescript
// ❌ Bad - Importing everything
import * as queries from '@graphql-microservices/client';

// ✅ Good - Import only what you need
import { GET_USER, UPDATE_USER } from '@graphql-microservices/client';
```

## 6. Real-time Optimization

### Implement Subscriptions Efficiently

```typescript
const ORDER_STATUS_SUB = graphql(`
  subscription OrderStatus($orderId: ID!) {
    orderStatusChanged(orderId: $orderId) {
      id
      status
      updatedAt
    }
  }
`);

// Unsubscribe when not needed
useEffect(() => {
  const subscription = client.subscribe({
    query: ORDER_STATUS_SUB,
    variables: { orderId },
  }).subscribe({
    next: (result) => {
      // Update only the status field in cache
      cache.modify({
        id: cache.identify({ __typename: 'Order', id: orderId }),
        fields: {
          status: () => result.data.orderStatusChanged.status,
          updatedAt: () => result.data.orderStatusChanged.updatedAt,
        },
      });
    },
  });
  
  return () => subscription.unsubscribe();
}, [orderId]);
```

## 7. Development Performance

### Use GraphQL Code Generator Wisely

```yaml
# codegen.yml - Optimize for development
generates:
  ./src/generated/:
    documents: 
      - './src/**/*.tsx'
      - '!./src/**/*.test.tsx' # Exclude tests
    config:
      # Only generate used types
      onlyOperationTypes: true
      # Skip generating hooks if not using them
      skipTypename: true
```

### Enable TypeScript Incremental Compilation

```json
// tsconfig.json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

## 8. Monitoring and Debugging

### Add Performance Tracking

```typescript
// Create a performance-aware client
const performanceLink = new ApolloLink((operation, forward) => {
  const start = performance.now();
  
  return forward(operation).map((response) => {
    const duration = performance.now() - start;
    
    if (duration > 1000) {
      console.warn(`Slow query ${operation.operationName}: ${duration}ms`);
    }
    
    // Send to analytics
    analytics.track('graphql_query', {
      operationName: operation.operationName,
      duration,
      variables: operation.variables,
    });
    
    return response;
  });
});
```

### Use Apollo DevTools

```typescript
// Enable devtools in development
const client = new ApolloClient({
  // ... other config
  connectToDevTools: process.env.NODE_ENV === 'development',
});
```

## Performance Checklist

- [ ] Use fragments for repeated selections
- [ ] Implement field-level caching in resolvers
- [ ] Configure Apollo Client cache policies
- [ ] Use cursor-based pagination for large lists
- [ ] Batch related queries when possible
- [ ] Lazy-load admin/rare queries
- [ ] Monitor query performance
- [ ] Enable TypeScript incremental builds
- [ ] Use DataLoader for N+1 prevention
- [ ] Implement proper subscription cleanup