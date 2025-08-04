/**
 * Event Bus for handling domain events with full type safety
 */

import { EventEmitter } from 'node:events';
import type { Class } from 'type-fest';
import type { IDomainEvent } from '../types';
import { getEventHandlerMetadata, isEventHandler } from './decorators';
import type { IEventHandler } from './types';

export interface EventBusOptions {
  /** Whether to use async event handlers */
  async?: boolean;
  /** Maximum number of listeners per event */
  maxListeners?: number;
  /** Error handler for failed event processing */
  onError?: (error: Error, event: IDomainEvent, handler: IEventHandler<unknown>) => void;
}

/**
 * Type-safe event map for event bus
 */
export type TypedEventMap<T extends Record<string, IDomainEvent>> = T;

/**
 * Extract event types from event map
 */
export type EventTypes<TEventMap> = TEventMap extends TypedEventMap<infer T> ? keyof T : never;

/**
 * Extract event from event map by type
 */
export type EventFromType<TEventMap, TType> = TEventMap extends TypedEventMap<infer T>
  ? TType extends keyof T
    ? T[TType]
    : never
  : never;

/**
 * Handler registration builder for type-safe event handler registration
 */
export class HandlerRegistrationBuilder<
  TEventMap extends TypedEventMap<Record<string, IDomainEvent>>,
> {
  private registrations: Array<() => void> = [];

  constructor(private eventBus: EventBus<TEventMap>) {}

  /**
   * Register a handler for a specific event type
   */
  on<TType extends EventTypes<TEventMap>>(
    eventType: TType,
    handler: IEventHandler<EventFromType<TEventMap, TType>>
  ): this {
    this.registrations.push(() => {
      this.eventBus.registerHandler(eventType, handler);
    });
    return this;
  }

  /**
   * Register a handler class decorated with @EventHandler
   */
  handler<TEvent extends TEventMap[keyof TEventMap]>(handler: IEventHandler<TEvent>): this {
    this.registrations.push(() => {
      this.eventBus.registerHandler(handler);
    });
    return this;
  }

  /**
   * Apply all registrations
   */
  build(): void {
    this.registrations.forEach((register) => register());
  }
}

/**
 * Type-safe event bus for publishing and subscribing to domain events
 */
export class EventBus<
  TEventMap extends TypedEventMap<Record<string, IDomainEvent>> = TypedEventMap<
    Record<string, IDomainEvent>
  >,
