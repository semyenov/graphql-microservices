# Framework Integration Guide for gql-tada

This guide shows how to integrate gql-tada with popular frontend frameworks and GraphQL clients.

## React + Apollo Client

### Setup

```bash
bun add @apollo/client graphql
```

### Usage

```tsx
// apollo-client.ts
import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

const httpLink = createHttpLink({
  uri: 'http://localhost:4000/graphql',
});

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem('authToken');
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  };
});

export const apolloClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});
```

```tsx
// UserProfile.tsx
import { useQuery, useMutation } from '@apollo/client';
import { GET_USER, UPDATE_PROFILE } from '@graphql-microservices/client';
import type { ResultOf, VariablesOf } from '@graphql-microservices/client';

function UserProfile({ userId }: { userId: string }) {
  const { data, loading, error } = useQuery(GET_USER, {
    variables: { id: userId },
  });

  const [updateProfile] = useMutation(UPDATE_PROFILE);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  // TypeScript knows data.user exists and all its fields!
  const user = data?.user;
  if (!user) return <div>User not found</div>;

  const handleUpdate = async () => {
    const result = await updateProfile({
      variables: {
        input: {
          name: 'New Name',
          phoneNumber: '+1234567890',
        },
      },
    });

    // Type-safe result access
    console.log('Updated:', result.data?.updateProfile.name);
  };

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <button onClick={handleUpdate}>Update Profile</button>
    </div>
  );
}
```

## Vue 3 + urql

### Setup

```bash
bun add @urql/vue graphql
```

### Usage

```vue
<!-- UserList.vue -->
<script setup lang="ts">
import { useQuery } from '@urql/vue';
import { GET_USERS } from '@graphql-microservices/client';
import type { ResultOf } from '@graphql-microservices/client';

const { data, fetching, error } = useQuery({
  query: GET_USERS,
});

// Computed with type safety
const users = computed(() => {
  const result = data.value as ResultOf<typeof GET_USERS> | undefined;
  return result?.users || [];
});
</script>

<template>
  <div>
    <h1>Users</h1>
    <div v-if="fetching">Loading...</div>
    <div v-else-if="error">Error: {{ error.message }}</div>
    <ul v-else>
      <li v-for="user in users" :key="user.id">
        {{ user.name }} ({{ user.email }})
      </li>
    </ul>
  </div>
</template>
```

## SvelteKit + Native Fetch

### Server-side Query

```typescript
// +page.server.ts
import { GET_PRODUCTS } from '@graphql-microservices/client';
import type { ResultOf } from '@graphql-microservices/client';

export async function load({ fetch }) {
  const response = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: GET_PRODUCTS,
      variables: { inStock: true },
    }),
  });

  const result = await response.json();
  const data = result.data as ResultOf<typeof GET_PRODUCTS>;

  return {
    products: data?.products || [],
  };
}
```

### Client Component

```svelte
<!-- ProductList.svelte -->
<script lang="ts">
  import { CREATE_ORDER } from '@graphql-microservices/client';
  import type { VariablesOf } from '@graphql-microservices/client';

  export let products: any[];

  async function createOrder(items: VariablesOf<typeof CREATE_ORDER>['input']['items']) {
    const response = await fetch('/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${$authToken}`,
      },
      body: JSON.stringify({
        query: CREATE_ORDER,
        variables: { input: { items } },
      }),
    });

    const result = await response.json();
    // Handle result with full type safety
  }
</script>
```

## Next.js 14 + Server Components

### Server Component

```tsx
// app/products/page.tsx
import { GET_PRODUCTS } from '@graphql-microservices/client';
import type { ResultOf } from '@graphql-microservices/client';

async function getProducts() {
  const response = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: GET_PRODUCTS,
      variables: { inStock: true },
    }),
    next: { revalidate: 60 }, // Cache for 60 seconds
  });

  const result = await response.json();
  return result.data as ResultOf<typeof GET_PRODUCTS>;
}

