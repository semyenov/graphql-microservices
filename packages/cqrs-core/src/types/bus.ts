import type { AsyncResult, DomainError } from '@graphql-microservices/shared-result';
import type { CommandType, CommandTypes, ICommand, TypedCommandMap } from './command.js';
import type {
  EventType,
  EventTypes,
  IEvent,
  IEventFilter,
  IEventSubscriptionOptions,
  TypedEventMap,
} from './event.js';
import type { ICommandHandler, IEventHandler, IHandlerContext, IQueryHandler } from './handler.js';
import type { ICommandMiddleware, IEventMiddleware, IQueryMiddleware } from './middleware.js';
import type { IQuery, IQueryResult, QueryType, QueryTypes, TypedQueryMap } from './query.js';

/**
 * Command bus interface with type-safe command execution
 */
export interface ICommandBus<TCommandMap extends TypedCommandMap<any> = TypedCommandMap<any>> {
  /**
   * Execute a command
   */
  execute<K extends CommandTypes<TCommandMap>, TResult = void>(
    type: K,
    command: CommandType<TCommandMap, K>,
    context?: IHandlerContext
  ): AsyncResult<TResult, DomainError>;

  /**
   * Register a command handler
   */
  register<K extends CommandTypes<TCommandMap>, TResult = void>(
    type: K,
    handler: ICommandHandler<CommandType<TCommandMap, K>, TResult>
  ): void;

  /**
   * Add middleware to the command pipeline
   */
  use(middleware: ICommandMiddleware): void;

  /**
   * Remove middleware from the command pipeline
   */
  remove(middlewareName: string): void;
}

/**
 * Query bus interface with type-safe query execution
 */
export interface IQueryBus<TQueryMap extends TypedQueryMap<any> = TypedQueryMap<any>> {
  /**
   * Execute a query
   */
  execute<K extends QueryTypes<TQueryMap>, TResult = unknown>(
    type: K,
    query: QueryType<TQueryMap, K>,
    context?: IHandlerContext
  ): AsyncResult<IQueryResult<TResult>, DomainError>;

  /**
   * Register a query handler
   */
  register<K extends QueryTypes<TQueryMap>, TResult = unknown>(
    type: K,
    handler: IQueryHandler<QueryType<TQueryMap, K>, TResult>
  ): void;

  /**
   * Add middleware to the query pipeline
   */
  use(middleware: IQueryMiddleware): void;

  /**
   * Remove middleware from the query pipeline
   */
  remove(middlewareName: string): void;
}

/**
 * Event bus interface with pub/sub capabilities
 */
export interface IEventBus<TEventMap extends TypedEventMap<any> = TypedEventMap<any>> {
  /**
   * Publish an event
   */
  publish<K extends EventTypes<TEventMap>>(
    type: K,
    event: EventType<TEventMap, K>,
    context?: IHandlerContext
  ): AsyncResult<void, DomainError>;

  /**
   * Publish multiple events
   */
  publishBatch(
    events: Array<EventType<TEventMap, EventTypes<TEventMap>>>,
    context?: IHandlerContext
  ): AsyncResult<void, DomainError>;

  /**
   * Subscribe to events
   */
  subscribe<K extends EventTypes<TEventMap>>(
    type: K | K[],
    handler: IEventHandler<EventType<TEventMap, K>>,
    options?: IEventSubscriptionOptions
  ): () => void; // Returns unsubscribe function

  /**
   * Subscribe to all events matching a filter
   */
  subscribeToFilter(
    filter: IEventFilter,
    handler: IEventHandler<IEvent>,
    options?: IEventSubscriptionOptions
  ): () => void;

  /**
   * Add middleware to the event pipeline
   */
  use(middleware: IEventMiddleware): void;

  /**
   * Remove middleware from the event pipeline
   */
  remove(middlewareName: string): void;
}

/**
 * Unified CQRS bus combining command, query, and event buses
 */
export interface ICQRSBus<
  TCommandMap extends TypedCommandMap<any> = TypedCommandMap<any>,
  TQueryMap extends TypedQueryMap<any> = TypedQueryMap<any>,
  TEventMap extends TypedEventMap<any> = TypedEventMap<any>,
> {
  readonly commands: ICommandBus<TCommandMap>;
  readonly queries: IQueryBus<TQueryMap>;
  readonly events: IEventBus<TEventMap>;
}

/**
 * Bus configuration options
 */
export interface IBusConfig {
  readonly enableMetrics?: boolean;
  readonly enableTracing?: boolean;
  readonly enableLogging?: boolean;
  readonly defaultTimeout?: number;
  readonly maxRetries?: number;
  readonly middleware?: ICommandMiddleware[] | IQueryMiddleware[] | IEventMiddleware[];
}
