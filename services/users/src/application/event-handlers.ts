import type { DomainEvent } from '@graphql-microservices/event-sourcing';
import type { CacheService } from '@graphql-microservices/shared-cache';
import type { PubSubService } from '@graphql-microservices/shared-pubsub';
import type { PrismaClient } from '../../generated/prisma';
import type {
  UserCreatedEvent,
  UserCredentialsUpdatedEvent,
  UserDeactivatedEvent,
  UserDomainEvent,
  UserPasswordChangedEvent,
  UserProfileUpdatedEvent,
  UserReactivatedEvent,
  UserRoleChangedEvent,
  UserSignedInEvent,
  UserSignedOutEvent,
} from '../domain/user-aggregate';

import { cacheKey, type Email, type UserId, type Username } from './types';
/**
 * Event handler interface with improved typing
 */
export interface IEventHandler<T extends DomainEvent = DomainEvent> {
  readonly eventType: T['type'];
  handle(event: T): Promise<void>;
  canHandle(event: DomainEvent): event is T;
}

/**
 * Base event handler with common functionality
 */
abstract class BaseEventHandler<T extends DomainEvent> implements IEventHandler<T> {
  abstract readonly eventType: T['type'];

  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly cacheService?: CacheService,
    protected readonly pubSubService?: PubSubService
  ) {}

  abstract handle(event: T): Promise<void>;

  canHandle(event: DomainEvent): event is T {
    return event.type === this.eventType;
  }

  /**
   * Invalidate user cache with type-safe keys
   */
  protected async invalidateUserCache(
    userId: UserId,
    username?: Username,
    email?: Email
  ): Promise<void> {
    if (!this.cacheService) return;

    const cacheKeys = [
      cacheKey.user(userId),
      username && cacheKey.userByUsername(username),
      email && cacheKey.userByEmail(email),
    ].filter(Boolean) as `${string}:${string}`[];

    await Promise.all(cacheKeys.map((key) => this.cacheService?.delete(key)));
  }

  /**
   * Publish GraphQL subscription event
   */
  protected async publishSubscriptionEvent<TType extends string>(
    eventType: TType,
    payload: Record<string, unknown> | Record<string, unknown>[]
  ): Promise<void> {
    if (!this.pubSubService) return;

    try {
      const pubsub = this.pubSubService.getPubSub();
      await pubsub.publish(eventType, payload);
    } catch (error) {
      console.error(`Failed to publish subscription event ${eventType}:`, error);
    }
  }

  /**
   * Log event processing
   */
  protected logEventProcessing(
    event: T,
    status: 'started' | 'completed' | 'failed',
    error?: Error | string
  ): void {
    const logData = {
      eventId: event.id,
      eventType: event.type,
      aggregateId: event.aggregateId,
      version: event.version,
      status,
      timestamp: new Date().toISOString(),
      ...(error && { error: error instanceof Error ? error.message : String(error) }),
    };

    if (status === 'failed') {
      console.error('Event processing failed:', logData);
    } else {
      console.log('Event processing:', logData);
    }
  }
}

/**
 * User Created Event Handler
 * Updates read model and publishes subscription events
 */
export class UserCreatedEventHandler extends BaseEventHandler<UserCreatedEvent> {
  readonly eventType = 'UserCreated' as const;

