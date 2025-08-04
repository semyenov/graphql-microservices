import type { AsyncResult, DomainError } from '@graphql-microservices/shared-result';
import type { ICommand } from './command.js';
import type { IEvent } from './event.js';
import type { IHandlerContext } from './handler.js';
import type { IQuery, IQueryResult } from './query.js';

/**
 * Middleware next function
 */
export type MiddlewareNext<TInput, TOutput> = (input: TInput) => AsyncResult<TOutput, DomainError>;

/**
 * Command middleware
 */
export interface ICommandMiddleware {
  execute<TCommand extends ICommand, TResult>(
    command: TCommand,
    next: MiddlewareNext<TCommand, TResult>,
    context?: IHandlerContext
  ): AsyncResult<TResult, DomainError>;
}

/**
 * Query middleware
 */
export interface IQueryMiddleware {
  execute<TQuery extends IQuery, TResult>(
    query: TQuery,
    next: MiddlewareNext<TQuery, IQueryResult<TResult>>,
    context?: IHandlerContext
  ): AsyncResult<IQueryResult<TResult>, DomainError>;
}

/**
 * Event middleware
 */
export interface IEventMiddleware {
  handle<TEvent extends IEvent>(
    event: TEvent,
    next: MiddlewareNext<TEvent, void>,
    context?: IHandlerContext
  ): AsyncResult<void, DomainError>;
}

/**
 * Middleware configuration
 */
export interface IMiddlewareConfig {
  readonly name: string;
  readonly enabled?: boolean;
  readonly order?: number;
  readonly options?: Record<string, unknown>;
}

/**
 * Middleware factory
 */
export interface IMiddlewareFactory<TMiddleware> {
  create(config?: IMiddlewareConfig): TMiddleware;
}

/**
 * Common middleware types
 */
export enum MiddlewareType {
  Validation = 'validation',
  Logging = 'logging',
  Tracing = 'tracing',
  Metrics = 'metrics',
  Caching = 'caching',
  RateLimiting = 'rate-limiting',
  Authorization = 'authorization',
  Retry = 'retry',
  Timeout = 'timeout',
  CircuitBreaker = 'circuit-breaker',
}
