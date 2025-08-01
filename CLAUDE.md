# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A production-ready federated GraphQL microservices architecture using Bun.sh runtime, Apollo Server, and Apollo Federation v2. The project implements Domain-Driven Design (DDD) with CQRS and Event Sourcing patterns. Features include JWT authentication, Redis caching, GraphQL subscriptions, rate limiting, and comprehensive documentation generation.

## Development Commands

```bash
# Initial setup
bun install
bun run docker:dev     # Start PostgreSQL and Redis containers
bun run setup          # Create databases and run migrations
bun run seed           # Seed sample data

# Development
bun run dev            # Start all services with hot reload
bun run dev:gateway    # Gateway only (port 4000)
bun run dev:users      # Users service only (port 4001)
bun run dev:products   # Products service only (port 4002)
bun run dev:orders     # Orders service only (port 4003)

# Code quality (IMPORTANT: Run before committing)
bun run lint           # Check code style with Biome
bun run lint:fix       # Auto-fix style issues
bun run typecheck      # TypeScript type checking

# Building
bun run build          # Build all services for production
bun run build:all      # Build packages and services
bun run build:packages # Build shared packages with tsdown
bun run build:services # Build services only
bun run build:types    # Generate TypeScript types

# Schema management
bun run schema:introspect  # Generate introspection from gateway
bun run schema:export      # Export schemas to files
bun run schema:update      # Extract schemas, clean, and run codegen
bun run schema:validate    # Validate schemas
bun run schema:check-compatibility # Check schema compatibility
bun run codegen           # Generate TypeScript types from GraphQL

# Documentation
bun run docs:generate     # Generate API documentation

# Testing
bun test                 # Run all tests
bun test services/users  # Test specific service
bun test --watch        # Run tests in watch mode
bun run test:integration # Run integration tests with Docker

# Database & Docker
bun run docker:dev      # Start PostgreSQL and Redis
bun run docker:dev:down # Stop containers
bun run docker:build    # Build production Docker images

# Event Sourcing (for packages with migrations)
cd packages/event-sourcing && bun run migrate        # Run migrations
cd packages/event-sourcing && bun run migrate:status # Check migration status
```

## Architecture

### DDD & CQRS/Event Sourcing Architecture

The project implements Domain-Driven Design with CQRS and Event Sourcing:

- **Aggregates**: Each service has domain aggregates (UserAggregate, ProductAggregate, OrderAggregate)
- **Commands & Queries**: Separate command and query handlers following CQRS pattern
- **Event Store**: PostgreSQL-based event store with outbox pattern for reliable event publishing
- **Domain Events**: Strongly-typed events with metadata and versioning
- **Value Objects**: Shared value objects (Email, Money, PhoneNumber) with validation

### Federation Architecture

- **Gateway** (port 4000): Apollo Gateway that composes the supergraph from all subgraphs
- **Users Service** (port 4001): Manages user accounts, authentication, implements CQRS with event sourcing
- **Products Service** (port 4002): Product catalog and inventory with domain aggregates
- **Orders Service** (port 4003): Order management with complex business rules and policies

### Key Patterns

1. **Entity Extension**: Orders service extends User type with `orders` field
2. **Reference Resolvers**: Each service implements `__resolveReference` for its entities
3. **External Fields**: Orders service marks User.id as @external
4. **Shared Types**: Common GraphQL utilities in `shared/graphql/`
5. **Auto-discovery**: Services are automatically discovered by scanning `services/*/package.json` files
6. **Shared Utilities**: Common patterns abstracted into `@shared/utils` for reuse across scripts and services
7. **Consistent Port Assignment**: Services get deterministic ports (users: 4001, products: 4002, orders: 4003, gateway: 4000)
8. **Event-Driven Architecture**: Services publish domain events through Redis for cross-service communication
9. **Outbox Pattern**: Ensures reliable event publishing with PostgreSQL-based outbox

### Service Communication

Services communicate through multiple patterns:
- **Apollo Federation**: For synchronous GraphQL queries
- **Domain Events**: Asynchronous communication via Redis pub/sub
- **Event Sourcing**: Complete audit trail of all state changes
- Real-time updates via GraphQL subscriptions over Redis PubSub

### Directory Structure

