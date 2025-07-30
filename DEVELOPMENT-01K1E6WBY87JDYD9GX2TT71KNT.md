---
runme:
  id: 01K1E6WVNMBZPY5N9171BGRP0A
  version: v3
  document:
    relativePath: DEVELOPMENT.md
  session:
    id: 01K1E6WBY87JDYD9GX2TT71KNT
    updated: 2025-07-30 20:44:33+03:00
---

# Development Guide

## Getting Started

### Prerequisites

1. Install Bun.sh:

```bash {"id":"01K1E6WVNMBZPY5N9169BS7DAM"}
curl -fsSL ht******************ll | bash
```

2. Install dependencies:

```bash {"id":"01K1E6WVNMBZPY5N916AKNK7MJ"}
bun install
```

### Running the Services

Start all services:

```bash {"id":"01K1E6WVNMBZPY5N916EFJ8DTQ"}
bun run dev
```

Services will be available at:

- Gateway: ht*************************ql
- Users: ht*************************ql
- Products: ht*************************ql
- Orders: ht*************************ql

## Development Workflow

### 1. Making Changes

Services automatically reload when you save changes thanks to Bun's `--watch` flag.

### 2. Testing Your Changes

Use the GraphQL Playground at ht*************************ql to test queries:

```graphql {"id":"01K1E6WVNMBZPY5N916JDPCMJR"}
# Test federation - get user with orders
query TestFederation {
  user(id: "1") {
    username
    email
    orders {
      id
      total
      items {
        product {
          name
          price
        }
      }
    }
  }
}
```

### 3. Adding New Fields

Example: Add a `phoneNumber` field to User:

1. Update the schema in `services/users/src/index.ts`:

```graphql {"id":"01K1E6WVNMBZPY5N916MJYPHGJ"}
type User @key(fields: "id") {
  id: ID!
  username: String!
  email: String!
  name: String!
  phoneNumber: String  # New field
  createdAt: String!
}
```

2. Update the mock data:

```typescript {"id":"01K1E6WVNMBZPY5N916NPN7PDW"}
const users = [
  { 
    id: '1', 
    username: 'johndoe',
    email: 'jo************om',
    name: 'John Doe',
    phoneNumber: '+1234567890',  // Add data
    createdAt: new Date().toISOString()
  },
  // ...
];
```

### 4. Adding a New Service

1. Create the service structure:

```bash {"id":"01K1E6WVNMBZPY5N916P6HJAVF"}
mkdir -p services/inventory/src
```

2. Create `services/inventory/package.json`:

```json {"id":"01K1E6WVNMBZPY5N916RAMJEP3"}
{"name":"@graphql-microservices/inventory","version":"1.0.0","type":"module","scripts":{"dev":"bun run --watch src/index.ts","start":"bun run src/index.ts"},"dependencies":{"@apollo/server":"^4.11.2","@apollo/subgraph":"^2.10.1","graphql":"^16.10.0","graphql-tag":"^2.12.6"}}
```

3. Implement the service in `services/inventory/src/index.ts`
4. Add to gateway configuration in `services/gateway/src/index.ts`:

```typescript {"id":"01K1E6WVNMBZPY5N916SGM6GK6"}
subgraphs: [
  { name: 'users', url: 'ht*************************ql' },
  { name: 'products', url: 'ht*************************ql' },
  { name: 'orders', url: 'ht*************************ql' },
  { name: 'inventory', url: 'ht*************************ql' }, // New
],
```

5. Update `scripts/dev.ts` to include the new service

## Common Patterns

### Extending Entities Across Services

```typescript {"id":"01K1E6WVNMBZPY5N916TZE76DX"}
// In orders service, extend the User type
extend type User @key(fields: "id") {
  id: ID! @external
  orders: [Order!]!
}
```

### Implementing Reference Resolvers

```typescript {"id":"01K1E6WVNMBZPY5N916W9SDAX0"}
const resolvers = {
  Product: {
    __resolveReference: (reference: { id: string }) => {
      return products.find(p => p.id === reference.id);
    }
  }
};
```

### Error Handling

```typescript {"id":"01K1E6WVNMBZPY5N9170434GGZ"}
const resolvers = {
  Mutation: {
    updateProduct: async (_, { id, input }) => {
      const product = products.find(p => p.id === id);
      if (!product) {
        throw new GraphQLError('Product not found', {
          extensions: { code: 'PRODUCT_NOT_FOUND' }
        });
      }
      // Update logic
    }
  }
};
```

## Debugging Tips

1. **Service Won't Start**: Check if the port is already in use
2. **Federation Errors**: Ensure all services are running before starting the gateway
3. **Type Conflicts**: Make sure @key fields match across services
4. **Performance Issues**: Use DataLoader for batch loading

## Best Practices

1. **Keep Services Focused**: Each service should have a single responsibility
2. **Use Consistent Naming**: Follow the same patterns across all services
3. **Document GraphQL Schema**: Add descriptions to types and fields
4. **Handle Errors Gracefully**: Return meaningful error messages
5. **Test Federation Queries**: Ensure cross-service queries work correctly