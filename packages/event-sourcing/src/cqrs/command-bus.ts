import {
  type AsyncResult,
  type DomainError,
  domainError,
  Result,
  validationError,
} from '@graphql-microservices/shared-result';
import { z } from 'zod';
import {
  CommandFactory,
  type CommandMetadata,
  type ICommand,
  type ICommandHandler,
} from '../types';
import { addSpanAttributes, createSpan } from './tracing-utils';

/**
 * Type-safe command map for compile-time safety
 */
export type TypedCommandMap<T extends Record<string, ICommand<unknown>>> = T;

/**
 * Helper to define command maps
 */
export type DefineCommandMap<T extends Record<string, ICommand<unknown>>> = {
  [K in keyof T]: T[K] extends ICommand<unknown> ? T[K] : never;
};

/**
 * Extract command types from command map
 */
export type CommandMapTypes<T extends TypedCommandMap<Record<string, ICommand<unknown>>>> = keyof T;

/**
 * Extract command union from command map
 */
export type CommandMapUnion<T extends TypedCommandMap<Record<string, ICommand<unknown>>>> =
  T[keyof T];

/**
 * Command middleware interface
 */
export interface CommandMiddleware<
  TCommandMap extends TypedCommandMap<Record<string, ICommand<unknown>>> = TypedCommandMap<
    Record<string, ICommand<unknown>>
  >,
> {
  /**
   * Called before command execution
   */
  preExecute?: <K extends keyof TCommandMap>(
    command: TCommandMap[K],
    commandType: K
  ) => AsyncResult<void, DomainError>;

  /**
   * Called after successful command execution
   */
  postExecute?: <K extends keyof TCommandMap>(
    command: TCommandMap[K],
    commandType: K,
    result: unknown
  ) => AsyncResult<void, DomainError>;

  /**
   * Called when command execution fails
   */
  onError?: <K extends keyof TCommandMap>(
    command: TCommandMap[K],
    commandType: K,
    error: DomainError
  ) => AsyncResult<void, DomainError>;
}

/**
 * Command execution context
 */
export interface CommandContext {
  commandId: string;
  commandType: string;
  userId?: string;
  correlationId?: string;
  startTime: number;
}

/**
 * Command bus options
 */
export interface CommandBusOptions {
  /**
   * Enable command validation
   */
  validateCommands?: boolean;

  /**
   * Enable tracing
   */
  enableTracing?: boolean;

  /**
   * Enable metrics
   */
  enableMetrics?: boolean;

  /**
   * Command timeout in milliseconds
   */
  commandTimeout?: number;

  /**
   * Service name for tracing
   */
  serviceName?: string;
}

/**
 * Type-safe command bus for dispatching commands to their handlers
 */
export class CommandBus<
  TCommandMap extends TypedCommandMap<Record<string, ICommand<unknown>>> = TypedCommandMap<
    Record<string, ICommand<unknown>>
  >,