```
services/
  gateway/src/index.ts      # Apollo Gateway with retry logic and health checks
  users/src/
    index.ts               # JWT auth, user management, subscriptions
    types.ts               # TypeScript types for GraphQL inputs
    subscriptions.ts       # Subscription resolvers and event publishers
    domain/
      user-aggregate.ts    # User aggregate root with business logic
    application/
      commands.ts          # Command definitions
      command-handlers.ts  # Command handler implementations
      queries.ts           # Query definitions
      query-handlers.ts    # Query handler implementations
    infrastructure/
      cqrs-integration.ts  # CQRS infrastructure setup
  products/src/
    index.ts               # Product catalog with DataLoader
    domain/
      product-aggregate.ts # Product aggregate with inventory management
  orders/src/
    index.ts               # Order management with federation
    domain/
      order-aggregate.ts   # Order aggregate with business rules
      order-policies.ts    # Business policies for order processing
packages/
  event-sourcing/          # CQRS/Event Sourcing framework
    src/
      types.ts             # Core interfaces and types
      event-store.ts       # Event store abstraction
      postgresql-event-store.ts # PostgreSQL implementation
      outbox.ts            # Outbox pattern implementation
shared/
  auth/                     # JWT with RS256, auth directives
  cache/                    # Redis caching with TTL strategies
  config/                   # Zod schemas for env validation
  domain/                   # Shared domain concepts
    events/                 # Domain event base classes
    value-objects/          # Shared value objects (Email, Money, etc.)
  errors/                   # Centralized error handling and types
  graphql/                  # Federation directives
  health/                   # Health check utilities
  observability/            # OpenTelemetry tracing and metrics
  pubsub/                   # GraphQL subscriptions via Redis
  query-complexity/         # GraphQL query complexity analysis
  rate-limit/               # Rate limiting with presets
  utils/                    # Shared utilities for scripts and services
    service-discovery.ts    # Auto-discovery patterns for services
    schema.ts              # GraphQL schema utilities
    docker.ts              # Docker management utilities
    index.ts               # Common logging and utility functions
  validation/               # Input validation with Zod schemas
scripts/
  dev.ts                    # Auto-discovers and starts services
  build.ts                  # Production build with auto-discovery
  setup-db.ts               # Database initialization with auto-discovery
  export-schema.ts          # Schema export utility with auto-discovery
  generate-docs.ts          # API documentation generator
  update-schemas.ts         # Schema extraction and codegen
```

### Key Enhancements

1. **Authentication & Authorization**
   - JWT with RS256 signing (separate keys for access/refresh tokens)
   - Role-based access control (USER, ADMIN, MODERATOR)
   - Auth directives: `@auth`, `@auth(requires: ADMIN)`, `@public`
   - Token refresh mechanism with database storage

2. **Database Integration**
   - PostgreSQL with Prisma ORM
   - Separate databases per service (users_db, products_db, orders_db)
   - Event store tables for event sourcing
   - Automatic migrations with `bun run setup`
   - DataLoader pattern for batch loading

3. **CQRS & Event Sourcing**
   - Command/Query separation with dedicated handlers
   - PostgreSQL-based event store with snapshots
   - Outbox pattern for reliable event publishing
   - Domain events with metadata and correlation IDs
   - Aggregate versioning and optimistic concurrency control

4. **Caching Strategy**
   - Redis caching with configurable TTL
   - Cache keys: `user:{id}`, `product:{id}`, `products:category:{category}:*`
   - Automatic cache invalidation on mutations
   - Pattern-based cache clearing

5. **Real-time Features**
   - GraphQL subscriptions via Redis PubSub
   - Events: user updates, product changes, order status updates
   - Domain events published to Redis for cross-service communication
   - Filtered subscriptions (e.g., by userId or productId)

6. **Rate Limiting**
   - Redis-backed token bucket algorithm
   - Presets: AUTH (5/5min), MUTATION (30/1min), QUERY (100/1min)
   - User-aware (different limits for authenticated users)
   - Graceful error responses with retry information

7. **Gateway Enhancements**
   - Retry logic for failed subgraph requests
   - Health check endpoint at `/health`
   - Correlation ID tracking
   - Graceful shutdown handling
   - Schema polling (10s dev, 30s prod)

8. **Auto-Discovery Architecture**
   - Services automatically discovered by filesystem scanning
   - Consistent port assignment based on service names
   - Zero-configuration addition of new services
   - Shared utilities for common patterns across all scripts
   - Centralized service management and health checking

9. **Observability & Monitoring**
   - OpenTelemetry distributed tracing across services
   - Structured logging with correlation ID propagation
   - Custom metrics collection for business events
   - Query complexity analysis to prevent expensive operations
   - Automatic instrumentation for GraphQL, HTTP, Redis, and database operations

10. **Input Validation & Security**
    - Comprehensive Zod schemas for all input validation
    - Automatic sanitization of string inputs
    - Centralized error handling with typed error responses
    - TypeScript utility types for better type safety
    - Domain validation in aggregates

## Testing Approach

Run tests with `bun test`. Each service should have:
- Unit tests for resolvers
- Integration tests for GraphQL operations
- Federation tests for cross-service queries
- Domain logic tests for aggregates and policies
- Event sourcing tests for command/event handling

## Critical Workflow: Schema Changes

