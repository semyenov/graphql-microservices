/**
 * Example usage of the typed EventBus with event handlers
 */

import type { IDomainEvent } from '../types';
// Test framework imports - adjust based on your test runner (jest, vitest, bun test, etc.)
// import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventHandler } from './decorators';
import { createEventBus, type DefineEventMap, type EventBus } from './event-bus';
import type { IEventHandler } from './types';

// Step 1: Define your domain events
interface UserCreatedEvent extends IDomainEvent {
  type: 'UserCreated';
  aggregateType: 'User';
  data: {
    userId: string;
    email: string;
    username: string;
  };
}

interface UserUpdatedEvent extends IDomainEvent {
  type: 'UserUpdated';
  aggregateType: 'User';
  data: {
    userId: string;
    changes: Record<string, any>;
  };
}

interface OrderPlacedEvent extends IDomainEvent {
  type: 'OrderPlaced';
  aggregateType: 'Order';
  data: {
    orderId: string;
    userId: string;
    items: Array<{ productId: string; quantity: number }>;
    totalAmount: number;
  };
}

// Step 2: Define your event map for full type safety
type AppEventMap = DefineEventMap<{
  UserCreated: UserCreatedEvent;
  UserUpdated: UserUpdatedEvent;
  OrderPlaced: OrderPlacedEvent;
}>;

// Step 3: Create event handlers using decorators
@EventHandler('UserCreated')
class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  async handle(event: UserCreatedEvent): Promise<void> {
    console.log('User created:', event.data);
    // Update read model, send emails, etc.
  }
}

@EventHandler('UserUpdated')
class UserUpdatedHandler implements IEventHandler<UserUpdatedEvent> {
  async handle(event: UserUpdatedEvent): Promise<void> {
    console.log('User updated:', event.data);
    // Update cache, publish to GraphQL subscriptions, etc.
  }
}

@EventHandler('OrderPlaced')
class OrderPlacedHandler implements IEventHandler<OrderPlacedEvent> {
  async handle(event: OrderPlacedEvent): Promise<void> {
    console.log('Order placed:', event.data);
    // Send confirmation email, update inventory, etc.
  }
}

// Alternative: Handler without decorator
class AnotherOrderHandler implements IEventHandler<OrderPlacedEvent> {
  async handle(event: OrderPlacedEvent): Promise<void> {
    console.log('Another order handler:', event.data);
  }
}

// Step 4: Create and configure the event bus
async function setupEventBus() {
  // Create a typed event bus
  const eventBus = createEventBus<AppEventMap>({
    async: true,
    maxListeners: 100,
    onError: (error, event, handler) => {
      console.error(`Error in ${handler.constructor.name}:`, error, {
        eventType: event.type,
        eventId: event.id,
      });
    },
  });

  // Method 1: Register handlers with decorators
  eventBus.registerHandler(new UserCreatedHandler());
  eventBus.registerHandler(new UserUpdatedHandler());
  eventBus.registerHandler(new OrderPlacedHandler());

  // Method 2: Register handler with explicit event type (no decorator needed)
  eventBus.registerHandler('OrderPlaced', new AnotherOrderHandler());

  // Method 3: Use the builder pattern for registration
  eventBus
    .register()
    .handler(new UserCreatedHandler())
    .handler(new UserUpdatedHandler())
    .on('OrderPlaced', new AnotherOrderHandler())
    .build();

  // Method 4: Register multiple handlers at once
  eventBus.registerHandlers(
    new UserCreatedHandler(),
    new UserUpdatedHandler(),
    new OrderPlacedHandler()
  );

  return eventBus;
}