> {
  private readonly handlers = new Map<keyof TCommandMap, ICommandHandler<any>>();
  private readonly middlewares: CommandMiddleware<TCommandMap>[] = [];
  private readonly options: Required<CommandBusOptions>;
  private readonly commandSchemas = new Map<keyof TCommandMap, z.ZodSchema>();

  constructor(options: CommandBusOptions = {}) {
    this.options = {
      validateCommands: true,
      enableTracing: true,
      enableMetrics: true,
      commandTimeout: 30000, // 30 seconds default
      serviceName: 'command-bus',
      ...options,
    };
  }

  /**
   * Register a command handler with type safety
   */
  register<K extends keyof TCommandMap>(
    commandType: K,
    handler: ICommandHandler<TCommandMap[K]>,
    schema?: z.ZodSchema
  ): this {
    if (this.handlers.has(commandType)) {
      throw new Error(`Handler already registered for command type: ${String(commandType)}`);
    }

    this.handlers.set(commandType, handler);

    if (schema) {
      this.commandSchemas.set(commandType, schema);
    }

    return this;
  }

  /**
   * Register a command handler using builder pattern
   */
  withHandler<K extends keyof TCommandMap>(
    commandType: K,
    handler: ICommandHandler<TCommandMap[K]>,
    schema?: z.ZodSchema
  ): this {
    return this.register(commandType, handler, schema);
  }

  /**
   * Add middleware
   */
  use(middleware: CommandMiddleware<TCommandMap>): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Execute a command with Result type
   */
  async execute<K extends keyof TCommandMap, TResult = unknown>(
    commandType: K,
    command: TCommandMap[K]
  ): AsyncResult<TResult, DomainError> {
    const cmd = command as ICommand<unknown>;
    const context: CommandContext = {
      commandId: cmd.metadata?.correlationId || CommandFactory.generateId(),
      commandType: String(commandType),
      userId: cmd.metadata?.userId,
      correlationId: cmd.metadata?.correlationId,
      startTime: Date.now(),
    };

    // Validate command if enabled
    if (this.options.validateCommands) {
      const validationResult = this.validateCommand(commandType, command);
      if (Result.isErr(validationResult)) {
        return validationResult;
      }
    }

    // Get handler
    const handler = this.handlers.get(commandType);
    if (!handler) {
      return Result.err(
        domainError(
          'HANDLER_NOT_FOUND',
          `No handler registered for command type: ${String(commandType)}`
        )
      );
    }

    // Execute with tracing if enabled
    if (this.options.enableTracing) {
      return this.executeWithTracing(commandType, command, handler, context);
    }

    // Execute with middleware
    return this.executeWithMiddleware(commandType, command, handler, context);
  }

  /**
   * Execute multiple commands in sequence
   */
  async executeMany<K extends keyof TCommandMap>(
    commands: Array<{ type: K; command: TCommandMap[K] }>
  ): AsyncResult<unknown[], DomainError> {
    const results: unknown[] = [];

    for (const { type, command } of commands) {
      const result = await this.execute(type, command);
      if (Result.isErr(result)) {
        return result;
      }
      results.push(result.value);
    }

    return Result.ok(results);
  }

  /**
   * Execute multiple commands in parallel
   */
  async executeParallel<K extends keyof TCommandMap>(
    commands: Array<{ type: K; command: TCommandMap[K] }>
  ): AsyncResult<unknown[], DomainError[]> {
    const promises = commands.map(({ type, command }) => this.execute(type, command));
    const results = await Promise.all(promises);

    const errors = results.filter(Result.isErr).map((r) => r.error);
    if (errors.length > 0) {
      return Result.err(errors);
    }

    const values = results.filter(Result.isOk).map((r) => r.value);
    return Result.ok(values);
  }

  /**
   * Check if a handler is registered for a command type
   */
  hasHandler(commandType: keyof TCommandMap): boolean {
    return this.handlers.has(commandType);
  }

  /**
   * Get all registered command types
   */
  getRegisteredTypes(): Array<keyof TCommandMap> {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all handlers (useful for testing)
   */
  clearHandlers(): void {
    this.handlers.clear();
    this.commandSchemas.clear();
  }

  /**
   * Clear all middleware
   */
  clearMiddleware(): void {
    this.middlewares.length = 0;
  }

  /**
   * Validate command structure
   */
  private validateCommand<K extends keyof TCommandMap>(
    commandType: K,
    command: TCommandMap[K]
  ): Result<void, DomainError> {
    // Check basic structure
    if (!command || typeof command !== 'object') {
      return Result.err(
        validationError([{ field: 'command', message: 'Command must be an object' }])
      );
    }

    const cmd = command as ICommand<unknown>;
    if (!('type' in command) || cmd.type !== commandType) {
      return Result.err(
        validationError([
          {
            field: 'type',
            message: `Command type mismatch. Expected ${String(commandType)}, got ${cmd.type}`,
          },
        ])
      );
    }

    // Check schema if available
    const schema = this.commandSchemas.get(commandType);
    if (schema) {
      const parseResult = schema.safeParse(command);
      if (!parseResult.success) {
        const fieldErrors = parseResult.error.issues.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        return Result.err(validationError(fieldErrors));
      }
    }

    return Result.ok(undefined);
  }

  /**
   * Execute command with tracing
   */
  private async executeWithTracing<K extends keyof TCommandMap, TResult>(
    commandType: K,
    command: TCommandMap[K],
    handler: ICommandHandler<TCommandMap[K]>,
    context: CommandContext
  ): AsyncResult<TResult, DomainError> {
    return createSpan(`command.${String(commandType)}`, async (span) => {
      // Add span attributes
      addSpanAttributes({
        'command.type': String(commandType),
        'command.id': context.commandId,
        'command.user_id': context.userId || '',
        'command.correlation_id': context.correlationId || '',
      });

      // Execute with middleware
      const result = await this.executeWithMiddleware<K, TResult>(
        commandType,
        command,
        handler,
        context
      );

      // Add result to span
      if (Result.isOk(result)) {
        span.setStatus({ code: 1 }); // OK
      } else {
        span.setStatus({ code: 2, message: result.error.message }); // ERROR
        span.recordException(new Error(result.error.message));
      }

      return result;
    });
  }

  /**
   * Execute command with middleware
   */
  private async executeWithMiddleware<K extends keyof TCommandMap, TResult>(
    commandType: K,
    command: TCommandMap[K],
    handler: ICommandHandler<TCommandMap[K]>,
    context: CommandContext
  ): AsyncResult<TResult, DomainError> {
    // Pre-execution middleware
    for (const middleware of this.middlewares) {
      if (middleware.preExecute) {
        const result = await middleware.preExecute(command, commandType);
        if (Result.isErr(result)) {
          return result;
        }
      }
    }

    // Execute command with timeout
    const executionResult = await this.executeWithTimeout<TResult>(
      () => handler.execute(command),
      this.options.commandTimeout
    );

    if (Result.isErr(executionResult)) {
      // Error middleware
      for (const middleware of this.middlewares) {
        if (middleware.onError) {
          await middleware.onError(command, commandType, executionResult.error);
        }
      }
      return executionResult;
    }

    // Post-execution middleware
    for (const middleware of this.middlewares) {
      if (middleware.postExecute) {
        const result = await middleware.postExecute(command, commandType, executionResult.value);
        if (Result.isErr(result)) {
          return result;
        }
      }
    }

    // Record metrics if enabled
    if (this.options.enableMetrics) {
      const duration = Date.now() - context.startTime;
      this.recordMetrics(commandType, duration, true);
    }

    return executionResult;
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<TResult>(
    fn: () => Promise<unknown>,
    timeout: number
  ): AsyncResult<TResult, DomainError> {
    return Promise.race([
      Result.tryCatchAsync(
        async () => (await fn()) as TResult,
        (error) => domainError('COMMAND_EXECUTION_ERROR', 'Command execution failed', error)
      ),
      new Promise<Result<TResult, DomainError>>((resolve) =>
        setTimeout(
          () =>
            resolve(
              Result.err(domainError('COMMAND_TIMEOUT', `Command timed out after ${timeout}ms`))
            ),
          timeout
        )
      ),
    ]);
  }

  /**
   * Record command metrics
   */
  private recordMetrics(commandType: keyof TCommandMap, duration: number, success: boolean): void {
    // This would integrate with your metrics system
    // For now, just log
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[CommandBus] ${String(commandType)} - Duration: ${duration}ms, Success: ${success}`
      );
    }
  }
}

/**
 * Create a typed command bus
 */
export function createCommandBus<
  TCommandMap extends TypedCommandMap<Record<string, ICommand<unknown>>>,
>(options?: CommandBusOptions): CommandBus<TCommandMap> {
  return new CommandBus<TCommandMap>(options);
}

/**
 * Create a test command bus with recording capabilities
 */
export function createTestCommandBus<
  TCommandMap extends TypedCommandMap<Record<string, ICommand<unknown>>>,
>(
  options?: CommandBusOptions
): CommandBus<TCommandMap> & {
  getRecordedCommands(): Array<{ type: keyof TCommandMap; command: ICommand }>;
  clearRecordedCommands(): void;
} {
  const recordedCommands: Array<{ type: keyof TCommandMap; command: ICommand }> = [];

  const bus = new CommandBus<TCommandMap>(options);

  // Add recording middleware
  bus.use({
    preExecute: async (command, commandType) => {
      recordedCommands.push({ type: commandType, command: command as ICommand<unknown> });
      return Result.ok(undefined);
    },
  });

  return Object.assign(bus, {
    getRecordedCommands: () => [...recordedCommands],
    clearRecordedCommands: () => {
      recordedCommands.length = 0;
    },
  });
}

/**
 * Command validation schemas
 */
export const commandMetadataSchema = z.object({
  userId: z.string().optional(),
  correlationId: z.string().optional(),
  timestamp: z.date().optional(),
  source: z.string().optional(),
});

export const baseCommandSchema = z.object({
  type: z.string(),
  payload: z.unknown(),
  metadata: commandMetadataSchema.optional(),
});

/**
 * Create a validated command factory
 */
export function createValidatedCommand<T extends z.ZodSchema>(
  type: string,
  payloadSchema: T,
  payload: z.infer<T>,
  metadata?: CommandMetadata
): Result<ICommand<z.infer<T>>, DomainError> {
  const parseResult = payloadSchema.safeParse(payload);

  if (!parseResult.success) {
    const fieldErrors = parseResult.error.issues.map((err: any) => ({
      field: `payload.${err.path.join('.')}`,
      message: err.message,
    }));
    return Result.err(validationError(fieldErrors));
  }

  return Result.ok(CommandFactory.create(type, parseResult.data, metadata));
}