When modifying GraphQL schemas in service TypeScript files:

```bash
# 1. Make schema changes in services/[service]/src/index.ts
# 2. Extract and update all generated files:
bun run schema:update

# This runs three steps:
# - Extracts schemas from TypeScript files
# - Cleans schemas (removes custom directives)
# - Runs codegen for TypeScript types
```

## Common Tasks

### Adding a New Service

1. Create service directory: `mkdir -p services/newservice/src`
2. Copy package.json from existing service (update name and port)
3. Implement schema with federation directives
4. Service will be auto-discovered by all scripts (no manual registration needed)
5. Add Prisma schema in `services/newservice/prisma/schema.prisma` (optional)
6. Run `bun run setup` to create database (if using Prisma)
7. Implement domain aggregates if using CQRS/Event Sourcing

**Auto-discovery works by:**
- Scanning `services/*/package.json` files
- Assigning consistent ports based on service name
- Including services in build, dev, schema extraction, and documentation processes

### Implementing CQRS in a Service

```typescript
// 1. Define aggregate
export class UserAggregate extends AggregateRoot {
  applyUserRegistered(event: UserRegisteredEvent) {
    this.id = event.payload.userId;
    this.email = event.payload.email;
    // ... update state
  }
}

// 2. Define commands
export class RegisterUserCommand {
  constructor(
    public readonly email: string,
    public readonly password: string
  ) {}
}

// 3. Implement command handler
export class RegisterUserHandler {
  async execute(command: RegisterUserCommand): Promise<void> {
    const aggregate = new UserAggregate();
    aggregate.register(command.email, command.password);
    await this.eventStore.save(aggregate);
  }
}
```

### Extending an Entity

```typescript
// In extending service
const typeDefs = gql`
  extend type User @key(fields: "id") {
    id: ID! @external
    newField: String!
  }
`;
```

### Adding Reference Resolver

```typescript
const resolvers = {
  User: {
    __resolveReference: (user: { id: string }) => 
      users.find(u => u.id === user.id),
  },
};
```

### Sharing Types Across Services

When multiple services need the same type (e.g., PageInfo for pagination):

```typescript
// Mark the type as @shareable in each service
type PageInfo @shareable {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

// Ensure @shareable is imported
extend schema @link(
  url: "https://specs.apollo.dev/federation/v2.0",
  import: ["@key", "@shareable", "@external"]
)
```

### Adding Subscriptions

```typescript
// 1. Add to schema
type Subscription {
  productUpdated(productId: ID): Product!
}

// 2. Implement resolver
Subscription: {
  productUpdated: {
    subscribe: (_, { productId }, context) => {
      return context.pubsub.asyncIterator(['PRODUCT_UPDATED']);
    },
    resolve: (payload, { productId }) => {
      if (productId && payload.productUpdated.id !== productId) {
        return null;
      }
      return payload.productUpdated;
    }
  }
}

// 3. Publish events in mutations
await context.pubsub.publish('PRODUCT_UPDATED', { productUpdated: product });
```

### Using Shared Utilities

The `@shared/utils` package provides common functionality used across scripts and services:

```typescript
import { 
  discoverServices, 
  getAllServiceInfo,
  checkServiceHealth,
  getServiceDatabaseUrl,
  exportSchema,
  logSuccess,
  logError,
  logStep
} from '@shared/utils';

// Auto-discover services
const services = await discoverServices();

// Get service information
const allServices = getAllServiceInfo();
const gatewayInfo = allServices.gateway; // { name, port, url, path }

// Check if a service is running
const isRunning = await checkServiceHealth('http://localhost:4001/graphql');

// Get database URL for a service
const dbUrl = getServiceDatabaseUrl('users'); // postgresql://...../users_db

// Export schemas
await exportSchema('http://localhost:4001/graphql', './output', 'both');

// Consistent logging
logStep('Starting process...');
logSuccess('Process completed!');
logError('Something went wrong');
```

**Available utilities:**
- **Service Discovery**: `discoverServices()`, `getServiceNames()`, `getAllServiceInfo()`
- **Health Checks**: `checkServiceHealth()`, `discoverRunningServices()`
- **Docker Management**: `startDocker()`, `stopDocker()`, `waitForPostgres()`
- **Schema Operations**: `exportSchema()`, `fetchIntrospectionSchema()`, `introspectionToSDL()`
- **Database**: `getServiceDatabaseUrl()`
- **Logging**: `logSuccess()`, `logError()`, `logWarning()`, `logInfo()`, `logStep()`

## Script Architecture

All scripts in `/scripts/` follow consistent patterns using shared utilities:

### Auto-Discovery Pattern
Scripts automatically discover services instead of using hardcoded lists:

