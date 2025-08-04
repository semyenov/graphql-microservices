# Typed EventBus Usage Guide

This guide demonstrates how to use the new typed EventBus implementation across the microservices.

## Overview

The typed EventBus provides:
- Full TypeScript type safety for all events
- IntelliSense support for event types and payloads
- Multiple registration patterns
- Built-in error handling
- Testing utilities

## Basic Usage

### 1. Define Event Maps

Each service has its own event map that defines all possible events:

```typescript
// services/orders/src/domain/events/event-map.ts
import type { DefineEventMap } from '@graphql-microservices/event-sourcing';

export type OrderEventMap = DefineEventMap<{
  OrderCreated: OrderCreatedEvent;
  OrderCancelled: OrderCancelledEvent;
  OrderStatusChanged: OrderStatusChangedEvent;
  // ... other events
}>;
```

### 2. Create Event Handlers

Event handlers use the `@EventHandler` decorator and implement `IEventHandler`:

```typescript
import { EventHandler, type IEventHandler } from '@graphql-microservices/event-sourcing/cqrs';

@EventHandler('OrderCreated')
export class OrderCreatedEventHandler implements IEventHandler<OrderCreatedEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: OrderCreatedEvent): Promise<void> {
    // Process the event
    await this.prisma.order.create({
      data: {
        id: event.aggregateId,
        // ... map event data to database schema
      }
    });
  }
}
```

### 3. Initialize Event Bus

Each service has a factory function to create a configured event bus:

```typescript
import { createOrderEventBus } from './infrastructure/event-bus';

// In your service initialization
const eventBus = createOrderEventBus(prisma);
```

### 4. Publish Events

Events can be published individually or in batches:

```typescript
// Single event
await eventBus.publish({
  type: 'OrderCreated',
  id: generateId(),
  aggregateId: orderId,
  version: 1,
  occurredAt: new Date(),
  data: {
    orderNumber: 'ORD-12345',
    customerId: 'customer-123',
    // ... other data
  }
});

// Multiple events
await eventBus.publishAll([
  orderCreatedEvent,
  orderItemAddedEvent,
  orderPaymentUpdatedEvent
]);
```

## Advanced Usage

### Event Bus with Builder Pattern

```typescript
const eventBus = createEventBus<OrderEventMap>();

eventBus
  .register()
  .handler(new OrderCreatedEventHandler(prisma))
  .handler(new OrderCancelledEventHandler(prisma))
  .on('OrderStatusChanged', new CustomStatusHandler(prisma))
  .build();
```

### Subscribe to Events

For testing or external integrations:

```typescript
// Subscribe to specific event
const unsubscribe = eventBus.subscribe('OrderCreated', async (event) => {
  console.log('Order created:', event.data.orderNumber);
});

// Subscribe to all events
const unsubscribeAll = eventBus.subscribeToAll(async (event) => {
  console.log('Event received:', event.type);
});

// Clean up
unsubscribe();
unsubscribeAll();
```

### Wait for Events (Testing)

```typescript
describe('Order Service', () => {
  it('should emit OrderCreated event', async () => {
    const eventPromise = eventBus.waitFor('OrderCreated', 5000);
    
    // Trigger action that creates order
    await createOrder(orderData);
    
    const event = await eventPromise;
    expect(event.data.orderNumber).toBe('ORD-12345');
  });
});
```

## Integration with Event Sourcing

### Processing Stored Events

```typescript
import { processOrderEvents } from './infrastructure/event-bus';

// After loading events from event store
const events = await eventStore.getEvents(aggregateId);
await processOrderEvents(eventBus, events);
```

### Command Handler Integration

```typescript
export class CreateOrderCommandHandler {
  constructor(
    private readonly eventStore: IEventStore,
    private readonly eventBus: EventBus<OrderEventMap>
  ) {}

  async execute(command: CreateOrderCommand): Promise<void> {
    // Create aggregate
    const order = Order.create(/* ... */);
    
    // Save to event store
    await this.eventStore.save(order);
    
    // Publish events for projections
    await this.eventBus.publishAll(order.getUncommittedEvents());
  }
}
```

## Service-Specific Examples

### Orders Service

```typescript
import { createOrderEventBus } from './infrastructure/event-bus';
import type { OrderEventMap } from './domain/order-aggregate';

const eventBus = createOrderEventBus(prisma);

// Type-safe event publishing
await eventBus.publish({
  type: 'OrderStatusChanged', // TypeScript knows valid types
  id: 'evt_123',
  aggregateId: 'order_456',
  version: 2,
  occurredAt: new Date(),
  data: {
    orderNumber: 'ORD-12345',
    newStatus: 'shipped', // TypeScript validates status values
    previousStatus: 'processing',
    reason: 'Items dispatched'
  }
});
```

### Users Service

```typescript
import { createUserEventBus } from './infrastructure/event-bus';

const eventBus = createUserEventBus(prisma, cacheService, pubSubService);

// Register additional handler
eventBus.registerHandler(new CustomUserEventHandler());

// Process user events
await eventBus.publish({
  type: 'UserRoleChanged',
  // ... event data
});
```

### Products Service

```typescript
import { createProductEventBus } from './infrastructure/event-bus';

const eventBus = createProductEventBus(prisma, cacheService, pubSubService);

// Handle stock updates
await eventBus.publish({
  type: 'ProductStockReserved',
  // ... event data
});
```

## Error Handling

The EventBus includes built-in error handling:

```typescript
const eventBus = createEventBus<OrderEventMap>({
  onError: (error, event, handler) => {
    logger.error('Event processing failed', {
      error: error.message,
      eventType: event.type,
      eventId: event.id,
      handler: handler.constructor.name
    });
    
    // Send to monitoring service
    await monitoring.reportError(error, { event });
  }
});
```

## Migration from Old Pattern

### Before (Custom EventHandler)

```typescript
export interface EventHandler<T extends DomainEvent> {
  handle(event: T): Promise<void>;
  canHandle(event: DomainEvent): boolean;
}

class UserCreatedHandler implements EventHandler<UserCreatedEvent> {
  canHandle(event: DomainEvent): boolean {
    return event.type === 'UserCreated';
  }
  
  async handle(event: UserCreatedEvent): Promise<void> {
    // ...
  }
}
```

### After (Typed EventBus)

```typescript
import { EventHandler, type IEventHandler } from '@graphql-microservices/event-sourcing/cqrs';

@EventHandler('UserCreated')
class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  async handle(event: UserCreatedEvent): Promise<void> {
    // ...
  }
}
```

## Benefits

1. **Type Safety**: Full compile-time checking of event types and payloads
2. **Developer Experience**: IntelliSense for all event operations
3. **Consistency**: Unified event handling across all services
4. **Testing**: Built-in utilities for testing event flows
5. **Performance**: Efficient event routing and parallel processing
6. **Error Handling**: Centralized error handling with custom callbacks

## Best Practices

1. **Define Event Maps Early**: Create event maps when designing new features
2. **Use Decorators**: Leverage `@EventHandler` for automatic registration
3. **Handle Errors**: Always provide custom error handlers for production
4. **Test Events**: Use `waitFor()` in tests to verify event emissions
5. **Batch Operations**: Use `publishAll()` for multiple related events
6. **Clean Up**: Unsubscribe from events when no longer needed