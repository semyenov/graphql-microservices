/**
 * Event bus infrastructure for Orders service
 */

import { createEventBus, type EventBus } from '@graphql-microservices/event-sourcing/cqrs';
import { createLogger } from '@graphql-microservices/logger';
import type { PrismaClient } from '../../generated/prisma';
import { createOrderEventHandlers } from '../application/event-handlers';
import type { OrderEventMap } from '../domain/order-aggregate';

const logger = createLogger({ service: 'orders-event-bus' });

/**
 * Create and configure event bus for order events with all handlers registered
 */
export function createOrderEventBus(prisma: PrismaClient): EventBus<OrderEventMap> {
  const eventBus = createEventBus<OrderEventMap>({
    async: true,
    maxListeners: 100,
    onError: (error, event, handler) => {
      logger.error('Event handler error', error, {
        eventType: event.type,
        eventId: event.id,
        aggregateId: event.aggregateId,
        handler: handler.constructor.name,
      });
    },
  });

  // Create and register all event handlers
  const handlers = createOrderEventHandlers(prisma);

  eventBus
    .register()
    .handler(handlers.orderCreated)
    .handler(handlers.orderCancelled)
    .handler(handlers.orderStatusChanged)
    .handler(handlers.orderShippingUpdated)
    .handler(handlers.orderItemAdded)
    .handler(handlers.orderItemRemoved)
    .handler(handlers.orderPaymentUpdated)
    .handler(handlers.orderRefunded)
    .build();

  logger.info('Order event bus initialized with all handlers');

  return eventBus;
}

/**
 * Process domain events through the event bus
 */
export async function processOrderEvents(
  eventBus: EventBus<OrderEventMap>,
  events: OrderEventMap[keyof OrderEventMap][]
): Promise<void> {
  try {
    await eventBus.publishAll(events);
    logger.info(`Processed ${events.length} order events`);
  } catch (error) {
    logger.error('Failed to process order events', error as Error, {
      eventCount: events.length,
      eventTypes: events.map((e) => e.type),
    });
    throw error;
  }
}
