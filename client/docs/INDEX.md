# gql-tada Client Package Documentation

Welcome to the gql-tada client package for the GraphQL microservices project. This package provides type-safe GraphQL operations for all services.

## 📚 Documentation

### Getting Started
- [README](../README.md) - Quick start guide and basic usage
- [Testing Guide](../../TESTING_GQL_TADA.md) - Step-by-step testing instructions

### Integration Guides
- [Framework Integration](../FRAMEWORK_INTEGRATION.md) - React, Vue, Svelte, Next.js, and more
- [Migration Guide](../MIGRATION_GUIDE.md) - Migrating from GraphQL Code Generator

### Best Practices
- [Performance Guide](../PERFORMANCE_GUIDE.md) - Optimization techniques and patterns
- [Troubleshooting](../TROUBLESHOOTING.md) - Common issues and solutions

## 🗂️ Package Structure

```
client/
├── src/
│   ├── index.ts              # Main exports
│   ├── graphql.ts            # gql-tada configuration
│   ├── queries.ts            # All available queries
│   ├── mutations.ts          # All available mutations
│   └── graphql-env.d.ts      # Generated types (after introspection)
├── examples/
│   ├── usage.ts              # Basic usage examples
│   └── federated-example.ts  # Advanced federation patterns
└── docs/
    └── INDEX.md              # This file
```

## 🚀 Available Operations

### User Service

**Queries:**
- `GET_USER` - Get user by ID
- `GET_USERS` - List all users (admin only)
- `GET_ME` - Get current user
- `GET_USER_WITH_ORDERS` - User with their orders (federation)

**Mutations:**
- `SIGN_UP` - Create new account
- `SIGN_IN` - Authenticate user
- `SIGN_OUT` - Log out
- `REFRESH_TOKEN` - Refresh JWT token
- `UPDATE_USER` - Update user details
- `UPDATE_PROFILE` - Update own profile
- `CHANGE_PASSWORD` - Change password
- `DEACTIVATE_USER` - Deactivate user (admin only)

### Product Service

**Queries:**
- `GET_PRODUCT` - Get product by ID
- `GET_PRODUCTS` - List products with filters

**Mutations:**
- `CREATE_PRODUCT` - Add new product
- `UPDATE_PRODUCT` - Update product details
- `DELETE_PRODUCT` - Remove product
- `UPDATE_PRODUCT_STOCK` - Update inventory

### Order Service

**Queries:**
- `GET_ORDER_WITH_DETAILS` - Order with user and product details
- `GET_MY_ORDERS` - Current user's orders

**Mutations:**
- `CREATE_ORDER` - Place new order
- `UPDATE_ORDER_STATUS` - Change order status
- `CANCEL_ORDER` - Cancel an order

## 🔧 Setup Instructions

### 1. Install Dependencies

```bash
bun install
```

### 2. Start Services

```bash
# Start all microservices
bun run dev
```

### 3. Generate Schema

```bash
# With services running, generate the federated schema
bun run schema:introspect
```

### 4. Use in Your Application

```typescript
import { SIGN_IN, GET_ME } from '@graphql-microservices/client';
import type { ResultOf, VariablesOf } from '@graphql-microservices/client';

// Type-safe variables
const variables: VariablesOf<typeof SIGN_IN> = {
  input: {
    username: 'user@example.com',
    password: 'password123'
  }
};

// Execute query
const result = await client.query({
  query: SIGN_IN,
  variables
});

// Type-safe result access
const token = result.data?.signIn?.accessToken;
```

## 🛠️ Development Workflow

### Adding New Queries

1. Add query to appropriate file (`queries.ts` or `mutations.ts`):
   ```typescript
   export const NEW_QUERY = graphql(`
     query NewQuery($id: ID!) {
       someField(id: $id) {
         id
         name
       }
     }
   `);
   ```

2. Export from `index.ts` if needed

3. TypeScript will automatically provide types!

### Using Fragments

```typescript
// Define reusable fragment
const USER_BASIC = graphql(`
  fragment UserBasic on User {
    id
    name
    email
  }
`);

// Use in queries
const GET_ORDER = graphql(`
  query GetOrder($id: ID!) {
    order(id: $id) {
      id
      user {
        ...UserBasic
      }
    }
  }
`, [USER_BASIC]);
```

### Working with Subscriptions

```typescript
const ORDER_UPDATES = graphql(`
  subscription OrderUpdates($orderId: ID!) {
    orderStatusChanged(orderId: $orderId) {
      id
      status
      updatedAt
    }
  }
`);
```

## 🎯 Type Safety Features

### Automatic Type Inference
- Variables are type-checked against schema
- Results have full type information
- No manual type definitions needed

### IDE Support
- Auto-completion for fields
- Inline documentation
- Error highlighting for invalid queries

### Compile-time Validation
- Queries validated against schema
- Type errors caught before runtime
- Refactoring support

## 📊 Performance Tips

1. **Use Fragments** - Reduce query duplication
2. **Select Only Needed Fields** - Avoid over-fetching
3. **Implement Caching** - Use Apollo Client cache
4. **Paginate Large Lists** - Use cursor-based pagination
5. **Batch Requests** - Combine related queries

## 🐛 Debugging

### Check Schema Generation
```bash
# Verify schema files exist
ls schema.json schema.graphql
```

### Validate Types
```bash
# Run TypeScript type checking
bun run typecheck
```

### Test Queries
Use GraphQL Playground at http://localhost:4000/graphql

## 📦 Deployment

The client package is designed to be:
- **Tree-shakeable** - Only used queries are bundled
- **Type-safe** - No runtime type errors
- **Framework agnostic** - Works with any setup

## 🤝 Contributing

When adding new operations:
1. Follow existing naming patterns
2. Include proper TypeScript types
3. Add usage examples
4. Update documentation

## 📞 Support

- Check [Troubleshooting Guide](../TROUBLESHOOTING.md)
- Review service logs for errors
- Ensure all services are healthy
- Verify authentication tokens