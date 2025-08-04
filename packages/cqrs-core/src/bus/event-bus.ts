import { createLogger } from '@graphql-microservices/logger';
import type { AsyncResult, DomainError } from '@graphql-microservices/shared-result';
import { domainError, Result } from '@graphql-microservices/shared-result';
import type { IBusConfig, IEventBus } from '../types/bus.js';
import type {
  EventType,
  EventTypes,
  IEvent,
  IEventFilter,
  IEventSubscriptionOptions,
  TypedEventMap,
} from '../types/event.js';
import type { IEventHandler, IHandlerContext } from '../types/handler.js';
import type { IEventMiddleware, MiddlewareNext } from '../types/middleware.js';

const logger = createLogger({ service: 'event-bus' });

/**
 * Event subscription entry
 */
interface SubscriptionEntry {
  id: string;
  eventTypes: Set<string>;
  handler: IEventHandler<any>;
  filter?: IEventFilter;
  options?: IEventSubscriptionOptions;
}

/**
 * Default event bus configuration
 */
const defaultConfig: Required<IBusConfig> = {
  enableMetrics: true,
  enableTracing: true,
  enableLogging: true,
  defaultTimeout: 30000,
  maxRetries: 0,
  middleware: [],
};

/**
 * Execution context for event handling
 */
interface ExecutionContext extends IHandlerContext {
  eventType: string;
  eventId: string;
  startTime: number;
  attempt: number;
}

/**
 * Type-safe event bus implementation
 */
export class EventBus<TEventMap extends TypedEventMap<any>> implements IEventBus<TEventMap> {
  private readonly subscriptions = new Map<string, SubscriptionEntry>();
  private readonly typeSubscriptions = new Map<string, Set<string>>();
  private readonly middleware: IEventMiddleware[] = [];
  private readonly config: Required<IBusConfig>;
  private subscriptionCounter = 0;

  constructor(config: IBusConfig = {}) {
    this.config = { ...defaultConfig, ...config };
    if (Array.isArray(this.config.middleware)) {
      this.middleware.push(...(this.config.middleware as IEventMiddleware[]));
    }
  }

  /**
   * Publish an event
   */
  async publish<K extends EventTypes<TEventMap>>(
    type: K,
    event: EventType<TEventMap, K>,
    context?: IHandlerContext
  ): AsyncResult<void, DomainError> {
    const executionContext: ExecutionContext = {
      eventType: type,
      eventId: event.metadata.correlationId,
      correlationId: event.metadata.correlationId,
      userId: event.metadata.userId,
      source: event.metadata.source,
      startTime: Date.now(),
      attempt: 1,
    };

    if (this.config.enableLogging) {
      logger.info('Publishing event', {
        type,
        correlationId: event.metadata.correlationId,
        aggregateId: event.aggregateId,
      });
    }

    // Validate event
    const validationResult = this.validateEvent(type, event);
    if (Result.isErr(validationResult)) {
      if (this.config.enableLogging) {
        logger.error('Event validation failed', validationResult.error);
      }
      return validationResult;
    }

    // Get relevant subscriptions
    const subscriptions = this.getSubscriptionsForEvent(type, event);

    if (subscriptions.length === 0) {
      if (this.config.enableLogging) {
        logger.debug('No subscriptions for event', { type });
      }
      return Result.ok(undefined);
    }

    // Handle event with all matching subscriptions
    const errors: DomainError[] = [];
    for (const subscription of subscriptions) {
      const result = await this.handleEventWithSubscription(event, subscription, executionContext);

      if (Result.isErr(result)) {
        errors.push(result.error);
        if (this.config.enableLogging) {
          logger.error('Event handler failed', {
            type,
            subscriptionId: subscription.id,
            error: result.error,
          });
        }
      }
    }

    // Record metrics
    if (this.config.enableMetrics) {
      const duration = Date.now() - executionContext.startTime;
      this.recordMetrics(type, duration, errors.length === 0, subscriptions.length);
    }

    if (errors.length > 0) {
      return Result.err(
        domainError('EVENT_HANDLING_FAILED', `${errors.length} handler(s) failed`, { errors })
      );
    }

    return Result.ok(undefined);
  }

