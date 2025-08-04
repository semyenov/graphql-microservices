# Modern Event Sourcing Architecture Guide

## Orders Service - Production-Ready CQRS/Event Sourcing Implementation

This document provides a comprehensive guide to the modernized Orders service, which implements a production-ready CQRS (Command Query Responsibility Segregation) and Event Sourcing architecture using the latest patterns and best practices.

## 🏗️ Architecture Overview

The Orders service implements a complete event-sourced domain with the following key components:

### Core Components

1. **Command Layer** - Handles business operations with Result types
2. **Event Store** - PostgreSQL-based event persistence with snapshots
3. **Projections** - Multi-projection system for read models
4. **Sagas** - Workflow orchestration with compensation patterns
5. **Repository Pattern** - Aggregate persistence and querying
6. **Monitoring** - Comprehensive health checks and metrics

### Technology Stack

- **Runtime**: Bun.js for high performance
- **Database**: PostgreSQL for event store and read models
- **Cache**: Redis for projections and performance
- **GraphQL**: Apollo Federation for API layer
- **Types**: Full TypeScript with strict typing

## 📋 Table of Contents

- [Command Handling](#command-handling)
- [Event Sourcing](#event-sourcing)
- [Projections](#projections)
- [Sagas](#sagas)
- [Repository Pattern](#repository-pattern)
- [Performance Optimizations](#performance-optimizations)
- [Monitoring](#monitoring)
- [Development Guide](#development-guide)
- [Production Deployment](#production-deployment)

## 🎯 Command Handling

### Modern Command Bus

The command bus uses TypeScript generics for type safety and Result types for functional error handling:

```typescript
// Define command map for type safety
export type OrderCommandMap = TypedCommandMap<{
  CreateOrder: CreateOrderCommand;
  CancelOrder: CancelOrderCommand;
  UpdateOrderStatus: UpdateOrderStatusCommand;
  // ... other commands
}>;

// Execute commands with type safety
const result = await commandBus.execute('CreateOrder', command);
if (Result.isErr(result)) {
  logger.error('Command failed', result.error);
  return;
}
```

### Command Handlers

All command handlers implement the `ICommandHandler` interface and return `AsyncResult`:

```typescript
export class CreateOrderCommandHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(private readonly repository: OrderRepository) {}

  async execute(command: CreateOrderCommand): AsyncResult<OrderResult, DomainError> {
    // Validate command
    const validationResult = this.validateCommand(command);
    if (Result.isErr(validationResult)) {
      return validationResult;
    }

    // Create aggregate
    const aggregate = Order.createOrder(command.payload);
    if (Result.isErr(aggregate)) {
      return aggregate;
    }

    // Save using repository
    const saveResult = await this.repository.save(aggregate.value);
    if (Result.isErr(saveResult)) {
      return saveResult;
    }

    return Result.ok({ aggregateId: aggregate.value.id });
  }
}
```

### Result Type Pattern

All operations use the Result type for explicit error handling:

```typescript
// Success case
return Result.ok(data);

// Error case
return Result.err(domainError('ORDER_NOT_FOUND', 'Order not found'));

// Pattern matching
const result = await operation();
return Result.match(result, {
  ok: (data) => processSuccess(data),
  err: (error) => handleError(error),
});
```

## ⚡ Event Sourcing

### Event Store

The PostgreSQL event store provides:

- **ACID guarantees** for event persistence
- **Optimistic concurrency control** with version checking
- **Snapshot support** for performance optimization
- **Event replay** capabilities for projections
- **Stream querying** with position-based filtering

```typescript
// Save events with concurrency control
const saveResult = await eventStore.appendToStream(
  aggregateId,
  events,
  expectedVersion
);

// Read event stream
const eventsResult = await eventStore.readStream(aggregateId);

// Read from position for projections
const allEventsResult = await eventStore.readAllEvents(fromPosition, batchSize);
```

### Aggregate Root

The modernized `OrderAggregate` extends `AggregateRoot` with proper event handling:

```typescript
export class Order extends AggregateRoot<IDomainEvent> {
  // Static factory method with Result type
  static createOrder(input: CreateOrderInput): Result<Order, DomainError> {
    const validationResult = this.validateInput(input);
    if (Result.isErr(validationResult)) {
      return validationResult;
    }

    const order = new Order(generateId(), 0);
    const event = new OrderCreatedEvent(/* ... */);
    order.applyEvent(event);
    
    return Result.ok(order);
  }

  // Business methods return Result types
  cancel(reason: string): Result<void, DomainError> {
    if (!this.canCancel()) {
      return Result.err(domainError('INVALID_STATE', 'Cannot cancel order'));
    }

    const event = new OrderCancelledEvent(/* ... */);
    this.applyEvent(event);
    
    return Result.ok(undefined);
  }

  // Event application with error handling
  protected applyEventData(event: IDomainEvent): Result<void, DomainError> {
    switch (event.type) {
      case 'OrderCreated':
        return this.applyOrderCreated(event as OrderCreatedEvent);
      case 'OrderCancelled':
        return this.applyOrderCancelled(event as OrderCancelledEvent);
      default:
        return Result.err(domainError('UNKNOWN_EVENT', `Unknown event: ${event.type}`));
    }
  }
}
```

## 📊 Projections

### Modern Projection System

The projection system supports multiple independent projections with:

- **Position tracking** with PostgreSQL checkpoints
- **Error handling** with retry mechanisms
- **Event filtering** by type and aggregate
- **Configurable batching** and polling intervals
- **Monitoring** and statistics

```typescript
// Projection configuration
const projectionConfigs: ProjectionConfig[] = [
  {
    name: 'order-read-model',
    batchSize: 50,
    pollInterval: 1000,
    startFromBeginning: true,
    aggregateTypes: ['Order'],
    enableRetries: true,
    maxRetries: 3,
  },
  {
    name: 'order-analytics',
    batchSize: 100,
    pollInterval: 5000,
    eventTypes: ['OrderCreated', 'OrderCancelled'],
    enableRetries: true,
  },
];

// Initialize projection service
const projectionService = new ModernOrderProjectionService(
  eventStore,
  prisma,
  projectionConfigs
);

await projectionService.start();
```

### Projection Rebuilding

Projections can be rebuilt from scratch:

```typescript
// Rebuild specific projection
await projectionService.rebuildProjection('order-read-model');

// Get projection statistics
const statsResult = await projectionService.getProjectionStats();
if (Result.isOk(statsResult)) {
  console.log('Projection stats:', statsResult.value);
}
```

### Event Handlers

Event handlers use Result types and proper error handling:

```typescript
export class ModernOrderCreatedEventHandler extends BaseOrderEventHandler<OrderCreatedEvent> {
  async handle(event: OrderCreatedEvent): AsyncResult<void, DomainError> {
    // Validate event
    const validation = this.validateEvent(event);
    if (Result.isErr(validation)) {
      return validation;
    }

    // Execute in transaction
    const result = await this.withTransaction(async (tx) => {
      return await tx.order.create({
        data: this.mapEventToOrderData(event),
      });
    });

    if (Result.isErr(result)) {
      return result;
    }

    // Handle side effects
    await this.handleSideEffects(event);

    return Result.ok(undefined);
  }

  private async handleSideEffects(event: OrderCreatedEvent): Promise<void> {
    // Reserve inventory
    if (this.context.inventoryService) {
      await this.context.inventoryService.reserveItems(/* ... */);
    }

    // Send notifications
    if (this.context.notificationService) {
      await this.context.notificationService.sendOrderNotification(/* ... */);
    }
  }
}
```

## 🔄 Sagas

### Workflow Orchestration

Sagas handle complex business workflows with compensation patterns:

```typescript
export class OrderFulfillmentSaga {
  async startSaga(event: OrderCreatedEvent): AsyncResult<SagaInstance, DomainError> {
    // Create saga instance
    const sagaId = generateId();
    const sagaData: OrderFulfillmentSagaData = {
      orderId: event.aggregateId,
      items: event.data.items,
      compensationActions: [],
    };

    const saga = await this.createSagaInstance(sagaId, sagaData);
    
    // Execute first step
    const reserveResult = await this.reserveInventory(saga);
    if (Result.isErr(reserveResult)) {
      await this.compensateSaga(saga, reserveResult.error.message);
    }

    return saga;
  }

  private async reserveInventory(saga: SagaInstance): AsyncResult<void, DomainError> {
    try {
      const result = await this.externalServices.inventoryService.reserveInventory({
        orderId: saga.orderId,
        items: saga.data.items,
      });

      // Update saga state
      await this.updateSagaState(saga.id, 'INVENTORY_RESERVED', {
        ...saga.data,
        reservationId: result.reservationId,
        compensationActions: [...saga.data.compensationActions, 'RELEASE_INVENTORY'],
      });

      // Proceed to next step
      return await this.processPayment(saga);
    } catch (error) {
      return Result.err(domainError('INVENTORY_RESERVATION_FAILED', 'Failed to reserve inventory', error));
    }
  }

  private async compensateSaga(saga: SagaInstance, reason: string): AsyncResult<void, DomainError> {
    await this.updateSagaState(saga.id, 'COMPENSATING', saga.data);

    // Execute compensation actions in reverse order
    for (const action of saga.data.compensationActions.reverse()) {
      await this.executeCompensationAction(saga, action);
    }

    await this.updateSagaState(saga.id, 'FAILED', saga.data);
    return Result.ok(undefined);
  }
}
```

### Saga Management

The saga manager coordinates multiple saga types:

```typescript
const sagaManager = new SagaManager(
  prisma,
  commandBus,
  externalServices,
  sagaConfig
);

// Handle domain events
await sagaManager.handleEvent(domainEvent);

// Get saga statistics
const stats = await sagaManager.getSagaStats();

// Retry failed sagas
await sagaManager.retrySaga(sagaId);
```

## 🗄️ Repository Pattern

### Enhanced Repository

The repository provides rich querying capabilities:

```typescript
export class OrderRepository extends BaseRepository<Order, string> {
  // Save aggregate with snapshots
  async save(aggregate: Order, options?: SaveOptions): AsyncResult<void, DomainError> {
    const events = aggregate.uncommittedEvents;
    const saveResult = await this.eventStore.appendToStream(
      aggregate.id,
      events,
      aggregate.version
    );

    if (Result.isErr(saveResult)) {
      return saveResult;
    }

    // Create snapshot if needed
    if (this.shouldCreateSnapshot(aggregate)) {
      await this.createSnapshot(aggregate);
    }

    aggregate.markEventsAsCommitted();
    return Result.ok(undefined);
  }

  // Query with specifications
  async findByQuery(query: RepositoryQuerySpec<Order>): AsyncResult<Order[], DomainError> {
    const allOrders = await this.loadAllOrders();
    const filtered = allOrders.filter(order => query.match(order));
    return Result.ok(filtered);
  }
}
```

### Query Specifications

Rich querying with composable specifications:

```typescript
// Pre-built queries
const activeOrdersQuery = CommonOrderQueries.active();
const pendingOrdersQuery = CommonOrderQueries.pending();

// Composite queries
const customerActiveOrders = OrderQueryBuilder.activeByCustomer(customerId);
const recentHighValueOrders = new CompositeRepositoryQuery([
  OrderQueryBuilder.highValue(1000),
  OrderQueryBuilder.recentByCustomer(customerId, 7),
], 'AND');

// Execute queries
const activeOrders = await repository.findByQuery(activeOrdersQuery);
const customerOrders = await repository.findByQuery(customerActiveOrders);
```

## 🚀 Performance Optimizations

### Caching Layer

```typescript
const performanceService = new OrdersPerformanceService(prisma, {
  enableCaching: true,
  cacheConfig: {
    ttl: 300, // 5 minutes
    maxSize: 1000,
  },
  batchConfig: {
    maxBatchSize: 10,
    batchTimeout: 50,
  },
});

// Optimized order retrieval
const order = await performanceService.getOptimizedOrder(orderId);

// Optimized list queries
const { orders, totalCount } = await performanceService.getOptimizedOrderList(
  filters,
  { skip: 0, take: 20 }
);
```

### Batch Operations

Operations are automatically batched for efficiency:

```typescript
// These will be batched automatically
const order1 = performanceService.getOptimizedOrder('order-1');
const order2 = performanceService.getOptimizedOrder('order-2');
const order3 = performanceService.getOptimizedOrder('order-3');

// All execute in single database query
const results = await Promise.all([order1, order2, order3]);
```

## 📈 Monitoring

### Health Checks

Comprehensive health monitoring:

```typescript
const monitoring = new OrdersMonitoringService(cqrsIntegration);

// Get overall health
const health = await monitoring.getHealthStatus();

// Get detailed metrics
const metrics = await monitoring.getSystemMetrics();

// Get projection status
const projectionStatus = await monitoring.getProjectionStatus();

// Get active sagas
const activeSagas = await monitoring.getActiveSagas();
```

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "version": "1.0.0",
  "uptime": 3600000,
  "components": {
    "database": {
      "status": "healthy",
      "responseTime": 45,
      "message": "Database responding in 45ms"
    },
    "eventStore": {
      "status": "healthy",
      "message": "Event store is operational"
    },
    "projections": {
      "status": "healthy",
      "message": "3/3 projections running",
      "details": {
        "totalProjections": 3,
        "runningProjections": 3,
        "eventsProcessed": 15432
      }
    },
    "sagas": {
      "status": "healthy",
      "message": "5 active, 2 failed of 150 total"
    }
  }
}
```

## 🛠️ Development Guide

### Setting Up Development Environment

1. **Install Dependencies**
   ```bash
   bun install
   ```

2. **Start Infrastructure**
   ```bash
   bun run docker:dev
   ```

3. **Run Migrations**
   ```bash
   bun run setup
   cd services/orders && bunx prisma migrate dev
   ```

4. **Start Service**
   ```bash
   bun run dev:orders
   ```

### Creating New Commands

1. **Define Command**
   ```typescript
   export interface MyNewCommand extends ICommand {
     type: 'MyNewCommand';
     payload: {
       orderId: string;
       data: MyData;
     };
   }
   ```

2. **Add to Command Map**
   ```typescript
   export type OrderCommandMap = TypedCommandMap<{
     // ... existing commands
     MyNewCommand: MyNewCommand;
   }>;
   ```

3. **Create Handler**
   ```typescript
   export class MyNewCommandHandler implements ICommandHandler<MyNewCommand> {
     async execute(command: MyNewCommand): AsyncResult<void, DomainError> {
       // Implementation
     }
   }
   ```

4. **Register Handler**
   ```typescript
   commandBus.register('MyNewCommand', new MyNewCommandHandler(repository));
   ```

### Creating New Events

1. **Define Event**
   ```typescript
   export interface MyNewEvent extends IDomainEvent {
     type: 'MyNewEvent';
     data: {
       orderId: string;
       // event data
     };
   }
   ```

2. **Add to Aggregate**
   ```typescript
   protected applyEventData(event: IDomainEvent): Result<void, DomainError> {
     switch (event.type) {
       // ... existing cases
       case 'MyNewEvent':
         return this.applyMyNewEvent(event as MyNewEvent);
     }
   }
   ```

3. **Create Event Handler**
   ```typescript
   export class MyNewEventHandler extends BaseOrderEventHandler<MyNewEvent> {
     async handle(event: MyNewEvent): AsyncResult<void, DomainError> {
       // Update read model
     }
   }
   ```

### Testing

```bash
# Run all tests
bun test

# Run specific test
bun test orders

# Run integration tests
bun run test:integration
```

### Code Quality

```bash
# Type checking
bun run typecheck

# Linting
bun run lint
bun run lint:fix
```

## 🚀 Production Deployment

### Environment Configuration

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/orders_db

# Redis
REDIS_URL=redis://host:6379

# Event Sourcing
ENABLE_MODERN_PROJECTIONS=true
ENABLE_SAGAS=true
ENABLE_OUTBOX_PROCESSOR=true

# Performance
ENABLE_QUERY_OPTIMIZATION=true
ENABLE_CACHING=true
CACHE_TTL=300
MAX_CACHE_SIZE=10000

# Monitoring
ENABLE_METRICS=true
ENABLE_TRACING=true
```

### Docker Deployment

```dockerfile
FROM oven/bun:1-alpine as dependencies
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine as build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN bun run build:services

FROM oven/bun:1-alpine as runtime
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/services/orders/package.json ./
EXPOSE 4003
CMD ["bun", "run", "dist/services/orders/index.js"]
```

### Health Check Endpoints

```bash
# Basic health
curl http://localhost:4003/health

# Detailed metrics
curl http://localhost:4003/metrics

# Projection status
curl http://localhost:4003/projections/status

# Active sagas
curl http://localhost:4003/sagas/active
```

### Performance Tuning

1. **Database Optimization**
   - Connection pooling: 10-20 connections
   - Query timeout: 30 seconds
   - Statement timeout: 60 seconds

2. **Event Store Tuning**
   - Batch size: 50-100 events
   - Snapshot frequency: every 10 events
   - Cleanup old events: 90 days

3. **Projection Optimization**
   - Poll interval: 1-5 seconds
   - Batch size: 25-100 events
   - Retry attempts: 3-5 times

4. **Cache Configuration**
   - TTL: 5-15 minutes
   - Max size: 1000-10000 entries
   - Eviction policy: LRU

### Monitoring and Alerting

1. **Key Metrics**
   - Command processing time
   - Event store append rate
   - Projection lag
   - Saga completion rate
   - Error rates

2. **Alerts**
   - High error rates (>5%)
   - Slow commands (>1s)
   - Projection lag (>1 minute)
   - Failed sagas (>10%)
   - Memory usage (>80%)

3. **Dashboards**
   - System overview
   - Command metrics
   - Event store metrics
   - Projection status
   - Saga workflows

## 📚 Additional Resources

- [Event Sourcing Patterns](https://martinfowler.com/eaaDev/EventSourcing.html)
- [CQRS Journey](https://docs.microsoft.com/en-us/previous-versions/msp-n-p/jj554200(v=pandp.10))
- [Saga Pattern](https://microservices.io/patterns/data/saga.html)
- [Domain-Driven Design](https://domainlanguage.com/ddd/)

## 🤝 Contributing

1. Follow the established patterns
2. Write comprehensive tests
3. Update documentation
4. Use Result types for error handling
5. Follow TypeScript strict mode
6. Add monitoring for new features

---

This guide provides a comprehensive overview of the modernized Orders service. For specific implementation details, refer to the source code and inline documentation.