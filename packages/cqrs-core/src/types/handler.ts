import type { AsyncResult, DomainError } from '@graphql-microservices/shared-result';
import type { ICommand } from './command.js';
import type { IEvent } from './event.js';
import type { IQuery, IQueryResult } from './query.js';

/**
 * Context provided to all handlers
 */
export interface IHandlerContext {
  readonly correlationId: string;
  readonly userId?: string;
  readonly source: string;
  readonly [key: string]: unknown;
}

/**
 * Base interface for command handlers
 */
export interface ICommandHandler<TCommand extends ICommand = ICommand, TResult = void> {
  execute(command: TCommand, context?: IHandlerContext): AsyncResult<TResult, DomainError>;
}

/**
 * Base interface for query handlers
 */
export interface IQueryHandler<TQuery extends IQuery = IQuery, TResult = unknown> {
  execute(
    query: TQuery,
    context?: IHandlerContext
  ): AsyncResult<IQueryResult<TResult>, DomainError>;
}

/**
 * Base interface for event handlers
 */
export interface IEventHandler<TEvent extends IEvent = IEvent> {
  handle(event: TEvent, context?: IHandlerContext): AsyncResult<void, DomainError>;

  /**
   * Optional method to determine if this handler should process the event
   */
  canHandle?(event: TEvent): boolean;
}

/**
 * Handler metadata for registration
 */
export interface IHandlerMetadata {
  readonly name: string;
  readonly type: 'command' | 'query' | 'event';
  readonly handles: string | string[];
  readonly priority?: number;
  readonly tags?: string[];
}

/**
 * Handler registration
 */
export interface IHandlerRegistration<THandler = unknown> {
  readonly metadata: IHandlerMetadata;
  readonly handler: THandler;
}

/**
 * Handler resolver for dependency injection
 */
export interface IHandlerResolver {
  resolve<THandler>(type: 'command' | 'query' | 'event', name: string): THandler | undefined;

  resolveAll<THandler>(type: 'command' | 'query' | 'event'): THandler[];
}
