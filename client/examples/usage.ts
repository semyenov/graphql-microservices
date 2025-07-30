/**
 * Example usage of gql-tada with the GraphQL microservices
 *
 * This demonstrates how to use the type-safe queries and mutations
 * with any GraphQL client (Apollo Client, urql, graphql-request, etc.)
 */

import type { ResultOf, VariablesOf } from '../src';
import { CREATE_ORDER, GET_ME, GET_USER_WITH_ORDERS, SIGN_IN } from '../src';

// Example 1: Using with fetch API
async function signInWithFetch() {
  const variables: VariablesOf<typeof SIGN_IN> = {
    input: {
      username: 'john.doe',
      password: 'password123',
    },
  };

  const response = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: SIGN_IN,
      variables,
    }),
  });

  const result = await response.json();

  // Type-safe access to the result
  const data: ResultOf<typeof SIGN_IN> = result.data;

  if (data?.signIn) {
    console.log('Access Token:', data.signIn.accessToken);
    console.log('User:', data.signIn.user);
    // TypeScript knows the exact shape of user!
    console.log('Username:', data.signIn.user.username);
  }

  return data?.signIn.accessToken;
}

// Example 2: Authenticated request
async function getMyProfile(accessToken: string) {
  const response = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: GET_ME,
    }),
  });

  const result = await response.json();
  const data: ResultOf<typeof GET_ME> = result.data;

  // TypeScript provides full auto-completion!
  return data?.me;
}

// Example 3: Complex federated query
async function getUserWithOrders(userId: string, accessToken: string) {
  const variables: VariablesOf<typeof GET_USER_WITH_ORDERS> = {
    id: userId,
  };

  const response = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: GET_USER_WITH_ORDERS,
      variables,
    }),
  });

  const result = await response.json();
  const data: ResultOf<typeof GET_USER_WITH_ORDERS> = result.data;

  if (data?.user) {
    console.log(`User ${data.user.name} has ${data.user.orders?.length || 0} orders`);

    // Iterate through orders with full type safety
    data.user.orders?.forEach((order) => {
      console.log(`Order ${order.id}: ${order.status} - $${order.totalAmount}`);

      // Access nested product information
      order.items?.forEach((item) => {
        console.log(`  - ${item.product.name} x${item.quantity}`);
      });
    });
  }
}

// Example 4: Creating an order
async function createOrder(accessToken: string) {
  const variables: VariablesOf<typeof CREATE_ORDER> = {
    input: {
      items: [
        {
          productId: 'prod-123',
          quantity: 2,
        },
        {
          productId: 'prod-456',
          quantity: 1,
        },
      ],
    },
  };

  const response = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: CREATE_ORDER,
      variables,
    }),
  });

  const result = await response.json();
  const data: ResultOf<typeof CREATE_ORDER> = result.data;

  if (data?.createOrder) {
    console.log('Order created:', data.createOrder.id);
    console.log('Total:', data.createOrder.totalAmount);

    // TypeScript knows all the fields available!
    data.createOrder.items?.forEach((item) => {
      console.log(`${item.product.name}: $${item.price} x ${item.quantity}`);
    });
  }
}

// Example usage with Apollo Client
import { ApolloClient, InMemoryCache } from '@apollo/client';

const client = new ApolloClient({
  uri: 'http://localhost:4000/graphql',
  cache: new InMemoryCache(),
});

async function apolloExample() {
  // Works seamlessly with Apollo Client
  const result = await client.query({
    query: GET_ME,
  });

  // Full type inference!
  const user = result.data.me;
  if (user) {
    console.log(user.email);
  }
}

// Example usage with urql
import { createClient } from 'urql';

const urqlClient = createClient({
  url: 'http://localhost:4000/graphql',
});

async function urqlExample() {
  // Works with urql too!
  const result = await urqlClient.query(GET_USER_WITH_ORDERS, { id: 'user-123' }).toPromise();

  // Type-safe result access
  const user = result.data?.user;
  if (user) {
    console.log(`${user.name} has ${user.orders?.length || 0} orders`);
  }
}

// Run examples
async function main() {
  try {
    // Sign in
    const token = await signInWithFetch();
    if (!token) {
      console.error('Failed to sign in');
      return;
    }

    // Get profile
    const profile = await getMyProfile(token);
    console.log('My profile:', profile);

    // Get user with orders
    if (profile?.id) {
      await getUserWithOrders(profile.id, token);
    }

    // Create an order
    await createOrder(token);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Uncomment to run
// main();
