import type { AsyncResult, DomainError } from '@graphql-microservices/shared-result';
import type { ICommand } from '../types/command.js';
import type { IEvent } from '../types/event.js';
import type { IHandlerContext } from '../types/handler.js';
import type {
  ICommandMiddleware,
  IEventMiddleware,
  IQueryMiddleware,
  MiddlewareNext,
} from '../types/middleware.js';
import type { IQuery, IQueryResult } from '../types/query.js';

/**
 * Tracing middleware configuration
 */
export interface TracingMiddlewareConfig {
  /**
   * Service name for traces
   */
  serviceName?: string;

  /**
   * Whether to include payloads in traces
   */
  includePayloads?: boolean;

  /**
   * Custom span attributes
   */
  customAttributes?: Record<string, string | number | boolean>;
}

/**
 * Command tracing middleware
 */
export class CommandTracingMiddleware implements ICommandMiddleware {
  constructor(private readonly config: TracingMiddlewareConfig = {}) {}

  async execute<TCommand extends ICommand, TResult>(
    command: TCommand,
    next: MiddlewareNext<TCommand, TResult>,
    context?: IHandlerContext
  ): AsyncResult<TResult, DomainError> {
    // TODO: Implement OpenTelemetry tracing
    // For now, just pass through
    return next(command);
  }
}

/**
 * Query tracing middleware
 */
export class QueryTracingMiddleware implements IQueryMiddleware {
  constructor(private readonly config: TracingMiddlewareConfig = {}) {}

  async execute<TQuery extends IQuery, TResult>(
    query: TQuery,
    next: MiddlewareNext<TQuery, IQueryResult<TResult>>,
    context?: IHandlerContext
  ): AsyncResult<IQueryResult<TResult>, DomainError> {
    // TODO: Implement OpenTelemetry tracing
    // For now, just pass through
    return next(query);
  }
}

/**
 * Event tracing middleware
 */
export class EventTracingMiddleware implements IEventMiddleware {
  constructor(private readonly config: TracingMiddlewareConfig = {}) {}

  async handle<TEvent extends IEvent>(
    event: TEvent,
    next: MiddlewareNext<TEvent, void>,
    context?: IHandlerContext
  ): AsyncResult<void, DomainError> {
    // TODO: Implement OpenTelemetry tracing
    // For now, just pass through
    return next(event);
  }
}
