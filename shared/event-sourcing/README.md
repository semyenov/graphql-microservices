# Event Sourcing Package

A comprehensive event sourcing and CQRS implementation for the GraphQL microservices architecture.

## Overview

This package provides the foundational building blocks for implementing event sourcing patterns:

- **Domain Events**: Type-safe event definitions with metadata
- **Event Store**: Abstractions for persisting and querying events
- **Outbox Pattern**: Reliable event publishing across service boundaries
- **Aggregate Roots**: Base classes for domain aggregates
- **CQRS Support**: Command/Query separation patterns

## Key Features

- ✅ **Type Safety**: Full TypeScript support with Zod validation
- ✅ **Optimistic Concurrency**: Built-in version conflict resolution
- ✅ **Reliable Publishing**: Outbox pattern with retry mechanisms
- ✅ **Event Replay**: Reconstruct aggregate state from events
- ✅ **Snapshots**: Performance optimization for large event streams
- ✅ **Tracing**: Correlation and causation ID support
- ✅ **Flexible Storage**: Pluggable event store implementations

## Core Concepts

### Domain Events

Events represent facts that have occurred in your domain:

```typescript
import { DomainEvent, EventFactory } from '@graphql-microservices/shared-event-sourcing';

// Create a domain event
const userCreatedEvent = EventFactory.create(
  'UserCreated',
  userId,
  'User',
  {
    username: 'john_doe',
    email: 'john@example.com',
    name: 'John Doe'
  },
  {
    source: 'users-service',
    userId: creatorId,
    correlationId: 'req-123'
  },
  1 // version
);
```

### Aggregate Roots

Aggregates encapsulate business logic and emit events:

```typescript
import { AggregateRoot, EventFactory } from '@graphql-microservices/shared-event-sourcing';

class User extends AggregateRoot {
  private username: string = '';
  private email: string = '';
  private isActive: boolean = true;

  static create(id: string, username: string, email: string): User {
    const user = new User(id);
    
    const event = EventFactory.create(
      'UserCreated',
      id,
      'User',
      { username, email },
      { source: 'users-service' },
      1
    );
    
    user.applyEvent(event);
    return user;
  }

  deactivate(): void {
    if (!this.isActive) {
      throw new Error('User is already deactivated');
    }

    const event = EventFactory.create(
      'UserDeactivated',
      this.id,
      'User',
      { reason: 'Manual deactivation' },
      { source: 'users-service' },
      this.version + 1
    );

    this.applyEvent(event);
  }

  protected applyEventData(event: DomainEvent): void {
    switch (event.type) {
      case 'UserCreated':
        this.username = event.data.username as string;
        this.email = event.data.email as string;
        this.isActive = true;
        break;
      
      case 'UserDeactivated':
        this.isActive = false;
        break;

      default:
        throw new Error(`Unknown event type: ${event.type}`);
    }
  }

  // Getters
  getUsername(): string { return this.username; }
  getEmail(): string { return this.email; }
  getIsActive(): boolean { return this.isActive; }
}
```

### Event Store

The event store persists events and supports querying:

```typescript
import { EventStore } from '@graphql-microservices/shared-event-sourcing';

// Append events to an aggregate stream
await eventStore.appendToStream(userId, user.uncommittedEvents);

// Read events from a stream
const events = await eventStore.readStream(userId);

// Reconstruct aggregate from events
const user = User.fromEvents(events);

// Query events across aggregates
const recentEvents = await eventStore.readEvents({
  aggregateType: 'User',
  eventType: 'UserCreated',
  fromPosition: lastProcessedPosition,
  limit: 100
});
```

### Outbox Pattern

Ensures reliable event publishing across service boundaries:

```typescript
import { OutboxProcessor, OutboxStore, EventPublisher } from '@graphql-microservices/shared-event-sourcing';

// Setup outbox processor
const processor = new OutboxProcessor(
  outboxStore,
  eventPublisher,
  {
    maxRetries: 5,
    batchSize: 10,
    processingInterval: 5000
  }
);

// Start processing
processor.start();

// Events are automatically published from the outbox
await outboxStore.addEvents(user.uncommittedEvents, 'user.events');
```

## Implementation Guide

### 1. Create Domain Events

Define your domain events with proper typing:

```typescript
// User domain events
export interface UserCreatedEvent extends DomainEvent {
  type: 'UserCreated';
  data: {
    username: string;
    email: string;
    name: string;
  };
}

export interface UserDeactivatedEvent extends DomainEvent {
  type: 'UserDeactivated';
  data: {
    reason: string;
  };
}

export type UserDomainEvent = UserCreatedEvent | UserDeactivatedEvent;
```

### 2. Implement Event Store

Create a PostgreSQL-based event store:

```typescript
import { BaseEventStore } from '@graphql-microservices/shared-event-sourcing';

export class PostgreSQLEventStore extends BaseEventStore {
  // Implementation details...
}
```

