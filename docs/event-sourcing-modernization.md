# Event Sourcing Package Modernization

This document describes the comprehensive modernization of the event sourcing package, introducing type safety, functional error handling, and modern patterns.

## Overview

The event sourcing package has been modernized with:
- **Result Type Integration**: All operations now return `Result<T, DomainError>` for functional error handling
- **Generic Type Support**: Full TypeScript generics for type-safe events and commands
- **Enhanced Interfaces**: New interfaces for projections, sagas, and stream management
- **Modern Patterns**: Command pattern, factory classes, and builder patterns
- **Production Features**: Retry logic, bulk operations, subscription management

## Core Types Enhancements

### Generic Event Types

```typescript
// Type-safe domain events with generic data
export interface IDomainEvent<TData = Record<string, unknown>> {
  readonly id: string;
  readonly type: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly data: TData;
  readonly metadata: IEventMetadata;
  readonly occurredAt: Date;
  readonly version: number;
}

// Type-safe stored events
export interface IStoredEvent<TData = Record<string, unknown>> 
  extends IDomainEvent<TData> {
  readonly position: IStreamPosition;
  readonly storedAt: Date;
}
```

### Command Pattern Support

```typescript
// Command interface with generic payload
export interface ICommand<TPayload = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: TPayload;
  readonly metadata: ICommandMetadata;
  readonly createdAt: Date;
}

// Command metadata
export interface ICommandMetadata {
  readonly userId?: string;
  readonly correlationId?: string;
  readonly source: string;
  readonly context?: Record<string, unknown>;
}
```

### Enhanced Aggregate Root

```typescript
export abstract class AggregateRoot<TEvent extends IDomainEvent = IDomainEvent> {
  // New features:
  protected isDeleted: boolean;
  
  // Execute command with Result type
  protected executeCommand<TCommand extends ICommand>(
    command: TCommand,
    handler: (cmd: TCommand) => Result<TEvent[], DomainError>
  ): Result<void, DomainError>;
  
  // Create event with metadata
  protected createEvent<TData>(
    type: string,
    data: TData,
    metadata?: Partial<IEventMetadata>
  ): TEvent;
  
  // Load from events
  static loadFromEvents<T extends AggregateRoot>(
    this: new (id: string, version?: number) => T,
    events: IDomainEvent[]
  ): T;
}
```

### New Interfaces

```typescript
// Snapshot support
export interface ISnapshot<TState = unknown> {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly state: TState;
  readonly createdAt: Date;
}

// Projection for read models
export interface IProjection<TState = unknown> {
  readonly name: string;
  readonly state: TState;
  readonly lastPosition: bigint;
  handle(event: IStoredEvent): Promise<void>;
  getState(): TState;
  reset(): Promise<void>;
}

// Saga for process managers
export interface ISaga {
  readonly id: string;
  readonly type: string;
  readonly state: 'active' | 'completed' | 'failed' | 'compensating';
  handle(event: IStoredEvent): Promise<ICommand[]>;
  isComplete(): boolean;
}

// Event stream management
export interface IEventStream {
  readonly streamId: string;
  readonly streamType: string;
  readonly version: number;
  append(events: IDomainEvent[], expectedVersion?: number): 
    Promise<Result<void, DomainError>>;
  read(fromVersion?: number, toVersion?: number): 
    Promise<Result<IStoredEvent[], DomainError>>;
  getMetadata(): Promise<Result<IStreamMetadata, DomainError>>;
}
```

## Event Store Modernization

### Result Type Integration

All event store methods now return `AsyncResult<T, DomainError>`:

```typescript
export interface IEventStore {
  appendToStream(
    aggregateId: string,
    events: IDomainEvent[],
    expectedVersion?: number
  ): AsyncResult<IStreamPosition[], DomainError>;

  readStream(
    aggregateId: string,
    fromVersion?: number,
    toVersion?: number
  ): AsyncResult<IStoredEvent[], DomainError>;

  getCurrentVersion(aggregateId: string): AsyncResult<number, DomainError>;
  
  aggregateExists(aggregateId: string): AsyncResult<boolean, DomainError>;
  
  saveSnapshot(snapshot: ISnapshot): AsyncResult<void, DomainError>;
  
  loadSnapshot(aggregateId: string): AsyncResult<ISnapshot | null, DomainError>;
}
```

### New Features