  /**
   * Publish multiple events
   */
  async publishBatch(
    events: Array<EventType<TEventMap, EventTypes<TEventMap>>>,
    context?: IHandlerContext
  ): AsyncResult<void, DomainError> {
    const errors: Array<{ event: IEvent; error: DomainError }> = [];

    for (const event of events) {
      const result = await this.publish(event.type as EventTypes<TEventMap>, event, context);
      if (Result.isErr(result)) {
        errors.push({ event, error: result.error });
      }
    }

    if (errors.length > 0) {
      return Result.err(
        domainError(
          'BATCH_PUBLISH_FAILED',
          `Failed to publish ${errors.length} of ${events.length} events`,
          { errors }
        )
      );
    }

    return Result.ok(undefined);
  }

  /**
   * Subscribe to events
   */
  subscribe<K extends EventTypes<TEventMap>>(
    type: K | K[],
    handler: IEventHandler<EventType<TEventMap, K>>,
    options?: IEventSubscriptionOptions
  ): () => void {
    const id = `sub-${++this.subscriptionCounter}`;
    const eventTypes = Array.isArray(type) ? type : [type];

    const subscription: SubscriptionEntry = {
      id,
      eventTypes: new Set(eventTypes),
      handler,
      options,
    };

    // Register subscription
    this.subscriptions.set(id, subscription);

    // Update type mappings
    for (const eventType of eventTypes) {
      if (!this.typeSubscriptions.has(eventType)) {
        this.typeSubscriptions.set(eventType, new Set());
      }
      this.typeSubscriptions.get(eventType)!.add(id);
    }

    if (this.config.enableLogging) {
      logger.info('Event subscription registered', {
        subscriptionId: id,
        eventTypes,
      });
    }

    // Return unsubscribe function
    return () => this.unsubscribe(id);
  }

  /**
   * Subscribe to all events matching a filter
   */
  subscribeToFilter(
    filter: IEventFilter,
    handler: IEventHandler<IEvent>,
    options?: IEventSubscriptionOptions
  ): () => void {
    const id = `sub-${++this.subscriptionCounter}`;

    const subscription: SubscriptionEntry = {
      id,
      eventTypes: new Set(filter.eventTypes || []),
      handler,
      filter,
      options,
    };

    // Register subscription
    this.subscriptions.set(id, subscription);

    // If specific event types are provided, update mappings
    if (filter.eventTypes) {
      for (const eventType of filter.eventTypes) {
        if (!this.typeSubscriptions.has(eventType)) {
          this.typeSubscriptions.set(eventType, new Set());
        }
        this.typeSubscriptions.get(eventType)!.add(id);
      }
    }

    if (this.config.enableLogging) {
      logger.info('Filter subscription registered', {
        subscriptionId: id,
        filter,
      });
    }

    // Return unsubscribe function
    return () => this.unsubscribe(id);
  }

  /**
   * Add middleware
   */
  use(middleware: IEventMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Remove middleware by name
   */
  remove(middlewareName: string): void {
    const index = this.middleware.findIndex((m: any) => m.name === middlewareName);
    if (index !== -1) {
      this.middleware.splice(index, 1);
    }
  }

  /**
   * Get subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get subscriptions for event type
   */
  getSubscriptionsForType(eventType: string): number {
    return this.typeSubscriptions.get(eventType)?.size || 0;
  }

  /**
   * Clear all subscriptions
   */
  clearSubscriptions(): void {
    this.subscriptions.clear();
    this.typeSubscriptions.clear();
    this.subscriptionCounter = 0;
  }

  /**
   * Unsubscribe
   */
  private unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    // Remove from subscriptions
    this.subscriptions.delete(subscriptionId);

    // Remove from type mappings
    for (const eventType of subscription.eventTypes) {
      const typeSubscriptions = this.typeSubscriptions.get(eventType);
      if (typeSubscriptions) {
        typeSubscriptions.delete(subscriptionId);
        if (typeSubscriptions.size === 0) {
          this.typeSubscriptions.delete(eventType);
        }
      }
    }

    if (this.config.enableLogging) {
      logger.info('Event subscription removed', { subscriptionId });
    }
  }

  /**
   * Validate event
   */
  private validateEvent<K extends EventTypes<TEventMap>>(
    type: K,
    event: EventType<TEventMap, K>
  ): Result<void, DomainError> {
    if (!event || typeof event !== 'object') {
      return Result.err(domainError('INVALID_EVENT', 'Event must be an object'));
    }

    if (event.type !== type) {
      return Result.err(
        domainError(
          'EVENT_TYPE_MISMATCH',
          `Event type mismatch. Expected ${type}, got ${event.type}`
        )
      );
    }

    if (!event.metadata || typeof event.metadata !== 'object') {
      return Result.err(domainError('INVALID_EVENT_METADATA', 'Event metadata is required'));
    }

    return Result.ok(undefined);
  }