### 3. Setup Outbox

Configure outbox pattern for your service:

```typescript
// In your service startup
const outboxStore = new PostgreSQLOutboxStore(connectionString);
const eventPublisher = new RedisEventPublisher(redisClient);
const processor = new OutboxProcessor(outboxStore, eventPublisher);

processor.start();
```

### 4. Create Command Handlers

Implement CQRS command handlers:

```typescript
export class CreateUserCommandHandler {
  constructor(
    private eventStore: EventStore,
    private outboxStore: OutboxStore
  ) {}

  async handle(command: CreateUserCommand): Promise<void> {
    // Create aggregate
    const user = User.create(
      command.id,
      command.username,
      command.email
    );

    // Save events
    await this.eventStore.appendToStream(
      user.id,
      user.uncommittedEvents
    );

    // Add to outbox for publishing
    await this.outboxStore.addEvents(
      user.uncommittedEvents,
      'user.events'
    );

    user.markEventsAsCommitted();
  }
}
```

### 5. Create Query Handlers

Implement read-side projections:

```typescript
export class UserProjection {
  async handle(event: UserDomainEvent): Promise<void> {
    switch (event.type) {
      case 'UserCreated':
        await this.createUserView(event);
        break;
      
      case 'UserDeactivated':
        await this.deactivateUserView(event);
        break;
    }
  }

  private async createUserView(event: UserCreatedEvent): Promise<void> {
    // Update read model/projection
  }
}
```

## Configuration

Configure the event sourcing system:

```typescript
import { EventSourcingConfig } from '@graphql-microservices/shared-event-sourcing';

const config: EventSourcingConfig = {
  serviceName: 'users-service',
  eventStore: {
    connectionString: process.env.DATABASE_URL,
    eventsTable: 'events',
    snapshotsTable: 'snapshots',
    enableSnapshots: true,
    snapshotFrequency: 50
  },
  outbox: {
    maxRetries: 5,
    initialRetryDelay: 1000,
    batchSize: 10
  },
  enableReplay: true,
  enableProjections: true
};
```

## Best Practices

1. **Event Naming**: Use past tense verbs (e.g., `UserCreated`, not `CreateUser`)
2. **Event Immutability**: Never modify events after they're stored
3. **Aggregate Boundaries**: Keep aggregates focused and avoid large graphs
4. **Idempotency**: Ensure event handlers are idempotent
5. **Versioning**: Plan for event schema evolution
6. **Snapshots**: Use snapshots for aggregates with many events
7. **Error Handling**: Implement proper retry and dead letter patterns

## Advanced Features

### Event Replay

Replay events to rebuild projections:

```typescript
const events = await eventStore.readAllEvents(fromPosition);
for (const event of events) {
  await projectionHandler.handle(event);
}
```

### Snapshots

Optimize performance with snapshots:

```typescript
// Load aggregate with snapshot optimization
const snapshot = await eventStore.loadSnapshot(aggregateId);
const fromVersion = snapshot ? snapshot.version + 1 : 1;
const events = await eventStore.readStream(aggregateId, fromVersion);

const aggregate = snapshot 
  ? User.fromSnapshot(snapshot)
  : new User(aggregateId);

// Apply remaining events
for (const event of events) {
  aggregate.applyEventData(event);
}
```

### Event Subscriptions

Subscribe to real-time events:

```typescript
const subscription = await eventStore.subscribe(
  async (events) => {
    for (const event of events) {
      await eventHandler.handle(event);
    }
  },
  { aggregateType: 'User' }
);
```

## Testing

Test your event-sourced aggregates:

```typescript
describe('User Aggregate', () => {
  it('should create user with correct events', () => {
    const user = User.create('123', 'john', 'john@example.com');
    
    expect(user.uncommittedEvents).toHaveLength(1);
    expect(user.uncommittedEvents[0].type).toBe('UserCreated');
    expect(user.getUsername()).toBe('john');
  });

  it('should deactivate user', () => {
    const user = User.create('123', 'john', 'john@example.com');
    user.markEventsAsCommitted();
    
    user.deactivate();
    
    expect(user.uncommittedEvents).toHaveLength(1);
    expect(user.uncommittedEvents[0].type).toBe('UserDeactivated');
    expect(user.getIsActive()).toBe(false);
  });
});
```

## Migration from Current Architecture

1. **Phase 1**: Add event sourcing alongside current CRUD operations
2. **Phase 2**: Migrate critical aggregates to event sourcing
3. **Phase 3**: Build read models from events
4. **Phase 4**: Remove direct database access for domain operations

## Performance Considerations

- Use connection pooling for event store
- Implement proper indexing on event tables
- Consider event batching for high-throughput scenarios
- Use snapshots for aggregates with many events
- Implement event archiving for old events