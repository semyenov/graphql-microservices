/**
 * Event bus infrastructure for Users service
 */

import { createEventBus, type EventBus } from '@graphql-microservices/event-sourcing/cqrs';
import { createLogger } from '@graphql-microservices/logger';
import type { CacheService } from '@graphql-microservices/shared-cache';
import type { PubSubService } from '@graphql-microservices/shared-pubsub';
import type { PrismaClient } from '../../generated/prisma';
import { createUserEventHandlers } from '../application/event-handlers';
import type { UserEventMap } from '../domain/user-aggregate';

const logger = createLogger({ service: 'users-event-bus' });

/**
 * Create and configure event bus for user events with all handlers registered
 */
export function createUserEventBus(
  prisma: PrismaClient,
  cacheService?: CacheService,
  pubSubService?: PubSubService
): EventBus<UserEventMap> {
  const eventBus = createEventBus<UserEventMap>({
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
  const handlers = createUserEventHandlers(prisma, cacheService, pubSubService);

  eventBus
    .register()
    .handler(handlers.userCreated)
    .handler(handlers.userProfileUpdated)
    .handler(handlers.userCredentialsUpdated)
    .handler(handlers.userRoleChanged)
    .handler(handlers.userPasswordChanged)
    .handler(handlers.userDeactivated)
    .handler(handlers.userReactivated)
    .handler(handlers.userSignedIn)
    .handler(handlers.userSignedOut)
    .build();

  logger.info('User event bus initialized with all handlers');

  return eventBus;
}

/**
 * Process domain events through the event bus
 */
export async function processUserEvents(
  eventBus: EventBus<UserEventMap>,
  events: UserEventMap[keyof UserEventMap][]
): Promise<void> {
  try {
    await eventBus.publishAll(events);
    logger.info(`Processed ${events.length} user events`);
  } catch (error) {
    logger.error('Failed to process user events', error as Error, {
      eventCount: events.length,
      eventTypes: events.map((e) => e.type),
    });
    throw error;
  }
}
