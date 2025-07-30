# GraphQL API Documentation

## Overview

This GraphQL API uses Apollo Federation to provide a unified graph across multiple microservices.

**Gateway Endpoint**: `http://localhost:4000/graphql`

## Schema

### User Type

```graphql
type User {
  id: ID!
  username: String!
  email: String!
  name: String!
  createdAt: String!
  orders: [Order!]!  # Federated from Orders service
}
```

### Product Type

```graphql
type Product {
  id: ID!
  name: String!
  description: String!
  price: Float!
  stock: Int!
  category: String!
  createdAt: String!
}
```

### Order Type

```graphql
type Order {
  id: ID!
  userId: ID!
  user: User!         # Federated from Users service
  items: [OrderItem!]!
  total: Float!
  status: OrderStatus!
  createdAt: String!
  updatedAt: String!
}

type OrderItem {
  productId: ID!
  product: Product!   # Federated from Products service
  quantity: Int!
  price: Float!
}

enum OrderStatus {
  PENDING
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
}
```

## Queries

### User Queries

```graphql
# Get a single user by ID
query GetUser($id: ID!) {
  user(id: $id) {
    id
    username
    email
    name
    createdAt
  }
}

# Get all users
query GetAllUsers {
  users {
    id
    username
    email
    name
  }
}

# Get current user
query GetMe {
  me {
    id
    username
    email
    orders {
      id
      total
      status
    }
  }
}
```

### Product Queries

```graphql
# Get a single product
query GetProduct($id: ID!) {
  product(id: $id) {
    id
    name
    description
    price
    stock
    category
  }
}

# Get all products
query GetAllProducts {
  products {
    id
    name
    price
    stock
    category
  }
}

# Get products by category
query GetProductsByCategory($category: String!) {
  productsByCategory(category: $category) {
    id
    name
    price
    stock
  }
}
```

### Order Queries

```graphql
# Get a single order
query GetOrder($id: ID!) {
  order(id: $id) {
    id
    user {
      username
      email
    }
    items {
      product {
        name
        price
      }
      quantity
      price
    }
    total
    status
    createdAt
  }
}

# Get orders by user
query GetUserOrders($userId: ID!) {
  ordersByUser(userId: $userId) {
    id
    total
    status
    createdAt
    items {
      product {
        name
      }
      quantity
    }
  }
}

# Get orders by status
query GetOrdersByStatus($status: OrderStatus!) {
  ordersByStatus(status: $status) {
    id
    user {
      username
    }
    total
    status
  }
}
```

## Mutations

### User Mutations

```graphql
# Create a new user
mutation CreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    id
    username
    email
    name
  }
}

# Update user information
mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
  updateUser(id: $id, input: $input) {
    id
    username
    email
    name
  }
}
```

Input Types:
```graphql
input CreateUserInput {
  username: String!
  email: String!
  name: String!
}

input UpdateUserInput {
  username: String
  email: String
  name: String
}
```

### Product Mutations

```graphql
# Create a new product
mutation CreateProduct($input: CreateProductInput!) {
  createProduct(input: $input) {
    id
    name
    price
    stock
    category
  }
}

# Update product information
mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
  updateProduct(id: $id, input: $input) {
    id
    name
    price
    stock
  }
}

# Update product stock
mutation UpdateStock($id: ID!, $quantity: Int!) {
  updateStock(id: $id, quantity: $quantity) {
    id
    stock
  }
}
```

Input Types:
```graphql
input CreateProductInput {
  name: String!
  description: String!
  price: Float!
  stock: Int!
  category: String!
}

input UpdateProductInput {
  name: String
  description: String
  price: Float
  stock: Int
  category: String
}
```

### Order Mutations

```graphql
# Create a new order
mutation CreateOrder($input: CreateOrderInput!) {
  createOrder(input: $input) {
    id
    user {
      username
    }
    total
    status
    items {
      product {
        name
      }
      quantity
      price
    }
  }
}

# Update order status
mutation UpdateOrderStatus($id: ID!, $status: OrderStatus!) {
  updateOrderStatus(id: $id, status: $status) {
    id
    status
    updatedAt
  }
}

# Cancel an order
mutation CancelOrder($id: ID!) {
  cancelOrder(id: $id) {
    id
    status
    updatedAt
  }
}
```

Input Types:
```graphql
input CreateOrderInput {
  userId: ID!
  items: [OrderItemInput!]!
}

input OrderItemInput {
  productId: ID!
  quantity: Int!
  price: Float!
}
```

## Federation Examples

### Cross-Service Query

Get user with their orders and product details:

```graphql
query GetUserWithFullOrderDetails($userId: ID!) {
  user(id: $userId) {
    id
    username
    email
    orders {
      id
      total
      status
      createdAt
      items {
        quantity
        price
        product {
          id
          name
          description
          category
        }
      }
    }
  }
}
```

### Complex Federation Query

Get all orders with user and product information:

```graphql
query GetCompleteOrders {
  orders {
    id
    user {
      username
      email
    }
    items {
      product {
        name
        price
        category
      }
      quantity
    }
    total
    status
  }
}
```

## Error Handling

The API returns standard GraphQL errors:

```json
{
  "errors": [
    {
      "message": "Product not found",
      "extensions": {
        "code": "PRODUCT_NOT_FOUND"
      }
    }
  ]
}
```

Common error codes:
- `USER_NOT_FOUND`
- `PRODUCT_NOT_FOUND`
- `ORDER_NOT_FOUND`
- `INVALID_ORDER_STATUS`
- `INSUFFICIENT_STOCK`