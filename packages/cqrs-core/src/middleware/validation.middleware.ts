import type { AsyncResult, DomainError } from '@graphql-microservices/shared-result';
import { Result, validationError } from '@graphql-microservices/shared-result';
import type { z } from 'zod';
import type { ICommand } from '../types/command.js';
import type { IHandlerContext } from '../types/handler.js';
import type { ICommandMiddleware, IQueryMiddleware, MiddlewareNext } from '../types/middleware.js';
import type { IQuery, IQueryResult } from '../types/query.js';

/**
 * Validation middleware configuration
 */
export interface ValidationMiddlewareConfig {
  /**
   * Whether to validate metadata
   */
  validateMetadata?: boolean;

  /**
   * Custom metadata schema
   */
  metadataSchema?: z.ZodSchema;

  /**
   * Whether to strip unknown fields
   */
  stripUnknown?: boolean;

  /**
   * Custom error transformer
   */
  errorTransformer?: (errors: z.ZodError) => DomainError;
}

/**
 * Command validation middleware
 */
export class CommandValidationMiddleware implements ICommandMiddleware {
  constructor(private readonly config: ValidationMiddlewareConfig = {}) {}

  async execute<TCommand extends ICommand, TResult>(
    command: TCommand,
    next: MiddlewareNext<TCommand, TResult>,
    context?: IHandlerContext
  ): AsyncResult<TResult, DomainError> {
    // Validate metadata if enabled
    if (this.config.validateMetadata && this.config.metadataSchema) {
      const metadataResult = this.config.metadataSchema.safeParse(command.metadata);
      if (!metadataResult.success) {
        return Result.err(this.transformError(metadataResult.error));
      }
    }

    // Validate command if it has a schema
    const validatedCommand = command as any;
    if (validatedCommand.schema && typeof validatedCommand.schema.safeParse === 'function') {
      const parseResult = validatedCommand.schema.safeParse(command);
      if (!parseResult.success) {
        return Result.err(this.transformError(parseResult.error));
      }

      // Use validated data if stripUnknown is enabled
      if (this.config.stripUnknown) {
        const strippedCommand = {
          ...command,
          ...parseResult.data,
        } as TCommand;
        return next(strippedCommand);
      }
    }

    return next(command);
  }

  private transformError(error: z.ZodError): DomainError {
    if (this.config.errorTransformer) {
      return this.config.errorTransformer(error);
    }

    const fieldErrors = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    return validationError(fieldErrors);
  }
}

/**
 * Query validation middleware
 */
export class QueryValidationMiddleware implements IQueryMiddleware {
  constructor(private readonly config: ValidationMiddlewareConfig = {}) {}

  async execute<TQuery extends IQuery, TResult>(
    query: TQuery,
    next: MiddlewareNext<TQuery, IQueryResult<TResult>>,
    context?: IHandlerContext
  ): AsyncResult<IQueryResult<TResult>, DomainError> {
    // Validate metadata if enabled
    if (this.config.validateMetadata && this.config.metadataSchema) {
      const metadataResult = this.config.metadataSchema.safeParse(query.metadata);
      if (!metadataResult.success) {
        return Result.err(this.transformError(metadataResult.error));
      }
    }

    // Validate query if it has a schema
    const validatedQuery = query as any;
    if (validatedQuery.schema && typeof validatedQuery.schema.safeParse === 'function') {
      const parseResult = validatedQuery.schema.safeParse(query);
      if (!parseResult.success) {
        return Result.err(this.transformError(parseResult.error));
      }

      // Use validated data if stripUnknown is enabled
      if (this.config.stripUnknown) {
        const strippedQuery = {
          ...query,
          ...parseResult.data,
        } as TQuery;
        return next(strippedQuery);
      }
    }

    return next(query);
  }

  private transformError(error: z.ZodError): DomainError {
    if (this.config.errorTransformer) {
      return this.config.errorTransformer(error);
    }

    const fieldErrors = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    return validationError(fieldErrors);
  }
}

/**
 * Create validation middleware for commands
 */
export function createCommandValidationMiddleware(
  config?: ValidationMiddlewareConfig
): CommandValidationMiddleware {
  return new CommandValidationMiddleware(config);
}

/**
 * Create validation middleware for queries
 */
export function createQueryValidationMiddleware(
  config?: ValidationMiddlewareConfig
): QueryValidationMiddleware {
  return new QueryValidationMiddleware(config);
}
