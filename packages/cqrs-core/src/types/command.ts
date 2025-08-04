import type { z } from 'zod';

/**
 * Metadata that accompanies every command
 */
export interface ICommandMetadata {
  readonly correlationId: string;
  readonly causationId?: string;
  readonly userId?: string;
  readonly timestamp: Date;
  readonly source: string;
  readonly [key: string]: unknown;
}

/**
 * Base interface for all commands
 */
export interface ICommand<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly payload: TPayload;
  readonly metadata: ICommandMetadata;
}

/**
 * Command with validation schema
 */
export interface IValidatedCommand<
  TType extends string = string,
  TPayload = unknown,
  TSchema extends z.ZodSchema<TPayload> = z.ZodSchema<TPayload>,
> extends ICommand<TType, TPayload> {
  readonly schema: TSchema;
}

/**
 * Type for mapping command types to their corresponding command interfaces
 */
export type TypedCommandMap<T extends Record<string, ICommand>> = T;

/**
 * Extract command types from a command map
 */
export type CommandTypes<TMap extends TypedCommandMap<any>> = keyof TMap & string;

/**
 * Get a specific command type from a command map
 */
export type CommandType<
  TMap extends TypedCommandMap<any>,
  TType extends CommandTypes<TMap>,
> = TMap[TType];

/**
 * Factory function for creating commands
 */
export interface ICommandFactory<TCommand extends ICommand> {
  create(payload: TCommand['payload'], metadata: Partial<ICommandMetadata>): TCommand;
  validate?(command: TCommand): boolean;
}