```typescript
// Old approach (avoid)
const services = ['users', 'products', 'orders'];

// New approach (preferred)
const services = await discoverServices(); // Auto-discovers from filesystem
const serviceNames = await getServiceNames(); // Just the names
```

### Service Information
Scripts can get comprehensive service information:

```typescript
const allServices = getAllServiceInfo();
// Returns: { 
//   users: { name: 'users', port: 4001, url: 'http://localhost:4001/graphql', path: 'services/users' },
//   products: { name: 'products', port: 4002, url: 'http://localhost:4002/graphql', path: 'services/products' },
//   // ...
// }
```

### Script Categories
- **Development**: `dev.ts`, `build.ts` - Use `discoverServices()` for full service configs
- **Database**: `setup-db.ts`, `seed.ts` - Auto-detect services with Prisma schemas
- **Schema**: `export-schema.ts`, `extract-schemas.ts`, `clean-schemas.ts` - Work with running/configured services
- **Documentation**: `generate-docs.ts` - Combines discovery with schema introspection

### Error Handling Pattern
All scripts follow consistent error handling with shared logging:

```typescript
async function main() {
  try {
    logStep('Starting process...');
    // ... do work ...
    logSuccess('Process completed!');
  } catch (error) {
    logError(`Process failed: ${error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  logError(`Script failed: ${error}`);
  process.exit(1);
});
```

## Performance Considerations

- Bun provides fast startup and hot reload
- DataLoader prevents N+1 queries (already implemented in all services)
- Redis caching reduces database load
- Gateway implements retry logic for resilience
- Health checks enable proper container orchestration
- Event sourcing provides read model optimization opportunities

## Debugging

- GraphQL Playground available at http://localhost:4000/graphql
- Each service has its own playground at its port
- Check service logs in terminal running `bun run dev`
- Use Apollo Studio for production monitoring
- Event store provides complete audit trail for debugging

## gql-tada Integration

This project includes gql-tada for type-safe GraphQL queries on the client side.

### Setup

1. **Generate Schema**: Run `bun run schema:introspect` to generate the federated schema from the gateway
2. **Use Client Package**: Import queries/mutations from `@graphql-microservices/client`

### Writing Type-Safe Queries

```typescript
import { graphql } from '@graphql-microservices/client';

// Define a query with automatic type inference
const GET_USER = graphql(`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      username
      email
      orders {
        id
        totalAmount
      }
    }
  }
`);

// Use with any GraphQL client
const result = await client.query({
  query: GET_USER,
  variables: { id: 'user-123' }
});

// Full type safety - TypeScript knows result.data.user.orders exists!
```

### Benefits

- **Zero Config Types**: No manual type definitions needed
- **IDE Support**: Full auto-completion and inline documentation
- **Federation Support**: Works seamlessly with Apollo Federation
- **Client Agnostic**: Use with Apollo Client, urql, or plain fetch

### Development Workflow

1. Make schema changes in services
2. Run `bun run schema:introspect` to update types
3. TypeScript will automatically pick up changes

## Type Safety with TypeScript

### Strict Type Checking

The project enforces strict TypeScript with no `any` types:
- All resolvers use proper Prisma-generated types
- GraphQL inputs have dedicated TypeScript interfaces in `types.ts`
- Context types are properly defined per service
- Domain aggregates are strongly typed with discriminated unions for events

### Generated Types

```bash
# After schema changes, regenerate TypeScript types:
bun run schema:update

# This generates:
# - services/[service]/generated/graphql.ts - Resolver types
# - shared/graphql/generated/client-types.ts - Client types
# - client/src/graphql-env.d.ts - gql.tada types
```

## Environment Configuration

Each service validates environment variables using Zod schemas:

```typescript
// In shared/config/index.ts
export const userServiceEnvSchema = z.object({
  PORT: z.number().default(4001),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('15m'),
  // ...
});
```

## Documentation

API documentation is auto-generated from schemas:

```bash
bun run docs:generate

# Creates:
# - docs/api/README.md - Markdown documentation
# - docs/api/index.html - Interactive HTML docs
# - docs/api/openapi.json - OpenAPI specification
# - docs/api/postman-collection.json - Postman collection
```

## Production Considerations

- Enable `INTROSPECTION_ENABLED=false` in production
- Use proper JWT secret keys (not generated at startup)
- Configure rate limiting based on actual usage patterns
- Set up monitoring with correlation IDs
- Use health checks for container orchestration
- Configure Redis with persistence for rate limiting state
- Implement event store archiving strategy for old events
- Consider read model projections for query optimization
- Set up event replay capabilities for disaster recovery

## Bun Runtime Preferences

This project uses Bun.sh as the runtime. Always prefer Bun commands and APIs:

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>`
- Bun automatically loads .env files, so dotenv is not needed
- The project uses `ioredis` for Redis compatibility with the existing architecture