export default async function ProductsPage() {
  const data = await getProducts();

  return (
    <div>
      <h1>Products</h1>
      <div className="grid grid-cols-3 gap-4">
        {data?.products?.map((product) => (
          <div key={product.id} className="border p-4">
            <h2>{product.name}</h2>
            <p>${product.price}</p>
            <p>Stock: {product.stock}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Client Component with Server Action

```tsx
// app/products/ProductActions.tsx
'use client';

import { useMutation } from '@apollo/client';
import { UPDATE_PRODUCT_STOCK } from '@graphql-microservices/client';

export function ProductActions({ productId }: { productId: string }) {
  const [updateStock] = useMutation(UPDATE_PRODUCT_STOCK);

  async function handleUpdateStock(formData: FormData) {
    const quantity = parseInt(formData.get('quantity') as string);
    
    const result = await updateStock({
      variables: { id: productId, quantity },
    });

    // TypeScript knows the exact shape of the result
    if (result.data?.updateProductStock) {
      console.log('New stock:', result.data.updateProductStock.stock);
    }
  }

  return (
    <form action={handleUpdateStock}>
      <input type="number" name="quantity" placeholder="New stock" />
      <button type="submit">Update Stock</button>
    </form>
  );
}
```

## Solid.js + graphql-request

### Setup

```bash
bun add graphql-request graphql
```

### Usage

```tsx
// ProductList.tsx
import { createResource } from 'solid-js';
import { request } from 'graphql-request';
import { GET_PRODUCTS } from '@graphql-microservices/client';
import type { ResultOf } from '@graphql-microservices/client';

const endpoint = 'http://localhost:4000/graphql';

function ProductList() {
  const [products] = createResource(async () => {
    const data = await request<ResultOf<typeof GET_PRODUCTS>>(
      endpoint,
      GET_PRODUCTS,
      { inStock: true }
    );
    return data.products;
  });

  return (
    <div>
      <h1>Products</h1>
      <ul>
        <For each={products()}>
          {(product) => (
            <li>
              {product.name} - ${product.price}
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
```

## Angular + Apollo Angular

### Setup

```bash
bun add apollo-angular @apollo/client graphql
```

### Service

```typescript
// graphql.service.ts
import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { GET_USERS, CREATE_USER } from '@graphql-microservices/client';
import type { ResultOf, VariablesOf } from '@graphql-microservices/client';

@Injectable({
  providedIn: 'root',
})
export class GraphQLService {
  constructor(private apollo: Apollo) {}

  getUsers(): Observable<ResultOf<typeof GET_USERS>['users']> {
    return this.apollo
      .query<ResultOf<typeof GET_USERS>>({
        query: GET_USERS,
      })
      .pipe(map((result) => result.data.users));
  }

  createUser(input: VariablesOf<typeof CREATE_USER>['input']) {
    return this.apollo.mutate<ResultOf<typeof CREATE_USER>>({
      mutation: CREATE_USER,
      variables: { input },
    });
  }
}
```

## Best Practices

1. **Type Imports**: Always import types explicitly
   ```typescript
   import type { ResultOf, VariablesOf } from '@graphql-microservices/client';
   ```

2. **Error Handling**: Use discriminated unions for error states
   ```typescript
   type QueryResult<T> =
     | { status: 'loading' }
     | { status: 'error'; error: Error }
     | { status: 'success'; data: T };
   ```

3. **Fragment Composition**: Use fragments for reusable selections
   ```typescript
   const UserBasicInfo = graphql(`
     fragment UserBasicInfo on User {
       id
       name
       email
     }
   `);
   ```

4. **Optimistic Updates**: Leverage gql-tada's type safety
   ```typescript
   optimisticResponse: {
     updateUser: {
       __typename: 'User',
       id: userId,
       ...updates, // TypeScript ensures this matches User type
     },
   }
   ```