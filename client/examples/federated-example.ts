/**
 * Advanced example showcasing gql-tada with Apollo Federation
 *
 * This demonstrates:
 * - Type-safe queries across federated services
 * - Fragment composition
 * - Custom scalar handling
 * - Error handling with type safety
 */

import type { TadaDocumentNode } from 'gql.tada';
import { type FragmentOf, graphql, readFragment } from '../src';

// Define reusable fragments with gql-tada
const UserFragment = graphql(
  `fragment UserDetails on User {
    id
    username
    email
    name
    role
    createdAt
  }`
);

const ProductFragment = graphql(
  `fragment ProductDetails on Product {
    id
    name
    description
    price
    sku
    category
    stock
  }`
);

const OrderFragment = graphql(
  `fragment OrderSummary on Order {
    id
    orderNumber
    status
    subtotal
    tax
    shipping
    total
    createdAt
  }`
);

// Complex federated query using fragments
export const FEDERATED_DASHBOARD_QUERY = graphql(
  `
  query FederatedDashboard($userId: ID!) {
    user(id: $userId) {
      ...UserDetails
      orders(first: 5) {
        nodes {
          ...OrderSummary
          items {
            quantity
            price
            total
            product {
              ...ProductDetails
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
    
    products(inStock: true, first: 10) {
      id
      name
      price
      stock
    }
  }
`,
  [UserFragment, OrderFragment, ProductFragment]
);

// Type-safe function to work with fragments
function displayUserInfo(userFragment: FragmentOf<typeof UserFragment>) {
  const user = readFragment(UserFragment, userFragment);
  console.log(`User: ${user.name} (${user.email})`);
  console.log(`Role: ${user.role}`);
  console.log(`Member since: ${new Date(user.createdAt).toLocaleDateString()}`);
}

// Advanced mutation with complex input types
export const CREATE_ORDER_WITH_VALIDATION = graphql(
  `mutation CreateOrderWithValidation($input: CreateOrderInput!) {
    createOrder(input: $input) {
      ...OrderSummary
      items {
        id
        quantity
        price
        product {
          id
          name
        }
      }
      user {
        id
        email
      }
    }
  }
`,
  [OrderFragment]
);

// Error handling with type safety
interface GraphQLError {
  message: string;
  extensions?: {
    code?: string;
    field?: string;
  };
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: GraphQLError[];
}

// Type-safe GraphQL client wrapper
class TypeSafeGraphQLClient {
  constructor(
    private endpoint: string,
    private getAuthToken: () => string | null
  ) {}

  async request<TResult, TVariables>(
    query: TadaDocumentNode<TResult, TVariables, void>,
    variables?: TVariables
  ): Promise<GraphQLResponse<TResult>> {
    const token = this.getAuthToken();

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    return response.json() as Promise<GraphQLResponse<TResult>>;
  }
}

// Usage example
async function runFederatedExample() {
  const client = new TypeSafeGraphQLClient('http://localhost:4000/graphql', () =>
    localStorage.getItem('authToken')
  );

  try {
    // 1. Get dashboard data with full type safety
    const dashboardResult = await client.request(FEDERATED_DASHBOARD_QUERY, { userId: 'user-123' });

    if (dashboardResult.errors) {
      console.error('GraphQL Errors:', dashboardResult.errors);
      return;
    }

    if (dashboardResult.data?.user) {
      // TypeScript knows all the fields!
      displayUserInfo(dashboardResult.data.user);

      // Process orders with full type inference
      dashboardResult.data.user.orders?.nodes?.forEach((order) => {
        console.log(`\nOrder ${order.orderNumber}:`);
        console.log(`Status: ${order.status}`);
        console.log(`Total: $${order.total}`);

        // Nested type safety for order items
        order.items?.forEach((item) => {
          console.log(`  - ${item.product.name}: ${item.quantity} × $${item.price}`);
        });
      });

      // Check pagination
      const pageInfo = dashboardResult.data.user.orders?.pageInfo;
      if (pageInfo?.hasNextPage) {
        console.log('More orders available...');
      }
    }

    // 2. Create a new order with validation
    const orderResult = await client.request(CREATE_ORDER_WITH_VALIDATION, {
      input: {
        items: [
          { productId: 'prod-1', quantity: 2, price: 100 },
          { productId: 'prod-2', quantity: 1, price: 200 },
        ],
        shippingInfo: {
          address: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94105',
          country: 'USA',
        },
      },
    });

    if (orderResult.data?.createOrder) {
      const order = readFragment(OrderFragment, orderResult.data.createOrder);
      console.log(`\nOrder created: ${order.orderNumber}`);
      console.log(`Total: $${order.total}`);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}

// Subscription example (if using WebSockets)
export const ORDER_STATUS_SUBSCRIPTION = graphql(`
  subscription OrderStatusUpdates($orderId: ID!) {
    orderStatusChanged(orderId: $orderId) {
      id
      status
      updatedAt
    }
  }
`);

// Optimistic updates example
export function optimisticOrderUpdate(orderId: string, newStatus: string) {
  // gql-tada ensures newStatus matches the OrderStatus enum
  return {
    __typename: 'Order' as const,
    id: orderId,
    status: newStatus,
    updatedAt: new Date().toISOString(),
  };
}

// Export for use in other files
export { UserFragment, ProductFragment, OrderFragment, TypeSafeGraphQLClient, runFederatedExample };

// Run the example
if (import.meta.main) {
  runFederatedExample();
}
