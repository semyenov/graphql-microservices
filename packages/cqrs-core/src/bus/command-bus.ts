import { createLogger } from '@graphql-microservices/logger';
import type { AsyncResult, DomainError } from '@graphql-microservices/shared-result';
import { domainError, Result, validationError } from '@graphql-microservices/shared-result';
import type { z } from 'zod';
import type { IBusConfig, ICommandBus } from '../types/bus.js';
import type {
  CommandType,
  CommandTypes,
  ICommand,
  ICommandMetadata,
  TypedCommandMap,
} from '../types/command.js';
import type { ICommandHandler, IHandlerContext } from '../types/handler.js';
import type { ICommandMiddleware, MiddlewareNext } from '../types/middleware.js';

const logger = createLogger({ service: 'command-bus' });

/**
 * Default command bus configuration
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
 * Command handler registry entry
 */
interface HandlerEntry<TCommand extends ICommand, TResult> {
  handler: ICommandHandler<TCommand, TResult>;
  schema?: z.ZodSchema;
  metadata?: {
    name?: string;
    tags?: string[];
  };
}

/**
 * Command execution context with timing
 */
interface ExecutionContext extends IHandlerContext {
  commandType: string;
  commandId: string;
  startTime: number;
  attempt: number;
}

/**
 * Type-safe command bus implementation
 */
