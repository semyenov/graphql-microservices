# Testing gql-tada Integration

This guide helps you test the gql-tada integration with your GraphQL microservices.

## Prerequisites

1. Ensure databases are running:
   ```bash
   bun run docker:dev
   ```

2. Set up databases (if not already done):
   ```bash
   bun run setup
   ```

## Step 1: Start All Services

```bash
bun run dev
```

Wait until you see all services are ready:
- Gateway ready at http://localhost:4000
- Users service ready at http://localhost:4001  
- Products service ready at http://localhost:4002
- Orders service ready at http://localhost:4003

## Step 2: Generate Schema

In a new terminal, generate the federated schema:

```bash
bun run schema:introspect
```

This should create:
- `schema.json` - Introspection result for gql-tada
- `schema.graphql` - GraphQL SDL (optional)

## Step 3: Test Type-Safe Queries

Create a test file `test-gql-tada.ts`:

```typescript
import { SIGN_IN, GET_ME, GET_USER_WITH_ORDERS } from './client/src';

async function test() {
  // 1. Sign in
  const signInResponse = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: SIGN_IN,
      variables: {
        input: {
          username: 'admin',
          password: 'admin123'
        }
      }
    })
  });

  const signInResult = await signInResponse.json();
  console.log('Sign in result:', signInResult);

  const token = signInResult.data?.signIn?.accessToken;
  if (!token) {
    console.error('Failed to sign in');
    return;
  }

  // 2. Get current user
  const meResponse = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ query: GET_ME })
  });

  const meResult = await meResponse.json();
  console.log('Current user:', meResult.data?.me);

  // 3. Get user with orders (federated query)
  const userId = meResult.data?.me?.id;
  if (userId) {
    const ordersResponse = await fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        query: GET_USER_WITH_ORDERS,
        variables: { id: userId }
      })
    });

    const ordersResult = await ordersResponse.json();
    console.log('User with orders:', ordersResult.data?.user);
  }
}

test().catch(console.error);
```

Run it:
```bash
bun run test-gql-tada.ts
```

## Step 4: Verify Type Safety in VS Code

1. Open `client/src/queries.ts` in VS Code
2. Try modifying a query - you should see:
   - Auto-completion for available fields
   - Type errors if you reference non-existent fields
   - Inline documentation for fields

Example - this should show an error:
```typescript
const BAD_QUERY = graphql(`
  query BadQuery {
    user(id: "123") {
      nonExistentField  # ❌ TypeScript error!
    }
  }
`);
```

## Step 5: Create New Type-Safe Queries

Add a new query to `client/src/queries.ts`:

```typescript
export const SEARCH_PRODUCTS = graphql(`
  query SearchProducts($query: String!) {
    searchProducts(query: $query) {
      id
      name
      price
      category
      stock
    }
  }
`);
```

Use it with full type safety:
```typescript
const result = await client.query({
  query: SEARCH_PRODUCTS,
  variables: { query: "laptop" }  // ✅ Type-safe!
});

// TypeScript knows the exact shape
result.data.searchProducts.forEach(product => {
  console.log(product.name, product.price);  // ✅ Auto-completion!
});
```

## Troubleshooting

### Schema introspection fails
- Ensure the gateway is running at http://localhost:4000
- Check that all services are healthy
- Try accessing http://localhost:4000/graphql in your browser

### Types not updating
- Re-run `bun run schema:introspect`
- Restart TypeScript server in VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"
- Check that `client/src/graphql-env.d.ts` was generated

### Import errors
- Ensure you've run `bun install` in the root directory
- Check that the client package is listed in workspaces