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

/**
 * Logging middleware configuration
 */
export interface LoggingMiddlewareConfig {
  /**
   * Logger name
   */
  name?: string;

  /**
   * Whether to log payloads
   */
  logPayloads?: boolean;

  /**
   * Whether to log results
   */
  logResults?: boolean;

  /**
   * Fields to mask in logs
   */
  maskFields?: string[];

  /**
   * Maximum payload size to log
   */
  maxPayloadSize?: number;
}

/**
 * Mask sensitive fields in data
 */
function maskSensitiveData(
  data: any,
  fieldsToMask: string[] = ['password', 'token', 'secret', 'key']
): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const masked = { ...data };
  for (const key in masked) {
    if (fieldsToMask.some((field) => key.toLowerCase().includes(field))) {
      masked[key] = '***';
    } else if (typeof masked[key] === 'object') {
      masked[key] = maskSensitiveData(masked[key], fieldsToMask);
    }
  }
  return masked;
}

/**
 * Truncate large payloads
 */
function truncatePayload(payload: any, maxSize: number): any {
  const str = JSON.stringify(payload);
  if (str.length <= maxSize) {
    return payload;
  }
  return {
    _truncated: true,
    _originalSize: str.length,
    _preview: str.substring(0, maxSize) + '...',
  };
}

/**
 * Command logging middleware
 */
export class CommandLoggingMiddleware implements ICommandMiddleware {
  private readonly logger;
  private readonly config: Required<LoggingMiddlewareConfig>;

  constructor(config: LoggingMiddlewareConfig = {}) {
    this.logger = createLogger({ service: config.name || 'command-middleware' });
    this.config = {
      name: 'command-middleware',
      logPayloads: true,
      logResults: false,
      maskFields: ['password', 'token', 'secret', 'key'],
      maxPayloadSize: 1000,
      ...config,
    };
  }

  async execute<TCommand extends ICommand, TResult>(
    command: TCommand,
    next: MiddlewareNext<TCommand, TResult>,
    context?: IHandlerContext
  ): AsyncResult<TResult, DomainError> {
    const startTime = Date.now();
    const logData: any = {
      type: command.type,
      correlationId: command.metadata.correlationId,
      userId: command.metadata.userId,
    };

    if (this.config.logPayloads) {
      const maskedPayload = maskSensitiveData(command.payload, this.config.maskFields);
      logData.payload = truncatePayload(maskedPayload, this.config.maxPayloadSize);
    }

    this.logger.info('Executing command', logData);

    const result = await next(command);
    const duration = Date.now() - startTime;

    if (Result.isOk(result)) {
      const successData: any = {
        ...logData,
        duration,
        success: true,
      };

      if (this.config.logResults && result.value !== undefined) {
        const maskedResult = maskSensitiveData(result.value, this.config.maskFields);
        successData.result = truncatePayload(maskedResult, this.config.maxPayloadSize);
      }

      this.logger.info('Command executed successfully', successData);
    } else {
      this.logger.error('Command execution failed', {
        ...logData,
        duration,
        success: false,
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      });
    }

    return result;
  }
}

/**
 * Query logging middleware
 */
export class QueryLoggingMiddleware implements IQueryMiddleware {
  private readonly logger;
  private readonly config: Required<LoggingMiddlewareConfig>;

  constructor(config: LoggingMiddlewareConfig = {}) {
    this.logger = createLogger({ service: config.name || 'query-middleware' });
    this.config = {
      name: 'query-middleware',
      logPayloads: true,
      logResults: false,
      maskFields: ['password', 'token', 'secret', 'key'],
      maxPayloadSize: 1000,
      ...config,
    };
  }

  async execute<TQuery extends IQuery, TResult>(
    query: TQuery,
    next: MiddlewareNext<TQuery, IQueryResult<TResult>>,
    context?: IHandlerContext
  ): AsyncResult<IQueryResult<TResult>, DomainError> {
    const startTime = Date.now();
    const logData: any = {
      type: query.type,
      correlationId: query.metadata.correlationId,
      userId: query.metadata.userId,
      cacheable: query.metadata.cacheable,
    };

    if (this.config.logPayloads) {
      const maskedPayload = maskSensitiveData(query.payload, this.config.maskFields);
      logData.payload = truncatePayload(maskedPayload, this.config.maxPayloadSize);
    }

    this.logger.info('Executing query', logData);

    const result = await next(query);
    const duration = Date.now() - startTime;

    if (Result.isOk(result)) {
      const successData: any = {
        ...logData,
        duration,
        success: true,
        fromCache: result.value.metadata?.fromCache,
      };

      if (this.config.logResults && result.value.data !== undefined) {
        const maskedResult = maskSensitiveData(result.value.data, this.config.maskFields);
        successData.result = truncatePayload(maskedResult, this.config.maxPayloadSize);
      }

      this.logger.info('Query executed successfully', successData);
    } else {
      this.logger.error('Query execution failed', {
        ...logData,
        duration,
        success: false,
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      });
    }

    return result;
  }
}

/**
 * Event logging middleware
 */
export class EventLoggingMiddleware implements IEventMiddleware {
  private readonly logger;
  private readonly config: Required<LoggingMiddlewareConfig>;

  constructor(config: LoggingMiddlewareConfig = {}) {
    this.logger = createLogger({ service: config.name || 'event-middleware' });
    this.config = {
      name: 'event-middleware',
      logPayloads: true,
      logResults: false,
      maskFields: ['password', 'token', 'secret', 'key'],
      maxPayloadSize: 1000,
      ...config,
    };
  }

  async handle<TEvent extends IEvent>(
    event: TEvent,
    next: MiddlewareNext<TEvent, void>,
    context?: IHandlerContext
  ): AsyncResult<void, DomainError> {
    const startTime = Date.now();
    const logData: any = {
      type: event.type,
      correlationId: event.metadata.correlationId,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
    };

    if (this.config.logPayloads) {
      const maskedData = maskSensitiveData(event.data, this.config.maskFields);
      logData.data = truncatePayload(maskedData, this.config.maxPayloadSize);
    }

    this.logger.info('Handling event', logData);

    const result = await next(event);
    const duration = Date.now() - startTime;

    if (Result.isOk(result)) {
      this.logger.info('Event handled successfully', {
        ...logData,
        duration,
        success: true,
      });
    } else {
      this.logger.error('Event handling failed', {
        ...logData,
        duration,
        success: false,
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      });
    }

    return result;
  }
}

/**
 * Create logging middleware for commands
 */
export function createCommandLoggingMiddleware(
  config?: LoggingMiddlewareConfig
): CommandLoggingMiddleware {
  return new CommandLoggingMiddleware(config);
}

/**
 * Create logging middleware for queries
 */
export function createQueryLoggingMiddleware(
  config?: LoggingMiddlewareConfig
): QueryLoggingMiddleware {
  return new QueryLoggingMiddleware(config);
}

/**
 * Create logging middleware for events
 */
export function createEventLoggingMiddleware(
  config?: LoggingMiddlewareConfig
): EventLoggingMiddleware {
  return new EventLoggingMiddleware(config);
}
