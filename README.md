# GraphQL Microservices with Bun.sh

A federated GraphQL microservices architecture built with Bun.sh, Apollo Server, and Apollo Federation.

## Architecture Overview

This project implements a microservices architecture using GraphQL Federation:

- **Gateway Service**: Apollo Gateway that aggregates all subgraphs
- **Users Service**: Manages user data and authentication
- **Products Service**: Handles product catalog and inventory
- **Orders Service**: Manages orders and order processing

## Prerequisites

- Bun.sh (latest version)
- Node.js 18+ (for some dependencies)

## Installation

```bash
# Install all dependencies
bun install
```

## Development

```bash
# Start all services in development mode
bun run dev

# Start individual services
bun run dev:gateway    # Gateway on http://localhost:4000
bun run dev:users      # Users service on http://localhost:4001
bun run dev:products   # Products service on http://localhost:4002
bun run dev:orders     # Orders service on http://localhost:4003
```

## Available Scripts

- `bun run dev` - Start all services in development mode
- `bun run build` - Build all services for production
- `bun run test` - Run tests
- `bun run lint` - Check code quality with Biome
- `bun run lint:fix` - Fix linting issues
- `bun run typecheck` - Run TypeScript type checking

## Service Architecture

### Gateway Service

The gateway uses Apollo Gateway to compose a supergraph from all subgraphs:

```graphql
# Access the unified GraphQL API at http://localhost:4000/graphql
```

### Users Service

Manages user accounts with the following schema:

```graphql
type User {
  id: ID!
  username: String!
  email: String!
  name: String!
  createdAt: String!
  orders: [Order!]! # Federated from Orders service
}
```

### Products Service

Handles product catalog:

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

### Orders Service

Manages customer orders:

```graphql
type Order {
  id: ID!
  userId: ID!
  user: User # Federated from Users service
  items: [OrderItem!]!
  total: Float!
  status: OrderStatus!
  createdAt: String!
  updatedAt: String!
}
```

## Federation Features

This project demonstrates:

- Entity extension across services
- Reference resolvers
- External fields
- Federation directives (@key, @shareable, @external)

## Project Structure

```
graphql-microservices/
├── services/
│   ├── gateway/       # Apollo Gateway
│   ├── users/         # Users subgraph
│   ├── products/      # Products subgraph
│   └── orders/        # Orders subgraph
├── shared/
│   └── graphql/       # Shared GraphQL utilities
├── scripts/
│   ├── dev.ts         # Development orchestration
│   └── build.ts       # Build script
└── package.json       # Root workspace configuration
```

## Testing Queries

Once all services are running, you can test the federated graph:

```graphql
# Get user with their orders
query GetUserWithOrders {
  user(id: "1") {
    id
    username
    email
    orders {
      id
      total
      status
      items {
        product {
          name
          price
        }
        quantity
      }
    }
  }
}

# Create a new order
mutation CreateOrder {
  createOrder(input: {
    userId: "1"
    items: [
      { productId: "1", quantity: 1, price: 999.99 }
    ]
  }) {
    id
    total
    status
    user {
      username
    }
  }
}
```

## Performance

Bun.sh provides:
- Fast startup times
- Native TypeScript support
- Built-in hot reloading
- Efficient package management

## Contributing

1. Fork the repository
2. Create your feature branch
3. Run tests and linting
4. Submit a pull request

## License

MIT