// Step 5: Publishing events with full type safety
export async function publishingExample() {
  const eventBus = await setupEventBus();

  // TypeScript knows the exact shape of each event
  await eventBus.publish({
    type: 'UserCreated',
    id: 'evt_123',
    aggregateId: 'user_456',
    aggregateType: 'User',
    version: 1,
    occurredAt: new Date(),
    data: {
      userId: 'user_456',
      email: 'user@example.com',
      username: 'johndoe',
    },
    metadata: {
      source: 'user-service',
      correlationId: 'req_123',
    },
  });

  // Type error if you try to publish invalid event
  // await eventBus.publish({
  //   type: 'UserCreated',
  //   payload: { invalid: 'data' }, // TypeScript error!
  // });

  // Publish multiple events
  await eventBus.publishAll([
    {
      type: 'UserUpdated',
      id: 'evt_124',
      aggregateId: 'user_456',
      aggregateType: 'User',
      version: 2,
      occurredAt: new Date(),
      data: {
        userId: 'user_456',
        changes: { name: 'John Doe' },
      },
      metadata: {
        source: 'user-service',
        correlationId: 'req_123',
      },
    },
    {
      type: 'OrderPlaced',
      id: 'evt_125',
      aggregateId: 'order_789',
      aggregateType: 'Order',
      version: 1,
      occurredAt: new Date(),
      data: {
        orderId: 'order_789',
        userId: 'user_456',
        items: [{ productId: 'prod_1', quantity: 2 }],
        totalAmount: 99.99,
      },
      metadata: {
        source: 'order-service',
        correlationId: 'req_123',
      },
    },
  ]);
}

// Step 6: Subscribe to events (useful for testing or external integrations)
export async function subscriptionExample() {
  const eventBus = await setupEventBus();

  // Subscribe to specific event type
  const unsubscribe = eventBus.subscribe('UserCreated', async (event) => {
    // TypeScript knows event is UserCreatedEvent
    console.log('User created via subscription:', event.data.email);
  });

  // Subscribe to all events
  const unsubscribeAll = eventBus.subscribeToAll(async (event) => {
    console.log('Event received:', event.type);
  });

  // Wait for a specific event (great for testing)
  const orderEvent = await eventBus.waitFor('OrderPlaced', 5000);
  console.log('Order placed:', orderEvent.data.orderId);

  // Clean up subscriptions
  unsubscribe();
  unsubscribeAll();
}

// Step 7: Integration with event store
export class EventStoreIntegration {
  constructor(
    private eventBus: EventBus<AppEventMap>,
    private eventStore: any // Your event store instance
  ) {}

  async processStoredEvents(events: IDomainEvent[]): Promise<void> {
    // The event bus handles type checking internally
    await this.eventBus.publishAll(events as any);
  }

  async processNewAggregate(aggregateId: string, events: IDomainEvent[]): Promise<void> {
    // Save events to event store
    await this.eventStore.saveEvents(aggregateId, events);

    // Publish to event bus for projections
    await this.eventBus.publishAll(events as any);
  }
}

// Step 8: Testing with typed event bus
// Uncomment and adjust imports based on your test framework
/*
describe('EventBus Tests', () => {
  let eventBus: EventBus<AppEventMap>;

  beforeEach(() => {
    eventBus = createEventBus<AppEventMap>();
  });

  afterEach(() => {
    eventBus.clear();
  });

  it('should handle UserCreated event', async () => {
    const handler = new UserCreatedHandler();
    const handleSpy = jest.spyOn(handler, 'handle');

    eventBus.registerHandler(handler);

    const event: UserCreatedEvent = {
      type: 'UserCreated',
      id: 'test_1',
      aggregateId: 'user_1',
      version: 1,
      occurredAt: new Date(),
      data: {
        userId: 'user_1',
        email: 'test@example.com',
        username: 'testuser',
      },
    };

    await eventBus.publish(event);

    expect(handleSpy).toHaveBeenCalledWith(event);
  });

  it('should wait for specific event', async () => {
    const event: OrderPlacedEvent = {
      type: 'OrderPlaced',
      id: 'test_2',
      aggregateId: 'order_1',
      aggregateType: 'Order',
      version: 1,
      occurredAt: new Date(),
      data: {
        orderId: 'order_1',
        userId: 'user_1',
        items: [{ productId: 'prod_1', quantity: 1 }],
        totalAmount: 49.99,
      },
      metadata: {
        source: 'test',
      },
    };

    // Publish after a delay
    setTimeout(() => eventBus.publish(event), 100);

    const receivedEvent = await eventBus.waitFor('OrderPlaced', 1000);
    expect(receivedEvent).toEqual(event);
  });
});
*/

export { setupEventBus };
export type { AppEventMap };
