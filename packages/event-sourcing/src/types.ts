import { generateId } from '@graphql-microservices/shared-errors';
import { z } from 'zod';

/**
 * Base domain event interface
 */
export interface IDomainEvent {
  /** Unique event identifier */
  readonly id: string;

  /** Type of the event (e.g., 'UserCreated', 'OrderShipped') */
  readonly type: string;

  /** Aggregate ID this event belongs to */
  readonly aggregateId: string;

  /** Aggregate type (e.g., 'User', 'Order', 'Product') */
  readonly aggregateType: string;

  /** Event payload/data */
  readonly data: Record<string, unknown>;

  /** Event metadata */
  readonly metadata: IEventMetadata;

  /** Timestamp when the event occurred */
  readonly occurredAt: Date;

  /** Version of the aggregate when this event was created */
  readonly version: number;
}

/**
 * Event metadata for tracing and auditing
 */
export interface IEventMetadata {
  /** User ID who triggered the event */
  readonly userId?: string;

  /** Correlation ID for request tracing */
  readonly correlationId?: string;

  /** Causation ID (ID of the command that caused this event) */
  readonly causationId?: string;

  /** Service that generated the event */
  readonly source: string;

  /** Additional context information */
  readonly context?: Record<string, unknown>;
}

/**
 * Event stream position
 */
export interface IStreamPosition {
  /** Global position in the event store */
  readonly globalPosition: bigint;

  /** Position within the aggregate stream */
  readonly streamPosition: number;
}

/**
 * Stored event with position information
 */
export interface IStoredEvent extends IDomainEvent {
  /** Position in the event stream */
  readonly position: IStreamPosition;

  /** When the event was stored */
  readonly storedAt: Date;
}

/**
 * Event store query options
 */
export interface IEventStoreQuery {
  /** Filter by aggregate ID */
  aggregateId?: string;

  /** Filter by aggregate type */
  aggregateType?: string;

  /** Filter by event type */
  eventType?: string;

  /** Start from this position */
  fromPosition?: bigint;

  /** Maximum number of events to return */
  limit?: number;

  /** Filter by time range */
  timeRange?: {
    from?: Date;
    to?: Date;
  };
}

/**
 * Aggregate root base class
 */
export abstract class AggregateRoot {
  #id: string;
  #aggregateType: string;
  #uncommittedEvents: IDomainEvent[] = [];
  #version: number = 0;

  constructor(id: string, version: number = 0) {
    this.#id = id;
    this.#version = version;
    this.#aggregateType = this.constructor.name;
  }

  get id(): string {
    return this.#id;
  }

  get version(): number {
    return this.#version;
  }

  get aggregateType(): string {
    return this.#aggregateType;
  }

  get uncommittedEvents(): readonly IDomainEvent[] {
    return this.#uncommittedEvents.filter((event) => event.version > this.#version);
  }

  /**
   * Apply an event to this aggregate
   */
  protected applyEvent(event: IDomainEvent): void {
    this.#uncommittedEvents.push(event);
    this.#version++;
    this.applyEventData(event);
  }

  /**
   * Apply event data to aggregate state (to be implemented by subclasses)
   */
  protected abstract applyEventData(event: IDomainEvent): void;

  /**
   * Mark all uncommitted events as committed
   */
  public markEventsAsCommitted(): void {
    this.#uncommittedEvents.length = 0;
  }
}

/**
 * Event validation schemas
 */
export const eventMetadataSchema = z.object({
  userId: z.string().optional(),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  source: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const domainEventSchema = z.object({
  id: z.uuid(),
  type: z.string().min(1),
  aggregateId: z.uuid(),
  aggregateType: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  metadata: eventMetadataSchema,
  occurredAt: z.date(),
  version: z.number().positive(),
});

export const storedEventSchema = domainEventSchema.extend({
  position: z.object({
    globalPosition: z.bigint(),
    streamPosition: z.number().positive(),
  }),
  storedAt: z.date(),
});

/**
 * Type guards and utilities
 */
export function isDomainEvent(obj: unknown): obj is IDomainEvent {
  return domainEventSchema.safeParse(obj).success;
}

export function isStoredEvent(obj: unknown): obj is IStoredEvent {
  return storedEventSchema.safeParse(obj).success;
}

/**
 * Event factory for creating events with proper metadata
 */
export const EventFactory = {
  create(
    type: string,
    aggregateId: string,
    aggregateType: string,
    data: Record<string, unknown>,
    metadata: Partial<IEventMetadata>,
    version: number,
    id?: string,
    occurredAt?: Date
  ): IDomainEvent {
    return {
      id: id || generateId(),
      type,
      aggregateId,
      aggregateType,
      data,
      metadata: {
        source: metadata.source || 'unknown',
        ...metadata,
      },
      occurredAt: occurredAt || new Date(),
      version,
    };
  },
};
