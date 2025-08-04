import type { IBusConfig, ICQRSBus } from '../types/bus.js';
import type { TypedCommandMap, TypedEventMap, TypedQueryMap } from '../types/index.js';
import { type CommandBus, createCommandBus } from './command-bus.js';
import { createEventBus, type EventBus } from './event-bus.js';
import {
  createQueryBus,
  type IQueryCache,
  type QueryBus,
  type QueryBusConfig,
} from './query-bus.js';

/**
 * CQRS bus configuration
 */
export interface CQRSBusConfig extends IBusConfig {
  /**
   * Command bus specific configuration
   */
  commandBus?: IBusConfig;

  /**
   * Query bus specific configuration
   */
  queryBus?: QueryBusConfig;

  /**
   * Event bus specific configuration
   */
  eventBus?: IBusConfig;

  /**
   * Shared query cache
   */
  queryCache?: IQueryCache;
}

/**
 * Unified CQRS bus implementation
 */
export class CQRSBus<
  TCommandMap extends TypedCommandMap<any> = TypedCommandMap<any>,
  TQueryMap extends TypedQueryMap<any> = TypedQueryMap<any>,
  TEventMap extends TypedEventMap<any> = TypedEventMap<any>,
> implements ICQRSBus<TCommandMap, TQueryMap, TEventMap>
{
  public readonly commands: CommandBus<TCommandMap>;
  public readonly queries: QueryBus<TQueryMap>;
  public readonly events: EventBus<TEventMap>;

  constructor(config: CQRSBusConfig = {}) {
    // Create command bus
    this.commands = createCommandBus<TCommandMap>({
      ...config,
      ...config.commandBus,
    });

    // Create query bus with shared cache if provided
    this.queries = createQueryBus<TQueryMap>({
      ...config,
      ...config.queryBus,
      cache: config.queryCache || config.queryBus?.cache,
    });

    // Create event bus
    this.events = createEventBus<TEventMap>({
      ...config,
      ...config.eventBus,
    });
  }

  /**
   * Apply shared middleware to all buses
   */
  useSharedMiddleware(options: { commands?: any; queries?: any; events?: any }): void {
    if (options.commands) {
      this.commands.use(options.commands);
    }
    if (options.queries) {
      this.queries.use(options.queries);
    }
    if (options.events) {
      this.events.use(options.events);
    }
  }

  /**
   * Clear all handlers and subscriptions (useful for testing)
   */
  clearAll(): void {
    this.commands.clearHandlers();
    this.queries.clearHandlers();
    this.events.clearSubscriptions();
  }

  /**
   * Get statistics
   */
  getStats(): {
    commands: { registeredTypes: string[] };
    queries: { registeredTypes: string[] };
    events: { subscriptionCount: number };
  } {
    return {
      commands: {
        registeredTypes: this.commands.getRegisteredTypes(),
      },
      queries: {
        registeredTypes: this.queries.getRegisteredTypes(),
      },
      events: {
        subscriptionCount: this.events.getSubscriptionCount(),
      },
    };
  }
}

/**
 * Create a unified CQRS bus
 */
export function createCQRSBus<
  TCommandMap extends TypedCommandMap<any> = TypedCommandMap<any>,
  TQueryMap extends TypedQueryMap<any> = TypedQueryMap<any>,
  TEventMap extends TypedEventMap<any> = TypedEventMap<any>,
>(config?: CQRSBusConfig): CQRSBus<TCommandMap, TQueryMap, TEventMap> {
  return new CQRSBus<TCommandMap, TQueryMap, TEventMap>(config);
}

/**
 * Create a test CQRS bus with recording capabilities
 */
export function createTestCQRSBus<
  TCommandMap extends TypedCommandMap<any> = TypedCommandMap<any>,
  TQueryMap extends TypedQueryMap<any> = TypedQueryMap<any>,
  TEventMap extends TypedEventMap<any> = TypedEventMap<any>,
>(
  config?: CQRSBusConfig
): CQRSBus<TCommandMap, TQueryMap, TEventMap> & {
  getRecordedCommands(): Array<{ type: string; command: any }>;
  getRecordedQueries(): Array<{ type: string; query: any }>;
  getRecordedEvents(): Array<{ type: string; event: any }>;
  clearRecorded(): void;
} {
  const recordedCommands: Array<{ type: string; command: any }> = [];
  const recordedQueries: Array<{ type: string; query: any }> = [];
  const recordedEvents: Array<{ type: string; event: any }> = [];

  const bus = new CQRSBus<TCommandMap, TQueryMap, TEventMap>(config);

  // Add recording middleware
  bus.commands.use({
    execute: async (command, next) => {
      recordedCommands.push({ type: command.type, command });
      return next(command);
    },
  });

  bus.queries.use({
    execute: async (query, next) => {
      recordedQueries.push({ type: query.type, query });
      return next(query);
    },
  });

  bus.events.use({
    handle: async (event, next) => {
      recordedEvents.push({ type: event.type, event });
      return next(event);
    },
  });

  return Object.assign(bus, {
    getRecordedCommands: () => [...recordedCommands],
    getRecordedQueries: () => [...recordedQueries],
    getRecordedEvents: () => [...recordedEvents],
    clearRecorded: () => {
      recordedCommands.length = 0;
      recordedQueries.length = 0;
      recordedEvents.length = 0;
    },
  });
}
