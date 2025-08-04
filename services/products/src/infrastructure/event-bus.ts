/**
 * Event bus infrastructure for Products service
 */

import { createEventBus, type EventBus } from '@graphql-microservices/event-sourcing/cqrs';
import { createLogger } from '@graphql-microservices/logger';
import type { CacheService } from '@graphql-microservices/shared-cache';
import type { PubSubService } from '@graphql-microservices/shared-pubsub';
import type { PrismaClient } from '../../generated/prisma';
import { createProductEventHandlers } from '../application/event-handlers';
import type { ProductEventMap } from '../domain/product-aggregate';

const logger = createLogger({ service: 'products-event-bus' });

/**
 * Create and configure event bus for product events with all handlers registered
 */
export function createProductEventBus(
  prisma: PrismaClient,
  cacheService?: CacheService,
  pubSubService?: PubSubService
): EventBus<ProductEventMap> {
  const eventBus = createEventBus<ProductEventMap>({
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
  const handlers = createProductEventHandlers(prisma, cacheService, pubSubService);

  eventBus
    .register()
    .handler(handlers.productCreated)
    .handler(handlers.productUpdated)
    .handler(handlers.productPriceChanged)
    .handler(handlers.productStockChanged)
    .handler(handlers.productCategoryChanged)
    .handler(handlers.productDeactivated)
    .handler(handlers.productReactivated)
    .handler(handlers.productStockReserved)
    .handler(handlers.productStockReservationReleased)
    .build();

  logger.info('Product event bus initialized with all handlers');

  return eventBus;
}

/**
 * Process domain events through the event bus
 */
export async function processProductEvents(
  eventBus: EventBus<ProductEventMap>,
  events: ProductEventMap[keyof ProductEventMap][]
): Promise<void> {
  try {
    await eventBus.publishAll(events);
    logger.info(`Processed ${events.length} product events`);
  } catch (error) {
    logger.error('Failed to process product events', error as Error, {
      eventCount: events.length,
      eventTypes: events.map((e) => e.type),
    });
    throw error;
  }
}