  async handle(event: UserCreatedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update read model (Prisma database)
      await this.prisma.user.upsert({
        where: { id: event.aggregateId },
        update: {
          username: event.data.username,
          email: event.data.email,
          name: event.data.name,
          phoneNumber: event.data.phoneNumber,
          role: event.data.role,
          isActive: true,
          updatedAt: event.occurredAt,
        },
        create: {
          id: event.aggregateId,
          username: event.data.username,
          email: event.data.email,
          name: event.data.name,
          phoneNumber: event.data.phoneNumber,
          role: event.data.role,
          isActive: true,
          password: '', // Password hash will be set separately for security
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
        },
      });

      // Publish GraphQL subscription
      const userPayload = {
        id: event.aggregateId,
        username: event.data.username,
        email: event.data.email,
        name: event.data.name,
        phoneNumber: event.data.phoneNumber,
        role: event.data.role,
        isActive: true,
        createdAt: event.occurredAt.toISOString(),
        updatedAt: event.occurredAt.toISOString(),
      };

      await this.publishSubscriptionEvent('userCreated', {
        userCreated: userPayload,
      });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(
        event,
        'failed',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}

/**
 * User Profile Updated Event Handler
 */
export class UserProfileUpdatedEventHandler extends BaseEventHandler<UserProfileUpdatedEvent> {
  readonly eventType = 'UserProfileUpdated' as const;

  async handle(event: UserProfileUpdatedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update read model
      const updateData: Record<string, unknown> = {
        updatedAt: event.occurredAt,
      };

      if (event.data.name !== undefined) {
        updateData.name = event.data.name;
      }
      if (event.data.phoneNumber !== undefined) {
        updateData.phoneNumber = event.data.phoneNumber;
      }

      const updatedUser = await this.prisma.user.update({
        where: { id: event.aggregateId },
        data: updateData,
      });

      // Invalidate cache
      await this.invalidateUserCache(
        event.aggregateId as UserId,
        updatedUser.username as Username,
        updatedUser.email as Email
      );

      // Publish GraphQL subscription
      await this.publishSubscriptionEvent('userUpdated', {
        userUpdated: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          name: updatedUser.name,
          phoneNumber: updatedUser.phoneNumber,
          role: updatedUser.role,
          isActive: updatedUser.isActive,
          createdAt: updatedUser.createdAt.toISOString(),
          updatedAt: updatedUser.updatedAt.toISOString(),
        },
      });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(
        event,
        'failed',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}

/**
 * User Credentials Updated Event Handler
 */
export class UserCredentialsUpdatedEventHandler extends BaseEventHandler<UserCredentialsUpdatedEvent> {
  readonly eventType = 'UserCredentialsUpdated' as const;

  async handle(event: UserCredentialsUpdatedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update read model
      const updateData: Record<string, unknown> = {
        updatedAt: event.occurredAt,
      };

      if (event.data.username !== undefined) {
        updateData.username = event.data.username;
      }
      if (event.data.email !== undefined) {
        updateData.email = event.data.email;
      }

      const updatedUser = await this.prisma.user.update({
        where: { id: event.aggregateId },
        data: updateData,
      });

      // Invalidate cache (including old username/email if changed)
      await this.invalidateUserCache(
        event.aggregateId as UserId,
        updatedUser.username as Username,
        updatedUser.email as Email
      );

      // Also invalidate old cache keys
      if (event.data.previousUsername) {
        await this.cacheService?.delete(`user:username:${event.data.previousUsername}`);
      }
      if (event.data.previousEmail) {
        await this.cacheService?.delete(`user:email:${event.data.previousEmail}`);
      }

      // Publish GraphQL subscription
      await this.publishSubscriptionEvent('userUpdated', {
        userUpdated: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          name: updatedUser.name,
          phoneNumber: updatedUser.phoneNumber,
          role: updatedUser.role,
          isActive: updatedUser.isActive,
          createdAt: updatedUser.createdAt.toISOString(),
          updatedAt: updatedUser.updatedAt.toISOString(),
        },
      });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(
        event,
        'failed',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}

/**
 * User Role Changed Event Handler
 */
export class UserRoleChangedEventHandler extends BaseEventHandler<UserRoleChangedEvent> {
  readonly eventType = 'UserRoleChanged' as const;

  async handle(event: UserRoleChangedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update read model
      const updatedUser = await this.prisma.user.update({
        where: { id: event.aggregateId },
        data: {
          role: event.data.newRole,
          updatedAt: event.occurredAt,
        },
      });

      // Invalidate cache
      await this.invalidateUserCache(
        event.aggregateId as UserId,
        updatedUser.username as Username,
        updatedUser.email as Email
      );

      // Publish GraphQL subscription
      await this.publishSubscriptionEvent('userUpdated', {
        userUpdated: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          name: updatedUser.name,
          phoneNumber: updatedUser.phoneNumber,
          role: updatedUser.role,
          isActive: updatedUser.isActive,
          createdAt: updatedUser.createdAt.toISOString(),
          updatedAt: updatedUser.updatedAt.toISOString(),
        },
      });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(
        event,
        'failed',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}

/**
 * User Password Changed Event Handler
 */
export class UserPasswordChangedEventHandler extends BaseEventHandler<UserPasswordChangedEvent> {
  readonly eventType = 'UserPasswordChanged' as const;

  async handle(event: UserPasswordChangedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update read model (just the timestamp, password hash is handled separately)
      const updatedUser = await this.prisma.user.update({
        where: { id: event.aggregateId },
        data: {
          updatedAt: event.occurredAt,
          refreshToken: null, // Invalidate refresh token on password change
        },
      });

      // Invalidate cache
      await this.invalidateUserCache(
        event.aggregateId as UserId,
        updatedUser.username as Username,
        updatedUser.email as Email
      );

      // Note: We don't publish this to GraphQL subscriptions for security reasons
      // Password changes are sensitive operations

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(
        event,
        'failed',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}

/**
 * User Deactivated Event Handler
 */
export class UserDeactivatedEventHandler extends BaseEventHandler<UserDeactivatedEvent> {
  readonly eventType = 'UserDeactivated' as const;

  async handle(event: UserDeactivatedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update read model
      const updatedUser = await this.prisma.user.update({
        where: { id: event.aggregateId },
        data: {
          isActive: false,
          refreshToken: null, // Invalidate refresh token
          updatedAt: event.occurredAt,
        },
      });

      // Invalidate cache
      await this.invalidateUserCache(
        event.aggregateId as UserId,
        updatedUser.username as Username,
        updatedUser.email as Email
      );

      // Publish GraphQL subscription
      await this.publishSubscriptionEvent('userDeactivated', {
        userDeactivated: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          name: updatedUser.name,
          phoneNumber: updatedUser.phoneNumber,
          role: updatedUser.role,
          isActive: updatedUser.isActive,
          createdAt: updatedUser.createdAt.toISOString(),
          updatedAt: updatedUser.updatedAt.toISOString(),
        },
      });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(
        event,
        'failed',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}

/**
 * User Reactivated Event Handler
 */
export class UserReactivatedEventHandler extends BaseEventHandler<UserReactivatedEvent> {
  readonly eventType = 'UserReactivated' as const;

  async handle(event: UserReactivatedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update read model
      const updatedUser = await this.prisma.user.update({
        where: { id: event.aggregateId },
        data: {
          isActive: true,
          updatedAt: event.occurredAt,
        },
      });

      // Invalidate cache
      await this.invalidateUserCache(
        event.aggregateId as UserId,
        updatedUser.username as Username,
        updatedUser.email as Email
      );

      // Publish GraphQL subscription
      await this.publishSubscriptionEvent('userUpdated', {
        userUpdated: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          name: updatedUser.name,
          phoneNumber: updatedUser.phoneNumber,
          role: updatedUser.role,
          isActive: updatedUser.isActive,
          createdAt: updatedUser.createdAt.toISOString(),
          updatedAt: updatedUser.updatedAt.toISOString(),
        },
      });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(
        event,
        'failed',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}

/**
 * User Sign In Event Handler
 * Tracks user activity and updates last sign in timestamp
 */
export class UserSignedInEventHandler extends BaseEventHandler<UserSignedInEvent> {
  readonly eventType = 'UserSignedIn' as const;

  async handle(event: UserSignedInEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update read model with last sign in timestamp
      await this.prisma.user.update({
        where: { id: event.aggregateId },
        data: {
          isActive: true,
          updatedAt: event.occurredAt,
        },
      });

      // Could also store sign-in analytics in a separate table
      // await this.prisma.userActivity.create({
      //   data: {
      //     userId: event.aggregateId,
      //     type: 'SIGN_IN',
      //     ipAddress: event.data.ipAddress,
      //     userAgent: event.data.userAgent,
      //     timestamp: event.occurredAt
      //   }
      // });

      // Invalidate cache
      await this.invalidateUserCache(event.aggregateId as UserId);

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(
        event,
        'failed',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}

/**
 * User Sign Out Event Handler
 */
export class UserSignedOutEventHandler extends BaseEventHandler<UserSignedOutEvent> {
  readonly eventType = 'UserSignedOut' as const;

  async handle(event: UserSignedOutEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update read model
      await this.prisma.user.update({
        where: { id: event.aggregateId },
        data: {
          refreshToken: null, // Clear refresh token
          updatedAt: event.occurredAt,
        },
      });

      // Invalidate cache
      await this.invalidateUserCache(event.aggregateId as UserId);

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(
        event,
        'failed',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}

/**
 * Event Dispatcher - Routes events to appropriate handlers
 */
export class UserEventDispatcher {
  private readonly handlers: IEventHandler<DomainEvent>[] = [];

  constructor(prisma: PrismaClient, cacheService?: CacheService, pubSubService?: PubSubService) {
    // Register all event handlers
    this.handlers = [
      new UserCreatedEventHandler(prisma, cacheService, pubSubService),
      new UserProfileUpdatedEventHandler(prisma, cacheService, pubSubService),
      new UserCredentialsUpdatedEventHandler(prisma, cacheService, pubSubService),
      new UserRoleChangedEventHandler(prisma, cacheService, pubSubService),
      new UserPasswordChangedEventHandler(prisma, cacheService, pubSubService),
      new UserDeactivatedEventHandler(prisma, cacheService, pubSubService),
      new UserReactivatedEventHandler(prisma, cacheService, pubSubService),
      new UserSignedInEventHandler(prisma, cacheService, pubSubService),
      new UserSignedOutEventHandler(prisma, cacheService, pubSubService),
    ];
  }

  /**
   * Dispatch an event to appropriate handlers
   */
  async dispatch<T extends DomainEvent>(event: T): Promise<void> {
    const applicableHandlers = this.handlers
      .filter((handler) => handler.canHandle(event)) as IEventHandler<T>[];

    if (applicableHandlers.length === 0) {
      console.warn(`No handlers found for event type: ${event.type}`);
      return;
    }

    // Process all handlers in parallel
    const promises = applicableHandlers.map((handler) => handler.handle(event));

    try {
      await Promise.all(promises);
    } catch (error) {
      console.error(`Failed to process event ${event.id} (${event.type}):`, error);
      throw error;
    }
  }

  /**
   * Dispatch multiple events
   */
  async dispatchBatch<T extends DomainEvent>(events: T[]): Promise<void> {
    const promises = events.map((event) => this.dispatch(event));
    await Promise.all(promises);
  }

  /**
   * Register a custom event handler
   */
  registerHandler(handler: IEventHandler<DomainEvent>): void {
    this.handlers.push(handler);
  }

  /**
   * Get registered handlers
   */
  getHandlers(): IEventHandler<DomainEvent>[] {
    return [...this.handlers];
  }
}
