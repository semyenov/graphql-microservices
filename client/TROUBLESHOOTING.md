# Troubleshooting Guide for gql-tada

This guide helps you resolve common issues when using gql-tada with the GraphQL microservices.

## Common Issues and Solutions

### 1. TypeScript Errors: "Type 'never' is not assignable"

**Problem**: Variables or results are typed as `never`

**Cause**: The schema hasn't been generated or TypeScript hasn't loaded the types

**Solution**:
```bash
# 1. Ensure all services are running
bun run dev

# 2. Generate the schema
bun run schema:introspect

# 3. Restart TypeScript server in VS Code
# Cmd+Shift+P → "TypeScript: Restart TS Server"

# 4. If still not working, check graphql-env.d.ts exists
ls client/src/graphql-env.d.ts
```

### 2. "Cannot find module './graphql-env.d.ts'"

**Problem**: The type definitions file is missing

**Solution**:
```bash
# Ensure the gateway is running, then:
bun run schema:introspect

# If the file still doesn't exist, check the introspection script output
bun run scripts/introspect-schema.ts
```

### 3. Query Returns Null Despite Data in Database

**Problem**: Query executes but returns null

**Possible Causes**:
1. Authentication missing
2. Permission denied
3. Cache returning stale data

**Solution**:
```typescript
// 1. Check authentication header
const response = await fetch('http://localhost:4000/graphql', {
  headers: {
    'Authorization': `Bearer ${token}`, // Ensure token is valid
  },
});

// 2. Check GraphQL errors
const result = await response.json();
if (result.errors) {
  console.error('GraphQL Errors:', result.errors);
}

// 3. Clear Redis cache if needed
docker exec -it graphql-microservices-redis redis-cli FLUSHALL
```

### 4. Federation Fields Not Resolving

**Problem**: Cross-service fields return null (e.g., `order.user` or `user.orders`)

**Cause**: Reference resolvers not working properly

**Solution**:
```typescript
// 1. Check service logs for errors
// Look for "__resolveReference" errors

// 2. Verify services can communicate
curl http://localhost:4001/health
curl http://localhost:4002/health
curl http://localhost:4003/health

// 3. Check gateway configuration
// Ensure all services are listed in subgraphs
```

### 5. Types Not Updating After Schema Changes

**Problem**: Made schema changes but TypeScript doesn't see them

**Solution**:
```bash
# 1. Re-run introspection
bun run schema:introspect

# 2. Clear TypeScript cache
rm -rf node_modules/.cache
rm .tsbuildinfo

# 3. Restart your development server
# Ctrl+C, then bun run dev

# 4. Force TypeScript to reload
touch client/src/graphql.ts
```

### 6. Performance Issues with Large Queries

**Problem**: Queries are slow or timing out

**Solution**:
```typescript
// 1. Use pagination
const PAGINATED_QUERY = graphql(`
  query GetOrders($first: Int = 20, $after: String) {
    orders(first: $first, after: $after) {
      nodes { id }
      pageInfo { hasNextPage, endCursor }
    }
  }
`);

// 2. Select only needed fields
// Bad: Selecting everything
query { users { ...AllUserFields } }

// Good: Select specific fields
query { users { id name email } }

// 3. Use fragments for repeated selections
const USER_BASIC = graphql(`
  fragment UserBasic on User {
    id
    name
    email
  }
`);
```

### 7. "Cannot read properties of undefined"

**Problem**: Trying to access nested fields that might be null

**Solution**:
```typescript
// Use optional chaining
const userName = data?.user?.name;

// Or check existence first
if (data?.user) {
  console.log(data.user.name);
}

// For arrays, check length
data?.user?.orders?.forEach(order => {
  // Safe iteration
});
```

### 8. Subscription Connection Issues

**Problem**: Subscriptions not receiving updates

**Solution**:
```typescript
// 1. Check WebSocket connection
const wsClient = new WebSocketLink({
  uri: 'ws://localhost:4000/graphql',
  options: {
    reconnect: true,
    connectionParams: {
      authorization: `Bearer ${token}`,
    },
  },
});

// 2. Handle connection lifecycle
wsClient.on('connected', () => console.log('WS Connected'));
wsClient.on('error', (error) => console.error('WS Error:', error));
```

### 9. Bundle Size Too Large

**Problem**: Client bundle includes all queries even if unused

**Solution**:
```typescript
// 1. Use dynamic imports
const loadAdminQueries = async () => {
  const { ADMIN_QUERIES } = await import('./queries/admin');
  return ADMIN_QUERIES;
};

// 2. Split queries by feature
// queries/auth.ts - Authentication queries only
// queries/products.ts - Product queries only
// queries/orders.ts - Order queries only

// 3. Tree-shake unused exports
// In vite.config.ts or webpack.config.js
{
  build: {
    rollupOptions: {
      treeshake: {
        moduleSideEffects: false,
      },
    },
  },
}
```

### 10. Development Server Memory Issues

**Problem**: Dev server consuming too much memory

**Solution**:
```bash
# 1. Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" bun run dev

# 2. Disable source maps in development
# In tsconfig.json
{
  "compilerOptions": {
    "sourceMap": false
  }
}

# 3. Use incremental compilation
{
  "compilerOptions": {
    "incremental": true
  }
}
```

## Debugging Tools

### 1. GraphQL Playground

Access at http://localhost:4000/graphql to:
- Test queries manually
- View schema documentation
- Check available fields

### 2. Apollo DevTools

Install browser extension for:
- Cache inspection
- Query performance metrics
- Network request details

### 3. Enable Verbose Logging

```typescript
// In services
const server = new ApolloServer({
  schema,
  plugins: [
    {
      requestDidStart() {
        return {
          willSendResponse(requestContext) {
            console.log('Query:', requestContext.request.query);
            console.log('Variables:', requestContext.request.variables);
          },
        };
      },
    },
  ],
});
```

### 4. Type Checking

```bash
# Check types without building
bun run typecheck

# Get detailed type errors
bunx tsc --noEmit --listFiles
```

## Error Reference

### GraphQL Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Cannot query field X on type Y` | Field doesn't exist | Check schema, re-run introspection |
| `Variable $X of required type Y was not provided` | Missing required variable | Provide all required variables |
| `Access denied` | Insufficient permissions | Check user role and auth |
| `Authentication required` | Missing or invalid token | Provide valid JWT token |

### TypeScript Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Type 'never' is not assignable` | Schema not generated | Run schema:introspect |
| `Property does not exist on type` | Selecting wrong fields | Check available fields in schema |
| `Argument of type X is not assignable` | Wrong variable types | Match variable types to schema |

## Getting Help

1. **Check Logs**: Service logs often contain detailed error messages
2. **Schema Explorer**: Use GraphQL Playground to explore available fields
3. **Type Hints**: Hover over queries in VS Code to see available fields
4. **Community**: Check gql-tada GitHub issues for similar problems

## Validation Checklist

Before reporting an issue, check:

- [ ] All services are running (`bun run dev`)
- [ ] Schema is generated (`bun run schema:introspect`)
- [ ] TypeScript server is restarted
- [ ] No TypeScript errors (`bun run typecheck`)
- [ ] Authentication token is valid
- [ ] Redis and PostgreSQL are running
- [ ] Network requests reach the gateway