import { createLogger } from '@graphql-microservices/logger';
import type { AsyncResult, DomainError } from '@graphql-microservices/shared-result';
import { Result } from '@graphql-microservices/shared-result';
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

const logger = createLogger({ service: 'retry-middleware' });

/**
 * Retry strategy
 */
export type RetryStrategy = 'exponential' | 'linear' | 'fixed';

/**
 * Retry middleware configuration
 */
export interface RetryMiddlewareConfig {
  /**
   * Maximum number of retries
   */
  maxRetries?: number;

  /**
   * Initial delay in milliseconds
   */
  initialDelay?: number;

  /**
   * Maximum delay in milliseconds
   */
  maxDelay?: number;

  /**
   * Retry strategy
   */
  strategy?: RetryStrategy;

  /**
   * Multiplier for exponential backoff
   */
  multiplier?: number;

  /**
   * Error codes to retry
   */
  retryableErrors?: string[];

  /**
   * Whether to log retry attempts
   */
  logRetries?: boolean;
}

/**
 * Calculate delay based on strategy
 */
function calculateDelay(attempt: number, config: Required<RetryMiddlewareConfig>): number {
  let delay: number;

  switch (config.strategy) {
    case 'exponential':
      delay = Math.min(config.initialDelay * config.multiplier ** (attempt - 1), config.maxDelay);
      break;
    case 'linear':
      delay = Math.min(config.initialDelay * attempt, config.maxDelay);
      break;
    case 'fixed':
    default:
      delay = config.initialDelay;
  }

  // Add jitter (±10%)
  const jitter = delay * 0.1;
  return delay + (Math.random() * 2 - 1) * jitter;
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: DomainError, retryableErrors: string[]): boolean {
  if (retryableErrors.length === 0) {
    // Default retryable errors
    return ['TIMEOUT', 'SERVICE_UNAVAILABLE', 'NETWORK_ERROR'].includes(error.code);
  }
  return retryableErrors.includes(error.code);
}

/**
 * Command retry middleware
 */
export class CommandRetryMiddleware implements ICommandMiddleware {
  private readonly config: Required<RetryMiddlewareConfig>;

  constructor(config: RetryMiddlewareConfig = {}) {
    this.config = {
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 5000,
      strategy: 'exponential',
      multiplier: 2,
      retryableErrors: [],
      logRetries: true,
      ...config,
    };
  }

  async execute<TCommand extends ICommand, TResult>(
    command: TCommand,
    next: MiddlewareNext<TCommand, TResult>,
    context?: IHandlerContext
  ): AsyncResult<TResult, DomainError> {
    let lastError: DomainError | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      if (attempt > 1) {
        const delay = calculateDelay(attempt - 1, this.config);

        if (this.config.logRetries) {
          logger.info('Retrying command', {
            type: command.type,
            attempt,
            maxRetries: this.config.maxRetries,
            delay,
            lastError: lastError?.code,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const result = await next(command);

      if (Result.isOk(result)) {
        if (attempt > 1 && this.config.logRetries) {
          logger.info('Command succeeded after retry', {
            type: command.type,
            attempt,
          });
        }
        return result;
      }

      lastError = result.error;

      // Check if error is retryable
      if (!isRetryableError(lastError, this.config.retryableErrors)) {
        return result;
      }

      // Don't retry if this is the last attempt
      if (attempt === this.config.maxRetries + 1) {
        return result;
      }
    }

    // This should never be reached, but TypeScript needs it
    return Result.err(lastError!);
  }
}

/**
 * Query retry middleware
 */
export class QueryRetryMiddleware implements IQueryMiddleware {
  private readonly config: Required<RetryMiddlewareConfig>;

  constructor(config: RetryMiddlewareConfig = {}) {
    this.config = {
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 5000,
      strategy: 'exponential',
      multiplier: 2,
      retryableErrors: [],
      logRetries: true,
      ...config,
    };
  }

  async execute<TQuery extends IQuery, TResult>(
    query: TQuery,
    next: MiddlewareNext<TQuery, IQueryResult<TResult>>,
    context?: IHandlerContext
  ): AsyncResult<IQueryResult<TResult>, DomainError> {
    let lastError: DomainError | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      if (attempt > 1) {
        const delay = calculateDelay(attempt - 1, this.config);

        if (this.config.logRetries) {
          logger.info('Retrying query', {
            type: query.type,
            attempt,
            maxRetries: this.config.maxRetries,
            delay,
            lastError: lastError?.code,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const result = await next(query);

      if (Result.isOk(result)) {
        if (attempt > 1 && this.config.logRetries) {
          logger.info('Query succeeded after retry', {
            type: query.type,
            attempt,
          });
        }
        return result;
      }

      lastError = result.error;

      // Check if error is retryable
      if (!isRetryableError(lastError, this.config.retryableErrors)) {
        return result;
      }

      // Don't retry if this is the last attempt
      if (attempt === this.config.maxRetries + 1) {
        return result;
      }
    }

    // This should never be reached, but TypeScript needs it
    return Result.err(lastError!);
  }
}

/**
 * Event retry middleware
 */
export class EventRetryMiddleware implements IEventMiddleware {
  private readonly config: Required<RetryMiddlewareConfig>;

  constructor(config: RetryMiddlewareConfig = {}) {
    this.config = {
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 5000,
      strategy: 'exponential',
      multiplier: 2,
      retryableErrors: [],
      logRetries: true,
      ...config,
    };
  }

  async handle<TEvent extends IEvent>(
    event: TEvent,
    next: MiddlewareNext<TEvent, void>,
    context?: IHandlerContext
  ): AsyncResult<void, DomainError> {
    let lastError: DomainError | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      if (attempt > 1) {
        const delay = calculateDelay(attempt - 1, this.config);

        if (this.config.logRetries) {
          logger.info('Retrying event handler', {
            type: event.type,
            attempt,
            maxRetries: this.config.maxRetries,
            delay,
            lastError: lastError?.code,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const result = await next(event);

      if (Result.isOk(result)) {
        if (attempt > 1 && this.config.logRetries) {
          logger.info('Event handler succeeded after retry', {
            type: event.type,
            attempt,
          });
        }
        return result;
      }

      lastError = result.error;

      // Check if error is retryable
      if (!isRetryableError(lastError, this.config.retryableErrors)) {
        return result;
      }

      // Don't retry if this is the last attempt
      if (attempt === this.config.maxRetries + 1) {
        return result;
      }
    }

    // This should never be reached, but TypeScript needs it
    return Result.err(lastError!);
  }
}
