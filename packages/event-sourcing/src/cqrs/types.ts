/**
 * CQRS Types and Interfaces
 */

/**
 * Base command interface
 */
export interface ICommand<T = unknown> {
  readonly type: string;
  readonly payload: T;
  readonly metadata?: CommandMetadata;
}

/**
 * Command metadata for tracing and auditing
 */
export interface CommandMetadata {
  readonly userId?: string;
  readonly correlationId?: string;
  readonly timestamp?: Date;
  readonly source?: string;
}

/**
 * Base query interface
 */
export interface IQuery<TParams = unknown> {
  readonly type: string;
  readonly parameters: TParams;
  readonly metadata?: QueryMetadata;
}

/**
 * Query metadata
 */
export interface QueryMetadata {
  readonly userId?: string;
  readonly correlationId?: string;
  readonly timestamp?: Date;
}

/**
 * Command handler interface
 */
export interface ICommandHandler<TCommand extends ICommand = ICommand> {
  execute(command: TCommand): Promise<any>;
}

/**
 * Query handler interface
 */
export interface IQueryHandler<TQuery extends IQuery = IQuery, TResult = unknown> {
  execute(query: TQuery): Promise<TResult>;
}

/**
 * Command result interface
 */
export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  aggregateId?: string;
}

/**
 * Handler not found error
 */
export class HandlerNotFoundError extends Error {
  constructor(public readonly handlerType: string) {
    super(`Handler not found for type: ${handlerType}`);
    this.name = 'HandlerNotFoundError';
  }
}

/**
 * Command validation error
 */
export class CommandValidationError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'CommandValidationError';
  }
}

/**
 * Query validation error
 */
export class QueryValidationError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'QueryValidationError';
  }
}

/**
 * Type guard for commands
 */
export function isCommand(obj: object): obj is ICommand {
  return obj && 'type' in obj && 'payload' in obj && typeof obj.type === 'string' && obj.payload !== undefined;
}

/**
 * Type guard for queries
 */
export function isQuery(obj: object): obj is IQuery {
  return obj && 'type' in obj && 'parameters' in obj && typeof obj.type === 'string' && obj.parameters !== undefined;
}