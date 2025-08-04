import { generateId } from '@graphql-microservices/shared-errors';
import type { ICommand, ICommandMetadata } from '../types/command.js';

/**
 * Default command metadata factory
 */
export function createCommandMetadata(overrides?: Partial<ICommandMetadata>): ICommandMetadata {
  return {
    correlationId: generateId(),
    timestamp: new Date(),
    source: 'unknown',
    ...overrides,
  };
}

/**
 * Command factory for creating commands
 */
export class CommandFactory {
  /**
   * Create a command with metadata
   */
  static create<TType extends string, TPayload>(
    type: TType,
    payload: TPayload,
    metadata?: Partial<ICommandMetadata>
  ): ICommand<TType, TPayload> {
    return {
      type,
      payload,
      metadata: createCommandMetadata(metadata),
    };
  }

  /**
   * Create a command with full metadata
   */
  static createWithMetadata<TType extends string, TPayload>(
    type: TType,
    payload: TPayload,
    metadata: ICommandMetadata
  ): ICommand<TType, TPayload> {
    return {
      type,
      payload,
      metadata,
    };
  }

  /**
   * Create a command from a request context
   */
  static createFromContext<TType extends string, TPayload>(
    type: TType,
    payload: TPayload,
    context: {
      userId?: string;
      correlationId?: string;
      source?: string;
      [key: string]: unknown;
    }
  ): ICommand<TType, TPayload> {
    return {
      type,
      payload,
      metadata: createCommandMetadata({
        userId: context.userId,
        correlationId: context.correlationId,
        source: context.source || 'api',
        ...context,
      }),
    };
  }
}

/**
 * Type-safe command builder
 */
export class CommandBuilder<TType extends string, TPayload> {
  private type: TType;
  private payload?: TPayload;
  private metadata: Partial<ICommandMetadata> = {};

  constructor(type: TType) {
    this.type = type;
  }

  withPayload(payload: TPayload): this {
    this.payload = payload;
    return this;
  }

  withMetadata(metadata: Partial<ICommandMetadata>): this {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }

  withUserId(userId: string): this {
    this.metadata.userId = userId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.metadata.correlationId = correlationId;
    return this;
  }

  withSource(source: string): this {
    this.metadata.source = source;
    return this;
  }

  build(): ICommand<TType, TPayload> {
    if (this.payload === undefined) {
      throw new Error('Payload is required');
    }

    return CommandFactory.create(this.type, this.payload, this.metadata);
  }
}

/**
 * Create a command builder
 */
export function commandBuilder<TType extends string, TPayload>(
  type: TType
): CommandBuilder<TType, TPayload> {
  return new CommandBuilder<TType, TPayload>(type);
}