> {
  private readonly emitter: EventEmitter;
  private readonly handlers = new Map<string, Set<IEventHandler<unknown>>>();
  private readonly options: Required<EventBusOptions>;

  constructor(options: EventBusOptions = {}) {
    this.options = {
      async: true,
      maxListeners: 100,
      onError: (error, event, handler) => {
        console.error(`Error handling event ${event.type}:`, error, {
          eventId: event.id,
          aggregateId: event.aggregateId,
          handler: handler.constructor.name,
        });
      },
      ...options,
    };
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(this.options.maxListeners);
  }

  /**
   * Create a handler registration builder for type-safe registration
   */
  register(): HandlerRegistrationBuilder<TEventMap> {
    return new HandlerRegistrationBuilder(this);
  }

  /**
   * Register an event handler with explicit event type
   */
  registerHandler<TType extends EventTypes<TEventMap>>(
    eventType: TType,
    handler: IEventHandler<EventFromType<TEventMap, TType>>
  ): void;

  /**
   * Register an event handler decorated with @EventHandler
   */
  registerHandler<TEvent extends TEventMap[keyof TEventMap]>(handler: IEventHandler<TEvent>): void;

  /**
   * Internal implementation
   */
  registerHandler(
    eventTypeOrHandler: string | IEventHandler<unknown>,
    handler?: IEventHandler<unknown>
  ): void {
    let eventType: string;
    let eventHandler: IEventHandler<unknown>;

    if (typeof eventTypeOrHandler === 'string') {
      eventType = eventTypeOrHandler;
      eventHandler = handler!;
    } else {
      eventHandler = eventTypeOrHandler;
      const handlerConstructor = eventHandler.constructor as Class<IEventHandler<any>>;
      const decoratorEventType = getEventHandlerMetadata(handlerConstructor);

      if (!decoratorEventType) {
        throw new Error(
          `Handler ${handlerConstructor.name} is not decorated with @EventHandler. ` +
            `Use @EventHandler('EventType') decorator or register with explicit event type.`
        );
      }

      eventType = decoratorEventType;
    }

    // Initialize handler set if needed
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());

      // Register event listener
      this.emitter.on(eventType, async (event: IDomainEvent) => {
        await this.handleEvent(eventType, event);
      });
    }

    // Add handler to set
    this.handlers.get(eventType)!.add(eventHandler);
  }

  /**
   * Register multiple handlers
   */
  registerHandlers(...handlers: IEventHandler<unknown>[]): void {
    handlers.forEach((handler) => {
      if (isEventHandler(handler.constructor)) {
        this.registerHandler(handler);
      }
    });
  }

  /**
   * Unregister a handler
   */
  unregisterHandler<TType extends EventTypes<TEventMap>>(
    eventType: TType,
    handler: IEventHandler<EventFromType<TEventMap, TType>>
  ): void {
    const handlers = this.handlers.get(eventType as string);
    if (handlers) {
      handlers.delete(handler);

      // Clean up if no handlers left
      if (handlers.size === 0) {
        this.handlers.delete(eventType as string);
        this.emitter.removeAllListeners(eventType as string);
      }
    }
  }

  /**
   * Publish a single event with type safety
   */
  async publish<TType extends EventTypes<TEventMap>>(
    event: EventFromType<TEventMap, TType>
  ): Promise<void> {
    const eventType = event.type;

    if (this.handlers.has(eventType)) {
      this.emitter.emit(eventType, event);
    }
  }

  /**
   * Publish multiple events
   */
  async publishAll(events: Array<TEventMap[keyof TEventMap]>): Promise<void> {
    if (this.options.async) {
      await Promise.all(
        events.map((event) =>
          this.publish(event as unknown as EventFromType<TEventMap, EventTypes<TEventMap>>)
        )
      );
    } else {
      for (const event of events) {
        await this.publish(event as unknown as EventFromType<TEventMap, EventTypes<TEventMap>>);
      }
    }
  }

  /**
   * Subscribe to events with a callback (lower-level API)
   */
  subscribe<TType extends EventTypes<TEventMap>>(
    eventType: TType,
    callback: (event: EventFromType<TEventMap, TType>) => void | Promise<void>
  ): () => void {
    const wrappedCallback = async (event: EventFromType<TEventMap, TType>) => {
      try {
        await callback(event);
      } catch (error) {
        this.options.onError(error instanceof Error ? error : new Error(String(error)), event, {
          handle: callback,
        } as any);
      }
    };

    this.emitter.on(eventType as string, wrappedCallback);

    // Return unsubscribe function
    return () => {
      this.emitter.off(eventType as string, wrappedCallback);
    };
  }

  /**
   * Subscribe to all events
   */
  subscribeToAll(
    callback: (event: TEventMap[keyof TEventMap]) => void | Promise<void>
  ): () => void {
    const eventTypes = this.getRegisteredEventTypes();
    const unsubscribers = eventTypes.map((eventType) =>
      this.subscribe(eventType as any, callback as any)
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  /**
   * Wait for a specific event (useful for testing)
   */
  waitFor<TType extends EventTypes<TEventMap>>(
    eventType: TType,
    timeout?: number
  ): Promise<EventFromType<TEventMap, TType>> {
    return new Promise((resolve, reject) => {
      const timer = timeout
        ? setTimeout(() => {
            this.emitter.off(eventType as string, handler);
            reject(new Error(`Timeout waiting for event ${String(eventType)}`));
          }, timeout)
        : undefined;

      const handler = (event: EventFromType<TEventMap, TType>) => {
        if (timer) clearTimeout(timer);
        resolve(event);
      };

      this.emitter.once(eventType as string, handler);
    });
  }

  /**
   * Get registered event types
   */
  getRegisteredEventTypes(): Array<EventTypes<TEventMap>> {
    return Array.from(this.handlers.keys()) as Array<EventTypes<TEventMap>>;
  }

  /**
   * Get handlers for a specific event type
   */
  getHandlers<TType extends EventTypes<TEventMap>>(
    eventType: TType
  ): ReadonlySet<IEventHandler<EventFromType<TEventMap, TType>>> {
    return this.handlers.get(eventType as string) || new Set();
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
    this.emitter.removeAllListeners();
  }

  /**
   * Handle event execution
   */
  private async handleEvent(eventType: string, event: IDomainEvent): Promise<void> {
    const handlers = this.handlers.get(eventType);
    if (!handlers || handlers.size === 0) return;

    const handlersArray = Array.from(handlers);

    if (this.options.async) {
      await Promise.all(handlersArray.map((handler) => this.executeHandler(handler, event)));
    } else {
      for (const handler of handlersArray) {
        await this.executeHandler(handler, event);
      }
    }
  }

  /**
   * Execute a single handler with error handling
   */
  private async executeHandler(
    handler: IEventHandler<unknown>,
    event: IDomainEvent
  ): Promise<void> {
    try {
      await handler.handle(event);
    } catch (error) {
      this.options.onError(
        error instanceof Error ? error : new Error(String(error)),
        event,
        handler
      );
    }
  }
}

/**
 * Create a typed event bus with predefined event map
 */
export function createEventBus<TEventMap extends TypedEventMap<Record<string, IDomainEvent>>>(
  options?: EventBusOptions
): EventBus<TEventMap> {
  return new EventBus<TEventMap>(options);
}

/**
 * Type helper for defining event maps
 */
export type DefineEventMap<T extends Record<string, IDomainEvent>> = T;