```typescript
// Bulk operations for efficiency
bulkAppend(
  operations: Array<{
    aggregateId: string;
    events: IDomainEvent[];
    expectedVersion?: number;
  }>
): AsyncResult<IStreamPosition[][], DomainError>;

// Stream metadata
getStreamMetadata(aggregateId: string): 
  AsyncResult<IStreamMetadata | null, DomainError>;

// Enhanced subscriptions
subscribe(
  callback: (events: IStoredEvent[]) => Promise<void>,
  query?: IEventStoreQuery
): AsyncResult<EventSubscription, DomainError>;

// Subscription management
interface EventSubscription {
  readonly id: string;
  close(): Promise<void>;
  isActive(): boolean;
  pause(): void;
  resume(): void;
  getStats(): SubscriptionStats;
}
```

### Retry Logic

```typescript
protected async withRetry<T>(
  operation: () => AsyncResult<T, DomainError>,
  operationName: string
): AsyncResult<T, DomainError> {
  // Exponential backoff retry for transient failures
  // Skips retry for non-transient errors like:
  // - CONCURRENCY_CONFLICT
  // - AGGREGATE_NOT_FOUND
  // - INVALID_EVENT_SEQUENCE
}
```

## PostgreSQL Implementation

The PostgreSQL event store has been fully modernized:

### Enhanced Schema

```sql
-- Events table with optimized indexes
CREATE TABLE events (
  global_position BIGSERIAL PRIMARY KEY,
  id UUID NOT NULL UNIQUE,
  type VARCHAR(255) NOT NULL,
  aggregate_id UUID NOT NULL,
  aggregate_type VARCHAR(255) NOT NULL,
  stream_position INTEGER NOT NULL,
  data JSONB NOT NULL,
  metadata JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL,
  UNIQUE(aggregate_id, stream_position)
);

-- Snapshots table
CREATE TABLE snapshots (
  id SERIAL PRIMARY KEY,
  aggregate_id UUID NOT NULL,
  aggregate_type VARCHAR(255) NOT NULL,
  state JSONB NOT NULL,
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Outbox table for reliable event publishing
CREATE TABLE outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id UUID NOT NULL,
  event_id UUID NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT
);
```

### Concurrency Control

```typescript
// Advisory locks for aggregate-level concurrency
await client.query(
  `SELECT pg_advisory_xact_lock(hashtext($1))`,
  [aggregateId]
);

// Optimistic concurrency with version checking
if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
  return Result.err(
    EventSourcingErrors.ConcurrencyConflict(expectedVersion, currentVersion)
  );
}
```

## Error Handling

### Domain-Specific Errors

```typescript
export const EventSourcingErrors = {
  AggregateNotFound: (aggregateType: string, id: string) =>
    domainError('AGGREGATE_NOT_FOUND', `${aggregateType} with id ${id} not found`),
  
  ConcurrencyConflict: (expectedVersion: number, actualVersion: number) =>
    domainError('CONCURRENCY_CONFLICT', 
      `Expected version ${expectedVersion} but current version is ${actualVersion}`),
  
  InvalidEventSequence: (message: string) =>
    domainError('INVALID_EVENT_SEQUENCE', message),
  
  SnapshotNotFound: (aggregateId: string) =>
    domainError('SNAPSHOT_NOT_FOUND', 
      `Snapshot not found for aggregate ${aggregateId}`),
  
  EventStoreError: (message: string, details?: unknown) =>
    domainError('EVENT_STORE_ERROR', message, details),
};
```

## Factory Classes

### EventFactory

```typescript
export class EventFactory {
  static create<TData = Record<string, unknown>>(
    type: string,
    aggregateId: string,
    aggregateType: string,
    data: TData,
    metadata: Partial<IEventMetadata>,
    version: number,
    id?: string,
    occurredAt?: Date
  ): IDomainEvent<TData>;

  static createFromCommand<TData = Record<string, unknown>>(
    command: ICommand,
    type: string,
    aggregateId: string,
    aggregateType: string,
    data: TData,
    version: number
  ): IDomainEvent<TData>;
}
```

### CommandFactory

```typescript
export class CommandFactory {
  static create<TPayload = unknown>(
    type: string,
    payload: TPayload,
    metadata: Partial<ICommandMetadata>,
    id?: string
  ): ICommand<TPayload>;
}
```

## Type-Safe Event Maps

```typescript
// Define event map for a service
export type OrderEventMap = DefineEventMap<{
  OrderCreated: OrderCreatedEvent;
  OrderCancelled: OrderCancelledEvent;
  OrderStatusChanged: OrderStatusChangedEvent;
  // ... other events
}>;

// Use with typed event bus
const eventBus = createEventBus<OrderEventMap>();

// Full type safety
eventBus.publish('OrderCreated', event); // ✓ Type-safe
eventBus.publish('InvalidEvent', event); // ✗ Compile error
```

## Usage Examples

