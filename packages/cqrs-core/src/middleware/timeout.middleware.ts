import type { AsyncResult, DomainError } from '@graphql-microservices/shared-result';
import { domainError, Result } from '@graphql-microservices/shared-result';
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
 * Timeout middleware configuration
 */
export interface TimeoutMiddlewareConfig {
  /**
   * Default timeout in milliseconds
   */
  defaultTimeout?: number;

  /**
   * Timeout overrides by type
   */
  timeouts?: Record<string, number>;

  /**
   * Whether to include timeout details in error
   */
  includeDetails?: boolean;
}

/**
 * Execute with timeout helper
 */
async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeout: number,
  errorMessage: string
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(domainError('TIMEOUT', errorMessage)), timeout)
    ),
  ]);
}

/**
 * Command timeout middleware
 */
export class CommandTimeoutMiddleware implements ICommandMiddleware {
  private readonly defaultTimeout: number;
  private readonly timeouts: Record<string, number>;
  private readonly includeDetails: boolean;

  constructor(config: TimeoutMiddlewareConfig = {}) {
    this.defaultTimeout = config.defaultTimeout || 30000;
    this.timeouts = config.timeouts || {};
    this.includeDetails = config.includeDetails ?? true;
  }

  async execute<TCommand extends ICommand, TResult>(
    command: TCommand,
    next: MiddlewareNext<TCommand, TResult>,
    context?: IHandlerContext
  ): AsyncResult<TResult, DomainError> {
    const timeout = this.timeouts[command.type] || this.defaultTimeout;
    const errorMessage = this.includeDetails
      ? `Command '${command.type}' timed out after ${timeout}ms`
      : 'Command timed out';

    try {
      const result = await executeWithTimeout(() => next(command), timeout, errorMessage);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('TIMEOUT')) {
        return Result.err(error as DomainError);
      }
      return Result.err(domainError('UNKNOWN_ERROR', 'Timeout middleware error', error));
    }
  }
}

/**
 * Query timeout middleware
 */
export class QueryTimeoutMiddleware implements IQueryMiddleware {
  private readonly defaultTimeout: number;
  private readonly timeouts: Record<string, number>;
  private readonly includeDetails: boolean;

  constructor(config: TimeoutMiddlewareConfig = {}) {
    this.defaultTimeout = config.defaultTimeout || 30000;
    this.timeouts = config.timeouts || {};
    this.includeDetails = config.includeDetails ?? true;
  }

  async execute<TQuery extends IQuery, TResult>(
    query: TQuery,
    next: MiddlewareNext<TQuery, IQueryResult<TResult>>,
    context?: IHandlerContext
  ): AsyncResult<IQueryResult<TResult>, DomainError> {
    const timeout = this.timeouts[query.type] || this.defaultTimeout;
    const errorMessage = this.includeDetails
      ? `Query '${query.type}' timed out after ${timeout}ms`
      : 'Query timed out';

    try {
      const result = await executeWithTimeout(() => next(query), timeout, errorMessage);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('TIMEOUT')) {
        return Result.err(error as DomainError);
      }
      return Result.err(domainError('UNKNOWN_ERROR', 'Timeout middleware error', error));
    }
  }
}

/**
 * Event timeout middleware
 */
export class EventTimeoutMiddleware implements IEventMiddleware {
  private readonly defaultTimeout: number;
  private readonly timeouts: Record<string, number>;
  private readonly includeDetails: boolean;

  constructor(config: TimeoutMiddlewareConfig = {}) {
    this.defaultTimeout = config.defaultTimeout || 30000;
    this.timeouts = config.timeouts || {};
    this.includeDetails = config.includeDetails ?? true;
  }

  async handle<TEvent extends IEvent>(
    event: TEvent,
    next: MiddlewareNext<TEvent, void>,
    context?: IHandlerContext
  ): AsyncResult<void, DomainError> {
    const timeout = this.timeouts[event.type] || this.defaultTimeout;
    const errorMessage = this.includeDetails
      ? `Event '${event.type}' handling timed out after ${timeout}ms`
      : 'Event handling timed out';

    try {
      const result = await executeWithTimeout(() => next(event), timeout, errorMessage);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('TIMEOUT')) {
        return Result.err(error as DomainError);
      }
      return Result.err(domainError('UNKNOWN_ERROR', 'Timeout middleware error', error));
    }
  }
}