  /**
   * Get subscriptions for event
   */
  private getSubscriptionsForEvent<K extends EventTypes<TEventMap>>(
    type: K,
    event: EventType<TEventMap, K>
  ): SubscriptionEntry[] {
    const subscriptions: SubscriptionEntry[] = [];

    // Get type-specific subscriptions
    const typeSubscriptionIds = this.typeSubscriptions.get(type);
    if (typeSubscriptionIds) {
      for (const id of typeSubscriptionIds) {
        const subscription = this.subscriptions.get(id);
        if (subscription && this.matchesFilter(event, subscription.filter)) {
          subscriptions.push(subscription);
        }
      }
    }

    // Get filter-only subscriptions (no specific types)
    for (const [id, subscription] of this.subscriptions) {
      if (subscription.eventTypes.size === 0 && subscription.filter) {
        if (this.matchesFilter(event, subscription.filter)) {
          subscriptions.push(subscription);
        }
      }
    }

    return subscriptions;
  }

  /**
   * Check if event matches filter
   */
  private matchesFilter(event: IEvent, filter?: IEventFilter): boolean {
    if (!filter) return true;

    // Check event types
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      if (!filter.eventTypes.includes(event.type)) {
        return false;
      }
    }

    // Check aggregate types
    if (filter.aggregateTypes && filter.aggregateTypes.length > 0) {
      if (!event.aggregateType || !filter.aggregateTypes.includes(event.aggregateType)) {
        return false;
      }
    }

    // Check aggregate IDs
    if (filter.aggregateIds && filter.aggregateIds.length > 0) {
      if (!event.aggregateId || !filter.aggregateIds.includes(event.aggregateId)) {
        return false;
      }
    }

    // Check metadata
    if (filter.metadata) {
      for (const [key, value] of Object.entries(filter.metadata)) {
        if (event.metadata[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Handle event with subscription
   */
  private async handleEventWithSubscription(
    event: IEvent,
    subscription: SubscriptionEntry,
    context: ExecutionContext
  ): AsyncResult<void, DomainError> {
    // Check if handler can handle this event
    if (subscription.handler.canHandle && !subscription.handler.canHandle(event)) {
      return Result.ok(undefined);
    }

    // Execute with middleware pipeline
    return this.executeWithMiddleware(event, subscription.handler, context);
  }

  /**
   * Execute with middleware pipeline
   */
  private async executeWithMiddleware(
    event: IEvent,
    handler: IEventHandler<IEvent>,
    context: ExecutionContext
  ): AsyncResult<void, DomainError> {
    // Build middleware chain
    const chain = this.middleware.reduceRight<MiddlewareNext<IEvent, void>>(
      (next, middleware) => async (evt) => {
        return middleware.handle(evt, next, context);
      },
      async (evt) => {
        // Apply timeout if configured
        if (this.config.defaultTimeout > 0) {
          return this.executeWithTimeout(
            () => handler.handle(evt, context),
            this.config.defaultTimeout
          );
        }
        return handler.handle(evt, context);
      }
    );

    // Execute chain with retry logic
    let lastError: DomainError | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0 && this.config.enableLogging) {
        logger.info('Retrying event handler', {
          type: event.type,
          attempt,
          maxRetries: this.config.maxRetries,
        });
      }

      const result = await chain(event);
      if (Result.isOk(result)) {
        return result;
      }

      lastError = result.error;
    }

    return Result.err(lastError || domainError('UNKNOWN_ERROR', 'Event handling failed'));
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout(
    fn: () => AsyncResult<void, DomainError>,
    timeout: number
  ): AsyncResult<void, DomainError> {
    return Promise.race([
      fn(),
      new Promise<Result<void, DomainError>>((resolve) =>
        setTimeout(
          () =>
            resolve(
              Result.err(domainError('TIMEOUT', `Event handling timed out after ${timeout}ms`))
            ),
          timeout
        )
      ),
    ]);
  }

  /**
   * Record metrics
   */
  private recordMetrics(
    eventType: string,
    duration: number,
    success: boolean,
    handlerCount: number
  ): void {
    // This would integrate with your metrics system
    // For now, just log in development
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Event metrics', {
        eventType,
        duration,
        success,
        handlerCount,
      });
    }
  }
}

/**
 * Create a typed event bus
 */
export function createEventBus<TEventMap extends TypedEventMap<any>>(
  config?: IBusConfig
): EventBus<TEventMap> {
  return new EventBus<TEventMap>(config);
}
