# Fixing Federation Composition Error

## Error
```
Non-shareable field "PageInfo.hasNextPage" is resolved from multiple subgraphs: it is resolved from subgraphs "orders" and "users" and defined as non-shareable in all of them
```

## Root Cause
The PageInfo type is being implicitly created or referenced in multiple services without being properly marked as shareable in Apollo Federation v2.

## Solution Applied
1. Added `@shareable` directive to PageInfo type in orders service:
```typescript
type PageInfo @shareable {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

## Testing Steps
1. Ensure all services are running:
```bash
# Terminal 1 - Start databases
bun run docker:dev

# Terminal 2 - Start all services
bun run dev
```

2. Wait for all services to be ready:
- Users service at http://localhost:4001
- Products service at http://localhost:4002  
- Orders service at http://localhost:4003

3. The gateway at http://localhost:4000 should start successfully

## Additional Notes
- The error suggests PageInfo is defined in both "orders" and "users" services
- Currently, PageInfo is only explicitly defined in orders service
- The @shareable directive allows the same type to be defined in multiple subgraphs
- Make sure all services are running before the gateway tries to compose the supergraph

## If Error Persists
1. Check if any generated code is creating implicit PageInfo types
2. Verify no other service has pagination that creates PageInfo
3. Consider moving PageInfo to a shared schema if needed