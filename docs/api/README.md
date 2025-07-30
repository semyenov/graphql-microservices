# GraphQL API Documentation

This document provides comprehensive API documentation for the GraphQL microservices architecture.

## Table of Contents

1. [Overview](#overview)
2. [Services](#services)
3. [Authentication](#authentication)
4. [Rate Limiting](#rate-limiting)
5. [Subscriptions](#subscriptions)
6. [API Reference](#api-reference)
7. [Examples](#examples)

## Overview

This GraphQL API is built using Apollo Federation v2, allowing multiple services to work together as a unified graph.

### Base URL

```
http://localhost:4000/graphql
```

### Headers

| Header | Description | Required |
|--------|-------------|----------|
| Authorization | JWT Bearer token | Yes (except for public operations) |
| X-Correlation-ID | Request tracking ID | No |

## Services

### Users Service

**Port**: 4001  
**Description**: Manages user accounts, authentication, and authorization

### Products Service

**Port**: 4002  
**Description**: Handles product catalog, inventory, and stock management

### Orders Service

**Port**: 4003  
**Description**: Manages order processing, status tracking, and fulfillment

## Authentication

Most operations require authentication using a JWT token. Public operations are marked with `@public` directive.

### Obtaining a Token

```graphql
mutation SignIn {
  signIn(input: {
    username: "john.doe"
    password: "password123"
  }) {
    accessToken
    refreshToken
    user {
      id
      username
      email
      role
    }
  }
}
```

### Using the Token

Include the token in the Authorization header:

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Refreshing Tokens

```graphql
mutation RefreshToken {
  refreshToken(refreshToken: "YOUR_REFRESH_TOKEN") {
    accessToken
    refreshToken
  }
}
```

## Rate Limiting

API operations are rate-limited to prevent abuse. Different limits apply to different operation types:

| Operation Type | Limit | Duration | Block Duration |
|----------------|-------|----------|----------------|
| Authentication | 5 requests | 5 minutes | 15 minutes |
| Mutations | 30 requests | 1 minute | 5 minutes |
| Queries | 100 requests | 1 minute | 1 minute |
| Public | 200 requests | 1 minute | 30 seconds |

## Subscriptions

Real-time updates are available through GraphQL subscriptions over WebSocket.

### Connection URL

```
ws://localhost:4000/graphql
```

### Available Subscriptions

#### User Events
- `userCreated` - New user registration
- `userUpdated` - User profile updates
- `userDeactivated` - User account deactivation

#### Product Events
- `productCreated` - New product added
- `productUpdated` - Product details changed
- `productStockChanged` - Inventory updates
- `productDeactivated` - Product removed from catalog

#### Order Events
- `orderCreated` - New order placed
- `orderStatusChanged` - Order status updates
- `orderCancelled` - Order cancellation
- `orderRefunded` - Order refund processed

## API Reference

### Types

#### OrderStatus

```graphql
enum OrderStatus {
  PENDING
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
  REFUNDED
}
```

#### Role

```graphql
enum Role {
  USER
  ADMIN
  MODERATOR
}
```

#### ChangePasswordInput

```graphql
input ChangePasswordInput {
  currentPassword: String!
  newPassword: String!
}
```

#### CreateOrderInput

```graphql
input CreateOrderInput {
  items: [OrderItemInput!]!
  shippingInfo: ShippingInfoInput!
  notes: String
}
```

#### CreateProductInput

```graphql
input CreateProductInput {
  name: String!
  description: String!
  price: Float!
  stock: Int!
  sku: String!
  category: String!
  tags: [String!]
  imageUrl: String
}
```

#### OrderItemInput

```graphql
input OrderItemInput {
  productId: ID!
  quantity: Int!
  price: Float!
}
```

#### ShippingInfoInput

```graphql
input ShippingInfoInput {
  address: String!
  city: String!
  state: String!
  zipCode: String!
  country: String!
  phone: String
}
```

#### SignInInput

```graphql
input SignInInput {
  username: String!
  password: String!
}
```

#### SignUpInput

```graphql
input SignUpInput {
  username: String!
  email: String!
  password: String!
  name: String!
  phoneNumber: String
}
```

#### StockUpdate

```graphql
input StockUpdate {
  productId: ID!
  quantity: Int!
}
```

#### UpdateProductInput

```graphql
input UpdateProductInput {
  name: String
  description: String
  price: Float
  stock: Int
  category: String
  tags: [String!]
  imageUrl: String
}
```

#### UpdateProfileInput

```graphql
input UpdateProfileInput {
  name: String
  phoneNumber: String
}
```

#### UpdateUserInput

```graphql
input UpdateUserInput {
  username: String
  email: String
  name: String
  phoneNumber: String
  role: Role
}
```

#### AuthPayload

```graphql
type AuthPayload {
  user: User!
  accessToken: String!
  refreshToken: String!
}
```

#### Order

```graphql
type Order  {
  id: ID!
  userId: ID!
  user: User
  orderNumber: String!
  items: [OrderItem!]!
  subtotal: Float!
  tax: Float!
  shipping: Float!
  total: Float!
  status: OrderStatus!
  shippingInfo: ShippingInfo
  paymentInfo: PaymentInfo
  notes: String
  createdAt: String!
  updatedAt: String!
}
```

#### OrderItem

```graphql
type OrderItem {
  id: ID!
  productId: ID!
  product: Product
  quantity: Int!
  price: Float!
  total: Float!
}
```

#### OrdersPage

```graphql
type OrdersPage {
  orders: [Order!]!
  totalCount: Int!
  pageInfo: PageInfo!
}
```

#### PageInfo

```graphql
type PageInfo  {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

#### PaymentInfo

```graphql
type PaymentInfo {
  method: String!
  transactionId: String
  paidAt: String
}
```

#### Product

```graphql
type Product  {
  id: ID!
  name: String!
  description: String!
  price: Float!
  stock: Int!
  sku: String!
  category: String!
  tags: [String!]!
  imageUrl: String
  isActive: Boolean!
  createdAt: String!
  updatedAt: String!
}
```

#### Product

```graphql
type Product  {
  id: ID! 
}
```

#### ProductsPage

```graphql
type ProductsPage {
  products: [Product!]!
  totalCount: Int!
  pageInfo: PageInfo!
}
```

#### ShippingInfo

```graphql
type ShippingInfo {
  address: String!
  city: String!
  state: String!
  zipCode: String!
  country: String!
  phone: String
}
```

#### User

```graphql
type User  {
  id: ID!
  username: String!
  email: String!
  name: String!
  phoneNumber: String
  role: Role!
  isActive: Boolean!
  createdAt: String!
  updatedAt: String!
}
```

#### User

```graphql
type User  {
  id: ID! 
  orders: [Order!]!
}
```

## Examples

### User Management

#### Create User Account

```graphql
mutation SignUp {
  signUp(input: {
    username: "jane.doe"
    email: "jane@example.com"
    password: "SecurePass123!"
    name: "Jane Doe"
    phoneNumber: "+1234567890"
  }) {
    accessToken
    user {
      id
      username
      email
    }
  }
}
```

#### Get Current User

```graphql
query GetMe {
  me {
    id
    username
    email
    name
    role
    orders {
      id
      orderNumber
      total
      status
    }
  }
}
```

### Product Management

#### List Products

```graphql
query ListProducts {
  products(first: 10, category: "Electronics") {
    products {
      id
      name
      description
      price
      stock
      category
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

#### Create Product

```graphql
mutation CreateProduct {
  createProduct(input: {
    name: "Wireless Headphones"
    description: "High-quality Bluetooth headphones"
    price: 99.99
    stock: 100
    sku: "WH-001"
    category: "Electronics"
    tags: ["audio", "wireless", "bluetooth"]
  }) {
    id
    name
    price
  }
}
```

### Order Management

#### Create Order

```graphql
mutation CreateOrder {
  createOrder(input: {
    items: [
      {
        productId: "product-123"
        quantity: 2
        price: 99.99
      }
    ]
    shippingInfo: {
      address: "123 Main St"
      city: "New York"
      state: "NY"
      zipCode: "10001"
      country: "USA"
      phone: "+1234567890"
    }
  }) {
    id
    orderNumber
    total
    status
  }
}
```

#### Track Order Status

```graphql
subscription TrackOrder($orderId: ID!) {
  orderStatusChanged(orderId: $orderId) {
    id
    orderNumber
    status
    updatedAt
  }
}
```

## Error Handling

### Error Format

```json
{
  "errors": [
    {
      "message": "Error message",
      "extensions": {
        "code": "ERROR_CODE",
        "field": "fieldName",
        "additionalInfo": {}
      }
    }
  ]
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| UNAUTHENTICATED | Missing or invalid authentication |
| FORBIDDEN | Insufficient permissions |
| NOT_FOUND | Resource not found |
| VALIDATION_ERROR | Input validation failed |
| RATE_LIMITED | Rate limit exceeded |
| INTERNAL_ERROR | Server error |

## Pagination

The API uses cursor-based pagination for list operations:

```graphql
query GetProducts($cursor: String) {
  products(first: 20, after: $cursor) {
    products {
      id
      name
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    totalCount
  }
}
```

## Best Practices

1. **Use Fragments**: Reuse common field selections
2. **Request Only Needed Fields**: Minimize data transfer
3. **Handle Errors Gracefully**: Check for errors in responses
4. **Implement Retry Logic**: For transient failures
5. **Cache Appropriately**: Use Apollo Client caching
6. **Monitor Rate Limits**: Track usage to avoid blocks

## SDK Examples

### TypeScript/JavaScript

```typescript
import { ApolloClient, InMemoryCache, gql } from '@apollo/client';

const client = new ApolloClient({
  uri: 'http://localhost:4000/graphql',
  cache: new InMemoryCache(),
  headers: {
    authorization: `Bearer ${getAuthToken()}`,
  },
});

// Query example
const GET_PRODUCTS = gql`
  query GetProducts {
    products(first: 10) {
      products {
        id
        name
        price
      }
    }
  }
`;

const { data } = await client.query({ query: GET_PRODUCTS });
```

### React

```typescript
import { useQuery, useMutation } from '@apollo/client';

function ProductList() {
  const { data, loading, error } = useQuery(GET_PRODUCTS);
  const [createProduct] = useMutation(CREATE_PRODUCT);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {data.products.products.map(product => (
        <li key={product.id}>{product.name} - ${product.price}</li>
      ))}
    </ul>
  );
}
```

## Additional Resources

- [GraphQL Documentation](https://graphql.org/learn/)
- [Apollo Federation](https://www.apollographql.com/docs/federation/)
- [Apollo Client](https://www.apollographql.com/docs/react/)