export class CommandBus<TCommandMap extends TypedCommandMap<any>>
  implements ICommandBus<TCommandMap>
{
  private readonly handlers = new Map<CommandTypes<TCommandMap>, HandlerEntry<any, any>>();
  private readonly middleware: ICommandMiddleware[] = [];
  private readonly config: Required<IBusConfig>;

  constructor(config: IBusConfig = {}) {
    this.config = { ...defaultConfig, ...config };
    if (Array.isArray(this.config.middleware)) {
      this.middleware.push(...(this.config.middleware as ICommandMiddleware[]));
    }
  }

  /**
   * Execute a command
   */
  async execute<K extends CommandTypes<TCommandMap>, TResult = void>(
    type: K,
    command: CommandType<TCommandMap, K>,
    context?: IHandlerContext
  ): AsyncResult<TResult, DomainError> {
    const executionContext: ExecutionContext = {
      commandType: type,
      commandId: command.metadata.correlationId,
      correlationId: command.metadata.correlationId,
      userId: command.metadata.userId,
      source: command.metadata.source,
      startTime: Date.now(),
      attempt: 1,
    };

    if (this.config.enableLogging) {
      logger.info('Executing command', {
        type,
        correlationId: command.metadata.correlationId,
        userId: command.metadata.userId,
      });
    }

    // Validate command
    const validationResult = await this.validateCommand(type, command);
    if (Result.isErr(validationResult)) {
      if (this.config.enableLogging) {
        logger.error('Command validation failed', validationResult.error);
      }
      return validationResult;
    }

    // Get handler
    const entry = this.handlers.get(type);
    if (!entry) {
      const error = domainError(
        'HANDLER_NOT_FOUND',
        `No handler registered for command type: ${type}`
      );
      if (this.config.enableLogging) {
        logger.error('Handler not found', error);
      }
      return Result.err(error);
    }

    // Execute with middleware pipeline
    const result = await this.executeWithMiddleware(command, entry.handler, executionContext);

    // Record metrics
    if (this.config.enableMetrics) {
      const duration = Date.now() - executionContext.startTime;
      this.recordMetrics(type, duration, Result.isOk(result));
    }

    if (this.config.enableLogging) {
      if (Result.isOk(result)) {
        logger.info('Command executed successfully', {
          type,
          duration: Date.now() - executionContext.startTime,
        });
      } else {
        logger.error('Command execution failed', result.error);
      }
    }

    return result;
  }

  /**
   * Register a command handler
   */
  register<K extends CommandTypes<TCommandMap>, TResult = void>(
    type: K,
    handler: ICommandHandler<CommandType<TCommandMap, K>, TResult>,
    options?: {
      schema?: z.ZodSchema;
      metadata?: { name?: string; tags?: string[] };
    }
  ): void {
    if (this.handlers.has(type)) {
      throw new Error(`Handler already registered for command type: ${type}`);
    }

    this.handlers.set(type, {
      handler,
      schema: options?.schema,
      metadata: options?.metadata,
    });

    if (this.config.enableLogging) {
      logger.info('Command handler registered', { type });
    }
  }

  /**
   * Add middleware
   */
  use(middleware: ICommandMiddleware): void {
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
   * Check if handler is registered
   */
  hasHandler(type: CommandTypes<TCommandMap>): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get registered command types
   */
  getRegisteredTypes(): CommandTypes<TCommandMap>[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all handlers (useful for testing)
   */
  clearHandlers(): void {
    this.handlers.clear();
  }

  /**
   * Validate command
   */
  private async validateCommand<K extends CommandTypes<TCommandMap>>(
    type: K,
    command: CommandType<TCommandMap, K>
  ): AsyncResult<void, DomainError> {
    // Check command structure
    if (!command || typeof command !== 'object') {
      return Result.err(
        validationError([{ field: 'command', message: 'Command must be an object' }])
      );
    }

    if (command.type !== type) {
      return Result.err(
        validationError([
          {
            field: 'type',
            message: `Command type mismatch. Expected ${type}, got ${command.type}`,
          },
        ])
      );
    }

    if (!command.metadata || typeof command.metadata !== 'object') {
      return Result.err(
        validationError([{ field: 'metadata', message: 'Command metadata is required' }])
      );
    }

    // Validate against schema if provided
    const entry = this.handlers.get(type);
    if (entry?.schema) {
      const parseResult = entry.schema.safeParse(command);
      if (!parseResult.success) {
        const fieldErrors = parseResult.error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        return Result.err(validationError(fieldErrors));
      }
    }

    return Result.ok(undefined);
  }

  /**
   * Execute with middleware pipeline
   */
  private async executeWithMiddleware<TCommand extends ICommand, TResult>(
    command: TCommand,
    handler: ICommandHandler<TCommand, TResult>,
    context: ExecutionContext
  ): AsyncResult<TResult, DomainError> {
    // Build middleware chain
    const chain = this.middleware.reduceRight<MiddlewareNext<TCommand, TResult>>(
      (next, middleware) => async (cmd) => {
        return middleware.execute(cmd, next, context);
      },
      async (cmd) => {
        // Apply timeout if configured
        if (this.config.defaultTimeout > 0) {
          return this.executeWithTimeout(
            () => handler.execute(cmd, context),
            this.config.defaultTimeout
          );
        }
        return handler.execute(cmd, context);
      }
    );

    // Execute chain with retry logic
    let lastError: DomainError | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0 && this.config.enableLogging) {
        logger.info('Retrying command execution', {
          type: command.type,
          attempt,
          maxRetries: this.config.maxRetries,
        });
      }

      const result = await chain(command);
      if (Result.isOk(result)) {
        return result;
      }

      lastError = result.error;

      // Don't retry validation errors
      if (lastError.code === 'VALIDATION_ERROR') {
        return result;
      }
    }

    return Result.err(lastError || domainError('UNKNOWN_ERROR', 'Command execution failed'));
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<TResult>(
    fn: () => AsyncResult<TResult, DomainError>,
    timeout: number
  ): AsyncResult<TResult, DomainError> {
    return Promise.race([
      fn(),
      new Promise<Result<TResult, DomainError>>((resolve) =>
        setTimeout(
          () => resolve(Result.err(domainError('TIMEOUT', `Command timed out after ${timeout}ms`))),
          timeout
        )
      ),
    ]);
  }

  /**
   * Record metrics
   */
  private recordMetrics(commandType: string, duration: number, success: boolean): void {
    // This would integrate with your metrics system
    // For now, just log in development
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Command metrics', {
        commandType,
        duration,
        success,
      });
    }
  }
}

/**
 * Create a typed command bus
 */
export function createCommandBus<TCommandMap extends TypedCommandMap<any>>(
  config?: IBusConfig
): CommandBus<TCommandMap> {
  return new CommandBus<TCommandMap>(config);
}