### Creating an Aggregate with Result Type

```typescript
class OrderAggregate extends AggregateRoot<OrderDomainEvent> {
  static create(
    customerId: string,
    items: OrderItem[]
  ): Result<OrderAggregate, DomainError> {
    // Validate business rules
    if (!customerId) {
      return Result.err(BusinessRuleError('Customer ID is required'));
    }
    
    if (items.length === 0) {
      return Result.err(BusinessRuleError('Order must have at least one item'));
    }
    
    // Create aggregate
    const order = new OrderAggregate(generateId());
    const event = order.createEvent('OrderCreated', {
      customerId,
      items,
      status: 'pending',
    });
    
    order.applyEvent(event);
    return Result.ok(order);
  }
  
  cancel(reason: string): Result<void, DomainError> {
    return this.executeCommand(
      CommandFactory.create('CancelOrder', { reason }),
      (cmd) => {
        if (this.status === 'delivered') {
          return Result.err(
            BusinessRuleError('Cannot cancel delivered order')
          );
        }
        
        const event = this.createEvent('OrderCancelled', {
          reason: cmd.payload.reason,
          cancelledAt: new Date(),
        });
        
        return Result.ok([event]);
      }
    );
  }
}
```

### Using the Event Store

```typescript
// Append events with Result handling
const result = await eventStore.appendToStream(
  orderId,
  order.uncommittedEvents,
  order.version
);

Result.match(result, {
  ok: (positions) => {
    console.log('Events stored at positions:', positions);
    order.markEventsAsCommitted();
  },
  err: (error) => {
    if (error.code === 'CONCURRENCY_CONFLICT') {
      // Handle concurrent update
    } else {
      // Handle other errors
    }
  }
});

// Read stream with error handling
const eventsResult = await eventStore.readStream(orderId);

return Result.flatMap(eventsResult, (events) => {
  if (events.length === 0) {
    return Result.err(EventSourcingErrors.AggregateNotFound('Order', orderId));
  }
  
  const order = OrderAggregate.loadFromEvents(events);
  return Result.ok(order);
});
```

### Subscriptions with Management

```typescript
const subscriptionResult = await eventStore.subscribe(
  async (events) => {
    for (const event of events) {
      await projection.handle(event);
    }
  },
  { aggregateType: 'Order', eventType: 'OrderCreated' }
);

if (Result.isOk(subscriptionResult)) {
  const subscription = subscriptionResult.value;
  
  // Pause during maintenance
  subscription.pause();
  
  // Resume processing
  subscription.resume();
  
  // Check statistics
  const stats = subscription.getStats();
  console.log(`Processed ${stats.eventsProcessed} events`);
  
  // Clean shutdown
  await subscription.close();
}
```

## Migration Guide

### From Throwing Exceptions to Result Type

Before:
```typescript
async appendToStream(aggregateId: string, events: IDomainEvent[]): Promise<void> {
  if (events.length === 0) {
    throw new Error('Cannot append empty event list');
  }
  // ... implementation
}
```

After:
```typescript
async appendToStream(
  aggregateId: string, 
  events: IDomainEvent[]
): AsyncResult<IStreamPosition[], DomainError> {
  const validation = this.validateEvents(events);
  if (Result.isErr(validation)) {
    return validation;
  }
  // ... implementation
}
```

### From Callbacks to Result Type in Aggregates

Before:
```typescript
class OrderAggregate {
  cancel(reason: string): void {
    if (this.status === 'delivered') {
      throw new Error('Cannot cancel delivered order');
    }
    this.applyEvent(new OrderCancelledEvent(reason));
  }
}
```

After:
```typescript
class OrderAggregate extends AggregateRoot<OrderDomainEvent> {
  cancel(reason: string): Result<void, DomainError> {
    return this.executeCommand(
      CommandFactory.create('CancelOrder', { reason }),
      (cmd) => {
        if (this.status === 'delivered') {
          return Result.err(
            BusinessRuleError('Cannot cancel delivered order')
          );
        }
        
        const event = this.createEvent('OrderCancelled', {
          reason: cmd.payload.reason,
        });
        
        return Result.ok([event]);
      }
    );
  }
}
```

## Benefits

1. **Type Safety**: Full TypeScript type inference for events, commands, and snapshots
2. **Error Handling**: Functional error handling without exceptions
3. **Testability**: Easy to test with Result type and factories
4. **Performance**: Bulk operations, retry logic, and optimized queries
5. **Observability**: Subscription statistics and comprehensive error tracking
6. **Flexibility**: Support for projections, sagas, and complex event flows
7. **Production Ready**: Concurrency control, outbox pattern, and graceful degradation