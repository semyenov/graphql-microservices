# GraphQL Client with gql-tada

This package provides type-safe GraphQL queries and mutations using gql-tada.

## Usage

### 1. Generate Schema

First, ensure the gateway is running, then generate the schema:

```bash
bun run schema:introspect
```

### 2. Import and Use

```typescript
import { graphql, SIGN_IN, GET_USER_WITH_ORDERS } from '@graphql-microservices/client';
import type { ResultOf, VariablesOf } from '@graphql-microservices/client';

// Type-safe variables
const variables: VariablesOf<typeof SIGN_IN> = {
  input: {
    username: 'john.doe',
    password: 'password123'
  }
};

// Execute query with any GraphQL client
const result = await client.query({
  query: SIGN_IN,
  variables
});

// Type-safe result access
const data: ResultOf<typeof SIGN_IN> = result.data;
console.log(data.signIn.user.email); // TypeScript knows this exists!
```

### 3. Creating New Queries

```typescript
import { graphql } from '@graphql-microservices/client';

// Define a new query with automatic type inference
export const MY_QUERY = graphql(`
  query MyQuery($id: ID!) {
    user(id: $id) {
      id
      username
      orders {
        id
        totalAmount
      }
    }
  }
`);
```

## Features

- **Zero-config types**: No manual type definitions needed
- **IDE support**: Full auto-completion and inline documentation
- **Federation support**: Works seamlessly with Apollo Federation
- **Client agnostic**: Use with Apollo Client, urql, or plain fetch

## Examples

See the `examples/usage.ts` file for complete examples with different GraphQL clients.