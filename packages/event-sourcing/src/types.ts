import { z } from 'zod';

/**
 * Base domain event interface
 */
export interface DomainEvent<
  TType extends string = string,
  TData extends Record<string, unknown> = Record<string, unknown>,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> {
  /** Unique event identifier */
  readonly id: string;

  /** Type of the event (e.g., 'UserCreated', 'OrderShipped') */
  readonly type: TType;

  /** Aggregate ID this event belongs to */
  readonly aggregateId: string;

  /** Aggregate type (e.g., 'User', 'Order', 'Product') */
  readonly aggregateType: string;

  /** Event payload/data */
  readonly data: TData;

  /** Event metadata */
  readonly metadata: TMetadata;

  /** Timestamp when the event occurred */
  readonly occurredAt: Date;

  /** Version of the aggregate when this event was created */
  readonly version: number;
}

/**
 * Event metadata for tracing and auditing
 */
export interface EventMetadata<TContext extends Record<string, unknown> = Record<string, unknown>> {
  /** User ID who triggered the event */
  readonly userId?: string;

  /** Correlation ID for request tracing */
  readonly correlationId?: string;

  /** Causation ID (ID of the command that caused this event) */
  readonly causationId?: string;

  /** Service that generated the event */
  readonly source: string;

  /** Additional context information */
  readonly context?: TContext;
}

/**
 * Event stream position
 */
export interface StreamPosition {
  /** Global position in the event store */
  readonly globalPosition: bigint;

  /** Position within the aggregate stream */
  readonly streamPosition: number;
}

/**
 * Stored event with position information
 */
export interface StoredEvent<
  TType extends string = string,
  TData extends Record<string, unknown> = Record<string, unknown>,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> extends DomainEvent<TType, TData, TContext, TMetadata> {
  /** Position in the event stream */
  readonly position: StreamPosition;

  /** When the event was stored */
  readonly storedAt: Date;
}

/**
 * Event store query options
 */
export interface EventStoreQuery {
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
  timeRange?: { from?: Date; to?: Date };
}

/**
 * Aggregate root base class
 */
export abstract class AggregateRoot<
  TType extends string = string,
  TData extends Record<string, unknown> = Record<string, unknown>,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> {
  protected readonly _id: string;
  protected _version: number = 0;
  protected readonly _uncommittedEvents: DomainEvent<TType, TData, TContext, TMetadata>[] = [];

  constructor(id: string, version: number = 0) {
    this._id = id;
    this._version = version;
  }

  get id(): string {
    return this._id;
  }

  get version(): number {
    return this._version;
  }

  get uncommittedEvents(): readonly DomainEvent<TType, TData, TContext, TMetadata>[] {
    return this._uncommittedEvents;
  }

  /**
   * Apply an event to this aggregate
   */
  protected applyEvent(event: DomainEvent<TType, TData, TContext, TMetadata>): void {
    this._uncommittedEvents.push(event);
    this._version++;
    this.applyEventData(event);
  }

  /**
   * Apply event data to aggregate state (to be implemented by subclasses)
   */
  protected abstract applyEventData(event: DomainEvent<TType, TData, TContext, TMetadata>): void;

  /**
   * Load aggregate from historical events
   */
  public static fromEvents<
    TType extends string = string,
    TData extends Record<string, unknown> = Record<string, unknown>,
    TContext extends Record<string, unknown> = Record<string, unknown>,
    TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
  >(
    AggregateConstructor: new (
      id: string,
      version: number
    ) => AggregateRoot<TType, TData, TContext, TMetadata>,
    events: DomainEvent<TType, TData, TContext, TMetadata>[]
  ): AggregateRoot<TType, TData, TContext, TMetadata> {
    if (events.length === 0) {
      throw new Error('Cannot create aggregate from empty event stream');
    }

    const firstEvent = events[0];
    if (!firstEvent) {
      throw new Error('Cannot create aggregate from empty event stream');
    }

    const aggregate = new AggregateConstructor(firstEvent.aggregateId, 0);
    for (const event of events) {
      aggregate.applyEventData(event);
      aggregate._version = event.version;
    }

    return aggregate;
  }

  /**
   * Mark all uncommitted events as committed
   */
  public markEventsAsCommitted(): void {
    this._uncommittedEvents.length = 0;
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
export function isDomainEvent<
  TType extends string = string,
  TData extends Record<string, unknown> = Record<string, unknown>,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
>(obj: unknown): obj is DomainEvent<TType, TData, TContext, TMetadata> {
  return domainEventSchema.safeParse(obj).success;
}

export function isStoredEvent<
  TType extends string = string,
  TData extends Record<string, unknown> = Record<string, unknown>,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
>(obj: unknown): obj is StoredEvent<TType, TData, TContext, TMetadata> {
  return storedEventSchema.safeParse(obj).success;
}

/**
 * Event factory for creating events with proper metadata
 */
export const EventFactory = {
  create<
    TType extends string = string,
    TContext extends Record<string, unknown> = Record<string, unknown>,
    TData extends Record<string, unknown> = Record<string, unknown>,
    TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
  >(
    type: TType,
    aggregateId: string,
    aggregateType: string,
    data: TData,
    metadata: Partial<TMetadata>,
    version: number,
    id?: string,
    occurredAt?: Date
  ): DomainEvent<TType, TData, TContext, TMetadata> {
    return {
      id: id || crypto.randomUUID(),
      type,
      aggregateId,
      aggregateType,
      data,
      metadata: {
        source: metadata.source || 'unknown',
        ...metadata,
      } as TMetadata,
      occurredAt: occurredAt || new Date(),
      version,
    };
  },
};
