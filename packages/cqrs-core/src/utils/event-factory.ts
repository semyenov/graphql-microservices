import { generateId } from '@graphql-microservices/shared-errors';
import type { IDomainEvent, IEvent, IEventMetadata } from '../types/event.js';

/**
 * Default event metadata factory
 */
export function createEventMetadata(overrides?: Partial<IEventMetadata>): IEventMetadata {
  return {
    correlationId: generateId(),
    timestamp: new Date(),
    source: 'unknown',
    version: 1,
    ...overrides,
  };
}

/**
 * Event factory for creating events
 */
export class EventFactory {
  /**
   * Create an event with metadata
   */
  static create<TType extends string, TData>(
    type: TType,
    data: TData,
    metadata?: Partial<IEventMetadata>
  ): IEvent<TType, TData> {
    return {
      type,
      data,
      metadata: createEventMetadata(metadata),
    };
  }

  /**
   * Create a domain event
   */
  static createDomainEvent<TType extends string, TData>(
    type: TType,
    data: TData,
    aggregateId: string,
    aggregateType: string,
    streamPosition: number,
    metadata?: Partial<IEventMetadata>
  ): IDomainEvent<TType, TData> {
    return {
      type,
      data,
      aggregateId,
      aggregateType,
      streamPosition,
      metadata: createEventMetadata(metadata),
    };
  }

  /**
   * Create an event from a command
   */
  static createFromCommand<TType extends string, TData>(
    type: TType,
    data: TData,
    command: { metadata: { correlationId: string; userId?: string; source?: string } },
    additionalMetadata?: Partial<IEventMetadata>
  ): IEvent<TType, TData> {
    return {
      type,
      data,
      metadata: createEventMetadata({
        correlationId: command.metadata.correlationId,
        causationId: command.metadata.correlationId,
        userId: command.metadata.userId,
        source: command.metadata.source,
        ...additionalMetadata,
      }),
    };
  }
}

/**
 * Type-safe event builder
 */
export class EventBuilder<TType extends string, TData> {
  private type: TType;
  private data?: TData;
  private metadata: Partial<IEventMetadata> = {};
  private aggregateId?: string;
  private aggregateType?: string;
  private streamPosition?: number;

  constructor(type: TType) {
    this.type = type;
  }

  withData(data: TData): this {
    this.data = data;
    return this;
  }

  withMetadata(metadata: Partial<IEventMetadata>): this {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.metadata.correlationId = correlationId;
    return this;
  }

  withCausationId(causationId: string): this {
    this.metadata.causationId = causationId;
    return this;
  }

  withUserId(userId: string): this {
    this.metadata.userId = userId;
    return this;
  }

  withSource(source: string): this {
    this.metadata.source = source;
    return this;
  }

  withAggregate(aggregateId: string, aggregateType: string, streamPosition: number): this {
    this.aggregateId = aggregateId;
    this.aggregateType = aggregateType;
    this.streamPosition = streamPosition;
    return this;
  }

  build(): IEvent<TType, TData> {
    if (this.data === undefined) {
      throw new Error('Event data is required');
    }

    if (this.aggregateId && this.aggregateType && this.streamPosition !== undefined) {
      return EventFactory.createDomainEvent(
        this.type,
        this.data,
        this.aggregateId,
        this.aggregateType,
        this.streamPosition,
        this.metadata
      );
    }

    return EventFactory.create(this.type, this.data, this.metadata);
  }

  buildDomainEvent(): IDomainEvent<TType, TData> {
    if (this.data === undefined) {
      throw new Error('Event data is required');
    }

    if (!this.aggregateId || !this.aggregateType || this.streamPosition === undefined) {
      throw new Error('Aggregate information is required for domain events');
    }

    return EventFactory.createDomainEvent(
      this.type,
      this.data,
      this.aggregateId,
      this.aggregateType,
      this.streamPosition,
      this.metadata
    );
  }
}

/**
 * Create an event builder
 */
export function eventBuilder<TType extends string, TData>(type: TType): EventBuilder<TType, TData> {
  return new EventBuilder<TType, TData>(type);
}
